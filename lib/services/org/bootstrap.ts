import { pgClient } from "@/db/index";

export interface BootstrapParams {
  orgName: string;
  orgSlug: string;
  timezone?: string;
  currency?: string;
  foundingUserAuthId: string;
  foundingUserEmail: string;
  foundingUserFullName: string;
  foundingUserPhone?: string;
  foundingUserLocale?: string;
}

export interface BootstrapResult {
  organizationId: string;
  userId: string;
  roles: string[];
}

/**
 * Creates a new organization with all required seed data in one transaction.
 *
 * Steps (all-or-nothing):
 *   1. INSERT organization
 *   2. INSERT founding user
 *   3. INSERT 5 roles + role_permissions
 *   4. Assign admin role to founding user
 *   5. INSERT default policy_settings
 *   6. INSERT default payment_methods (3)
 *   7. INSERT invoice_sequences row
 *
 * Throws on failure — caller should catch and return appropriate HTTP response.
 */
export async function bootstrapOrganization(
  params: BootstrapParams
): Promise<BootstrapResult> {
  const {
    orgName,
    orgSlug,
    timezone = "Asia/Beirut",
    currency = "USD",
    foundingUserAuthId,
    foundingUserEmail,
    foundingUserFullName,
    foundingUserPhone = null,
    foundingUserLocale = "en",
  } = params;

  // Use a raw transaction via pgClient
  const result = await pgClient.begin(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql = tx as any;
    // 1. Create organization
    const [org] = await sql`
      INSERT INTO organizations (name, slug, timezone, currency)
      VALUES (${orgName}, ${orgSlug}, ${timezone}, ${currency})
      RETURNING id
    `;
    const orgId = org.id;

    // 2. Create founding user
    const [user] = await sql`
      INSERT INTO users (id, organization_id, email, full_name, phone, preferred_locale)
      VALUES (${foundingUserAuthId}, ${orgId}, ${foundingUserEmail}, ${foundingUserFullName}, ${foundingUserPhone}, ${foundingUserLocale})
      RETURNING id
    `;

    // 3. Create 5 roles for this org
    const roleNames = ["admin", "manager", "receptionist", "provider", "accountant"];
    const roles = await sql`
      INSERT INTO roles (organization_id, name)
      SELECT ${orgId}, unnest(${roleNames}::text[])
      RETURNING id, name
    `;

    // 4. Map permissions to roles
    // Get all global permissions
    const allPerms = await sql`SELECT id, key FROM permissions`;
    const permMap = new Map(
      (allPerms as Array<{ key: string; id: string }>).map((p) => [p.key, p.id])
    );

    // Permission matrix
    const matrix: Record<string, string[]> = {
      admin: [
        "service.edit_price", "discount.large", "invoice.void", "payment.void",
        "settings.edit", "user.manage", "reports.view", "patient.manage",
        "appointment.manage", "invoice.create", "payment.record",
      ],
      manager: [
        "service.edit_price", "discount.large", "invoice.void", "payment.void",
        "settings.edit", "reports.view", "patient.manage",
        "appointment.manage", "invoice.create", "payment.record",
      ],
      receptionist: ["patient.manage", "appointment.manage", "invoice.create", "payment.record"],
      provider: ["patient.manage", "appointment.manage"],
      accountant: ["reports.view", "invoice.create", "payment.record"],
    };

    // Build role_permissions inserts
    for (const role of roles) {
      const permKeys = matrix[role.name] || [];
      const permIds = permKeys
        .map((key: string) => permMap.get(key))
        .filter((id: string | undefined): id is string => id !== undefined);

      if (permIds.length > 0) {
        await sql`
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT ${role.id}, unnest(${permIds}::uuid[])
          ON CONFLICT DO NOTHING
        `;
      }
    }

    // 5. Assign admin role to founding user
    const adminRole = (roles as Array<{ id: string; name: string }>).find((r) => r.name === "admin");
    if (!adminRole) throw new Error("Admin role not created");

    await sql`
      INSERT INTO user_roles (user_id, role_id)
      VALUES (${user.id}, ${adminRole.id})
    `;

    // 6. Create default policy_settings
    await sql`
      INSERT INTO policy_settings (organization_id)
      VALUES (${orgId})
    `;

    // 7. Create default payment methods (trilingual)
    await sql`
      INSERT INTO payment_methods (organization_id, type, label_en, label_fr, label_ar, display_order)
      VALUES
        (${orgId}, 'cash', 'Cash', 'Espèces', 'نقداً', 1),
        (${orgId}, 'card', 'Credit/Debit Card', 'Carte de crédit/débit', 'بطاقة ائتمان/خصم', 2),
        (${orgId}, 'bank_transfer', 'Bank Transfer', 'Virement bancaire', 'تحويل بنكي', 3)
    `;

    // 8. Create invoice sequence counter
    await sql`
      INSERT INTO invoice_sequences (organization_id, last_seq)
      VALUES (${orgId}, 0)
    `;

    return {
      organizationId: orgId,
      userId: user.id,
      roles: ["admin"],
    };
  });

  return result;
}
