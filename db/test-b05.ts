/**
 * B-05 Smoke Test: Record Payment API
 * Run with: TEST_AUTH_BYPASS=true npx tsx db/test-b05.ts
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

async function createIssuedInvoice(params: {
  orgId: string;
  patientId: string;
  userId: string;
  serviceId: string;
  total: number;
  tag: string;
}): Promise<string> {
  const invoiceNumber = `INV-B05-${params.tag}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const [invoice] = await pgClient`
    INSERT INTO invoices (
      organization_id, patient_id, invoice_number, status,
      subtotal, discount_amount, total, created_by, issued_at
    )
    VALUES (
      ${params.orgId},
      ${params.patientId},
      ${invoiceNumber},
      'issued',
      ${params.total},
      0,
      ${params.total},
      ${params.userId},
      now()
    )
    RETURNING id
  `;

  await pgClient`
    INSERT INTO invoice_lines (
      invoice_id, service_id, description_en, description_fr, description_ar,
      quantity, unit_price, line_total
    )
    VALUES (
      ${invoice.id},
      ${params.serviceId},
      'B05 line',
      'Ligne B05',
      'سطر B05',
      1,
      ${params.total},
      ${params.total}
    )
  `;

  return invoice.id as string;
}

async function createDraftInvoice(params: {
  orgId: string;
  patientId: string;
  userId: string;
  serviceId: string;
  total: number;
  tag: string;
}): Promise<string> {
  const invoiceNumber = `INV-B05-DRAFT-${params.tag}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const [invoice] = await pgClient`
    INSERT INTO invoices (
      organization_id, patient_id, invoice_number, status,
      subtotal, discount_amount, total, created_by
    )
    VALUES (
      ${params.orgId},
      ${params.patientId},
      ${invoiceNumber},
      'draft',
      ${params.total},
      0,
      ${params.total},
      ${params.userId}
    )
    RETURNING id
  `;

  await pgClient`
    INSERT INTO invoice_lines (
      invoice_id, service_id, description_en, description_fr, description_ar,
      quantity, unit_price, line_total
    )
    VALUES (
      ${invoice.id},
      ${params.serviceId},
      'B05 draft line',
      'Ligne brouillon B05',
      'سطر مسودة B05',
      1,
      ${params.total},
      ${params.total}
    )
  `;

  return invoice.id as string;
}

async function createVoidedInvoice(params: {
  orgId: string;
  patientId: string;
  userId: string;
  serviceId: string;
  total: number;
  tag: string;
}): Promise<string> {
  const id = await createIssuedInvoice(params);
  await pgClient`
    UPDATE invoices
    SET status = 'voided', updated_at = now()
    WHERE id = ${id}
  `;
  return id;
}

async function ensureRole(orgId: string, roleName: string): Promise<string> {
  const [role] = await pgClient`
    SELECT id FROM roles
    WHERE organization_id = ${orgId}
      AND name = ${roleName}
    LIMIT 1
  `;
  if (role) return role.id as string;

  const [created] = await pgClient`
    INSERT INTO roles (organization_id, name)
    VALUES (${orgId}, ${roleName})
    RETURNING id
  `;
  return created.id as string;
}

async function ensurePermission(key: string): Promise<string> {
  const [permission] = await pgClient`
    SELECT id FROM permissions
    WHERE key = ${key}
    LIMIT 1
  `;
  if (permission) return permission.id as string;

  const [created] = await pgClient`
    INSERT INTO permissions (key, description)
    VALUES (${key}, ${`Auto-created by test for ${key}`})
    RETURNING id
  `;
  return created.id as string;
}

async function main() {
  console.log("=== B-05 Smoke Test: Record Payment API ===\n");
  let passed = 0;
  let failed = 0;

  const createdInvoiceIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdPaymentMethodIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdPermissionRoleLinks: Array<{ roleId: string; permissionId: string }> = [];

  const [seedUser] = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (!seedUser) {
    console.log("SKIP: No user found.");
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
    console.log("SKIP: Missing patient/service.");
    process.exit(1);
  }
  const patientId = patient.id as string;
  const serviceId = service.id as string;

  let paymentMethodId = "";
  const [paymentMethod] = await pgClient`
    SELECT id FROM payment_methods
    WHERE organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (paymentMethod) {
    paymentMethodId = paymentMethod.id as string;
  } else {
    const [createdMethod] = await pgClient`
      INSERT INTO payment_methods (
        organization_id, type, label_en, label_fr, label_ar, is_active, display_order
      )
      VALUES (
        ${orgId}, 'cash', 'Cash', 'Especes', 'نقدا', true, 0
      )
      RETURNING id
    `;
    paymentMethodId = createdMethod.id as string;
    createdPaymentMethodIds.push(paymentMethodId);
  }

  // Admin user
  let adminUserId = "";
  const [existingAdmin] = await pgClient`
    SELECT u.id
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE u.organization_id = ${orgId}
      AND r.name = 'admin'
    LIMIT 1
  `;
  if (existingAdmin) {
    adminUserId = existingAdmin.id as string;
  } else {
    const [createdAdmin] = await pgClient`
      INSERT INTO users (id, organization_id, email, full_name, is_active)
      VALUES (gen_random_uuid(), ${orgId}, ${`b05-admin-${Date.now()}@test.local`}, 'B05 Admin', true)
      RETURNING id
    `;
    adminUserId = createdAdmin.id as string;
    createdUserIds.push(adminUserId);
    const adminRoleId = await ensureRole(orgId, "admin");
    await pgClient`INSERT INTO user_roles (user_id, role_id) VALUES (${adminUserId}, ${adminRoleId})`;
  }

  // Provider user (no payment.edit)
  let providerUserId = "";
  const [existingProvider] = await pgClient`
    SELECT u.id
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE u.organization_id = ${orgId}
      AND r.name = 'provider'
    LIMIT 1
  `;
  if (existingProvider) {
    providerUserId = existingProvider.id as string;
  } else {
    const [createdProvider] = await pgClient`
      INSERT INTO users (id, organization_id, email, full_name, is_active)
      VALUES (gen_random_uuid(), ${orgId}, ${`b05-provider-${Date.now()}@test.local`}, 'B05 Provider', true)
      RETURNING id
    `;
    providerUserId = createdProvider.id as string;
    createdUserIds.push(providerUserId);
    const providerRoleId = await ensureRole(orgId, "provider");
    await pgClient`INSERT INTO user_roles (user_id, role_id) VALUES (${providerUserId}, ${providerRoleId})`;
  }

  // Ensure payment.edit permission for admin role
  const adminRoleId = await ensureRole(orgId, "admin");
  const paymentEditPermissionId = await ensurePermission("payment.edit");
  const [existingRolePerm] = await pgClient`
    SELECT 1
    FROM role_permissions
    WHERE role_id = ${adminRoleId}
      AND permission_id = ${paymentEditPermissionId}
    LIMIT 1
  `;
  if (!existingRolePerm) {
    await pgClient`
      INSERT INTO role_permissions (role_id, permission_id)
      VALUES (${adminRoleId}, ${paymentEditPermissionId})
    `;
    createdPermissionRoleLinks.push({
      roleId: adminRoleId,
      permissionId: paymentEditPermissionId,
    });
  }

  // Invoices A/B/C/D + extra
  const invoiceAId = await createIssuedInvoice({
    orgId,
    patientId,
    userId: adminUserId,
    serviceId,
    total: 100,
    tag: "A",
  });
  const invoiceBId = await createIssuedInvoice({
    orgId,
    patientId,
    userId: adminUserId,
    serviceId,
    total: 60,
    tag: "B",
  });
  const invoiceCId = await createIssuedInvoice({
    orgId,
    patientId,
    userId: adminUserId,
    serviceId,
    total: 50,
    tag: "C",
  });
  const invoiceDId = await createIssuedInvoice({
    orgId,
    patientId,
    userId: adminUserId,
    serviceId,
    total: 40,
    tag: "D",
  });
  const invoiceExceedId = await createIssuedInvoice({
    orgId,
    patientId,
    userId: adminUserId,
    serviceId,
    total: 30,
    tag: "EX",
  });
  const invoiceVoidedId = await createVoidedInvoice({
    orgId,
    patientId,
    userId: adminUserId,
    serviceId,
    total: 20,
    tag: "V",
  });
  const invoiceDraftId = await createDraftInvoice({
    orgId,
    patientId,
    userId: adminUserId,
    serviceId,
    total: 20,
    tag: "DR",
  });
  createdInvoiceIds.push(
    invoiceAId,
    invoiceBId,
    invoiceCId,
    invoiceDId,
    invoiceExceedId,
    invoiceVoidedId,
    invoiceDraftId
  );

  let paymentForPatchId = "";

  // 1) Full payment on invoice A -> paid
  try {
    const res = await fetchJson(`${BASE}/api/payments`, {
      method: "POST",
      userId: adminUserId,
      body: {
        patient_id: patientId,
        payment_method_id: paymentMethodId,
        amount: 100,
        allocations: [{ invoice_id: invoiceAId, amount: 100 }],
      },
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const payment = res.data as { id: string };
    paymentForPatchId = payment.id;
    createdPaymentIds.push(payment.id);
    const [invoice] = await pgClient`SELECT status FROM invoices WHERE id = ${invoiceAId}`;
    if (invoice.status !== "paid") throw new Error(`Expected paid, got ${invoice.status}`);
    console.log("✅ 1. Full payment sets invoice A to paid");
    passed++;
  } catch (e) {
    console.log("❌ 1.", (e as Error).message);
    failed++;
  }

  // 2) Partial payment on B -> partially_paid
  try {
    const res = await fetchJson(`${BASE}/api/payments`, {
      method: "POST",
      userId: adminUserId,
      body: {
        patient_id: patientId,
        payment_method_id: paymentMethodId,
        amount: 40,
        allocations: [{ invoice_id: invoiceBId, amount: 40 }],
      },
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    createdPaymentIds.push((res.data as { id: string }).id);
    const [invoice] = await pgClient`SELECT status FROM invoices WHERE id = ${invoiceBId}`;
    if (invoice.status !== "partially_paid") throw new Error(`Expected partially_paid, got ${invoice.status}`);
    console.log("✅ 2. Partial payment sets invoice B to partially_paid");
    passed++;
  } catch (e) {
    console.log("❌ 2.", (e as Error).message);
    failed++;
  }

  // 3) Remaining payment on B -> paid
  try {
    const res = await fetchJson(`${BASE}/api/payments`, {
      method: "POST",
      userId: adminUserId,
      body: {
        patient_id: patientId,
        payment_method_id: paymentMethodId,
        amount: 20,
        allocations: [{ invoice_id: invoiceBId, amount: 20 }],
      },
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    createdPaymentIds.push((res.data as { id: string }).id);
    const [invoice] = await pgClient`SELECT status FROM invoices WHERE id = ${invoiceBId}`;
    if (invoice.status !== "paid") throw new Error(`Expected paid, got ${invoice.status}`);
    console.log("✅ 3. Remaining payment sets invoice B to paid");
    passed++;
  } catch (e) {
    console.log("❌ 3.", (e as Error).message);
    failed++;
  }

  // 4) Split across C/D
  try {
    const res = await fetchJson(`${BASE}/api/payments`, {
      method: "POST",
      userId: adminUserId,
      body: {
        patient_id: patientId,
        payment_method_id: paymentMethodId,
        amount: 80,
        allocations: [
          { invoice_id: invoiceCId, amount: 50 },
          { invoice_id: invoiceDId, amount: 30 },
        ],
      },
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    createdPaymentIds.push((res.data as { id: string }).id);
    const [c] = await pgClient`SELECT status FROM invoices WHERE id = ${invoiceCId}`;
    const [d] = await pgClient`SELECT status FROM invoices WHERE id = ${invoiceDId}`;
    if (c.status !== "paid") throw new Error(`Invoice C expected paid, got ${c.status}`);
    if (d.status !== "partially_paid") throw new Error(`Invoice D expected partially_paid, got ${d.status}`);
    console.log("✅ 4. Split payment updates invoices C/D correctly");
    passed++;
  } catch (e) {
    console.log("❌ 4.", (e as Error).message);
    failed++;
  }

  // 5) sum mismatch -> 422
  try {
    const res = await fetchJson(`${BASE}/api/payments`, {
      method: "POST",
      userId: adminUserId,
      body: {
        patient_id: patientId,
        payment_method_id: paymentMethodId,
        amount: 100,
        allocations: [{ invoice_id: invoiceExceedId, amount: 90 }],
      },
    });
    if (res.status === 422) {
      console.log("✅ 5. Allocation sum mismatch rejected (422)");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  // 6) exceeds remaining -> 422 with message
  try {
    const res = await fetchJson(`${BASE}/api/payments`, {
      method: "POST",
      userId: adminUserId,
      body: {
        patient_id: patientId,
        payment_method_id: paymentMethodId,
        amount: 40,
        allocations: [{ invoice_id: invoiceExceedId, amount: 40 }],
      },
    });
    if (res.status === 422) {
      const err = res.data as { error?: string };
      if (!String(err.error ?? "").includes("exceeds remaining balance")) {
        throw new Error(`Expected clear balance error, got ${JSON.stringify(res.data)}`);
      }
      console.log("✅ 6. Exceeding remaining balance rejected with clear message");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 6.", (e as Error).message);
    failed++;
  }

  // 7) allocate to voided -> 422
  try {
    const res = await fetchJson(`${BASE}/api/payments`, {
      method: "POST",
      userId: adminUserId,
      body: {
        patient_id: patientId,
        payment_method_id: paymentMethodId,
        amount: 10,
        allocations: [{ invoice_id: invoiceVoidedId, amount: 10 }],
      },
    });
    if (res.status === 422) {
      console.log("✅ 7. Allocation to voided invoice rejected (422)");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  // 8) allocate to draft -> 422
  try {
    const res = await fetchJson(`${BASE}/api/payments`, {
      method: "POST",
      userId: adminUserId,
      body: {
        patient_id: patientId,
        payment_method_id: paymentMethodId,
        amount: 10,
        allocations: [{ invoice_id: invoiceDraftId, amount: 10 }],
      },
    });
    if (res.status === 422) {
      console.log("✅ 8. Allocation to draft invoice rejected (422)");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 8.", (e as Error).message);
    failed++;
  }

  // 9) PATCH payment by admin -> 200 + audit log
  try {
    const res = await fetchJson(`${BASE}/api/payments/${paymentForPatchId}`, {
      method: "PATCH",
      userId: adminUserId,
      body: {
        reference_number: "UPDATED-B05-REF",
      },
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const [audit] = await pgClient`
      SELECT id
      FROM audit_logs
      WHERE organization_id = ${orgId}
        AND action = 'payment.edited'
        AND entity_type = 'payment'
        AND entity_id = ${paymentForPatchId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!audit) throw new Error("Missing payment.edited audit log");
    console.log("✅ 9. Admin PATCH payment succeeded and logged audit");
    passed++;
  } catch (e) {
    console.log("❌ 9.", (e as Error).message);
    failed++;
  }

  // 10) PATCH by provider -> 403
  try {
    const res = await fetchJson(`${BASE}/api/payments/${paymentForPatchId}`, {
      method: "PATCH",
      userId: providerUserId,
      body: { notes: "provider edit should fail" },
    });
    if (res.status === 403) {
      console.log("✅ 10. Provider PATCH denied (403)");
      passed++;
    } else {
      throw new Error(`Expected 403, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 10.", (e as Error).message);
    failed++;
  }

  await cleanup(
    createdPaymentIds,
    createdInvoiceIds,
    createdPaymentMethodIds,
    createdUserIds,
    createdPermissionRoleLinks,
    orgId
  );

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function cleanup(
  paymentIds: string[],
  invoiceIds: string[],
  paymentMethodIds: string[],
  userIds: string[],
  rolePermLinks: Array<{ roleId: string; permissionId: string }>,
  orgId: string
) {
  for (const paymentId of paymentIds) {
    await pgClient`DELETE FROM payment_allocations WHERE payment_id = ${paymentId}`;
  }
  for (const paymentId of paymentIds) {
    await pgClient`DELETE FROM payments WHERE id = ${paymentId}`;
  }
  for (const invoiceId of invoiceIds) {
    await pgClient`DELETE FROM invoice_lines WHERE invoice_id = ${invoiceId}`;
  }
  for (const invoiceId of invoiceIds) {
    await pgClient`DELETE FROM invoices WHERE id = ${invoiceId}`;
  }

  for (const link of rolePermLinks) {
    await pgClient`
      DELETE FROM role_permissions
      WHERE role_id = ${link.roleId}
        AND permission_id = ${link.permissionId}
    `;
  }

  for (const userId of userIds) {
    await pgClient`DELETE FROM user_roles WHERE user_id = ${userId}`;
    await pgClient`DELETE FROM users WHERE id = ${userId} AND organization_id = ${orgId}`;
  }

  for (const methodId of paymentMethodIds) {
    await pgClient`DELETE FROM payment_methods WHERE id = ${methodId}`;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
