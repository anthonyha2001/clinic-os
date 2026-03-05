/**
 * One-time script: ensure every admin role has reports.view permission.
 * Run with: npx tsx db/ensure-admin-reports-permission.ts
 */
import "dotenv/config";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local"), override: false });

async function main() {
  const { pgClient } = await import("./index");

  const PERMISSION_KEY = "reports.view";

  const [permRow] = await pgClient`
    SELECT id FROM permissions WHERE key = ${PERMISSION_KEY} LIMIT 1
  `;
  if (!permRow?.id) {
    console.error(`Permission "${PERMISSION_KEY}" not found. Run seed (e.g. seedPermissions) first.`);
    process.exit(1);
  }
  const permissionId = permRow.id;

  const adminRoles = await pgClient`
    SELECT id, name, organization_id FROM roles WHERE name = 'admin'
  `;
  if (adminRoles.length === 0) {
    console.log("No admin roles found.");
    process.exit(0);
  }

  let added = 0;
  for (const role of adminRoles) {
    const [existing] = await pgClient`
      SELECT 1 FROM role_permissions
      WHERE role_id = ${role.id} AND permission_id = ${permissionId}
      LIMIT 1
    `;
    if (!existing) {
      await pgClient`
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (${role.id}, ${permissionId})
        ON CONFLICT DO NOTHING
      `;
      added++;
      console.log("Granted reports.view to an admin role.");
    }
  }
  console.log(`Done. Granted reports.view to ${added} admin role(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
