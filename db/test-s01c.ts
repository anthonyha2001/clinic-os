import "dotenv/config";
import { pgClient } from "./index";

async function testS01c() {
  console.log("=== S-01c Smoke Test ===\n");
  let passed = 0;
  let failed = 0;

  // Get test org, provider, patient, service, user from existing data
  const orgRes = await pgClient`SELECT id FROM organizations LIMIT 1`;
  if (orgRes.length === 0) {
    console.log("SKIP: No org found. Run test-k02b first.");
    return;
  }
  const orgId = orgRes[0].id;

  const userRes = await pgClient`SELECT id FROM users WHERE organization_id = ${orgId} LIMIT 1`;
  const userId = userRes[0].id;

  const providerRes = await pgClient`SELECT id FROM provider_profiles WHERE organization_id = ${orgId} LIMIT 1`;
  if (providerRes.length === 0) {
    console.log("SKIP: No provider found. Create one first.");
    return;
  }
  const providerId = providerRes[0].id;

  const patientRes = await pgClient`SELECT id FROM patients WHERE organization_id = ${orgId} LIMIT 1`;
  if (patientRes.length === 0) {
    console.log("SKIP: No patient found. Run test-p01 first.");
    return;
  }
  const patientId = patientRes[0].id;

  const serviceRes = await pgClient`SELECT id, price, default_duration_minutes FROM services WHERE organization_id = ${orgId} LIMIT 1`;
  if (serviceRes.length === 0) {
    console.log("SKIP: No service found.");
    return;
  }
  const service = serviceRes[0];

  // --- CHECK 1: chk_duration_bounds constraint exists ---
  try {
    const res = await pgClient`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'appointments' AND constraint_name = 'chk_duration_bounds'
    `;
    console.log(res.length === 1 ? "✅ 1. chk_duration_bounds constraint exists" : "❌ 1. chk_duration_bounds NOT FOUND");
    res.length === 1 ? passed++ : failed++;
  } catch (e: any) { console.log("❌ 1.", e.message); failed++; }

  // --- CHECK 2: end_time = start_time → rejected ---
  try {
    const start = "2025-06-01T10:00:00Z";
    await pgClient`
      INSERT INTO appointments (organization_id, patient_id, provider_id, start_time, end_time, status, created_by)
      VALUES (${orgId}, ${patientId}, ${providerId}, ${start}, ${start}, 'scheduled', ${userId})
    `;
    console.log("❌ 2. end_time = start_time should have been rejected");
    failed++;
  } catch (e: any) {
    const ok = e.message.includes("chk_duration_bounds");
    console.log(ok ? "✅ 2. end_time = start_time → constraint violation" : "❌ 2. Wrong error: " + e.message);
    ok ? passed++ : failed++;
  }

  // --- CHECK 3: end_time = start_time + 3min → rejected ---
  try {
    await pgClient`
      INSERT INTO appointments (organization_id, patient_id, provider_id, start_time, end_time, status, created_by)
      VALUES (${orgId}, ${patientId}, ${providerId}, '2025-06-01T10:00:00Z', '2025-06-01T10:03:00Z', 'scheduled', ${userId})
    `;
    console.log("❌ 3. 3min duration should have been rejected");
    failed++;
  } catch (e: any) {
    const ok = e.message.includes("chk_duration_bounds");
    console.log(ok ? "✅ 3. 3min duration → constraint violation" : "❌ 3. Wrong error: " + e.message);
    ok ? passed++ : failed++;
  }

  // --- CHECK 4: end_time = start_time + 5min → accepted ---
  let appt5minId: string | null = null;
  try {
    const res = await pgClient`
      INSERT INTO appointments (organization_id, patient_id, provider_id, start_time, end_time, status, created_by)
      VALUES (${orgId}, ${patientId}, ${providerId}, '2025-07-01T08:00:00Z', '2025-07-01T08:05:00Z', 'scheduled', ${userId})
      RETURNING id
    `;
    appt5minId = res[0].id;
    console.log("✅ 4. 5min duration → accepted");
    passed++;
  } catch (e: any) { console.log("❌ 4.", e.message); failed++; }

  // --- CHECK 5: end_time = start_time + 11h → accepted ---
  let appt11hId: string | null = null;
  try {
    const res = await pgClient`
      INSERT INTO appointments (organization_id, patient_id, provider_id, start_time, end_time, status, created_by)
      VALUES (${orgId}, ${patientId}, ${providerId}, '2025-07-02T06:00:00Z', '2025-07-02T17:00:00Z', 'scheduled', ${userId})
      RETURNING id
    `;
    appt11hId = res[0].id;
    console.log("✅ 5. 11h duration → accepted");
    passed++;
  } catch (e: any) { console.log("❌ 5.", e.message); failed++; }

  // --- CHECK 6: end_time = start_time + 13h → rejected ---
  try {
    await pgClient`
      INSERT INTO appointments (organization_id, patient_id, provider_id, start_time, end_time, status, created_by)
      VALUES (${orgId}, ${patientId}, ${providerId}, '2025-07-03T06:00:00Z', '2025-07-03T19:00:00Z', 'scheduled', ${userId})
    `;
    console.log("❌ 6. 13h duration should have been rejected");
    failed++;
  } catch (e: any) {
    const ok = e.message.includes("chk_duration_bounds");
    console.log(ok ? "✅ 6. 13h duration → constraint violation" : "❌ 6. Wrong error: " + e.message);
    ok ? passed++ : failed++;
  }

  // --- CHECK 7: set_org_id_from_parent() function exists ---
  try {
    const res = await pgClient`
      SELECT routine_name FROM information_schema.routines
      WHERE routine_name = 'set_org_id_from_parent' AND routine_schema = 'public'
    `;
    console.log(res.length >= 1 ? "✅ 7. set_org_id_from_parent() function exists" : "❌ 7. Function NOT FOUND");
    res.length >= 1 ? passed++ : failed++;
  } catch (e: any) { console.log("❌ 7.", e.message); failed++; }

  // --- CHECK 8: Trigger sets org_id from parent (NULL → filled) ---
  if (appt5minId) {
    try {
      const res = await pgClient`
        INSERT INTO appointment_lines (appointment_id, service_id, quantity, unit_price, duration_minutes, sequence_order)
        VALUES (${appt5minId}, ${service.id}, 1, ${service.price}, ${service.default_duration_minutes}, 1)
        RETURNING organization_id
      `;
      const lineOrgId = res[0].organization_id;
      const ok = lineOrgId === orgId;
      console.log(ok ? "✅ 8. Trigger sets org_id from parent (NULL input → filled)" : "❌ 8. org_id mismatch: " + lineOrgId);
      ok ? passed++ : failed++;
    } catch (e: any) { console.log("❌ 8.", e.message); failed++; }
  } else {
    console.log("⏭️  8. Skipped (no 5min appointment)");
  }

  // --- CHECK 9: Trigger overwrites wrong org_id ---
  if (appt11hId) {
    try {
      const fakeOrgId = "00000000-0000-0000-0000-000000000000";
      const res = await pgClient`
        INSERT INTO appointment_lines (appointment_id, organization_id, service_id, quantity, unit_price, duration_minutes, sequence_order)
        VALUES (${appt11hId}, ${fakeOrgId}, ${service.id}, 1, ${service.price}, ${service.default_duration_minutes}, 1)
        RETURNING organization_id
      `;
      const lineOrgId = res[0].organization_id;
      const ok = lineOrgId === orgId;
      console.log(ok ? "✅ 9. Trigger overwrites wrong org_id with parent's" : "❌ 9. org_id not overwritten: " + lineOrgId);
      ok ? passed++ : failed++;
    } catch (e: any) { console.log("❌ 9.", e.message); failed++; }
  } else {
    console.log("⏭️  9. Skipped (no 11h appointment)");
  }

  // --- CHECK 10: Trigger raises exception for non-existent appointment ---
  try {
    const fakeApptId = "00000000-0000-0000-0000-000000000099";
    await pgClient`
      INSERT INTO appointment_lines (appointment_id, service_id, quantity, unit_price, duration_minutes, sequence_order)
      VALUES (${fakeApptId}, ${service.id}, 1, 50.00, 30, 1)
    `;
    console.log("❌ 10. Non-existent appointment_id should have been rejected");
    failed++;
  } catch (e: any) {
    // Could be FK violation or trigger exception — both valid
    const ok = e.message.includes("Parent record not found") || e.message.includes("violates foreign key");
    console.log(ok ? "✅ 10. Non-existent appointment_id → rejected" : "❌ 10. Wrong error: " + e.message);
    ok ? passed++ : failed++;
  }

  // --- CHECK 11: trg_set_org_id trigger exists on appointment_lines ---
  try {
    const res = await pgClient`
      SELECT trigger_name FROM information_schema.triggers
      WHERE event_object_table = 'appointment_lines' AND trigger_name = 'trg_set_org_id'
    `;
    console.log(res.length >= 1 ? "✅ 11. trg_set_org_id trigger exists on appointment_lines" : "❌ 11. Trigger NOT FOUND");
    res.length >= 1 ? passed++ : failed++;
  } catch (e: any) { console.log("❌ 11.", e.message); failed++; }

  // --- Cleanup ---
  if (appt5minId) {
    await pgClient`DELETE FROM appointment_lines WHERE appointment_id = ${appt5minId}`;
    await pgClient`DELETE FROM appointments WHERE id = ${appt5minId}`;
  }
  if (appt11hId) {
    await pgClient`DELETE FROM appointment_lines WHERE appointment_id = ${appt11hId}`;
    await pgClient`DELETE FROM appointments WHERE id = ${appt11hId}`;
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed out of ${passed + failed} ===`);
  process.exit(failed > 0 ? 1 : 0);
}

testS01c().catch(console.error);