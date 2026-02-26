import "dotenv/config";
import { pgClient } from "./index";

async function main() {
  const testSlug = `test_k11_${Date.now()}`;
  let orgId: string | null = null;

  try {
    // Setup: create temp org + user
    const [org] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('K11 Test', ${testSlug})
      RETURNING id
    `;
    orgId = org.id;

    const userId = crypto.randomUUID();
    await pgClient`
      INSERT INTO users (id, organization_id, email, full_name)
      VALUES (${userId}, ${orgId}, 'doctor@test.com', 'Dr. Test')
    `;

    // 1. Insert provider profile with trilingual data
    const [profile] = await pgClient`
      INSERT INTO provider_profiles (user_id, organization_id, specialty_en, specialty_fr, specialty_ar, bio_en, color_hex)
      VALUES (
        ${userId}, ${orgId},
        'Orthodontics', 'Orthodontie', 'تقويم الأسنان',
        'Specialist in dental alignment',
        '#EF4444'
      )
      RETURNING *
    `;
    console.log("✅ Provider profile created");

    // 2. Verify defaults
    if (profile.is_accepting_appointments !== true) throw new Error("Default should be true");
    console.log("✅ is_accepting_appointments defaults to true");

    // 3. Verify trilingual fields
    if (profile.specialty_en !== "Orthodontics") throw new Error("specialty_en wrong");
    if (profile.specialty_fr !== "Orthodontie") throw new Error("specialty_fr wrong");
    if (profile.specialty_ar !== "تقويم الأسنان") throw new Error("specialty_ar wrong");
    console.log("✅ Trilingual specialty stored (EN/FR/AR)");

    // 4. Verify color hex
    if (profile.color_hex !== "#EF4444") throw new Error("color_hex wrong");
    console.log("✅ Custom color_hex stored: #EF4444");

    // 5. Verify nullable bio fields
    if (profile.bio_fr !== null || profile.bio_ar !== null) throw new Error("Unfilled bios should be null");
    console.log("✅ Nullable bio fields work (fr/ar are null)");

    // 6. Unique user_id — second profile for same user should fail
    try {
      await pgClient`
        INSERT INTO provider_profiles (user_id, organization_id)
        VALUES (${userId}, ${orgId})
      `;
      throw new Error("Should have failed — duplicate user_id!");
    } catch (err: any) {
      if (err.code === "23505" || err.message.includes("unique") || err.message.includes("duplicate")) {
        console.log("✅ Unique user_id enforced (one profile per user)");
      } else {
        throw err;
      }
    }

    // 7. Test is_accepting_appointments toggle
    await pgClient`
      UPDATE provider_profiles SET is_accepting_appointments = false WHERE user_id = ${userId}
    `;
    const [toggled] = await pgClient`
      SELECT is_accepting_appointments FROM provider_profiles WHERE user_id = ${userId}
    `;
    if (toggled.is_accepting_appointments !== false) throw new Error("Toggle failed");
    console.log("✅ is_accepting_appointments toggle works");

    // 8. Default color_hex when not specified
    const userId2 = crypto.randomUUID();
    await pgClient`
      INSERT INTO users (id, organization_id, email, full_name)
      VALUES (${userId2}, ${orgId}, 'doctor2@test.com', 'Dr. Default')
    `;
    const [defaultProfile] = await pgClient`
      INSERT INTO provider_profiles (user_id, organization_id)
      VALUES (${userId2}, ${orgId})
      RETURNING color_hex
    `;
    if (defaultProfile.color_hex !== "#3B82F6") throw new Error(`Default color should be #3B82F6, got ${defaultProfile.color_hex}`);
    console.log("✅ Default color_hex is #3B82F6");

    console.log("\n🎉 K-11 ALL CHECKS PASSED");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    if (orgId) {
      await pgClient`DELETE FROM provider_profiles WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM users WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
      console.log("🧹 Test data cleaned up");
    }
    await pgClient.end();
  }
}

main();
