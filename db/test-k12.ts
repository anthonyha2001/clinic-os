import "dotenv/config";
import { pgClient } from "./index";

async function main() {
  const testSlug = `test_k12_${Date.now()}`;
  let orgId: string | null = null;
  let org2Id: string | null = null;

  try {
    // Setup: create temp org
    const [org] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('K12 Test', ${testSlug})
      RETURNING id
    `;
    orgId = org.id;

    // 1. Insert trilingual tags
    await pgClient`
      INSERT INTO tags (organization_id, name_en, name_fr, name_ar, color_hex)
      VALUES
        (${orgId}, 'VIP', 'VIP', 'مهم', '#EF4444'),
        (${orgId}, 'Pediatric', 'Pédiatrique', 'أطفال', '#3B82F6'),
        (${orgId}, 'Urgent', 'Urgent', 'عاجل', '#F59E0B')
    `;
    console.log("✅ 3 trilingual tags inserted");

    // 2. Verify all stored
    const all = await pgClient`
      SELECT name_en, name_fr, name_ar, color_hex, is_active
      FROM tags WHERE organization_id = ${orgId}
      ORDER BY name_en
    `;
    if (all.length !== 3) throw new Error(`Expected 3 tags, got ${all.length}`);
    console.log("✅ All 3 tags retrieved");

    // 3. Verify trilingual storage
    const pediatric = all.find((t: any) => t.name_en === "Pediatric");
    if (!pediatric) throw new Error("Pediatric tag not found");
    if (pediatric.name_fr !== "Pédiatrique") throw new Error("French name wrong");
    if (pediatric.name_ar !== "أطفال") throw new Error("Arabic name wrong");
    console.log("✅ Trilingual names correct (EN/FR/AR)");

    // 4. Verify color hex
    const vip = all.find((t: any) => t.name_en === "VIP");
    if (!vip) throw new Error("VIP tag not found");
    if (vip.color_hex !== "#EF4444") throw new Error("Color wrong");
    console.log("✅ Custom color_hex stored");

    // 5. Default is_active
    if (all[0].is_active !== true) throw new Error("Default is_active should be true");
    console.log("✅ Default is_active = true");

    // 6. Unique constraint on (org_id, name_en)
    try {
      await pgClient`
        INSERT INTO tags (organization_id, name_en, name_fr, name_ar)
        VALUES (${orgId}, 'VIP', 'Deuxième VIP', 'ثاني مهم')
      `;
      throw new Error("Should have failed — duplicate name_en in same org!");
    } catch (err: any) {
      if (err.code === "23505" || err.message.includes("unique") || err.message.includes("duplicate")) {
        console.log("✅ Unique (org_id, name_en) enforced");
      } else {
        throw err;
      }
    }

    // 7. Same name_en allowed in different org
    const [org2] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('K12 Org2', ${testSlug + '_2'})
      RETURNING id
    `;
    org2Id = org2.id;
    await pgClient`
      INSERT INTO tags (organization_id, name_en, name_fr, name_ar)
      VALUES (${org2Id}, 'VIP', 'VIP', 'مهم')
    `;
    console.log("✅ Same name_en allowed in different org");

    // 8. Org scoping
    const org2Tags = await pgClient`
      SELECT * FROM tags WHERE organization_id = ${org2Id}
    `;
    if (org2Tags.length !== 1) throw new Error("Org2 should have exactly 1 tag");
    console.log("✅ Org scoping correct");

    // 9. Default color when not specified
    const [defaultTag] = await pgClient`
      INSERT INTO tags (organization_id, name_en, name_fr, name_ar)
      VALUES (${orgId}, 'Default Color', 'Couleur par défaut', 'لون افتراضي')
      RETURNING color_hex
    `;
    if (defaultTag.color_hex !== "#6B7280") throw new Error(`Default color should be #6B7280, got ${defaultTag.color_hex}`);
    console.log("✅ Default color_hex is #6B7280");

    console.log("\n🎉 K-12 ALL CHECKS PASSED");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    if (org2Id) {
      await pgClient`DELETE FROM tags WHERE organization_id = ${org2Id}`;
      await pgClient`DELETE FROM organizations WHERE id = ${org2Id}`;
    }
    if (orgId) {
      await pgClient`DELETE FROM tags WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
    }
    await pgClient.end();
    console.log("🧹 Test data cleaned up");
  }
}

main();
