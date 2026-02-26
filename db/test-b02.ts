/**
 * B-02 Smoke Test: Invoice status transitions & voiding
 * Run with: TEST_AUTH_BYPASS=true npx tsx db/test-b02.ts
 * Prerequisites: dev server running with TEST_AUTH_BYPASS=true
 */
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

async function createDraftInvoice(userId: string, patientId: string, serviceId: string) {
  const res = await fetchJson(`${BASE}/api/invoices`, {
    method: "POST",
    userId,
    body: {
      patient_id: patientId,
      lines: [
        {
          service_id: serviceId,
          description_en: "B02 line EN",
          description_fr: "B02 line FR",
          description_ar: "B02 line AR",
          quantity: 1,
          unit_price: 20,
        },
      ],
    },
  });
  if (res.status !== 201) {
    throw new Error(`Create draft invoice failed: ${res.status}`);
  }
  return res.data as { id: string; status: string };
}

async function main() {
  console.log("=== B-02 Smoke Test: Invoice status transitions & voiding ===\n");
  let passed = 0;
  let failed = 0;

  const createdInvoiceIds: string[] = [];
  const createdUserIds: string[] = [];

  const [seedUser] = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (!seedUser) {
    console.log("SKIP: No users found.");
    process.exit(1);
  }
  const orgId = seedUser.organization_id as string;

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
    console.log("SKIP: Missing patient or active service.");
    process.exit(1);
  }
  const patientId = patient.id as string;
  const serviceId = service.id as string;

  let adminUserId = "";
  const [admin] = await pgClient`
    SELECT u.id
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE u.organization_id = ${orgId}
      AND r.name = 'admin'
    LIMIT 1
  `;
  if (admin) {
    adminUserId = admin.id as string;
  } else {
    const [createdAdmin] = await pgClient`
      INSERT INTO users (id, organization_id, email, full_name, is_active)
      VALUES (gen_random_uuid(), ${orgId}, ${`admin-${Date.now()}@test.local`}, 'B02 Admin', true)
      RETURNING id
    `;
    adminUserId = createdAdmin.id as string;
    createdUserIds.push(adminUserId);

    const [adminRole] = await pgClient`
      SELECT id
      FROM roles
      WHERE organization_id = ${orgId}
        AND name = 'admin'
      LIMIT 1
    `;
    if (!adminRole) {
      console.log("SKIP: Admin role not found.");
      process.exit(1);
    }
    await pgClient`
      INSERT INTO user_roles (user_id, role_id)
      VALUES (${adminUserId}, ${adminRole.id})
    `;
  }

  let receptionistUserId = "";
  const [existingReceptionist] = await pgClient`
    SELECT u.id
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE u.organization_id = ${orgId}
      AND r.name = 'receptionist'
    LIMIT 1
  `;
  if (existingReceptionist) {
    receptionistUserId = existingReceptionist.id as string;
  } else {
    const [createdUser] = await pgClient`
      INSERT INTO users (id, organization_id, email, full_name, is_active)
      VALUES (gen_random_uuid(), ${orgId}, ${`receptionist-${Date.now()}@test.local`}, 'B02 Receptionist', true)
      RETURNING id
    `;
    receptionistUserId = createdUser.id as string;
    createdUserIds.push(receptionistUserId);

    const [receptionistRole] = await pgClient`
      SELECT id
      FROM roles
      WHERE organization_id = ${orgId}
        AND name = 'receptionist'
      LIMIT 1
    `;
    if (!receptionistRole) {
      throw new Error("Receptionist role not found");
    }
    await pgClient`
      INSERT INTO user_roles (user_id, role_id)
      VALUES (${receptionistUserId}, ${receptionistRole.id})
    `;
  }

  // 1) draft -> issued
  let invoice1Id = "";
  try {
    const inv = await createDraftInvoice(adminUserId, patientId, serviceId);
    invoice1Id = inv.id;
    createdInvoiceIds.push(invoice1Id);

    const res = await fetchJson(`${BASE}/api/invoices/${invoice1Id}/status`, {
      method: "POST",
      userId: adminUserId,
      body: { status: "issued" },
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

    const [row] = await pgClient`
      SELECT status, issued_at
      FROM invoices
      WHERE id = ${invoice1Id}
    `;
    if (!row || row.status !== "issued" || !row.issued_at) {
      throw new Error("issued_at/status not set correctly");
    }
    console.log("✅ 1. draft -> issued works and sets issued_at");
    passed++;
  } catch (e) {
    console.log("❌ 1.", (e as Error).message);
    failed++;
  }

  // 2) issued -> voided with reason (admin) + audit log
  try {
    const res = await fetchJson(`${BASE}/api/invoices/${invoice1Id}/status`, {
      method: "POST",
      userId: adminUserId,
      body: { status: "voided", reason: "Entry mistake" },
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

    const [audit] = await pgClient`
      SELECT id
      FROM audit_logs
      WHERE organization_id = ${orgId}
        AND action = 'invoice.voided'
        AND entity_type = 'invoice'
        AND entity_id = ${invoice1Id}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!audit) {
      throw new Error("Missing audit log for invoice void");
    }
    console.log("✅ 2. issued -> voided by admin succeeds and logs audit row");
    passed++;
  } catch (e) {
    console.log("❌ 2.", (e as Error).message);
    failed++;
  }

  // 3) issued -> voided without reason -> 422
  try {
    const inv = await createDraftInvoice(adminUserId, patientId, serviceId);
    createdInvoiceIds.push(inv.id);
    await fetchJson(`${BASE}/api/invoices/${inv.id}/status`, {
      method: "POST",
      userId: adminUserId,
      body: { status: "issued" },
    });

    const res = await fetchJson(`${BASE}/api/invoices/${inv.id}/status`, {
      method: "POST",
      userId: adminUserId,
      body: { status: "voided" },
    });
    if (res.status === 422) {
      console.log("✅ 3. void without reason rejected (422)");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 3.", (e as Error).message);
    failed++;
  }

  // 4) void attempt by receptionist -> 403
  try {
    const inv = await createDraftInvoice(adminUserId, patientId, serviceId);
    createdInvoiceIds.push(inv.id);
    await fetchJson(`${BASE}/api/invoices/${inv.id}/status`, {
      method: "POST",
      userId: adminUserId,
      body: { status: "issued" },
    });

    const res = await fetchJson(`${BASE}/api/invoices/${inv.id}/status`, {
      method: "POST",
      userId: receptionistUserId,
      body: { status: "voided", reason: "Not allowed user" },
    });
    if (res.status === 403) {
      console.log("✅ 4. receptionist void attempt blocked (403)");
      passed++;
    } else {
      throw new Error(`Expected 403, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 4.", (e as Error).message);
    failed++;
  }

  // 5) draft -> paid (manual API disallowed) -> 422
  try {
    const inv = await createDraftInvoice(adminUserId, patientId, serviceId);
    createdInvoiceIds.push(inv.id);

    const res = await fetchJson(`${BASE}/api/invoices/${inv.id}/status`, {
      method: "POST",
      userId: adminUserId,
      body: { status: "paid" },
    });
    if (res.status === 422) {
      console.log("✅ 5. draft -> paid rejected via API (422)");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  // 6) voided -> issued (terminal) -> 422
  try {
    const res = await fetchJson(`${BASE}/api/invoices/${invoice1Id}/status`, {
      method: "POST",
      userId: adminUserId,
      body: { status: "issued" },
    });
    if (res.status === 422) {
      console.log("✅ 6. voided -> issued rejected (422)");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 6.", (e as Error).message);
    failed++;
  }

  // 7) cannot void fully paid invoice
  try {
    const inv = await createDraftInvoice(adminUserId, patientId, serviceId);
    createdInvoiceIds.push(inv.id);
    await fetchJson(`${BASE}/api/invoices/${inv.id}/status`, {
      method: "POST",
      userId: adminUserId,
      body: { status: "issued" },
    });

    await pgClient`
      UPDATE invoices
      SET status = 'paid', updated_at = now()
      WHERE id = ${inv.id}
    `;

    const res = await fetchJson(`${BASE}/api/invoices/${inv.id}/status`, {
      method: "POST",
      userId: adminUserId,
      body: { status: "voided", reason: "Trying to void paid" },
    });
    if (res.status === 422) {
      const err = res.data as { error?: string };
      if ((err.error ?? "").includes("Cannot void a fully paid invoice")) {
        console.log("✅ 7. paid invoice cannot be voided (422)");
        passed++;
      } else {
        throw new Error(`Expected paid-void message, got ${JSON.stringify(res.data)}`);
      }
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  await cleanup(createdInvoiceIds, createdUserIds, orgId);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function cleanup(invoiceIds: string[], createdUserIds: string[], orgId: string) {
  for (const invoiceId of invoiceIds) {
    await pgClient`DELETE FROM invoice_lines WHERE invoice_id = ${invoiceId}`;
    await pgClient`DELETE FROM invoices WHERE id = ${invoiceId}`;
  }

  for (const userId of createdUserIds) {
    await pgClient`DELETE FROM user_roles WHERE user_id = ${userId}`;
    await pgClient`DELETE FROM users WHERE id = ${userId} AND organization_id = ${orgId}`;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
