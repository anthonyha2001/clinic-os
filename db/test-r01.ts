import "dotenv/config";
import { pgClient } from "./index";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

function authHeaders(userId: string): Record<string, string> {
  if (process.env.TEST_AUTH_BYPASS !== "true") return {};
  return { "X-Test-User-Id": userId };
}

async function fetchJson(
  url: string,
  opts: { method?: string; body?: unknown; userId?: string } = {}
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(opts.userId ?? ""),
  };
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = await res.text();
  }
  return { status: res.status, data };
}

function nearlyEqual(a: number, b: number, eps = 0.0001): boolean {
  return Math.abs(a - b) < eps;
}

async function ensureUserWithPermission(params: {
  orgId: string;
  roleName: string;
  emailPrefix: string;
  fullName: string;
  permissionKey?: string;
}): Promise<string> {
  const { orgId, roleName, emailPrefix, fullName, permissionKey } = params;

  const [role] = await pgClient`
    INSERT INTO roles (organization_id, name)
    VALUES (${orgId}, ${roleName})
    ON CONFLICT (organization_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;

  if (permissionKey) {
    const [perm] = await pgClient`
      SELECT id FROM permissions WHERE key = ${permissionKey} LIMIT 1
    `;
    if (perm) {
      await pgClient`
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (${role.id}, ${perm.id})
        ON CONFLICT (role_id, permission_id) DO NOTHING
      `;
    }
  }

  const [user] = await pgClient`
    INSERT INTO users (id, organization_id, email, full_name, is_active)
    VALUES (
      gen_random_uuid(),
      ${orgId},
      ${`${emailPrefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@test.local`},
      ${fullName},
      true
    )
    RETURNING id
  `;

  await pgClient`
    INSERT INTO user_roles (user_id, role_id)
    VALUES (${user.id}, ${role.id})
    ON CONFLICT (user_id, role_id) DO NOTHING
  `;

  return user.id as string;
}

async function main() {
  console.log("=== R-01 Smoke Test: Revenue Reports API ===\n");
  let passed = 0;
  let failed = 0;

  const createdUserIds: string[] = [];
  const createdPaymentMethodIds: string[] = [];
  const createdAppointmentIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdInvoiceLineIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdAllocationIds: string[] = [];

  const [seedUser] = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (!seedUser) {
    console.log("SKIP: No user found.");
    process.exit(1);
  }
  const orgId = seedUser.organization_id as string;

  const providers = await pgClient`
    SELECT id
    FROM provider_profiles
    WHERE organization_id = ${orgId}
    LIMIT 2
  `;
  if (providers.length === 0) {
    console.log("SKIP: No provider found.");
    process.exit(1);
  }
  const provider1Id = providers[0].id as string;
  let provider2Id = providers[1]?.id as string | undefined;
  if (!provider2Id) {
    const [u] = await pgClient`
      INSERT INTO users (id, organization_id, email, full_name, is_active)
      VALUES (gen_random_uuid(), ${orgId}, ${`r01-provider-${Date.now()}@test.local`}, 'R01 Provider', true)
      RETURNING id
    `;
    createdUserIds.push(u.id as string);
    const [pp] = await pgClient`
      INSERT INTO provider_profiles (user_id, organization_id, is_accepting_appointments, color_hex)
      VALUES (${u.id}, ${orgId}, true, '#F59E0B')
      RETURNING id
    `;
    provider2Id = pp.id as string;
  }

  const [patient] = await pgClient`
    SELECT id FROM patients
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  const [service] = await pgClient`
    SELECT id FROM services
    WHERE organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (!patient || !service) {
    console.log("SKIP: Missing patient or service.");
    process.exit(1);
  }
  const patientId = patient.id as string;
  const serviceId = service.id as string;

  const adminUserId = await ensureUserWithPermission({
    orgId,
    roleName: `r01-admin-${Date.now()}`,
    emailPrefix: "r01-admin",
    fullName: "R01 Admin",
    permissionKey: "reports.view",
  });
  createdUserIds.push(adminUserId);

  const receptionistUserId = await ensureUserWithPermission({
    orgId,
    roleName: `r01-receptionist-${Date.now()}`,
    emailPrefix: "r01-receptionist",
    fullName: "R01 Receptionist",
  });
  createdUserIds.push(receptionistUserId);

  const [pmCash] = await pgClient`
    INSERT INTO payment_methods (
      organization_id, type, label_en, label_fr, label_ar, is_active, display_order
    )
    VALUES (${orgId}, 'cash', 'Cash R01', 'Cash R01 FR', 'كاش R01', true, 11)
    RETURNING id
  `;
  const [pmCard] = await pgClient`
    INSERT INTO payment_methods (
      organization_id, type, label_en, label_fr, label_ar, is_active, display_order
    )
    VALUES (${orgId}, 'card', 'Card R01', 'Card R01 FR', 'بطاقة R01', true, 12)
    RETURNING id
  `;
  const [pmBank] = await pgClient`
    INSERT INTO payment_methods (
      organization_id, type, label_en, label_fr, label_ar, is_active, display_order
    )
    VALUES (${orgId}, 'bank_transfer', 'Bank R01', 'Bank R01 FR', 'تحويل R01', true, 13)
    RETURNING id
  `;
  createdPaymentMethodIds.push(pmCash.id as string, pmCard.id as string, pmBank.id as string);

  // Month 1: two appointments/invoices/payments
  const jan10 = new Date("2026-01-10T10:00:00.000Z");
  const jan20 = new Date("2026-01-20T12:00:00.000Z");
  // Month 2: one appointment/invoice/payment
  const feb15 = new Date("2026-02-15T09:00:00.000Z");

  const appts = [
    { dt: jan10, providerId: provider1Id, amount: 100, pmId: pmCash.id as string },
    { dt: jan20, providerId: provider1Id, amount: 150, pmId: pmCard.id as string },
    { dt: feb15, providerId: provider2Id, amount: 200, pmId: pmBank.id as string },
  ];

  for (const [idx, item] of Array.from(appts.entries())) {
    const start = item.dt.toISOString();
    const end = new Date(item.dt.getTime() + 30 * 60 * 1000).toISOString();

    const [appt] = await pgClient`
      INSERT INTO appointments (
        organization_id, patient_id, provider_id, start_time, end_time, status, created_by
      )
      VALUES (
        ${orgId}, ${patientId}, ${item.providerId},
        ${start}::timestamptz, ${end}::timestamptz, 'completed', ${adminUserId}
      )
      RETURNING id
    `;
    createdAppointmentIds.push(appt.id as string);

    const [inv] = await pgClient`
      INSERT INTO invoices (
        organization_id, patient_id, appointment_id, invoice_number, status,
        subtotal, discount_amount, total, created_by, issued_at, created_at
      )
      VALUES (
        ${orgId}, ${patientId}, ${appt.id}, ${`INV-R01-${Date.now()}-${idx}`}, 'issued',
        ${item.amount}, 0, ${item.amount}, ${adminUserId},
        ${start}::timestamptz, ${start}::timestamptz
      )
      RETURNING id
    `;
    createdInvoiceIds.push(inv.id as string);

    const [line] = await pgClient`
      INSERT INTO invoice_lines (
        invoice_id, service_id, description_en, description_fr, description_ar,
        quantity, unit_price, line_total
      )
      VALUES (
        ${inv.id}, ${serviceId}, 'R01 EN', 'R01 FR', 'R01 AR',
        1, ${item.amount}, ${item.amount}
      )
      RETURNING id
    `;
    createdInvoiceLineIds.push(line.id as string);

    const [payment] = await pgClient`
      INSERT INTO payments (
        organization_id, patient_id, payment_method_id, amount, received_by, created_at
      )
      VALUES (
        ${orgId}, ${patientId}, ${item.pmId}, ${item.amount}, ${adminUserId}, ${start}::timestamptz
      )
      RETURNING id
    `;
    createdPaymentIds.push(payment.id as string);

    const [alloc] = await pgClient`
      INSERT INTO payment_allocations (payment_id, invoice_id, amount)
      VALUES (${payment.id}, ${inv.id}, ${item.amount})
      RETURNING id
    `;
    createdAllocationIds.push(alloc.id as string);
  }

  const startAll = "2026-01-01T00:00:00.000Z";
  const endAll = "2026-02-28T23:59:59.999Z";

  try {
    const res = await fetchJson(
      `${BASE}/api/reports/revenue?group_by=month&start_date=${encodeURIComponent(startAll)}&end_date=${encodeURIComponent(endAll)}`,
      { userId: adminUserId }
    );
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = res.data as {
      summary: {
        totalRevenue: number;
        paymentCount: number;
        breakdownByMethod: Array<{ type: string; amount: number }>;
      };
      byPeriod: Array<{
        period: string;
        totalRevenue: number;
        paymentCount: number;
      }>;
    };
    if (body.summary.totalRevenue !== 450 || body.summary.paymentCount !== 3) {
      throw new Error(`Unexpected summary: ${JSON.stringify(body.summary)}`);
    }
    const jan = body.byPeriod.find((p) => p.period.startsWith("2026-01"));
    const feb = body.byPeriod.find((p) => p.period.startsWith("2026-02"));
    if (!jan || !feb) throw new Error("Missing month buckets");
    if (jan.totalRevenue !== 250 || jan.paymentCount !== 2) {
      throw new Error(`Unexpected Jan bucket: ${JSON.stringify(jan)}`);
    }
    if (feb.totalRevenue !== 200 || feb.paymentCount !== 1) {
      throw new Error(`Unexpected Feb bucket: ${JSON.stringify(feb)}`);
    }
    const byType = new Map(body.summary.breakdownByMethod.map((m) => [m.type, m.amount]));
    if (byType.get("cash") !== 100 || byType.get("card") !== 150 || byType.get("bank_transfer") !== 200) {
      throw new Error(`Unexpected method breakdown: ${JSON.stringify(body.summary.breakdownByMethod)}`);
    }
    console.log("✅ 1-4. revenue month summary/byPeriod/breakdown verified");
    passed += 4;
  } catch (e) {
    console.log("❌ 1-4.", (e as Error).message);
    failed += 4;
  }

  try {
    const res = await fetchJson(
      `${BASE}/api/reports/revenue?group_by=day&start_date=${encodeURIComponent(startAll)}&end_date=${encodeURIComponent(endAll)}`,
      { userId: adminUserId }
    );
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = res.data as { byPeriod: Array<{ period: string }> };
    if (!body.byPeriod.some((p) => p.period.startsWith("2026-01-10"))) {
      throw new Error("Daily buckets missing Jan 10");
    }
    console.log("✅ 5. group_by=day returns daily buckets");
    passed++;
  } catch (e) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  try {
    const res = await fetchJson(
      `${BASE}/api/reports/revenue/by-provider?start_date=${encodeURIComponent(startAll)}&end_date=${encodeURIComponent(endAll)}`,
      { userId: adminUserId }
    );
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const rows = res.data as Array<{ providerId: string; totalRevenue: number }>;
    const p1 = rows.find((r) => r.providerId === provider1Id);
    const p2 = rows.find((r) => r.providerId === provider2Id);
    if (!p1 || !p2) throw new Error("Expected both providers in by-provider report");
    if (p1.totalRevenue !== 250 || p2.totalRevenue !== 200) {
      throw new Error(`Unexpected provider totals: ${JSON.stringify(rows)}`);
    }
    console.log("✅ 6. by-provider endpoint returns both providers with correct totals");
    passed++;
  } catch (e) {
    console.log("❌ 6.", (e as Error).message);
    failed++;
  }

  try {
    const res = await fetchJson(
      `${BASE}/api/reports/revenue/by-service?start_date=${encodeURIComponent(startAll)}&end_date=${encodeURIComponent(endAll)}`,
      { userId: adminUserId }
    );
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const rows = res.data as Array<{ serviceId: string; totalRevenue: number }>;
    const s = rows.find((r) => r.serviceId === serviceId);
    if (!s) throw new Error("Expected service in by-service report");
    if (!nearlyEqual(s.totalRevenue, 450)) {
      throw new Error(`Unexpected service total: ${JSON.stringify(rows)}`);
    }
    console.log("✅ 7. by-service endpoint returns expected total");
    passed++;
  } catch (e) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  try {
    const res = await fetchJson(
      `${BASE}/api/reports/revenue?group_by=month&start_date=${encodeURIComponent(startAll)}&end_date=${encodeURIComponent(endAll)}&provider_id=${provider1Id}`,
      { userId: adminUserId }
    );
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = res.data as { summary: { totalRevenue: number } };
    if (body.summary.totalRevenue !== 250) {
      throw new Error(`Expected provider1 revenue 250, got ${body.summary.totalRevenue}`);
    }
    console.log("✅ 8. provider_id filter scopes revenue correctly");
    passed++;
  } catch (e) {
    console.log("❌ 8.", (e as Error).message);
    failed++;
  }

  try {
    const res = await fetchJson(
      `${BASE}/api/reports/revenue?group_by=month&start_date=${encodeURIComponent("2027-01-01T00:00:00.000Z")}&end_date=${encodeURIComponent("2027-02-28T23:59:59.999Z")}`,
      { userId: adminUserId }
    );
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = res.data as {
      summary: { totalRevenue: number; paymentCount: number; averagePayment: number };
      byPeriod: Array<{ totalRevenue: number; paymentCount: number }>;
    };
    if (
      body.summary.totalRevenue !== 0 ||
      body.summary.paymentCount !== 0 ||
      body.summary.averagePayment !== 0
    ) {
      throw new Error(`Expected zero summary, got ${JSON.stringify(body.summary)}`);
    }
    if (body.byPeriod.some((p) => p.totalRevenue !== 0 || p.paymentCount !== 0)) {
      throw new Error("Expected all-zero period buckets for empty range");
    }
    console.log("✅ 9. empty range returns zero-safe results");
    passed++;
  } catch (e) {
    console.log("❌ 9.", (e as Error).message);
    failed++;
  }

  try {
    const res = await fetchJson(
      `${BASE}/api/reports/revenue?group_by=month&start_date=${encodeURIComponent(startAll)}&end_date=${encodeURIComponent(endAll)}`,
      { userId: receptionistUserId }
    );
    if (res.status === 403) {
      console.log("✅ 10. receptionist without reports.view gets 403");
      passed++;
    } else {
      throw new Error(`Expected 403, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 10.", (e as Error).message);
    failed++;
  }

  try {
    const res = await fetchJson(
      `${BASE}/api/reports/revenue?group_by=month&start_date=${encodeURIComponent("2024-01-01T00:00:00.000Z")}&end_date=${encodeURIComponent("2026-01-10T00:00:00.000Z")}`,
      { userId: adminUserId }
    );
    if (res.status === 422) {
      console.log("✅ 11. range >365 days rejected with 422");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 11.", (e as Error).message);
    failed++;
  }

  await cleanup({
    allocationIds: createdAllocationIds,
    paymentIds: createdPaymentIds,
    invoiceLineIds: createdInvoiceLineIds,
    invoiceIds: createdInvoiceIds,
    appointmentIds: createdAppointmentIds,
    paymentMethodIds: createdPaymentMethodIds,
    userIds: createdUserIds,
    orgId,
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function cleanup(params: {
  allocationIds: string[];
  paymentIds: string[];
  invoiceLineIds: string[];
  invoiceIds: string[];
  appointmentIds: string[];
  paymentMethodIds: string[];
  userIds: string[];
  orgId: string;
}) {
  for (const id of params.allocationIds) {
    await pgClient`DELETE FROM payment_allocations WHERE id = ${id}`;
  }
  for (const id of params.paymentIds) {
    await pgClient`DELETE FROM payments WHERE id = ${id}`;
  }
  for (const id of params.invoiceLineIds) {
    await pgClient`DELETE FROM invoice_lines WHERE id = ${id}`;
  }
  for (const id of params.invoiceIds) {
    await pgClient`DELETE FROM invoices WHERE id = ${id}`;
  }
  for (const id of params.appointmentIds) {
    await pgClient`DELETE FROM appointments WHERE id = ${id}`;
  }
  for (const id of params.paymentMethodIds) {
    await pgClient`DELETE FROM payment_methods WHERE id = ${id}`;
  }
  for (const userId of params.userIds) {
    await pgClient`DELETE FROM user_roles WHERE user_id = ${userId}`;
    await pgClient`DELETE FROM users WHERE id = ${userId} AND organization_id = ${params.orgId}`;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
