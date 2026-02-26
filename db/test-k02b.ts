import "dotenv/config";
import { pgClient } from "./index";
import { bootstrapOrganization } from "../lib/services/org/bootstrap";

// Ensure global permissions exist before running bootstrap
async function ensurePermissions() {
  const count = await pgClient`SELECT COUNT(*) as c FROM permissions`;
  if (Number(count[0].c) < 11) {
    const { seedPermissions } = await import("./seed/permissions");
    await seedPermissions();
  }
}

async function main() {
  const testSlug = `test_k02b_${Date.now()}`;
  const fakeAuthId = crypto.randomUUID();
  let orgId: string | null = null;

  try {
    await ensurePermissions();

    // 1. Bootstrap a new org
    const result = await bootstrapOrganization({
      orgName: "K02b Test Clinic",
      orgSlug: testSlug,
      foundingUserAuthId: fakeAuthId,
      foundingUserEmail: "admin@test-k02b.com",
      foundingUserFullName: "Test Admin",
      foundingUserPhone: "+961-1-234567",
      foundingUserLocale: "fr",
    });
    orgId = result.organizationId;
    console.log("✅ Bootstrap completed — orgId:", orgId);

    // 2. Verify organization created
    const [org] = await pgClient`
      SELECT * FROM organizations WHERE id = ${orgId}
    `;
    if (!org) throw new Error("Organization not found");
    if (org.slug !== testSlug) throw new Error("Slug mismatch");
    if (org.timezone !== "Asia/Beirut") throw new Error("Default timezone wrong");
    if (org.currency !== "USD") throw new Error("Default currency wrong");
    console.log("✅ Organization created with correct defaults");

    // 3. Verify founding user
    const [user] = await pgClient`
      SELECT * FROM users WHERE id = ${fakeAuthId}
    `;
    if (!user) throw new Error("User not found");
    if (user.organization_id !== orgId) throw new Error("User org mismatch");
    if (user.preferred_locale !== "fr") throw new Error("Locale mismatch");
    console.log("✅ Founding user created with correct org and locale");

    // 4. Verify 5 roles
    const roles = await pgClient`
      SELECT name FROM roles WHERE organization_id = ${orgId} ORDER BY name
    `;
    const roleNames = roles.map((r: any) => r.name).sort();
    const expected = ["accountant", "admin", "manager", "provider", "receptionist"];
    if (JSON.stringify(roleNames) !== JSON.stringify(expected)) {
      throw new Error(`Expected roles ${expected.join(",")}, got ${roleNames.join(",")}`);
    }
    console.log("✅ 5 roles created: " + roleNames.join(", "));

    // 5. Verify role_permissions (admin should have 11)
    const adminPerms = await pgClient`
      SELECT p.key FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE r.organization_id = ${orgId} AND r.name = 'admin'
      ORDER BY p.key
    `;
    if (adminPerms.length !== 11) throw new Error(`Admin should have 11 perms, got ${adminPerms.length}`);
    console.log("✅ Admin has 11 permissions");

    // 6. Verify manager has 10 (no user.manage)
    const mgrPerms = await pgClient`
      SELECT p.key FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE r.organization_id = ${orgId} AND r.name = 'manager'
    `;
    if (mgrPerms.length !== 10) throw new Error(`Manager should have 10 perms, got ${mgrPerms.length}`);
    const hasUserManage = mgrPerms.some((p: any) => p.key === "user.manage");
    if (hasUserManage) throw new Error("Manager should NOT have user.manage");
    console.log("✅ Manager has 10 permissions (no user.manage)");

    // 7. Verify provider has 2 (patient.manage, appointment.manage)
    const provPerms = await pgClient`
      SELECT p.key FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE r.organization_id = ${orgId} AND r.name = 'provider'
      ORDER BY p.key
    `;
    if (provPerms.length !== 2) throw new Error(`Provider should have 2 perms, got ${provPerms.length}`);
    console.log("✅ Provider has 2 permissions");

    // 8. Verify accountant has 3 (reports.view, invoice.create, payment.record)
    const acctPerms = await pgClient`
      SELECT p.key FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE r.organization_id = ${orgId} AND r.name = 'accountant'
      ORDER BY p.key
    `;
    if (acctPerms.length !== 3) throw new Error(`Accountant should have 3 perms, got ${acctPerms.length}`);
    console.log("✅ Accountant has 3 permissions");

    // 9. Verify user_roles — founding user has admin role
    const userRoles = await pgClient`
      SELECT r.name FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ${fakeAuthId}
    `;
    if (userRoles.length !== 1 || userRoles[0].name !== "admin") {
      throw new Error("Founding user should have exactly admin role");
    }
    console.log("✅ Founding user has admin role");

    // 10. Verify policy_settings (one row, defaults)
    const [policy] = await pgClient`
      SELECT * FROM policy_settings WHERE organization_id = ${orgId}
    `;
    if (!policy) throw new Error("Policy settings not created");
    if (policy.no_show_risk_threshold !== 3) throw new Error("Default threshold wrong");
    if (policy.large_discount_threshold_percent !== 20) throw new Error("Default discount threshold wrong");
    console.log("✅ Policy settings created with defaults");

    // 11. Verify payment methods (3, trilingual)
    const methods = await pgClient`
      SELECT type, label_en, label_fr, label_ar, display_order
      FROM payment_methods WHERE organization_id = ${orgId}
      ORDER BY display_order
    `;
    if (methods.length !== 3) throw new Error(`Expected 3 payment methods, got ${methods.length}`);
    if (methods[0].type !== "cash") throw new Error("First method should be cash");
    if (methods[1].type !== "card") throw new Error("Second method should be card");
    if (methods[2].type !== "bank_transfer") throw new Error("Third method should be bank_transfer");
    if (!methods[0].label_ar || !methods[1].label_fr) throw new Error("Missing trilingual labels");
    console.log("✅ 3 payment methods with trilingual labels");

    // 12. Verify invoice_sequences
    const [seq] = await pgClient`
      SELECT last_seq FROM invoice_sequences WHERE organization_id = ${orgId}
    `;
    if (!seq) throw new Error("Invoice sequence not created");
    if (seq.last_seq !== 0) throw new Error(`Sequence should be 0, got ${seq.last_seq}`);
    console.log("✅ Invoice sequence created (last_seq = 0)");

    // 13. Duplicate slug should fail (transaction rolls back)
    try {
      await bootstrapOrganization({
        orgName: "Duplicate Org",
        orgSlug: testSlug, // same slug!
        foundingUserAuthId: crypto.randomUUID(),
        foundingUserEmail: "dup@test.com",
        foundingUserFullName: "Dup User",
      });
      throw new Error("Should have failed — duplicate slug!");
    } catch (err: any) {
      if (err.message.includes("Should have failed")) throw err;
      console.log("✅ Duplicate slug rejected (transaction rolled back)");
    }

    // 14. Verify no orphan data from failed bootstrap
    const [dupOrg] = await pgClient`
      SELECT * FROM organizations WHERE name = 'Duplicate Org'
    `;
    if (dupOrg) throw new Error("Failed bootstrap should NOT leave orphan org");
    console.log("✅ Failed bootstrap left no orphan data");

    // 15. Duplicate user auth ID should fail
    try {
      await bootstrapOrganization({
        orgName: "Another Org",
        orgSlug: testSlug + "_another",
        foundingUserAuthId: fakeAuthId, // same auth ID!
        foundingUserEmail: "another@test.com",
        foundingUserFullName: "Another User",
      });
      throw new Error("Should have failed — duplicate user ID!");
    } catch (err: any) {
      if (err.message.includes("Should have failed")) throw err;
      console.log("✅ Duplicate user auth ID rejected");
    }

    console.log("\n🎉 K-02b ALL CHECKS PASSED");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    // Cleanup in reverse dependency order
    if (orgId) {
      await pgClient`DELETE FROM user_roles WHERE user_id = ${fakeAuthId}`;
      await pgClient`DELETE FROM invoice_sequences WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM payment_methods WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM policy_settings WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE organization_id = ${orgId})`;
      await pgClient`DELETE FROM roles WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM users WHERE id = ${fakeAuthId}`;
      await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
      console.log("🧹 Test data cleaned up");
    }
    await pgClient.end();
  }
}

main();
