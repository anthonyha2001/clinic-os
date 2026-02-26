import "dotenv/config";
import { pgClient } from "./index";

type IdRow = { id: string };

async function testB01() {
  console.log("=== B-01 Smoke Test (Invoices schema) ===\n");
  let passed = 0;
  let failed = 0;

  const createdInvoiceIds: string[] = [];
  const createdOrgIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdAppointmentIds: string[] = [];
  const createdPlanIds: string[] = [];
  const createdPlanItemIds: string[] = [];

  const [user] = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (!user) {
    console.log("SKIP: No user found.");
    process.exit(1);
  }
  const userId = user.id as string;
  const orgId = user.organization_id as string;

  const [patient] = await pgClient`
    SELECT id FROM patients
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  if (!patient) {
    console.log("SKIP: No patient in primary org.");
    process.exit(1);
  }
  const patientId = patient.id as string;

  const [provider] = await pgClient`
    SELECT id FROM provider_profiles
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  if (!provider) {
    console.log("SKIP: No provider in primary org.");
    process.exit(1);
  }
  const providerId = provider.id as string;

  const [service] = await pgClient`
    SELECT id, price FROM services
    WHERE organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (!service) {
    console.log("SKIP: No active service in primary org.");
    process.exit(1);
  }
  const serviceId = service.id as string;
  const servicePrice = String(service.price);

  let appointmentId: string;
  const [existingAppointment] = await pgClient`
    SELECT id FROM appointments
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  if (existingAppointment) {
    appointmentId = existingAppointment.id as string;
  } else {
    const [createdAppt] = await pgClient`
      INSERT INTO appointments (
        organization_id, patient_id, provider_id, start_time, end_time, status, created_by
      )
      VALUES (
        ${orgId},
        ${patientId},
        ${providerId},
        '2026-06-01T10:00:00Z'::timestamptz,
        '2026-06-01T10:30:00Z'::timestamptz,
        'scheduled',
        ${userId}
      )
      RETURNING id
    `;
    appointmentId = createdAppt.id as string;
    createdAppointmentIds.push(appointmentId);
  }

  let planItemId: string;
  const [existingPlanItem] = await pgClient`SELECT id FROM plan_items LIMIT 1`;
  if (existingPlanItem) {
    planItemId = existingPlanItem.id as string;
  } else {
    const [createdPlan] = await pgClient`
      INSERT INTO plans (
        organization_id, patient_id, provider_id, name_en, name_fr, name_ar, status, created_by
      )
      VALUES (
        ${orgId},
        ${patientId},
        ${providerId},
        'B01 Plan EN',
        'B01 Plan FR',
        'B01 Plan AR',
        'proposed',
        ${userId}
      )
      RETURNING id
    `;
    const planId = createdPlan.id as string;
    createdPlanIds.push(planId);

    const [createdPlanItem] = await pgClient`
      INSERT INTO plan_items (
        plan_id, service_id, sequence_order, quantity_total, quantity_completed, unit_price
      )
      VALUES (
        ${planId},
        ${serviceId},
        1,
        1,
        0,
        ${servicePrice}
      )
      RETURNING id
    `;
    planItemId = createdPlanItem.id as string;
    createdPlanItemIds.push(planItemId);
  }

  let secondOrgId: string;
  let secondOrgPatientId: string;

  const [otherOrg] = await pgClient`
    SELECT id FROM organizations
    WHERE id != ${orgId}
    LIMIT 1
  `;
  if (otherOrg) {
    secondOrgId = otherOrg.id as string;
    const [otherPatient] = await pgClient`
      SELECT id FROM patients
      WHERE organization_id = ${secondOrgId}
      LIMIT 1
    `;
    if (otherPatient) {
      secondOrgPatientId = otherPatient.id as string;
    } else {
      const [createdPatient] = await pgClient`
        INSERT INTO patients (
          organization_id, first_name, last_name, phone, is_active
        )
        VALUES (
          ${secondOrgId},
          'B01',
          'OtherOrgPatient',
          ${`+1${Date.now().toString().slice(-10)}`},
          true
        )
        RETURNING id
      `;
      secondOrgPatientId = createdPatient.id as string;
      createdPatientIds.push(secondOrgPatientId);
    }
  } else {
    const [createdOrg] = await pgClient`
      INSERT INTO organizations (
        name, slug
      )
      VALUES (
        'B01 Org',
        ${`b01-org-${Date.now()}`}
      )
      RETURNING id
    `;
    secondOrgId = createdOrg.id as string;
    createdOrgIds.push(secondOrgId);

    const [createdPatient] = await pgClient`
      INSERT INTO patients (
        organization_id, first_name, last_name, phone, is_active
      )
      VALUES (
        ${secondOrgId},
        'B01',
        'SecondOrgPatient',
        ${`+1${(Date.now() + 1).toString().slice(-10)}`},
        true
      )
      RETURNING id
    `;
    secondOrgPatientId = createdPatient.id as string;
    createdPatientIds.push(secondOrgPatientId);
  }

  const invoiceNumber = `INV-B01-${Date.now()}`;
  const secondInvoiceNumber = `INV-B01-2-${Date.now()}`;
  let invoiceId: string | null = null;

  // 1) Insert invoice draft
  try {
    const [inv] = await pgClient`
      INSERT INTO invoices (
        organization_id, patient_id, appointment_id, invoice_number, status,
        subtotal, discount_amount, total, created_by
      )
      VALUES (
        ${orgId},
        ${patientId},
        ${appointmentId},
        ${invoiceNumber},
        'draft',
        100.00,
        0.00,
        100.00,
        ${userId}
      )
      RETURNING id
    `;
    invoiceId = inv.id as string;
    createdInvoiceIds.push(invoiceId);
    console.log("✅ 1. Insert draft invoice succeeded");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 1.", (e as Error).message);
    failed++;
  }

  // 2) Insert 2 invoice_lines (service + plan_item)
  try {
    if (!invoiceId) throw new Error("Missing invoice id");
    await pgClient`
      INSERT INTO invoice_lines (
        invoice_id, service_id, description_en, description_fr, description_ar,
        quantity, unit_price, line_total
      )
      VALUES (
        ${invoiceId},
        ${serviceId},
        'Service line',
        'Ligne service',
        'سطر خدمة',
        1,
        50.00,
        50.00
      )
    `;
    await pgClient`
      INSERT INTO invoice_lines (
        invoice_id, plan_item_id, description_en, description_fr, description_ar,
        quantity, unit_price, line_total
      )
      VALUES (
        ${invoiceId},
        ${planItemId},
        'Plan item line',
        'Ligne plan',
        'سطر خطة',
        1,
        50.00,
        50.00
      )
    `;
    console.log("✅ 2. Insert 2 invoice_lines succeeded");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 2.", (e as Error).message);
    failed++;
  }

  // 3) Same invoice_number same org -> unique violation
  try {
    await pgClient`
      INSERT INTO invoices (
        organization_id, patient_id, invoice_number, status,
        subtotal, discount_amount, total, created_by
      )
      VALUES (
        ${orgId},
        ${patientId},
        ${invoiceNumber},
        'draft',
        10.00,
        0.00,
        10.00,
        ${userId}
      )
    `;
    console.log("❌ 3. Duplicate invoice_number in same org should fail");
    failed++;
  } catch (e: unknown) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("invoices_org_invoice_number_unique")) {
      console.log("✅ 3. Same invoice_number same org -> unique violation");
      passed++;
    } else {
      console.log("❌ 3. Wrong error:", msg);
      failed++;
    }
  }

  // 4) Same invoice_number different org -> succeeds
  try {
    const [inv] = await pgClient`
      INSERT INTO invoices (
        organization_id, patient_id, invoice_number, status,
        subtotal, discount_amount, total, created_by
      )
      VALUES (
        ${secondOrgId},
        ${secondOrgPatientId},
        ${invoiceNumber},
        'draft',
        20.00,
        0.00,
        20.00,
        ${userId}
      )
      RETURNING id
    `;
    createdInvoiceIds.push(inv.id as string);
    console.log("✅ 4. Same invoice_number different org -> succeeds");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 4.", (e as Error).message);
    failed++;
  }

  // 5) invoice_line with both service_id and plan_item_id -> succeeds
  try {
    if (!invoiceId) throw new Error("Missing invoice id");
    await pgClient`
      INSERT INTO invoice_lines (
        invoice_id, service_id, plan_item_id,
        description_en, description_fr, description_ar,
        quantity, unit_price, line_total
      )
      VALUES (
        ${invoiceId},
        ${serviceId},
        ${planItemId},
        'Combined line',
        'Ligne combinée',
        'سطر مشترك',
        1,
        10.00,
        10.00
      )
    `;
    console.log("✅ 5. invoice_line with both service_id and plan_item_id succeeds");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  // 6) invoice_line with neither service_id nor plan_item_id -> succeeds
  try {
    if (!invoiceId) throw new Error("Missing invoice id");
    await pgClient`
      INSERT INTO invoice_lines (
        invoice_id, description_en, description_fr, description_ar,
        quantity, unit_price, line_total
      )
      VALUES (
        ${invoiceId},
        'Manual line',
        'Ligne manuelle',
        'سطر يدوي',
        1,
        5.00,
        5.00
      )
    `;
    console.log("✅ 6. manual invoice_line (no service/plan_item) succeeds");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 6.", (e as Error).message);
    failed++;
  }

  // 7) Query invoices by (organization_id, status)
  try {
    const rows = await pgClient`
      SELECT id
      FROM invoices
      WHERE organization_id = ${orgId}
        AND status = 'draft'
    `;
    const ok = invoiceId ? rows.some((r) => r.id === invoiceId) : false;
    if (!ok) throw new Error("Expected invoice not found in filtered query");
    console.log("✅ 7. Query invoices by (organization_id, status) works");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  // 8) Query invoice + joined lines
  try {
    if (!invoiceId) throw new Error("Missing invoice id");
    const rows = await pgClient`
      SELECT i.id AS invoice_id, l.id AS line_id
      FROM invoices i
      LEFT JOIN invoice_lines l ON l.invoice_id = i.id
      WHERE i.id = ${invoiceId}
      ORDER BY l.created_at ASC
    `;
    if (rows.length < 2) {
      throw new Error(`Expected at least 2 lines, got ${rows.length}`);
    }
    console.log("✅ 8. Query invoice with joined lines works");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 8.", (e as Error).message);
    failed++;
  }

  // 9) appointment_id UNIQUE enforcement
  try {
    await pgClient`
      INSERT INTO invoices (
        organization_id, patient_id, appointment_id, invoice_number, status,
        subtotal, discount_amount, total, created_by
      )
      VALUES (
        ${orgId},
        ${patientId},
        ${appointmentId},
        ${secondInvoiceNumber},
        'draft',
        30.00,
        0.00,
        30.00,
        ${userId}
      )
    `;
    console.log("❌ 9. Duplicate appointment_id should fail");
    failed++;
  } catch (e: unknown) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("invoices_appointment_id_unique")) {
      console.log("✅ 9. appointment_id unique constraint enforced");
      passed++;
    } else {
      console.log("❌ 9. Wrong error:", msg);
      failed++;
    }
  }

  await cleanup(
    createdInvoiceIds,
    createdPlanItemIds,
    createdPlanIds,
    createdAppointmentIds,
    createdPatientIds,
    createdOrgIds
  );

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function cleanup(
  invoiceIds: string[],
  planItemIds: string[],
  planIds: string[],
  appointmentIds: string[],
  patientIds: string[],
  orgIds: string[]
) {
  for (const invoiceId of invoiceIds) {
    await pgClient`DELETE FROM invoice_lines WHERE invoice_id = ${invoiceId}`;
  }
  for (const invoiceId of invoiceIds) {
    await pgClient`DELETE FROM invoices WHERE id = ${invoiceId}`;
  }

  for (const apptId of appointmentIds) {
    await pgClient`DELETE FROM appointment_status_history WHERE appointment_id = ${apptId}`;
    await pgClient`DELETE FROM appointment_lines WHERE appointment_id = ${apptId}`;
    await pgClient`DELETE FROM appointments WHERE id = ${apptId}`;
  }

  for (const planId of planIds) {
    await pgClient`DELETE FROM plan_status_history WHERE plan_id = ${planId}`;
    await pgClient`DELETE FROM plan_items WHERE plan_id = ${planId}`;
    await pgClient`DELETE FROM plans WHERE id = ${planId}`;
  }
  for (const planItemId of planItemIds) {
    await pgClient`DELETE FROM plan_items WHERE id = ${planItemId}`;
  }
  for (const patientId of patientIds) {
    await pgClient`DELETE FROM patients WHERE id = ${patientId}`;
  }
  for (const orgId of orgIds) {
    await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
  }
}

testB01().catch((e) => {
  console.error(e);
  process.exit(1);
});
