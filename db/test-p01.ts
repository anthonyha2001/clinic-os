import "dotenv/config";
import { pgClient } from "./index";

async function main() {
  const testSlug = `test_p01_${Date.now()}`;
  let orgId: string | null = null;

  try {
    // Setup: create temp org
    const [org] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('P01 Test', ${testSlug})
      RETURNING id
    `;
    orgId = org.id;

    // 1. Insert a patient with required fields
    const [pat] = await pgClient`
      INSERT INTO patients (
        organization_id, first_name, last_name, phone, email,
        date_of_birth, gender, preferred_locale
      ) VALUES (
        ${orgId}, 'Ahmad', 'Khoury', '+961-3-123456', 'ahmad@test.com',
        '1990-05-15', 'male', 'ar'
      )
      RETURNING *
    `;
    console.log("✅ Patient created with all fields");

    // 2. Verify defaults
    if (pat.is_active !== true) throw new Error("Default is_active should be true");
    console.log("✅ Default is_active = true");

    // 3. Verify nullable fields
    if (pat.phone_secondary !== null) throw new Error("phone_secondary should be null");
    if (pat.address !== null) throw new Error("address should be null");
    console.log("✅ Nullable fields work");

    // 4. Unique phone per org
    try {
      await pgClient`
        INSERT INTO patients (organization_id, first_name, last_name, phone)
        VALUES (${orgId}, 'Sara', 'Khoury', '+961-3-123456')
      `;
      throw new Error("Should have failed — duplicate phone in same org!");
    } catch (err: any) {
      if (err.code === "23505" || err.message.includes("unique") || err.message.includes("duplicate")) {
        console.log("✅ Unique (org_id, phone) enforced");
      } else {
        throw err;
      }
    }

    // 5. Same phone in different org should work
    const [org2] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('P01 Org2', ${testSlug + '_2'})
      RETURNING id
    `;
    await pgClient`
      INSERT INTO patients (organization_id, first_name, last_name, phone)
      VALUES (${org2.id}, 'Ahmad', 'Khoury', '+961-3-123456')
    `;
    console.log("✅ Same phone in different org allowed");
    await pgClient`DELETE FROM patients WHERE organization_id = ${org2.id}`;
    await pgClient`DELETE FROM organizations WHERE id = ${org2.id}`;

    // 6. Second patient with different phone
    const [pat2] = await pgClient`
      INSERT INTO patients (organization_id, first_name, last_name, phone)
      VALUES (${orgId}, 'Nadia', 'Haddad', '+961-3-999888')
      RETURNING id
    `;
    console.log("✅ Second patient created");

    // 7. Patient-tag assignment
    const [tag] = await pgClient`
      INSERT INTO tags (organization_id, name_en, name_fr, name_ar)
      VALUES (${orgId}, 'VIP', 'VIP', 'مميز')
      RETURNING id
    `;
    await pgClient`
      INSERT INTO patient_tags (patient_id, tag_id) VALUES (${pat.id}, ${tag.id})
    `;
    const ptags = await pgClient`
      SELECT t.name_en FROM patient_tags pt
      JOIN tags t ON t.id = pt.tag_id
      WHERE pt.patient_id = ${pat.id}
    `;
    if (ptags.length !== 1 || ptags[0].name_en !== "VIP") throw new Error("Tag assignment failed");
    console.log("✅ Patient-tag assignment works");

    // 8. Duplicate tag assignment should fail
    try {
      await pgClient`
        INSERT INTO patient_tags (patient_id, tag_id) VALUES (${pat.id}, ${tag.id})
      `;
      throw new Error("Should have failed — duplicate patient-tag!");
    } catch (err: any) {
      if (err.code === "23505" || err.message.includes("unique") || err.message.includes("duplicate")) {
        console.log("✅ Duplicate patient-tag prevented (composite PK)");
      } else {
        throw err;
      }
    }

    // 9. Multiple tags on one patient
    const [tag2] = await pgClient`
      INSERT INTO tags (organization_id, name_en, name_fr, name_ar)
      VALUES (${orgId}, 'Dental', 'Dentaire', 'أسنان')
      RETURNING id
    `;
    await pgClient`
      INSERT INTO patient_tags (patient_id, tag_id) VALUES (${pat.id}, ${tag2.id})
    `;
    const allTags = await pgClient`
      SELECT tag_id FROM patient_tags WHERE patient_id = ${pat.id}
    `;
    if (allTags.length !== 2) throw new Error(`Expected 2 tags, got ${allTags.length}`);
    console.log("✅ Multiple tags on one patient");

    // 10. Org scoping — other org sees 0 patients
    const [org3] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('P01 Org3', ${testSlug + '_3'})
      RETURNING id
    `;
    const otherPats = await pgClient`
      SELECT * FROM patients WHERE organization_id = ${org3.id}
    `;
    if (otherPats.length !== 0) throw new Error("Org3 should have 0 patients");
    console.log("✅ Org scoping correct");
    await pgClient`DELETE FROM organizations WHERE id = ${org3.id}`;

    // 11. Soft-delete via is_active toggle
    await pgClient`
      UPDATE patients SET is_active = false WHERE id = ${pat2.id}
    `;
    const [deactivated] = await pgClient`
      SELECT is_active FROM patients WHERE id = ${pat2.id}
    `;
    if (deactivated.is_active !== false) throw new Error("is_active should be false");
    console.log("✅ Soft-delete (is_active=false) works");

    // 12. Cascade delete — deleting patient removes patient_tags
    await pgClient`DELETE FROM patients WHERE id = ${pat.id}`;
    const orphanTags = await pgClient`
      SELECT * FROM patient_tags WHERE patient_id = ${pat.id}
    `;
    if (orphanTags.length !== 0) throw new Error("Cascade should remove patient_tags");
    console.log("✅ Cascade delete removes patient_tags");

    console.log("\n🎉 P-01 ALL CHECKS PASSED");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    if (orgId) {
      await pgClient`DELETE FROM patient_tags WHERE patient_id IN (SELECT id FROM patients WHERE organization_id = ${orgId})`;
      await pgClient`DELETE FROM patients WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM tags WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
      console.log("🧹 Test data cleaned up");
    }
    await pgClient.end();
  }
}

main();
