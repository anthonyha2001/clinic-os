import "dotenv/config";
import { pgClient } from "./index";

async function main() {
  const testSlug = `test_s01b_${Date.now()}`;
  let orgId: string | null = null;
  const fakeUserId = crypto.randomUUID();

  try {
    // Setup: org, user, provider, patient
    const [org] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('S01b Test', ${testSlug})
      RETURNING id
    `;
    orgId = org.id;

    await pgClient`
      INSERT INTO users (id, organization_id, email, full_name)
      VALUES (${fakeUserId}, ${orgId}, 'recep@test.com', 'Receptionist')
    `;

    const [prov1] = await pgClient`
      INSERT INTO provider_profiles (organization_id, user_id)
      VALUES (${orgId}, ${fakeUserId})
      RETURNING id
    `;

    const [pat] = await pgClient`
      INSERT INTO patients (organization_id, first_name, last_name, phone)
      VALUES (${orgId}, 'Ahmad', 'Khoury', '+961-3-111222')
      RETURNING id
    `;

    // 1. Book 10:00-10:30
    await pgClient`
      INSERT INTO appointments (
        organization_id, patient_id, provider_id, start_time, end_time, created_by
      ) VALUES (
        ${orgId}, ${pat.id}, ${prov1.id},
        '2026-04-01T10:00:00Z', '2026-04-01T10:30:00Z', ${fakeUserId}
      )
    `;
    console.log("✅ First booking 10:00-10:30 created");

    // 2. Overlapping booking should fail (10:15-10:45)
    try {
      await pgClient`
        INSERT INTO appointments (
          organization_id, patient_id, provider_id, start_time, end_time, created_by
        ) VALUES (
          ${orgId}, ${pat.id}, ${prov1.id},
          '2026-04-01T10:15:00Z', '2026-04-01T10:45:00Z', ${fakeUserId}
        )
      `;
      throw new Error("Should have failed — overlapping booking!");
    } catch (err: any) {
      if (err.message.includes("Should have failed")) throw err;
      if (err.code === "23P01" || err.message.includes("exclusion") || err.message.includes("no_double_booking")) {
        console.log("✅ Overlapping booking rejected (EXCLUDE constraint)");
      } else {
        throw err;
      }
    }

    // 3. Adjacent booking should succeed (10:30-11:00)
    await pgClient`
      INSERT INTO appointments (
        organization_id, patient_id, provider_id, start_time, end_time, created_by
      ) VALUES (
        ${orgId}, ${pat.id}, ${prov1.id},
        '2026-04-01T10:30:00Z', '2026-04-01T11:00:00Z', ${fakeUserId}
      )
    `;
    console.log("✅ Adjacent booking 10:30-11:00 allowed (no overlap)");

    // 4. Same time, different provider — should succeed
    const fakeUserId2 = crypto.randomUUID();
    await pgClient`
      INSERT INTO users (id, organization_id, email, full_name)
      VALUES (${fakeUserId2}, ${orgId}, 'doc2@test.com', 'Dr. Two')
    `;
    const [prov2] = await pgClient`
      INSERT INTO provider_profiles (organization_id, user_id)
      VALUES (${orgId}, ${fakeUserId2})
      RETURNING id
    `;

    await pgClient`
      INSERT INTO appointments (
        organization_id, patient_id, provider_id, start_time, end_time, created_by
      ) VALUES (
        ${orgId}, ${pat.id}, ${prov2.id},
        '2026-04-01T10:00:00Z', '2026-04-01T10:30:00Z', ${fakeUserId}
      )
    `;
    console.log("✅ Same time, different provider allowed");

    // 5. Canceled appointment should NOT block new booking
    // First, cancel the 10:00-10:30 appointment
    await pgClient`
      UPDATE appointments SET status = 'canceled'
      WHERE organization_id = ${orgId}
        AND provider_id = ${prov1.id}
        AND start_time = '2026-04-01T10:00:00Z'
    `;

    // Now book the same slot — should work because the original is canceled
    await pgClient`
      INSERT INTO appointments (
        organization_id, patient_id, provider_id, start_time, end_time, created_by
      ) VALUES (
        ${orgId}, ${pat.id}, ${prov1.id},
        '2026-04-01T10:00:00Z', '2026-04-01T10:30:00Z', ${fakeUserId}
      )
    `;
    console.log("✅ Canceled appointment does NOT block new booking");

    // 6. Fully contained overlap should fail
    // 10:00-10:30 is booked (the new one). Try 10:05-10:20.
    try {
      await pgClient`
        INSERT INTO appointments (
          organization_id, patient_id, provider_id, start_time, end_time, created_by
        ) VALUES (
          ${orgId}, ${pat.id}, ${prov1.id},
          '2026-04-01T10:05:00Z', '2026-04-01T10:20:00Z', ${fakeUserId}
        )
      `;
      throw new Error("Should have failed — contained overlap!");
    } catch (err: any) {
      if (err.message.includes("Should have failed")) throw err;
      console.log("✅ Fully contained overlap rejected");
    }

    // 7. Same time different org — should succeed
    const [org2] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('S01b Org2', ${testSlug + '_2'})
      RETURNING id
    `;
    const fakeUserId3 = crypto.randomUUID();
    await pgClient`
      INSERT INTO users (id, organization_id, email, full_name)
      VALUES (${fakeUserId3}, ${org2.id}, 'doc3@test.com', 'Dr. Three')
    `;
    const [prov3] = await pgClient`
      INSERT INTO provider_profiles (organization_id, user_id)
      VALUES (${org2.id}, ${fakeUserId3})
      RETURNING id
    `;
    const [pat2] = await pgClient`
      INSERT INTO patients (organization_id, first_name, last_name, phone)
      VALUES (${org2.id}, 'Sara', 'Test', '+961-1-999888')
      RETURNING id
    `;

    await pgClient`
      INSERT INTO appointments (
        organization_id, patient_id, provider_id, start_time, end_time, created_by
      ) VALUES (
        ${org2.id}, ${pat2.id}, ${prov3.id},
        '2026-04-01T10:00:00Z', '2026-04-01T10:30:00Z', ${fakeUserId3}
      )
    `;
    console.log("✅ Same time, different org allowed");

    // Cleanup org2
    await pgClient`DELETE FROM appointments WHERE organization_id = ${org2.id}`;
    await pgClient`DELETE FROM provider_profiles WHERE organization_id = ${org2.id}`;
    await pgClient`DELETE FROM patients WHERE organization_id = ${org2.id}`;
    await pgClient`DELETE FROM users WHERE organization_id = ${org2.id}`;
    await pgClient`DELETE FROM organizations WHERE id = ${org2.id}`;

    console.log("\n🎉 S-01b ALL CHECKS PASSED");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    if (orgId) {
      await pgClient`DELETE FROM appointments WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM provider_profiles WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM patients WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM users WHERE id = ${fakeUserId}`;
      await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
      console.log("🧹 Test data cleaned up");
    }
    await pgClient.end();
  }
}

main();
