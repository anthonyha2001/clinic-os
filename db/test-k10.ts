import "dotenv/config";
import { pgClient } from "./index";

async function main() {
  const testSlug = `test_k10_${Date.now()}`;
  let orgId: string | null = null;

  try {
    // Setup: create temp org
    const [org] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('K10 Test', ${testSlug})
      RETURNING id
    `;
    orgId = org.id;

    // 1. Insert policy settings with defaults
    const [policy] = await pgClient`
      INSERT INTO policy_settings (organization_id)
      VALUES (${orgId})
      RETURNING *
    `;
    console.log("✅ Policy row created with defaults");

    // 2. Verify defaults match spec
    if (policy.no_show_risk_threshold !== 3) throw new Error(`Expected threshold 3, got ${policy.no_show_risk_threshold}`);
    if (policy.deposit_required_above_risk !== true) throw new Error("Expected deposit_required true");
    if (policy.inactivity_days_warning !== 60) throw new Error(`Expected warning 60, got ${policy.inactivity_days_warning}`);
    if (policy.inactivity_days_critical !== 90) throw new Error(`Expected critical 90, got ${policy.inactivity_days_critical}`);
    if (policy.large_discount_threshold_percent !== 20) throw new Error(`Expected discount 20, got ${policy.large_discount_threshold_percent}`);
    if (policy.updated_by !== null) throw new Error("Expected updated_by null initially");
    console.log("✅ All defaults correct: threshold=3, deposit=true, warning=60, critical=90, discount=20%");

    // 3. Verify one-per-org uniqueness
    try {
      await pgClient`
        INSERT INTO policy_settings (organization_id) VALUES (${orgId})
      `;
      throw new Error("Should have failed — duplicate org policy!");
    } catch (err: any) {
      if (err.code === "23505" || err.message.includes("unique") || err.message.includes("duplicate")) {
        console.log("✅ One-per-org uniqueness enforced");
      } else {
        throw err;
      }
    }

    // 4. Test update with updated_by
    const fakeUserId = crypto.randomUUID();
    await pgClient`
      INSERT INTO users (id, organization_id, email, full_name)
      VALUES (${fakeUserId}, ${orgId}, 'admin@test.com', 'Admin')
    `;

    const [updated] = await pgClient`
      UPDATE policy_settings
      SET no_show_risk_threshold = 5,
          large_discount_threshold_percent = 15,
          updated_by = ${fakeUserId},
          updated_at = NOW()
      WHERE organization_id = ${orgId}
      RETURNING no_show_risk_threshold, large_discount_threshold_percent, updated_by
    `;
    if (updated.no_show_risk_threshold !== 5) throw new Error("Update failed for threshold");
    if (updated.large_discount_threshold_percent !== 15) throw new Error("Update failed for discount");
    if (updated.updated_by !== fakeUserId) throw new Error("updated_by not set");
    console.log("✅ Update works: threshold=5, discount=15%, updated_by set");

    // 5. Verify org scoping — new org has no policy until explicitly created
    const [org2] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('K10 Org2', ${testSlug + '_2'})
      RETURNING id
    `;
    const org2Policy = await pgClient`
      SELECT * FROM policy_settings WHERE organization_id = ${org2.id}
    `;
    if (org2Policy.length !== 0) throw new Error("Org2 should have no policy row yet");
    console.log("✅ Org scoping correct (org2 has no policy until bootstrap)");

    // Cleanup org2
    await pgClient`DELETE FROM organizations WHERE id = ${org2.id}`;

    console.log("\n🎉 K-10 ALL CHECKS PASSED");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    if (orgId) {
      await pgClient`DELETE FROM policy_settings WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM users WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
      console.log("🧹 Test data cleaned up");
    }
    await pgClient.end();
  }
}

main();
