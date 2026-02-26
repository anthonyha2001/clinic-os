/**
 * B-06 Smoke Test: Invoice list & detail API
 * Run with: TEST_AUTH_BYPASS=true npx tsx db/test-b06.ts
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

async function main() {
  console.log("=== B-06 Smoke Test: Invoice List & Detail API ===\n");
  let passed = 0;
  let failed = 0;

  const createdInvoiceIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdOrgIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdServiceIds: string[] = [];
  const createdPaymentMethodIds: string[] = [];

  const [seedUser] = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (!seedUser) {
    console.log("SKIP: No user found.");
    process.exit(1);
  }
  const userId = seedUser.id as string;
  const orgId = seedUser.organization_id as string;

  let [patient] = await pgClient`
    SELECT id, first_name, last_name, phone
    FROM patients
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  if (!patient) {
    [patient] = await pgClient`
      INSERT INTO patients (
        organization_id, first_name, last_name, phone, is_active
      )
      VALUES (
        ${orgId}, 'B06', 'Patient', ${`+1${Date.now().toString().slice(-10)}`}, true
      )
      RETURNING id, first_name, last_name, phone
    `;
    createdPatientIds.push(patient.id as string);
  }

  let [service] = await pgClient`
    SELECT id
    FROM services
    WHERE organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (!service) {
    [service] = await pgClient`
      INSERT INTO services (
        organization_id, name_en, name_fr, name_ar, price, default_duration_minutes, is_active
      )
      VALUES (
        ${orgId}, ${`B06 Service ${Date.now()}`}, 'Service B06 FR', 'خدمة B06', 100.00, 30, true
      )
      RETURNING id
    `;
    createdServiceIds.push(service.id as string);
  }

  let [paymentMethod] = await pgClient`
    SELECT id
    FROM payment_methods
    WHERE organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (!paymentMethod) {
    [paymentMethod] = await pgClient`
      INSERT INTO payment_methods (
        organization_id, type, label_en, label_fr, label_ar, is_active, display_order
      )
      VALUES (
        ${orgId}, 'cash', 'Cash', 'Especes', 'نقدا', true, 0
      )
      RETURNING id
    `;
    createdPaymentMethodIds.push(paymentMethod.id as string);
  }

  const patientId = patient.id as string;
  const serviceId = service.id as string;
  const paymentMethodId = paymentMethod.id as string;

  const now = new Date();
  const startRange = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const endRange = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Setup invoices
  const invoiceNumberA = `INV-B06-A-${Date.now()}`;
  const invoiceNumberB = `INV-B06-B-${Date.now()}`;
  const invoiceNumberC = `INV-B06-C-${Date.now()}`;

  const [invA] = await pgClient`
    INSERT INTO invoices (
      organization_id, patient_id, invoice_number, status,
      subtotal, discount_amount, total, created_by, issued_at
    )
    VALUES (
      ${orgId}, ${patientId}, ${invoiceNumberA}, 'issued',
      100.00, 0.00, 100.00, ${userId}, now()
    )
    RETURNING id
  `;
  const invoiceAId = invA.id as string;
  createdInvoiceIds.push(invoiceAId);

  const [invB] = await pgClient`
    INSERT INTO invoices (
      organization_id, patient_id, invoice_number, status,
      subtotal, discount_amount, total, created_by, issued_at
    )
    VALUES (
      ${orgId}, ${patientId}, ${invoiceNumberB}, 'partially_paid',
      80.00, 0.00, 80.00, ${userId}, now()
    )
    RETURNING id
  `;
  const invoiceBId = invB.id as string;
  createdInvoiceIds.push(invoiceBId);

  const [invC] = await pgClient`
    INSERT INTO invoices (
      organization_id, patient_id, invoice_number, status,
      subtotal, discount_amount, total, created_by
    )
    VALUES (
      ${orgId}, ${patientId}, ${invoiceNumberC}, 'draft',
      50.00, 0.00, 50.00, ${userId}
    )
    RETURNING id
  `;
  const invoiceCId = invC.id as string;
  createdInvoiceIds.push(invoiceCId);

  await pgClient`
    INSERT INTO invoice_lines (
      invoice_id, service_id, description_en, description_fr, description_ar,
      quantity, unit_price, line_total
    ) VALUES
      (${invoiceAId}, ${serviceId}, 'A line', 'A ligne', 'أ', 1, 100.00, 100.00),
      (${invoiceBId}, ${serviceId}, 'B line', 'B ligne', 'ب', 1, 80.00, 80.00),
      (${invoiceCId}, ${serviceId}, 'C line', 'C ligne', 'ج', 1, 50.00, 50.00)
  `;

  const [payA] = await pgClient`
    INSERT INTO payments (
      organization_id, patient_id, payment_method_id, amount, reference_number, received_by
    )
    VALUES (
      ${orgId}, ${patientId}, ${paymentMethodId}, 100.00, 'B06-A', ${userId}
    )
    RETURNING id
  `;
  const paymentAId = payA.id as string;
  createdPaymentIds.push(paymentAId);
  await pgClient`
    INSERT INTO payment_allocations (payment_id, invoice_id, amount)
    VALUES (${paymentAId}, ${invoiceAId}, 100.00)
  `;

  const [payB] = await pgClient`
    INSERT INTO payments (
      organization_id, patient_id, payment_method_id, amount, reference_number, received_by
    )
    VALUES (
      ${orgId}, ${patientId}, ${paymentMethodId}, 30.00, 'B06-B', ${userId}
    )
    RETURNING id
  `;
  const paymentBId = payB.id as string;
  createdPaymentIds.push(paymentBId);
  await pgClient`
    INSERT INTO payment_allocations (payment_id, invoice_id, amount)
    VALUES (${paymentBId}, ${invoiceBId}, 30.00)
  `;

  // 1) no filters -> 3 invoices
  try {
    const res = await fetchJson(`${BASE}/api/invoices`, { userId });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const rows = res.data as Array<{ id: string }>;
    const ids = new Set(rows.map((r) => r.id));
    if (!ids.has(invoiceAId) || !ids.has(invoiceBId) || !ids.has(invoiceCId)) {
      throw new Error("Expected all A/B/C invoices in result");
    }
    console.log("✅ 1. GET /api/invoices returns all setup invoices");
    passed++;
  } catch (e) {
    console.log("❌ 1.", (e as Error).message);
    failed++;
  }

  // 2) status=draft -> only C
  try {
    const res = await fetchJson(`${BASE}/api/invoices?status=draft`, { userId });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const rows = res.data as Array<{ id: string }>;
    const ids = new Set(rows.map((r) => r.id));
    if (!ids.has(invoiceCId) || ids.has(invoiceAId) || ids.has(invoiceBId)) {
      throw new Error("Draft filter did not isolate invoice C");
    }
    console.log("✅ 2. status=draft filter works");
    passed++;
  } catch (e) {
    console.log("❌ 2.", (e as Error).message);
    failed++;
  }

  // 3) status=issued,partially_paid -> A and B
  try {
    const res = await fetchJson(`${BASE}/api/invoices?status=issued,partially_paid`, {
      userId,
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const rows = res.data as Array<{ id: string }>;
    const ids = new Set(rows.map((r) => r.id));
    if (!ids.has(invoiceAId) || !ids.has(invoiceBId) || ids.has(invoiceCId)) {
      throw new Error("Status IN filter did not return A+B only");
    }
    console.log("✅ 3. status list filter works");
    passed++;
  } catch (e) {
    console.log("❌ 3.", (e as Error).message);
    failed++;
  }

  // 4) patient filter
  try {
    const res = await fetchJson(`${BASE}/api/invoices?patient_id=${patientId}`, { userId });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const rows = res.data as Array<{ patient_id: string }>;
    if (!rows.every((r) => r.patient_id === patientId)) {
      throw new Error("Patient filter returned invoices for other patients");
    }
    console.log("✅ 4. patient_id filter works");
    passed++;
  } catch (e) {
    console.log("❌ 4.", (e as Error).message);
    failed++;
  }

  // 5) date range filter
  try {
    const res = await fetchJson(
      `${BASE}/api/invoices?start_date=${encodeURIComponent(startRange)}&end_date=${encodeURIComponent(endRange)}`,
      { userId }
    );
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const rows = res.data as Array<{ id: string }>;
    const ids = new Set(rows.map((r) => r.id));
    if (!ids.has(invoiceAId) || !ids.has(invoiceBId) || !ids.has(invoiceCId)) {
      throw new Error("Date range filter missed expected invoices");
    }
    console.log("✅ 5. start_date/end_date filter works");
    passed++;
  } catch (e) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  // 6) detail for B: balance_due=50, payments include partial
  try {
    const res = await fetchJson(`${BASE}/api/invoices/${invoiceBId}`, { userId });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const invoice = res.data as {
      balance_due: number;
      payments: Array<{ allocation_amount: string | number }>;
      lines: unknown[];
      patient: unknown;
      discount: unknown;
    };
    if (Number(invoice.balance_due) !== 50) {
      throw new Error(`Expected balance_due 50, got ${invoice.balance_due}`);
    }
    if (!Array.isArray(invoice.payments) || invoice.payments.length < 1) {
      throw new Error("Expected partial payment details in payments array");
    }
    if (!invoice.lines || !invoice.patient || !invoice.discount) {
      throw new Error("Missing nested fields in detail response");
    }
    console.log("✅ 6. Invoice B detail includes balance_due and payments");
    passed++;
  } catch (e) {
    console.log("❌ 6.", (e as Error).message);
    failed++;
  }

  // 7) detail for A: balance_due=0 and status=paid
  try {
    await pgClient`
      UPDATE invoices
      SET status = 'paid', updated_at = now()
      WHERE id = ${invoiceAId}
    `;
    const res = await fetchJson(`${BASE}/api/invoices/${invoiceAId}`, { userId });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const invoice = res.data as { balance_due: number; status: string };
    if (Number(invoice.balance_due) !== 0) {
      throw new Error(`Expected balance_due 0, got ${invoice.balance_due}`);
    }
    if (invoice.status !== "paid") {
      throw new Error(`Expected status paid, got ${invoice.status}`);
    }
    console.log("✅ 7. Invoice A detail shows paid and zero balance");
    passed++;
  } catch (e) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  // 8) non-existent -> 404
  try {
    const fakeId = "00000000-0000-0000-0000-000000000099";
    const res = await fetchJson(`${BASE}/api/invoices/${fakeId}`, { userId });
    if (res.status === 404) {
      console.log("✅ 8. Non-existent invoice returns 404");
      passed++;
    } else {
      throw new Error(`Expected 404, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 8.", (e as Error).message);
    failed++;
  }

  // 9) cross-org access -> 404
  try {
    const [otherOrg] = await pgClient`
      INSERT INTO organizations (name, slug)
      VALUES ('B06 Other Org', ${`b06-other-${Date.now()}`})
      RETURNING id
    `;
    const otherOrgId = otherOrg.id as string;
    createdOrgIds.push(otherOrgId);

    const [otherPatient] = await pgClient`
      INSERT INTO patients (
        organization_id, first_name, last_name, phone, is_active
      )
      VALUES (
        ${otherOrgId}, 'Other', 'Patient', ${`+1${Date.now().toString().slice(-10)}`}, true
      )
      RETURNING id
    `;
    const otherPatientId = otherPatient.id as string;
    createdPatientIds.push(otherPatientId);

    const [otherInvoice] = await pgClient`
      INSERT INTO invoices (
        organization_id, patient_id, invoice_number, status,
        subtotal, discount_amount, total, created_by
      )
      VALUES (
        ${otherOrgId}, ${otherPatientId}, ${`INV-B06-OTHER-${Date.now()}`}, 'issued',
        10.00, 0.00, 10.00, ${userId}
      )
      RETURNING id
    `;
    const otherInvoiceId = otherInvoice.id as string;
    createdInvoiceIds.push(otherInvoiceId);

    const res = await fetchJson(`${BASE}/api/invoices/${otherInvoiceId}`, { userId });
    if (res.status === 404) {
      console.log("✅ 9. Cross-org invoice access returns 404");
      passed++;
    } else {
      throw new Error(`Expected 404, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 9.", (e as Error).message);
    failed++;
  }

  await cleanup(
    createdPaymentIds,
    createdInvoiceIds,
    createdPatientIds,
    createdOrgIds,
    createdServiceIds,
    createdPaymentMethodIds
  );
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function cleanup(
  paymentIds: string[],
  invoiceIds: string[],
  patientIds: string[],
  orgIds: string[],
  serviceIds: string[],
  paymentMethodIds: string[]
) {
  for (const paymentId of paymentIds) {
    await pgClient`DELETE FROM payment_allocations WHERE payment_id = ${paymentId}`;
  }
  for (const paymentId of paymentIds) {
    await pgClient`DELETE FROM payments WHERE id = ${paymentId}`;
  }
  for (const invoiceId of invoiceIds) {
    await pgClient`DELETE FROM payment_allocations WHERE invoice_id = ${invoiceId}`;
    await pgClient`DELETE FROM invoice_lines WHERE invoice_id = ${invoiceId}`;
    await pgClient`DELETE FROM invoices WHERE id = ${invoiceId}`;
  }
  for (const patientId of patientIds) {
    await pgClient`DELETE FROM patients WHERE id = ${patientId}`;
  }
  for (const serviceId of serviceIds) {
    await pgClient`DELETE FROM services WHERE id = ${serviceId}`;
  }
  for (const paymentMethodId of paymentMethodIds) {
    await pgClient`DELETE FROM payment_methods WHERE id = ${paymentMethodId}`;
  }
  for (const orgId of orgIds) {
    await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
