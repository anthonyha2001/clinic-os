import "dotenv/config";
import { pgClient } from "./index";

async function testT01() {
  console.log("=== T-01 Smoke Test (Plans Schema) ===\n");
  let passed = 0;
  let failed = 0;

  let planId: string | null = null;
  const createdPlanItemIds: string[] = [];

  const [user] = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (!user) {
    console.log("SKIP: No user found.");
    process.exit(1);
  }
  const orgId = user.organization_id as string;
  const userId = user.id as string;

  const [provider] = await pgClient`
    SELECT id FROM provider_profiles
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  if (!provider) {
    console.log("SKIP: No provider found.");
    process.exit(1);
  }
  const providerId = provider.id as string;

  const [patient] = await pgClient`
    SELECT id FROM patients
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  if (!patient) {
    console.log("SKIP: No patient found.");
    process.exit(1);
  }
  const patientId = patient.id as string;

  const [service] = await pgClient`
    SELECT id, price FROM services
    WHERE organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (!service) {
    console.log("SKIP: No active service found.");
    process.exit(1);
  }
  const serviceId = service.id as string;
  const servicePrice = String(service.price);

  // 1) Insert plan with proposed status
  try {
    const [row] = await pgClient`
      INSERT INTO plans (
        organization_id, patient_id, provider_id,
        name_en, name_fr, name_ar, status,
        total_estimated_cost, notes, created_by
      )
      VALUES (
        ${orgId}, ${patientId}, ${providerId},
        'Care Plan T-01', 'Plan de soins T-01', 'خطة علاج T-01', 'proposed',
        100.00, 't01 smoke test', ${userId}
      )
      RETURNING id
    `;
    planId = row.id as string;
    console.log("✅ 1. Insert plan (proposed) succeeded");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 1.", (e as Error).message);
    failed++;
  }

  if (!planId) {
    console.log("\nCannot continue without plan id.");
    process.exit(1);
  }

  // 2) Insert two plan_items
  try {
    const i1 = await pgClient`
      INSERT INTO plan_items (
        plan_id, service_id, sequence_order,
        quantity_total, quantity_completed, unit_price,
        description_en, description_fr, description_ar
      )
      VALUES (
        ${planId}, ${serviceId}, 1,
        2, 0, ${servicePrice},
        'Item 1 EN', 'Item 1 FR', 'عنصر 1'
      )
      RETURNING id
    `;
    const i2 = await pgClient`
      INSERT INTO plan_items (
        plan_id, service_id, sequence_order,
        quantity_total, quantity_completed, unit_price
      )
      VALUES (
        ${planId}, ${serviceId}, 2,
        1, 0, ${servicePrice}
      )
      RETURNING id
    `;
    createdPlanItemIds.push(i1[0].id as string, i2[0].id as string);
    console.log("✅ 2. Insert 2 plan_items succeeded");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 2.", (e as Error).message);
    failed++;
  }

  // 3) Insert status history with old_status null -> proposed
  try {
    await pgClient`
      INSERT INTO plan_status_history (plan_id, old_status, new_status, changed_by, reason)
      VALUES (${planId}, NULL, 'proposed', ${userId}, 'Initial proposal')
    `;
    console.log("✅ 3. Insert plan_status_history (NULL -> proposed) succeeded");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 3.", (e as Error).message);
    failed++;
  }

  // 4) Violating check: quantity_completed > quantity_total
  try {
    await pgClient`
      INSERT INTO plan_items (
        plan_id, service_id, sequence_order,
        quantity_total, quantity_completed, unit_price
      )
      VALUES (
        ${planId}, ${serviceId}, 99,
        1, 2, ${servicePrice}
      )
    `;
    console.log("❌ 4. Expected check constraint violation did not happen");
    failed++;
  } catch (e: unknown) {
    const msg = (e as Error).message ?? "";
    const ok = msg.includes("plan_items_quantity_completed_lte_total");
    if (ok) {
      console.log("✅ 4. quantity_completed <= quantity_total check enforced");
      passed++;
    } else {
      console.log("❌ 4. Wrong error:", msg);
      failed++;
    }
  }

  // 5) Query plans by (organization_id, patient_id, status)
  try {
    const rows = await pgClient`
      SELECT id
      FROM plans
      WHERE organization_id = ${orgId}
        AND patient_id = ${patientId}
        AND status = 'proposed'
    `;
    const ok = rows.some((r) => r.id === planId);
    if (!ok) throw new Error("Expected plan not found in filtered query");
    console.log("✅ 5. Query by (organization_id, patient_id, status) returned plan");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  // 6) Query plan with items joined, ordered by sequence_order
  try {
    const rows = await pgClient`
      SELECT p.id AS plan_id, pi.id AS plan_item_id, pi.sequence_order
      FROM plans p
      LEFT JOIN plan_items pi ON pi.plan_id = p.id
      WHERE p.id = ${planId}
      ORDER BY pi.sequence_order ASC
    `;

    if (rows.length !== 2) {
      throw new Error(`Expected 2 joined items, got ${rows.length}`);
    }
    if (rows[0].sequence_order !== 1 || rows[1].sequence_order !== 2) {
      throw new Error("Sequence order mismatch");
    }
    console.log("✅ 6. Joined plan + items query returned 2 ordered items");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 6.", (e as Error).message);
    failed++;
  }

  // 7) Update plan status to accepted + history entry
  try {
    await pgClient`
      UPDATE plans
      SET status = 'accepted', accepted_at = now(), updated_at = now()
      WHERE id = ${planId}
    `;
    await pgClient`
      INSERT INTO plan_status_history (plan_id, old_status, new_status, changed_by, reason)
      VALUES (${planId}, 'proposed', 'accepted', ${userId}, 'Patient accepted')
    `;
    const [updated] = await pgClient`
      SELECT status FROM plans WHERE id = ${planId}
    `;
    if (!updated || updated.status !== "accepted") {
      throw new Error("Plan status was not updated to accepted");
    }
    console.log("✅ 7. Update status to accepted + history insert succeeded");
    passed++;
  } catch (e: unknown) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  // Cleanup
  try {
    await pgClient`DELETE FROM plan_status_history WHERE plan_id = ${planId}`;
    await pgClient`DELETE FROM plan_items WHERE plan_id = ${planId}`;
    await pgClient`DELETE FROM plans WHERE id = ${planId}`;
  } catch (e: unknown) {
    console.log("Cleanup warning:", (e as Error).message);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

testT01().catch((e) => {
  console.error(e);
  process.exit(1);
});
