import "dotenv/config";
import { pgClient } from "./index";

async function testB04() {
  console.log("=== B-04 Smoke Test (Payments & Allocations schema) ===\n");
  let passed = 0;
  let failed = 0;

  const createdPaymentIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdPaymentMethodIds: string[] = [];

  const [user] = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (!user) {
    console.log("SKIP: No user found.");
    process.exit(1);
  }
  const userId = user.id as string;
  const orgId = user.organization_id as string;

  const [patient] = await pgClient`
    SELECT id
    FROM patients
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  if (!patient) {
    console.log("SKIP: No patient found.");
    process.exit(1);
  }
  const patientId = patient.id as string;

  let paymentMethodId: string;
  const [paymentMethod] = await pgClient`
    SELECT id
    FROM payment_methods
    WHERE organization_id = ${orgId}
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

  const [service] = await pgClient`
    SELECT id
    FROM services
    WHERE organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (!service) {
    console.log("SKIP: No active service found.");
    process.exit(1);
  }

  const invoiceNumberA = `INV-B04-A-${Date.now()}`;
  const invoiceNumberB = `INV-B04-B-${Date.now()}`;
  let invoiceAId = "";
  let invoiceBId = "";

  try {
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
    invoiceAId = invA.id as string;
    createdInvoiceIds.push(invoiceAId);

    await pgClient`
      INSERT INTO invoice_lines (
        invoice_id, service_id, description_en, description_fr, description_ar,
        quantity, unit_price, line_total
      )
      VALUES (
        ${invoiceAId}, ${service.id}, 'B04 Base Invoice', 'B04 Facture Base', 'فاتورة اساسية',
        1, 100.00, 100.00
      )
    `;

    const [invB] = await pgClient`
      INSERT INTO invoices (
        organization_id, patient_id, invoice_number, status,
        subtotal, discount_amount, total, created_by, issued_at
      )
      VALUES (
        ${orgId}, ${patientId}, ${invoiceNumberB}, 'issued',
        50.00, 0.00, 50.00, ${userId}, now()
      )
      RETURNING id
    `;
    invoiceBId = invB.id as string;
    createdInvoiceIds.push(invoiceBId);

    await pgClient`
      INSERT INTO invoice_lines (
        invoice_id, service_id, description_en, description_fr, description_ar,
        quantity, unit_price, line_total
      )
      VALUES (
        ${invoiceBId}, ${service.id}, 'B04 Split Invoice', 'B04 Facture Split', 'فاتورة تقسيم',
        1, 50.00, 50.00
      )
    `;
  } catch (e: unknown) {
    console.log("SKIP: Could not create test invoices:", (e as Error).message);
    await cleanup(createdPaymentIds, createdInvoiceIds, createdPaymentMethodIds);
    process.exit(1);
  }

  // 1) Insert payment amount 100
  let payment1Id = "";
  try {
    const [payment] = await pgClient`
      INSERT INTO payments (
        organization_id, patient_id, payment_method_id, amount, reference_number, notes, received_by
      )
      VALUES (
        ${orgId}, ${patientId}, ${paymentMethodId}, 100.00, 'B04-P1', 'primary payment', ${userId}
      )
      RETURNING id
    `;
    payment1Id = payment.id as string;
    createdPaymentIds.push(payment1Id);
    console.log("✅ 1. Insert payment amount=100 succeeded");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 1.", (e as Error).message);
    failed++;
  }

  // 2) Insert payment_allocation amount 100
  try {
    await pgClient`
      INSERT INTO payment_allocations (payment_id, invoice_id, amount)
      VALUES (${payment1Id}, ${invoiceAId}, 100.00)
    `;
    console.log("✅ 2. Insert payment allocation succeeded");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 2.", (e as Error).message);
    failed++;
  }

  // 3) Allocation amount 0 -> CHECK violation
  try {
    await pgClient`
      INSERT INTO payment_allocations (payment_id, invoice_id, amount)
      VALUES (${payment1Id}, ${invoiceAId}, 0)
    `;
    console.log("❌ 3. amount=0 should fail");
    failed++;
  } catch (e: unknown) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("payment_allocations_amount_gt_zero")) {
      console.log("✅ 3. amount=0 check enforced");
      passed++;
    } else {
      console.log("❌ 3. Wrong error:", msg);
      failed++;
    }
  }

  // 4) Allocation amount -10 -> CHECK violation
  try {
    await pgClient`
      INSERT INTO payment_allocations (payment_id, invoice_id, amount)
      VALUES (${payment1Id}, ${invoiceAId}, -10)
    `;
    console.log("❌ 4. amount=-10 should fail");
    failed++;
  } catch (e: unknown) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("payment_allocations_amount_gt_zero")) {
      console.log("✅ 4. amount=-10 check enforced");
      passed++;
    } else {
      console.log("❌ 4. Wrong error:", msg);
      failed++;
    }
  }

  // 5) Second payment same patient different amount -> succeeds
  let payment2Id = "";
  try {
    const [payment] = await pgClient`
      INSERT INTO payments (
        organization_id, patient_id, payment_method_id, amount, reference_number, received_by
      )
      VALUES (
        ${orgId}, ${patientId}, ${paymentMethodId}, 60.00, 'B04-P2', ${userId}
      )
      RETURNING id
    `;
    payment2Id = payment.id as string;
    createdPaymentIds.push(payment2Id);
    console.log("✅ 5. Second payment for same patient succeeded");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  // 6) Split payment to two invoices -> succeeds
  try {
    await pgClient`
      INSERT INTO payment_allocations (payment_id, invoice_id, amount)
      VALUES (${payment2Id}, ${invoiceAId}, 30.00)
    `;
    await pgClient`
      INSERT INTO payment_allocations (payment_id, invoice_id, amount)
      VALUES (${payment2Id}, ${invoiceBId}, 30.00)
    `;
    console.log("✅ 6. Split payment allocations succeeded");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 6.", (e as Error).message);
    failed++;
  }

  // 7) Query payment with allocations joined
  try {
    const rows = await pgClient`
      SELECT p.id AS payment_id, pa.invoice_id
      FROM payments p
      LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
      WHERE p.id = ${payment2Id}
      ORDER BY pa.created_at ASC
    `;
    if (rows.length < 2) {
      throw new Error(`Expected at least 2 allocations, got ${rows.length}`);
    }
    console.log("✅ 7. Payment with joined allocations query works");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  // 8) Query allocations by invoice_id
  try {
    const rows = await pgClient`
      SELECT id
      FROM payment_allocations
      WHERE invoice_id = ${invoiceAId}
    `;
    if (rows.length < 2) {
      throw new Error(`Expected at least 2 allocations for invoice, got ${rows.length}`);
    }
    console.log("✅ 8. Allocation query by invoice_id works");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 8.", (e as Error).message);
    failed++;
  }

  // 9) FK: non-existent payment_id -> fails
  try {
    await pgClient`
      INSERT INTO payment_allocations (payment_id, invoice_id, amount)
      VALUES ('00000000-0000-0000-0000-000000000099'::uuid, ${invoiceAId}, 5.00)
    `;
    console.log("❌ 9. Non-existent payment_id should fail");
    failed++;
  } catch (e: unknown) {
    const msg = (e as Error).message ?? "";
    if (msg.toLowerCase().includes("foreign key")) {
      console.log("✅ 9. FK enforcement on payment_id works");
      passed++;
    } else {
      console.log("❌ 9. Wrong error:", msg);
      failed++;
    }
  }

  await cleanup(createdPaymentIds, createdInvoiceIds, createdPaymentMethodIds);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function cleanup(
  paymentIds: string[],
  invoiceIds: string[],
  paymentMethodIds: string[]
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
  for (const methodId of paymentMethodIds) {
    await pgClient`DELETE FROM payment_methods WHERE id = ${methodId}`;
  }
}

testB04().catch((e) => {
  console.error(e);
  process.exit(1);
});
