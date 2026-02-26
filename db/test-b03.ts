/**
 * B-03 Smoke Test: Discount application with permission control
 * Run with: TEST_AUTH_BYPASS=true npx tsx db/test-b03.ts
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
          description_en: "B03 line EN",
          description_fr: "B03 line FR",
          description_ar: "B03 line AR",
          quantity: 1,
          unit_price: 100,
        },
      ],
    },
  });
  if (res.status !== 201) {
    throw new Error(`Create draft invoice failed: ${res.status}`);
  }
  return res.data as { id: string };
}

async function issueInvoice(invoiceId: string, userId: string) {
  const res = await fetchJson(`${BASE}/api/invoices/${invoiceId}/status`, {
    method: "POST",
    userId,
    body: { status: "issued" },
  });
  if (res.status !== 200) {
    throw new Error(`Issue invoice failed: ${res.status}`);
  }
}

async function main() {
  console.log("=== B-03 Smoke Test: Discount application ===\n");
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
      VALUES (gen_random_uuid(), ${orgId}, ${`b03-admin-${Date.now()}@test.local`}, 'B03 Admin', true)
      RETURNING id
    `;
    adminUserId = createdAdmin.id as string;
    createdUserIds.push(adminUserId);

    let [adminRole] = await pgClient`
      SELECT id FROM roles
      WHERE organization_id = ${orgId}
        AND name = 'admin'
      LIMIT 1
    `;
    if (!adminRole) {
      [adminRole] = await pgClient`
        INSERT INTO roles (organization_id, name)
        VALUES (${orgId}, 'admin')
        RETURNING id
      `;
    }
    await pgClient`INSERT INTO user_roles (user_id, role_id) VALUES (${adminUserId}, ${adminRole.id})`;
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
    const [createdRec] = await pgClient`
      INSERT INTO users (id, organization_id, email, full_name, is_active)
      VALUES (gen_random_uuid(), ${orgId}, ${`b03-rec-${Date.now()}@test.local`}, 'B03 Receptionist', true)
      RETURNING id
    `;
    receptionistUserId = createdRec.id as string;
    createdUserIds.push(receptionistUserId);

    let [recRole] = await pgClient`
      SELECT id FROM roles
      WHERE organization_id = ${orgId}
        AND name = 'receptionist'
      LIMIT 1
    `;
    if (!recRole) {
      [recRole] = await pgClient`
        INSERT INTO roles (organization_id, name)
        VALUES (${orgId}, 'receptionist')
        RETURNING id
      `;
    }
    await pgClient`INSERT INTO user_roles (user_id, role_id) VALUES (${receptionistUserId}, ${recRole.id})`;
  }

  // Base issued invoice subtotal 100
  let invoiceId = "";
  try {
    const created = await createDraftInvoice(adminUserId, patientId, serviceId);
    invoiceId = created.id;
    createdInvoiceIds.push(invoiceId);
    await issueInvoice(invoiceId, adminUserId);
  } catch (e) {
    console.log("❌ Setup failed:", (e as Error).message);
    await cleanup(createdInvoiceIds, createdUserIds, orgId);
    process.exit(1);
  }

  // 1) 10% by receptionist -> 200 total 90 + audit row
  try {
    const res = await fetchJson(`${BASE}/api/invoices/${invoiceId}/discount`, {
      method: "PATCH",
      userId: receptionistUserId,
      body: { discount_percent: 10, reason: "Promo day" },
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const invoice = res.data as { total: string | number };
    if (Number(invoice.total) !== 90) {
      throw new Error(`Expected total 90.00, got ${invoice.total}`);
    }
    const [audit] = await pgClient`
      SELECT id
      FROM audit_logs
      WHERE organization_id = ${orgId}
        AND action = 'discount.applied'
        AND entity_type = 'invoice'
        AND entity_id = ${invoiceId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!audit) throw new Error("Missing audit log for 10% discount");
    console.log("✅ 1. 10% receptionist discount applied with audit log");
    passed++;
  } catch (e) {
    console.log("❌ 1.", (e as Error).message);
    failed++;
  }

  // 2) 25% by receptionist -> 403
  try {
    const res = await fetchJson(`${BASE}/api/invoices/${invoiceId}/discount`, {
      method: "PATCH",
      userId: receptionistUserId,
      body: { discount_percent: 25, reason: "Too large" },
    });
    if (res.status === 403) {
      console.log("✅ 2. 25% receptionist discount blocked (403)");
      passed++;
    } else {
      throw new Error(`Expected 403, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 2.", (e as Error).message);
    failed++;
  }

  // 3) 25% by admin -> 200, approved_by set + audit
  try {
    const res = await fetchJson(`${BASE}/api/invoices/${invoiceId}/discount`, {
      method: "PATCH",
      userId: adminUserId,
      body: { discount_percent: 25, reason: "Manager override" },
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const invoice = res.data as { discount_approved_by: string | null };
    if (invoice.discount_approved_by !== adminUserId) {
      throw new Error("discount_approved_by not set to admin");
    }
    const [audit] = await pgClient`
      SELECT id
      FROM audit_logs
      WHERE organization_id = ${orgId}
        AND action = 'discount.applied'
        AND entity_type = 'invoice'
        AND entity_id = ${invoiceId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!audit) throw new Error("Missing audit log for 25% discount");
    console.log("✅ 3. 25% admin discount applied with approval + audit");
    passed++;
  } catch (e) {
    console.log("❌ 3.", (e as Error).message);
    failed++;
  }

  // 4) both percent and amount -> 422
  try {
    const res = await fetchJson(`${BASE}/api/invoices/${invoiceId}/discount`, {
      method: "PATCH",
      userId: adminUserId,
      body: { discount_percent: 10, discount_amount: 10, reason: "invalid both" },
    });
    if (res.status === 422) {
      console.log("✅ 4. both discount fields rejected (422)");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 4.", (e as Error).message);
    failed++;
  }

  // 5) neither -> 422
  try {
    const res = await fetchJson(`${BASE}/api/invoices/${invoiceId}/discount`, {
      method: "PATCH",
      userId: adminUserId,
      body: { reason: "invalid neither" },
    });
    if (res.status === 422) {
      console.log("✅ 5. neither discount field rejected (422)");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  // 6) amount > subtotal -> 422
  try {
    const res = await fetchJson(`${BASE}/api/invoices/${invoiceId}/discount`, {
      method: "PATCH",
      userId: adminUserId,
      body: { discount_amount: 150, reason: "too large amount" },
    });
    if (res.status === 422) {
      console.log("✅ 6. discount amount > subtotal rejected (422)");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 6.", (e as Error).message);
    failed++;
  }

  // 7) missing reason -> 422
  try {
    const res = await fetchJson(`${BASE}/api/invoices/${invoiceId}/discount`, {
      method: "PATCH",
      userId: adminUserId,
      body: { discount_percent: 5 },
    });
    if (res.status === 422) {
      console.log("✅ 7. missing reason rejected (422)");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  // 8) voided invoice -> discount -> 422
  try {
    const created = await createDraftInvoice(adminUserId, patientId, serviceId);
    createdInvoiceIds.push(created.id);
    await issueInvoice(created.id, adminUserId);
    await fetchJson(`${BASE}/api/invoices/${created.id}/status`, {
      method: "POST",
      userId: adminUserId,
      body: { status: "voided", reason: "void for test" },
    });

    const res = await fetchJson(`${BASE}/api/invoices/${created.id}/discount`, {
      method: "PATCH",
      userId: adminUserId,
      body: { discount_percent: 10, reason: "after void" },
    });
    if (res.status === 422) {
      console.log("✅ 8. discount on voided invoice rejected (422)");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 8.", (e as Error).message);
    failed++;
  }

  // 9) discount_amount mode -> total 70, percent 30.00
  try {
    const created = await createDraftInvoice(adminUserId, patientId, serviceId);
    createdInvoiceIds.push(created.id);
    await issueInvoice(created.id, adminUserId);

    const res = await fetchJson(`${BASE}/api/invoices/${created.id}/discount`, {
      method: "PATCH",
      userId: adminUserId,
      body: { discount_amount: 30, reason: "amount mode check" },
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const invoice = res.data as { total: string | number; discount_percent: string | number };
    if (Number(invoice.total) !== 70) {
      throw new Error(`Expected total 70.00, got ${invoice.total}`);
    }
    if (Number(invoice.discount_percent) !== 30) {
      throw new Error(`Expected discount_percent 30.00, got ${invoice.discount_percent}`);
    }
    console.log("✅ 9. discount_amount mode recalculates total/percent correctly");
    passed++;
  } catch (e) {
    console.log("❌ 9.", (e as Error).message);
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
