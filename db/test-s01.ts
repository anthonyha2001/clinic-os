import "dotenv/config";
import { pgClient } from "./index";

async function main() {
  const testSlug = `test_s01_${Date.now()}`;
  let orgId: string | null = null;
  const fakeUserId = crypto.randomUUID();

  try {
    // Setup: org, user, provider_profile, patient, 2 services
    const [org] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('S01 Test', ${testSlug})
      RETURNING id
    `;
    orgId = org.id;

    await pgClient`
      INSERT INTO users (id, organization_id, email, full_name)
      VALUES (${fakeUserId}, ${orgId}, 'recep@test.com', 'Receptionist')
    `;

    const [provider] = await pgClient`
      INSERT INTO provider_profiles (organization_id, user_id)
      VALUES (${orgId}, ${fakeUserId})
      RETURNING id
    `;

    const [pat] = await pgClient`
      INSERT INTO patients (organization_id, first_name, last_name, phone)
      VALUES (${orgId}, 'Ahmad', 'Khoury', '+961-3-111222')
      RETURNING id
    `;

    const [svc1] = await pgClient`
      INSERT INTO services (organization_id, name_en, name_fr, name_ar, price, default_duration_minutes)
      VALUES (${orgId}, 'Cleaning', 'Nettoyage', 'تنظيف', 75.00, 30)
      RETURNING id
    `;

    const [svc2] = await pgClient`
      INSERT INTO services (organization_id, name_en, name_fr, name_ar, price, default_duration_minutes)
      VALUES (${orgId}, 'X-Ray', 'Radiographie', 'أشعة', 50.00, 15)
      RETURNING id
    `;

    const startTime = new Date("2026-03-01T10:00:00Z");
    const endTime = new Date("2026-03-01T10:45:00Z"); // 30 + 15 = 45 min

    // 1. Create appointment
    const [appt] = await pgClient`
      INSERT INTO appointments (
        organization_id, patient_id, provider_id, start_time, end_time, created_by
      ) VALUES (
        ${orgId}, ${pat.id}, ${provider.id}, ${startTime.toISOString()}, ${endTime.toISOString()}, ${fakeUserId}
      )
      RETURNING *
    `;
    console.log("✅ Appointment created");

    // 2. Verify NO service_id or plan_item_id on appointments
    const apptCols = await pgClient`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments'
    `;
    const colNames = apptCols.map((c: any) => c.column_name);
    if (colNames.includes("service_id")) throw new Error("appointments must NOT have service_id");
    if (colNames.includes("plan_item_id")) throw new Error("appointments must NOT have plan_item_id");
    console.log("✅ No service_id or plan_item_id on appointments table");

    // 3. Verify defaults
    if (appt.status !== "scheduled") throw new Error("Default status should be 'scheduled'");
    if (appt.deposit_required !== false) throw new Error("Default deposit_required should be false");
    console.log("✅ Defaults correct (status=scheduled, deposit_required=false)");

    // 4. Add appointment lines (multi-service)
    await pgClient`
      INSERT INTO appointment_lines (
        appointment_id, organization_id, service_id, quantity, unit_price, duration_minutes, sequence_order
      ) VALUES
        (${appt.id}, ${orgId}, ${svc1.id}, 1, '75.00', 30, 1),
        (${appt.id}, ${orgId}, ${svc2.id}, 1, '50.00', 15, 2)
    `;
    const lines = await pgClient`
      SELECT * FROM appointment_lines WHERE appointment_id = ${appt.id} ORDER BY sequence_order
    `;
    if (lines.length !== 2) throw new Error(`Expected 2 lines, got ${lines.length}`);
    console.log("✅ 2 appointment lines created");

    // 5. Price stored as exact decimal
    if (lines[0].unit_price !== "75.00") throw new Error(`Price should be "75.00", got "${lines[0].unit_price}"`);
    if (lines[1].unit_price !== "50.00") throw new Error(`Price should be "50.00", got "${lines[1].unit_price}"`);
    console.log("✅ Prices stored as exact decimal strings");

    // 6. Duration stored
    if (lines[0].duration_minutes !== 30) throw new Error("Line 1 duration should be 30");
    if (lines[1].duration_minutes !== 15) throw new Error("Line 2 duration should be 15");
    console.log("✅ Durations stored correctly");

    // 7. planItemId is nullable
    if (lines[0].plan_item_id !== null) throw new Error("plan_item_id should be null");
    console.log("✅ plan_item_id nullable (null by default)");

    // 8. Sequence order
    if (lines[0].sequence_order !== 1) throw new Error("First line sequence should be 1");
    if (lines[1].sequence_order !== 2) throw new Error("Second line sequence should be 2");
    console.log("✅ Sequence order correct");

    // 9. Create status history entry
    await pgClient`
      INSERT INTO appointment_status_history (
        appointment_id, old_status, new_status, changed_by
      ) VALUES (
        ${appt.id}, null, 'scheduled', ${fakeUserId}
      )
    `;
    const [hist] = await pgClient`
      SELECT * FROM appointment_status_history WHERE appointment_id = ${appt.id}
    `;
    if (hist.old_status !== null) throw new Error("Initial old_status should be null");
    if (hist.new_status !== "scheduled") throw new Error("new_status should be 'scheduled'");
    console.log("✅ Status history entry created (null → scheduled)");

    // 10. Status transition history
    await pgClient`
      UPDATE appointments SET status = 'confirmed' WHERE id = ${appt.id}
    `;
    await pgClient`
      INSERT INTO appointment_status_history (
        appointment_id, old_status, new_status, changed_by, reason
      ) VALUES (
        ${appt.id}, 'scheduled', 'confirmed', ${fakeUserId}, 'Patient confirmed by phone'
      )
    `;
    const allHist = await pgClient`
      SELECT * FROM appointment_status_history
      WHERE appointment_id = ${appt.id}
      ORDER BY created_at
    `;
    if (allHist.length !== 2) throw new Error(`Expected 2 history entries, got ${allHist.length}`);
    if (allHist[1].reason !== "Patient confirmed by phone") throw new Error("Reason not stored");
    console.log("✅ Status transition history with reason");

    // 11. Indexes exist
    const indexes = await pgClient`
      SELECT indexname FROM pg_indexes WHERE tablename = 'appointments'
    `;
    const idxNames = indexes.map((i: any) => i.indexname);
    const hasProviderIdx = idxNames.some((n: string) => n.includes("provider_time") || n.includes("appt_provider"));
    const hasPatientIdx = idxNames.some((n: string) => n.includes("patient") || n.includes("appt_patient"));
    if (!hasProviderIdx) throw new Error("Missing provider/time index");
    if (!hasPatientIdx) throw new Error("Missing patient index");
    console.log("✅ Indexes exist (provider+time, patient)");

    // 12. Org scoping
    const [org2] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('S01 Org2', ${testSlug + '_2'})
      RETURNING id
    `;
    const otherAppts = await pgClient`
      SELECT * FROM appointments WHERE organization_id = ${org2.id}
    `;
    if (otherAppts.length !== 0) throw new Error("Org2 should have 0 appointments");
    console.log("✅ Org scoping correct");
    await pgClient`DELETE FROM organizations WHERE id = ${org2.id}`;

    // 13. Cascade delete — deleting appointment removes lines and history
    const apptId = appt.id;
    await pgClient`DELETE FROM appointments WHERE id = ${apptId}`;
    const orphanLines = await pgClient`
      SELECT * FROM appointment_lines WHERE appointment_id = ${apptId}
    `;
    const orphanHist = await pgClient`
      SELECT * FROM appointment_status_history WHERE appointment_id = ${apptId}
    `;
    if (orphanLines.length !== 0) throw new Error("Cascade should remove lines");
    if (orphanHist.length !== 0) throw new Error("Cascade should remove history");
    console.log("✅ Cascade delete removes lines and history");

    // 14. Line with quantity > 1
    const [appt2] = await pgClient`
      INSERT INTO appointments (
        organization_id, patient_id, provider_id, start_time, end_time, created_by
      ) VALUES (
        ${orgId}, ${pat.id}, ${provider.id},
        '2026-03-02T14:00:00Z', '2026-03-02T14:40:00Z', ${fakeUserId}
      )
      RETURNING id
    `;
    await pgClient`
      INSERT INTO appointment_lines (
        appointment_id, organization_id, service_id, quantity, unit_price, duration_minutes
      ) VALUES (
        ${appt2.id}, ${orgId}, ${svc1.id}, 2, '75.00', 20
      )
    `;
    const [multiQty] = await pgClient`
      SELECT quantity, duration_minutes FROM appointment_lines WHERE appointment_id = ${appt2.id}
    `;
    if (multiQty.quantity !== 2) throw new Error("Quantity should be 2");
    if (multiQty.duration_minutes !== 20) throw new Error("Duration override should be 20");
    console.log("✅ Line with quantity=2 and duration override");

    console.log("\n🎉 S-01 ALL CHECKS PASSED");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    if (orgId) {
      await pgClient`DELETE FROM appointment_status_history WHERE appointment_id IN (SELECT id FROM appointments WHERE organization_id = ${orgId})`;
      await pgClient`DELETE FROM appointment_lines WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM appointments WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM services WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM provider_profiles WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM patients WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM users WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
      console.log("🧹 Test data cleaned up");
    }
    await pgClient.end();
  }
}

main();
