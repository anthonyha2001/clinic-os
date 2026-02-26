import { pgClient } from "@/db/index";

export interface AuditLogParams {
  organizationId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any;
}

/**
 * Record an audit log entry. Call this within the same transaction
 * as the action being audited for consistency.
 *
 * Common actions:
 *   invoice.voided, payment.voided, payment.reversed,
 *   discount.applied, service.price_changed, policy.updated,
 *   role.assigned, role.removed
 */
export async function auditLog(params: AuditLogParams): Promise<void> {
  const {
    organizationId,
    userId,
    action,
    entityType,
    entityId,
    details = null,
    ipAddress = null,
    tx,
  } = params;

  const sql = tx ?? pgClient;
  await sql`
    INSERT INTO audit_logs (
      organization_id, user_id, action, entity_type, entity_id, details, ip_address
    ) VALUES (
      ${organizationId},
      ${userId},
      ${action},
      ${entityType},
      ${entityId},
      ${details ? JSON.stringify(details) : null}::jsonb,
      ${ipAddress}
    )
  `;
}
