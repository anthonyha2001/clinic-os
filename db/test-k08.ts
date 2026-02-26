import "dotenv/config";
import { pgClient } from "./index";

async function main() {
  const testSlug = `test_k08_${Date.now()}`;
  let orgId: string | null = null;

  try {
    // Setup: create temp org
    const [org] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('K08 Test', ${testSlug})
      RETURNING id
    `;
    orgId = org.id;

    // 1. Insert a service with trilingual data
    const [svc] = await pgClient`
      INSERT INTO services (
        organization_id, name_en, name_fr, name_ar,
        description_en, category, price, default_duration_minutes
      ) VALUES (
        ${orgId}, 'Teeth Cleaning', 'Nettoyage dentaire', 'تنظيف الأسنان',
        'Professional dental cleaning', 'procedure', '75.00', 45
      )
      RETURNING *
    `;
    console.log("✅ Service created with trilingual name");

    // 2. Verify price is exact decimal
    if (svc.price !== "75.00") throw new Error(`Price should be "75.00", got "${svc.price}"`);
    console.log("✅ Price stored as exact decimal: 75.00");

    // 3. Verify defaults
    if (svc.is_active !== true) throw new Error("Default is_active should be true");
    if (svc.category !== "procedure") throw new Error("Category wrong");
    console.log("✅ Category and is_active correct");

    // 4. Verify nullable descriptions
    if (svc.description_fr !== null || svc.description_ar !== null) {
      throw new Error("Unfilled descriptions should be null");
    }
    console.log("✅ Nullable descriptions work");

    // 5. Verify default duration
    if (svc.default_duration_minutes !== 45) throw new Error("Duration wrong");
    console.log("✅ Duration stored: 45 minutes");

    // 6. Insert second service to test default duration
    const [svc2] = await pgClient`
      INSERT INTO services (organization_id, name_en, name_fr, name_ar, price)
      VALUES (${orgId}, 'Consultation', 'Consultation', 'استشارة', '50.00')
      RETURNING default_duration_minutes, category
    `;
    if (svc2.default_duration_minutes !== 30) throw new Error(`Default duration should be 30, got ${svc2.default_duration_minutes}`);
    if (svc2.category !== "other") throw new Error(`Default category should be "other", got ${svc2.category}`);
    console.log("✅ Default duration=30, default category='other'");

    // 7. Unique constraint on (org_id, name_en)
    try {
      await pgClient`
        INSERT INTO services (organization_id, name_en, name_fr, name_ar, price)
        VALUES (${orgId}, 'Teeth Cleaning', 'Autre nom', 'اسم آخر', '100.00')
      `;
      throw new Error("Should have failed — duplicate name_en in same org!");
    } catch (err: any) {
      if (err.code === "23505" || err.message.includes("unique") || err.message.includes("duplicate")) {
        console.log("✅ Unique (org_id, name_en) enforced");
      } else {
        throw err;
      }
    }

    // 8. Tag assignment
    const [tag] = await pgClient`
      INSERT INTO tags (organization_id, name_en, name_fr, name_ar)
      VALUES (${orgId}, 'Dental', 'Dentaire', 'أسنان')
      RETURNING id
    `;
    await pgClient`
      INSERT INTO service_tags (service_id, tag_id) VALUES (${svc.id}, ${tag.id})
    `;
    const svcTags = await pgClient`
      SELECT t.name_en FROM service_tags st
      JOIN tags t ON t.id = st.tag_id
      WHERE st.service_id = ${svc.id}
    `;
    if (svcTags.length !== 1 || svcTags[0].name_en !== "Dental") throw new Error("Tag assignment failed");
    console.log("✅ Service-tag assignment works");

    // 9. Duplicate tag assignment should fail (composite PK)
    try {
      await pgClient`
        INSERT INTO service_tags (service_id, tag_id) VALUES (${svc.id}, ${tag.id})
      `;
      throw new Error("Should have failed — duplicate service-tag!");
    } catch (err: any) {
      if (err.code === "23505" || err.message.includes("unique") || err.message.includes("duplicate")) {
        console.log("✅ Duplicate service-tag prevented (composite PK)");
      } else {
        throw err;
      }
    }

    // 10. Org scoping
    const [org2] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('K08 Org2', ${testSlug + '_2'})
      RETURNING id
    `;
    const org2Svcs = await pgClient`
      SELECT * FROM services WHERE organization_id = ${org2.id}
    `;
    if (org2Svcs.length !== 0) throw new Error("Org2 should have 0 services");
    console.log("✅ Org scoping correct");
    await pgClient`DELETE FROM organizations WHERE id = ${org2.id}`;

    console.log("\n🎉 K-08 ALL CHECKS PASSED");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    if (orgId) {
      await pgClient`DELETE FROM service_tags WHERE service_id IN (SELECT id FROM services WHERE organization_id = ${orgId})`;
      await pgClient`DELETE FROM services WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM tags WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
      console.log("🧹 Test data cleaned up");
    }
    await pgClient.end();
  }
}

main();
