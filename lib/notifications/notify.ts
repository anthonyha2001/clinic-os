import { pgClient } from "@/db/index";
import { sendEmail } from "@/lib/email/send";

export type NotifyPayload = {
  organizationId: string;
  /** Specific user IDs to notify. If omitted, notifies all active users in org. */
  userIds?: string[];
  /** If true, only notify admin + manager roles */
  adminOnly?: boolean;
  /** If true, only notify users with the 'provider' role */
  providerIds?: string[];
  type: "new_appointment" | "schedule_change" | "no_show" | "eod_summary";
  title: string;
  body: string;
  link?: string;
  /** Send email as well */
  email?: {
    subject: string;
    html: string;
  };
};

/**
 * Creates in-app notification rows and optionally sends emails.
 * Never throws — failures are logged only.
 */
export async function notify(payload: NotifyPayload): Promise<void> {
  const {
    organizationId,
    userIds,
    adminOnly,
    providerIds,
    type,
    title,
    body,
    link,
    email,
  } = payload;

  try {
    // ── Resolve recipients ──────────────────────────────────────────────────
    let recipients: { id: string; email: string }[] = [];

    if (userIds?.length) {
      const rows = await pgClient`
        SELECT id, email FROM users
        WHERE id = ANY(${userIds}::uuid[])
          AND organization_id = ${organizationId}
          AND is_active = true
      `;
      recipients = rows as { id: string; email: string }[];
    } else if (adminOnly) {
      const rows = await pgClient`
        SELECT DISTINCT u.id, u.email
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE u.organization_id = ${organizationId}
          AND u.is_active = true
          AND r.name IN ('admin', 'manager')
      `;
      recipients = rows as { id: string; email: string }[];
    } else {
      const rows = await pgClient`
        SELECT id, email FROM users
        WHERE organization_id = ${organizationId}
          AND is_active = true
      `;
      recipients = rows as { id: string; email: string }[];
    }

    if (recipients.length === 0) return;

    // ── Insert notification rows ────────────────────────────────────────────
    for (const u of recipients) {
      await pgClient`
        INSERT INTO notifications
          (organization_id, user_id, type, title, body, link)
        VALUES
          (${organizationId}, ${u.id}, ${type}, ${title}, ${body}, ${link ?? null})
      `;
    }

    // ── Send emails ─────────────────────────────────────────────────────────
    if (email) {
      await Promise.allSettled(
        recipients
          .filter((u) => u.email?.trim())
          .map((u) =>
            sendEmail({ to: u.email, subject: email.subject, html: email.html })
          )
      );
    }
  } catch (e) {
    console.error("[notify] Error:", e);
  }
}