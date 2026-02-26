import "dotenv/config";
import { pgClient } from "./index";

async function main() {
  const testSlug = `test_p03_${Date.now()}`;
  let orgId: string | null = null;
  const fakeUserId = crypto.randomUUID();

  try {
    // Setup: org, user, patient
    const [org] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('P03 Test', ${testSlug})
      RETURNING id
    `;
    orgId = org.id;

    await pgClient`
      INSERT INTO users (id, organization_id, email, full_name)
      VALUES (${fakeUserId}, ${orgId}, 'doc@test.com', 'Dr. Test')
    `;

    const [pat] = await pgClient`
      INSERT INTO patients (organization_id, first_name, last_name, phone)
      VALUES (${orgId}, 'Ahmad', 'Khoury', '+961-3-111222')
      RETURNING id
    `;

    // 1. Insert a note
    const [note] = await pgClient`
      INSERT INTO patient_notes (patient_id, organization_id, author_id, content)
      VALUES (${pat.id}, ${orgId}, ${fakeUserId}, 'Patient reports mild tooth pain')
      RETURNING *
    `;
    if (!note.id) throw new Error("Note not created");
    console.log("✅ Note created");

    // 2. Verify defaults
    if (note.is_pinned !== false) throw new Error("Default is_pinned should be false");
    if (note.deleted_at !== null) throw new Error("Default deleted_at should be null");
    console.log("✅ Defaults correct (is_pinned=false, deleted_at=null)");

    // 3. Author tracked
    if (note.author_id !== fakeUserId) throw new Error("Author ID mismatch");
    console.log("✅ Author tracked");

    // 4. Pin a note
    await pgClient`
      UPDATE patient_notes SET is_pinned = true WHERE id = ${note.id}
    `;
    const [pinned] = await pgClient`
      SELECT is_pinned FROM patient_notes WHERE id = ${note.id}
    `;
    if (pinned.is_pinned !== true) throw new Error("Pin failed");
    console.log("✅ Pinning works");

    // 5. Soft-delete
    const now = new Date().toISOString();
    await pgClient`
      UPDATE patient_notes SET deleted_at = ${now} WHERE id = ${note.id}
    `;
    const [deleted] = await pgClient`
      SELECT deleted_at FROM patient_notes WHERE id = ${note.id}
    `;
    if (!deleted.deleted_at) throw new Error("Soft-delete failed");
    console.log("✅ Soft-delete works (deleted_at set)");

    // 6. Soft-deleted notes still exist in DB
    const allNotes = await pgClient`
      SELECT * FROM patient_notes WHERE patient_id = ${pat.id}
    `;
    if (allNotes.length !== 1) throw new Error("Soft-deleted note should still exist");
    console.log("✅ Soft-deleted note still in DB");

    // 7. Filter active notes (deleted_at IS NULL)
    const activeNotes = await pgClient`
      SELECT * FROM patient_notes
      WHERE patient_id = ${pat.id} AND deleted_at IS NULL
    `;
    if (activeNotes.length !== 0) throw new Error("No active notes after soft-delete");
    console.log("✅ Active filter excludes soft-deleted");

    // 8. Multiple notes per patient
    await pgClient`
      INSERT INTO patient_notes (patient_id, organization_id, author_id, content)
      VALUES
        (${pat.id}, ${orgId}, ${fakeUserId}, 'Follow-up: pain subsided'),
        (${pat.id}, ${orgId}, ${fakeUserId}, 'Scheduled for X-ray')
    `;
    const multiNotes = await pgClient`
      SELECT * FROM patient_notes WHERE patient_id = ${pat.id}
    `;
    if (multiNotes.length !== 3) throw new Error(`Expected 3 notes, got ${multiNotes.length}`);
    console.log("✅ Multiple notes per patient");

    // 9. Org scoping
    const [org2] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('P03 Org2', ${testSlug + '_2'})
      RETURNING id
    `;
    const otherNotes = await pgClient`
      SELECT * FROM patient_notes WHERE organization_id = ${org2.id}
    `;
    if (otherNotes.length !== 0) throw new Error("Org2 should have 0 notes");
    console.log("✅ Org scoping correct");
    await pgClient`DELETE FROM organizations WHERE id = ${org2.id}`;

    // 10. Cascade delete — deleting patient removes notes
    await pgClient`DELETE FROM patients WHERE id = ${pat.id}`;
    const orphanNotes = await pgClient`
      SELECT * FROM patient_notes WHERE patient_id = ${pat.id}
    `;
    if (orphanNotes.length !== 0) throw new Error("Cascade should remove patient_notes");
    console.log("✅ Cascade delete removes notes");

    console.log("\n🎉 P-03 ALL CHECKS PASSED");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    if (orgId) {
      await pgClient`DELETE FROM patient_notes WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM patients WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM users WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
      console.log("🧹 Test data cleaned up");
    }
    await pgClient.end();
  }
}

main();
