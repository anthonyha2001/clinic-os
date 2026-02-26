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
    const [perm] = await pgClient`SELECT id FROM permissions WHERE key = ${permissionKey} LIMIT 1`;
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
  console.log("=== R-02 Smoke Test: Unpaid Invoices Report API ===\n");
  let passed = 0;
  let failed = 0;

  const createdUserIds: string[] = [];
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

  let [patient] = await pgClient`
    SELECT id FROM patients WHERE organization_id = ${orgId} LIMIT 1
  `;
  if (!patient) {
    const [createdPatient] = await pgClient`
      INSERT INTO patients (organization_id, first_name, last_name, phone, is_active)
      VALUES (${orgId}, 'R02', 'Patient', ${`+1${Date.now().toString().slice(-10)}`}, true)
      RETURNING id
    `;
    patient = createdPatient;
  }

  let [service] = await pgClient`
    SELECT id FROM services WHERE organization_id = ${orgId} AND is_active = true LIMIT 1
  `;
  if (!service) {
    const [createdService] = await pgClient`
      INSERT INTO services (
        organization_id, name_en, name_fr, name_ar, price, default_duration_minutes, is_active
      )
      VALUES (
        ${orgId}, ${`R02 Service ${Date.now()}`}, 'R02 Service FR', 'خدمة R02', 100, 30, true
      )
      RETURNING id
    `;
    service = createdService;
  }

  let [provider] = await pgClient`
    SELECT id FROM provider_profiles WHERE organization_id = ${orgId} LIMIT 1
  `;
  if (!provider) {
    const [providerUser] = await pgClient`
      INSERT INTO users (id, organization_id, email, full_name, is_active)
      VALUES (gen_random_uuid(), ${orgId}, ${`r02-provider-${Date.now()}@test.local`}, 'R02 Provider', true)
      RETURNING id
    `;
    createdUserIds.push(providerUser.id as string);
    const [createdProvider] = await pgClient`
      INSERT INTO provider_profiles (user_id, organization_id, is_accepting_appointments, color_hex)
      VALUES (${providerUser.id}, ${orgId}, true, '#22C55E')
      RETURNING id
    `;
    provider = createdProvider;
  }

  let [paymentMethod] = await pgClient`
    SELECT id FROM payment_methods WHERE organization_id = ${orgId} AND is_active = true LIMIT 1
  `;
  if (!paymentMethod) {
    const [createdMethod] = await pgClient`
      INSERT INTO payment_methods (
        organization_id, type, label_en, label_fr, label_ar, is_active, display_order
      )
      VALUES (${orgId}, 'cash', 'R02 Cash', 'R02 Cash FR', 'نقدي R02', true, 1)
      RETURNING id
    `;
    paymentMethod = createdMethod;
  }

  const adminUserId = await ensureUserWithPermission({
    orgId,
    roleName: `r02-admin-${Date.now()}`,
    emailPrefix: "r02-admin",
    fullName: "R02 Admin",
    permissionKey: "reports.view",
  });
  createdUserIds.push(adminUserId);

  const receptionistUserId = await ensureUserWithPermission({
    orgId,
    roleName: `r02-receptionist-${Date.now()}`,
    emailPrefix: "r02-receptionist",
    fullName: "R02 Receptionist",
  });
  createdUserIds.push(receptionistUserId);

  const now = Date.now();
  const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000).toISOString();

  // helper: create appointment + invoice + line
  async function createInvoice(params: {
    amount: number;
    status: "issued" | "partially_paid" | "paid" | "draft" | "voided";
    issuedAtDaysAgo: number;
  }) {
    const start = daysAgo(Math.max(params.issuedAtDaysAgo, 1));
    const end = new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString();
    const [appt] = await pgClient`
      INSERT INTO appointments (
        organization_id, patient_id, provider_id, start_time, end_time, status, created_by
      )
      VALUES (
        ${orgId}, ${patient.id}, ${provider.id},
        ${start}::timestamptz, ${end}::timestamptz, 'completed', ${adminUserId}
      )
      RETURNING id
    `;
    const [inv] = await pgClient`
      INSERT INTO invoices (
        organization_id, patient_id, appointment_id, invoice_number, status,
        subtotal, discount_amount, total, created_by, issued_at, created_at
      )
      VALUES (
        ${orgId}, ${patient.id}, ${appt.id}, ${`INV-R02-${Date.now()}-${Math.floor(Math.random() * 1000)}`}, ${params.status},
        ${params.amount}, 0, ${params.amount}, ${adminUserId},
        ${daysAgo(params.issuedAtDaysAgo)}::timestamptz, ${daysAgo(params.issuedAtDaysAgo)}::timestamptz
      )
      RETURNING id
    `;
    createdInvoiceIds.push(inv.id as string);
    const [line] = await pgClient`
      INSERT INTO invoice_lines (
        invoice_id, service_id, description_en, description_fr, description_ar, quantity, unit_price, line_total
      )
      VALUES (
        ${inv.id}, ${service.id}, 'R02 EN', 'R02 FR', 'R02 AR', 1, ${params.amount}, ${params.amount}
      )
      RETURNING id
    `;
    createdInvoiceLineIds.push(line.id as string);
    return inv.id as string;
  }

  const invoiceA = await createInvoice({ amount: 200, status: "issued", issuedAtDaysAgo: 10 });
  const invoiceB = await createInvoice({ amount: 150, status: "partially_paid", issuedAtDaysAgo: 5 });
  await createInvoice({ amount: 120, status: "paid", issuedAtDaysAgo: 6 }); // C
  await createInvoice({ amount: 50, status: "draft", issuedAtDaysAgo: 2 }); // D
  await createInvoice({ amount: 80, status: "voided", issuedAtDaysAgo: 8 }); // E

  // partial payment for B: 50
  const [paymentB] = await pgClient`
    INSERT INTO payments (
      organization_id, patient_id, payment_method_id, amount, received_by, created_at
    )
    VALUES (
      ${orgId}, ${patient.id}, ${paymentMethod.id}, 50, ${adminUserId}, ${daysAgo(4)}::timestamptz
    )
    RETURNING id
  `;
  createdPaymentIds.push(paymentB.id as string);
  const [allocB] = await pgClient`
    INSERT INTO payment_allocations (payment_id, invoice_id, amount)
    VALUES (${paymentB.id}, ${invoiceB}, 50)
    RETURNING id
  `;
  createdAllocationIds.push(allocB.id as string);

  try {
    const res = await fetchJson(`${BASE}/api/reports/unpaid`, { userId: adminUserId });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = res.data as {
      summary: {
        totalUnpaidAmount: number;
        totalUnpaidCount: number;
        totalPartiallyPaid: number;
        totalIssued: number;
      };
      invoices: Array<{
        invoiceId: string;
        balanceDue: number;
        amountPaid: number;
        daysOutstanding: number;
        status: string;
      }>;
    };
    if (body.invoices.length !== 2) throw new Error(`Expected 2 unpaid invoices, got ${body.invoices.length}`);
    const a = body.invoices.find((i) => i.invoiceId === invoiceA);
    const b = body.invoices.find((i) => i.invoiceId === invoiceB);
    if (!a || !b) throw new Error("Expected invoice A and B only");
    if (a.balanceDue !== 200 || a.amountPaid !== 0 || a.status !== "issued") {
      throw new Error(`Invoice A mismatch: ${JSON.stringify(a)}`);
    }
    if (a.daysOutstanding < 9) {
      throw new Error(`Invoice A daysOutstanding expected around 10, got ${a.daysOutstanding}`);
    }
    if (b.balanceDue !== 100 || b.amountPaid !== 50 || b.status !== "partially_paid") {
      throw new Error(`Invoice B mismatch: ${JSON.stringify(b)}`);
    }
    if (
      body.summary.totalUnpaidAmount !== 300 ||
      body.summary.totalUnpaidCount !== 2 ||
      body.summary.totalIssued !== 1 ||
      body.summary.totalPartiallyPaid !== 1
    ) {
      throw new Error(`Summary mismatch: ${JSON.stringify(body.summary)}`);
    }
    console.log("✅ 1-5. base unpaid list, invoice fields, and summary verified");
    passed += 5;
  } catch (e) {
    console.log("❌ 1-5.", (e as Error).message);
    failed += 5;
  }

  try {
    const desc = await fetchJson(`${BASE}/api/reports/unpaid?sort_by=balance_due&sort_order=desc`, { userId: adminUserId });
    const asc = await fetchJson(`${BASE}/api/reports/unpaid?sort_by=balance_due&sort_order=asc`, { userId: adminUserId });
    if (desc.status !== 200 || asc.status !== 200) throw new Error("Sort endpoints failed");
    const descIds = (desc.data as { invoices: Array<{ invoiceId: string }> }).invoices.map((i) => i.invoiceId);
    const ascIds = (asc.data as { invoices: Array<{ invoiceId: string }> }).invoices.map((i) => i.invoiceId);
    if (descIds[0] !== invoiceA || ascIds[0] !== invoiceB) {
      throw new Error(`Sort order incorrect. desc=${JSON.stringify(descIds)} asc=${JSON.stringify(ascIds)}`);
    }
    console.log("✅ 6-7. sort_by=balance_due asc/desc works");
    passed += 2;
  } catch (e) {
    console.log("❌ 6-7.", (e as Error).message);
    failed += 2;
  }

  try {
    const res = await fetchJson(`${BASE}/api/reports/unpaid?sort_by=days_outstanding&sort_order=desc`, { userId: adminUserId });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const ids = (res.data as { invoices: Array<{ invoiceId: string }> }).invoices.map((i) => i.invoiceId);
    if (ids[0] !== invoiceA) {
      throw new Error(`Expected invoice A first by days_outstanding desc, got ${JSON.stringify(ids)}`);
    }
    console.log("✅ 8. sort_by=days_outstanding uses issued_at age correctly");
    passed++;
  } catch (e) {
    console.log("❌ 8.", (e as Error).message);
    failed++;
  }

  try {
    // mark unpaid invoices as paid, then expect empty
    await pgClient`UPDATE invoices SET status = 'paid', updated_at = now() WHERE id IN (${invoiceA}, ${invoiceB})`;
    const res = await fetchJson(`${BASE}/api/reports/unpaid`, { userId: adminUserId });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = res.data as { summary: { totalUnpaidAmount: number; totalUnpaidCount: number }; invoices: unknown[] };
    if (body.invoices.length !== 0 || body.summary.totalUnpaidAmount !== 0 || body.summary.totalUnpaidCount !== 0) {
      throw new Error(`Expected empty unpaid report, got ${JSON.stringify(body)}`);
    }
    console.log("✅ 9. no unpaid invoices returns empty list + zero summary");
    passed++;
  } catch (e) {
    console.log("❌ 9.", (e as Error).message);
    failed++;
  }

  try {
    const res = await fetchJson(`${BASE}/api/reports/unpaid`, { userId: receptionistUserId });
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

  await cleanup({
    allocationIds: createdAllocationIds,
    paymentIds: createdPaymentIds,
    invoiceLineIds: createdInvoiceLineIds,
    invoiceIds: createdInvoiceIds,
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
  for (const userId of params.userIds) {
    await pgClient`DELETE FROM user_roles WHERE user_id = ${userId}`;
    await pgClient`DELETE FROM users WHERE id = ${userId} AND organization_id = ${params.orgId}`;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
