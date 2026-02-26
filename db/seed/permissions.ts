import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.local"), override: true });

const PERMISSION_KEYS = [
  "service.edit_price",
  "discount.large",
  "invoice.void",
  "payment.void",
  "settings.edit",
  "user.manage",
  "reports.view",
  "patient.manage",
  "appointment.manage",
  "invoice.create",
  "payment.record",
] as const;

const ROLE_PERMISSION_MAP: Record<string, readonly string[]> = {
  admin: PERMISSION_KEYS,
  manager: [
    "service.edit_price", "discount.large", "invoice.void", "payment.void",
    "settings.edit", "reports.view", "patient.manage", "appointment.manage",
    "invoice.create", "payment.record",
  ],
  receptionist: [
    "patient.manage", "appointment.manage", "invoice.create", "payment.record",
  ],
  provider: [
    "patient.manage", "appointment.manage",
  ],
  accountant: [
    "reports.view", "invoice.create", "payment.record",
  ],
};

/**
 * Seed global permissions (idempotent — ON CONFLICT DO NOTHING).
 * Returns a map of key → id for linking to roles.
 */
export async function seedPermissions(): Promise<Map<string, string>> {
  const { pgClient } = await import("../index");
  const permMap = new Map<string, string>();

  for (const key of PERMISSION_KEYS) {
    const [row] = await pgClient`
      INSERT INTO permissions (key, description)
      VALUES (${key}, ${key.replace(".", " — ")})
      ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key
      RETURNING id
    `;
    permMap.set(key, row.id);
  }

  return permMap;
}

/**
 * Seed 5 roles for an organization and map their permissions.
 * Idempotent — uses ON CONFLICT DO NOTHING.
 *
 * @param orgId - Organization UUID
 * @param permMap - Map of permission key → permission UUID (from seedPermissions)
 */
export async function seedRolesForOrg(
  orgId: string,
  permMap: Map<string, string>
): Promise<void> {
  const { pgClient } = await import("../index");

  for (const [roleName, permKeys] of Object.entries(ROLE_PERMISSION_MAP)) {
    // Upsert role
    const [role] = await pgClient`
      INSERT INTO roles (organization_id, name)
      VALUES (${orgId}, ${roleName})
      ON CONFLICT ON CONSTRAINT roles_org_name_unique DO UPDATE
        SET name = EXCLUDED.name
      RETURNING id
    `;

    // Map permissions
    for (const key of permKeys) {
      const permId = permMap.get(key);
      if (!permId) throw new Error(`Permission ${key} not found in map`);

      await pgClient`
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (${role.id}, ${permId})
        ON CONFLICT DO NOTHING
      `;
    }
  }
}
