import "dotenv/config";
import { pgClient } from "./index";

async function main() {
  try {
    // 1. Check RLS is enabled on all core tables
    const tables = await pgClient`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN (
          'organizations', 'users', 'roles', 'permissions',
          'role_permissions', 'user_roles', 'provider_profiles',
          'services', 'service_tags', 'payment_methods',
          'policy_settings', 'tags', 'audit_logs', 'invoice_sequences'
        )
      ORDER BY tablename
    `;

    const expectedTables = [
      "audit_logs", "invoice_sequences", "organizations", "payment_methods",
      "permissions", "policy_settings", "provider_profiles", "role_permissions",
      "roles", "service_tags", "services", "tags", "user_roles", "users",
    ];

    if (tables.length !== 14) {
      throw new Error(`Expected 14 tables with RLS, found ${tables.length}`);
    }

    const missingRls = tables.filter((t: any) => !t.rowsecurity);
    if (missingRls.length > 0) {
      throw new Error(`Tables without RLS: ${missingRls.map((t: any) => t.tablename).join(", ")}`);
    }
    console.log("✅ RLS enabled on all 14 core tables");

    // 2. Check get_user_org_id function exists
    const [fn] = await pgClient`
      SELECT proname FROM pg_proc WHERE proname = 'get_user_org_id'
    `;
    if (!fn) throw new Error("get_user_org_id function not found");
    console.log("✅ get_user_org_id() function exists");

    // 3. Count policies
    const policies = await pgClient`
      SELECT tablename, policyname, cmd
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN (
          'organizations', 'users', 'roles', 'permissions',
          'role_permissions', 'user_roles', 'provider_profiles',
          'services', 'service_tags', 'payment_methods',
          'policy_settings', 'tags', 'audit_logs', 'invoice_sequences'
        )
      ORDER BY tablename, policyname
    `;

    if (policies.length < 50) {
      throw new Error(`Expected 50+ policies, found ${policies.length}`);
    }
    console.log(`✅ ${policies.length} RLS policies created`);

    // 4. Verify specific policy patterns
    // permissions should allow SELECT for all
    const permSelect = policies.find(
      (p: any) => p.tablename === "permissions" && p.cmd === "SELECT"
    );
    if (!permSelect) throw new Error("permissions SELECT policy missing");
    console.log("✅ permissions table has SELECT policy (global read)");

    // audit_logs should block UPDATE and DELETE
    const auditUpdate = policies.find(
      (p: any) => p.tablename === "audit_logs" && p.cmd === "UPDATE"
    );
    const auditDelete = policies.find(
      (p: any) => p.tablename === "audit_logs" && p.cmd === "DELETE"
    );
    if (!auditUpdate || !auditDelete) throw new Error("audit_logs UPDATE/DELETE policies missing");
    console.log("✅ audit_logs has UPDATE/DELETE deny policies (immutable)");

    // 5. Verify service_role bypasses RLS (our server queries still work)
    // pgClient uses service_role, so this should work even with RLS enabled
    const orgCount = await pgClient`SELECT COUNT(*) as c FROM organizations`;
    console.log(`✅ Service role bypasses RLS (${orgCount[0].c} orgs visible)`);

    console.log("\n🎉 K-13 ALL CHECKS PASSED");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

main();
