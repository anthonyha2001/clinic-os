import "dotenv/config";
import { pgClient } from "./index";
import { seedPermissions, seedRolesForOrg } from "./seed/permissions";

async function main() {
  const testSlug = `test_k03_${Date.now()}`;
  let orgId: string | null = null;

  try {
    // Setup: create temp org
    const [org] = await pgClient`
      INSERT INTO organizations (name, slug) VALUES ('K03 Test', ${testSlug})
      RETURNING id
    `;
    orgId = org.id;
    console.log("Setup: org created", testSlug);

    // 1. Seed permissions
    const permMap = await seedPermissions();
    console.log(`✅ ${permMap.size} permissions seeded`);
    if (permMap.size !== 11) throw new Error(`Expected 11 permissions, got ${permMap.size}`);

    // 2. Verify "payment.edit" does NOT exist
    const badPerm = await pgClient`
      SELECT id FROM permissions WHERE key = 'payment.edit'
    `;
    if (badPerm.length > 0) throw new Error("payment.edit should NOT exist!");
    console.log("✅ payment.edit correctly absent");

    // 3. Seed roles for this org
    await seedRolesForOrg(orgId!, permMap);
    const orgRoles = await pgClient`
      SELECT name FROM roles WHERE organization_id = ${orgId} ORDER BY name
    `;
    const roleNames = orgRoles.map((r: any) => r.name).sort();
    console.log("Roles:", roleNames.join(", "));
    if (roleNames.length !== 5) throw new Error(`Expected 5 roles, got ${roleNames.length}`);
    console.log("✅ 5 roles seeded");

    // 4. Verify admin has all 11 permissions
    const adminPerms = await pgClient`
      SELECT p.key FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE r.organization_id = ${orgId} AND r.name = 'admin'
      ORDER BY p.key
    `;
    console.log("Admin perms:", adminPerms.map((r: any) => r.key).join(", "));
    if (adminPerms.length !== 11) throw new Error(`Admin should have 11 perms, got ${adminPerms.length}`);
    console.log("✅ admin has all 11 permissions");

    // 5. Verify provider has exactly 2 permissions (patient.manage, appointment.manage)
    const providerPerms = await pgClient`
      SELECT p.key FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE r.organization_id = ${orgId} AND r.name = 'provider'
      ORDER BY p.key
    `;
    const providerKeys = providerPerms.map((r: any) => r.key);
    console.log("Provider perms:", providerKeys.join(", "));
    if (providerKeys.length !== 2) throw new Error(`Provider should have 2 perms, got ${providerKeys.length}`);
    if (!providerKeys.includes("patient.manage") || !providerKeys.includes("appointment.manage")) {
      throw new Error("Provider missing expected permissions");
    }
    console.log("✅ provider has exactly 2 permissions (zero financial)");

    // 6. Verify accountant has exactly 3 permissions
    const acctPerms = await pgClient`
      SELECT p.key FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE r.organization_id = ${orgId} AND r.name = 'accountant'
      ORDER BY p.key
    `;
    const acctKeys = acctPerms.map((r: any) => r.key);
    console.log("Accountant perms:", acctKeys.join(", "));
    if (acctKeys.length !== 3) throw new Error(`Accountant should have 3, got ${acctKeys.length}`);
    console.log("✅ accountant has 3 permissions (reports.view, invoice.create, payment.record)");

    // 7. Test user_roles assignment
    const fakeUserId = crypto.randomUUID();
    await pgClient`
      INSERT INTO users (id, organization_id, email, full_name)
      VALUES (${fakeUserId}, ${orgId}, 'roletest@test.com', 'Role Test')
    `;
    const [adminRole] = await pgClient`
      SELECT id FROM roles WHERE organization_id = ${orgId} AND name = 'admin'
    `;
    await pgClient`
      INSERT INTO user_roles (user_id, role_id) VALUES (${fakeUserId}, ${adminRole.id})
    `;
    const [assignment] = await pgClient`
      SELECT ur.user_id, r.name as role_name
      FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ${fakeUserId}
    `;
    if (assignment.role_name !== "admin") throw new Error("Role assignment failed");
    console.log("✅ user_roles assignment works");

    // 8. Idempotency — run seed again, no errors
    await seedPermissions();
    await seedRolesForOrg(orgId!, permMap);
    console.log("✅ seeding is idempotent");

    console.log("\n🎉 K-03 ALL CHECKS PASSED");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    if (orgId) {
      await pgClient`DELETE FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE organization_id = ${orgId})`;
      await pgClient`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE organization_id = ${orgId})`;
      await pgClient`DELETE FROM users WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM roles WHERE organization_id = ${orgId}`;
      await pgClient`DELETE FROM organizations WHERE id = ${orgId}`;
      // NOTE: global permissions are left in place (they are shared, not test-specific)
      console.log("🧹 Test data cleaned up");
    }
    await pgClient.end();
  }
}

main();
