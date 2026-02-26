import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local"), override: true });

async function main() {
  const { pgClient } = await import("./index");

  const testSlug = `test_k02_${Date.now()}`;
  let orgId: string | null = null;

  try {
    // 1. Insert org
    const [org] = await pgClient`
      INSERT INTO organizations (name, slug)
      VALUES ('Test Clinic', ${testSlug})
      RETURNING id, name, slug, timezone, currency
    `;
    orgId = org.id;
    console.log("✅ Org created:", org.slug, "| tz:", org.timezone, "| currency:", org.currency);

    // 2. Insert user (using a fake UUID since we don't have Supabase Auth here)
    const fakeAuthId = crypto.randomUUID();
    const [user] = await pgClient`
      INSERT INTO users (id, organization_id, email, full_name)
      VALUES (${fakeAuthId}, ${orgId}, 'test@clinic.com', 'Test User')
      RETURNING id, organization_id, email, preferred_locale, is_active
    `;
    console.log("✅ User created:", user.email, "| locale:", user.preferred_locale, "| active:", user.is_active);

    // 3. Verify FK — user.organization_id matches org.id
    if (user.organization_id !== orgId) throw new Error("FK mismatch!");
    console.log("✅ FK relationship valid");

    // 4. Test unique constraint — duplicate (org_id, email) should fail
    try {
      const fakeAuthId2 = crypto.randomUUID();
      await pgClient`
        INSERT INTO users (id, organization_id, email, full_name)
        VALUES (${fakeAuthId2}, ${orgId}, 'test@clinic.com', 'Duplicate User')
      `;
      throw new Error("Should have failed — duplicate email in same org!");
    } catch (err: any) {
      if (err.message.includes("unique") || err.message.includes("duplicate") || err.code === "23505") {
        console.log("✅ Unique constraint (org_id, email) enforced");
      } else {
        throw err;
      }
    }

    // 5. Test that org_id is required (NOT NULL)
    try {
      const fakeAuthId3 = crypto.randomUUID();
      await pgClient`
        INSERT INTO users (id, email, full_name)
        VALUES (${fakeAuthId3}, 'null-org@test.com', 'No Org User')
      `;
      throw new Error("Should have failed — organization_id is required!");
    } catch (err: any) {
      if (err.message.includes("null") || err.message.includes("not-null") || err.code === "23502") {
        console.log("✅ organization_id NOT NULL enforced");
      } else {
        throw err;
      }
    }

    console.log("\n🎉 K-02 ALL CHECKS PASSED");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    // Cleanup
    if (orgId) {
      await pgClient`DELETE FROM users WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
      console.log("🧹 Test data cleaned up");
    }
    await pgClient.end();
  }
}

main();
