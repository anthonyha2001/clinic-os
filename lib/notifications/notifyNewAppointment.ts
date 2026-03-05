import { pgClient } from "@/db/index";
import { sendEmail } from "@/lib/email/send";

export type NewAppointmentPayload = {
  organizationId: string;
  appointmentId: string;
  patientId: string;
  providerId: string;
  startTime: Date;
  endTime: Date;
  patientName?: string;
  providerName?: string;
};

/**
 * Send email to all users in the organization when a new appointment is created.
 * Runs asynchronously and never throws — email failures do not block appointment creation.
 */
export async function notifyNewAppointment(
  payload: NewAppointmentPayload
): Promise<void> {
  const { organizationId, appointmentId, startTime, endTime } = payload;

  try {
    const [details] = await pgClient`
      SELECT
        p.first_name || ' ' || COALESCE(p.last_name, '') AS patient_name,
        COALESCE(u.full_name, 'Provider') AS provider_name
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      LEFT JOIN provider_profiles pp ON pp.id = a.provider_id
      LEFT JOIN users u ON u.id = pp.user_id
      WHERE a.id = ${appointmentId}
      LIMIT 1
    `;

    const patientName =
      payload.patientName ?? (details?.patient_name as string) ?? "Patient";
    const providerName =
      payload.providerName ?? (details?.provider_name as string) ?? "Provider";

    const startFormatted = new Date(startTime).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const endFormatted = new Date(endTime).toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://yourapp.com";
    const appointmentsUrl = `${appUrl.replace(/\/$/, "")}/appointments`;

    const subject = `New appointment: ${patientName} — ${startFormatted}`;
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">New Appointment</h2>
        <p style="color: #475569; line-height: 1.6;">
          A new appointment has been scheduled.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc; border-radius: 8px; overflow: hidden;">
          <tr><td style="padding: 12px 16px; font-weight: 600; color: #64748b; width: 120px;">Patient</td><td style="padding: 12px 16px;">${escapeHtml(patientName)}</td></tr>
          <tr><td style="padding: 12px 16px; font-weight: 600; color: #64748b;">Provider</td><td style="padding: 12px 16px;">${escapeHtml(providerName)}</td></tr>
          <tr><td style="padding: 12px 16px; font-weight: 600; color: #64748b;">Date & time</td><td style="padding: 12px 16px;">${escapeHtml(startFormatted)} – ${escapeHtml(endFormatted)}</td></tr>
        </table>
        <p style="margin-top: 24px;">
          <a href="${appointmentsUrl}" style="display: inline-block; padding: 10px 20px; background: #1e88e5; color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">View appointments</a>
        </p>
      </div>
    `;

    const users = await pgClient`
      SELECT email, full_name
      FROM users
      WHERE organization_id = ${organizationId}
        AND is_active = true
        AND email IS NOT NULL
        AND trim(email) != ''
    `;

    const emails = (users as { email: string }[]).map((u) => u.email.trim());
    const uniqueEmails = [...new Set(emails)];

    if (uniqueEmails.length === 0) {
      if (process.env.NODE_ENV === "development") {
        console.log("[notifyNewAppointment] No users with email in org", organizationId);
      }
      return;
    }

    const results = await Promise.allSettled(
      uniqueEmails.map((email) =>
        sendEmail({ to: email, subject, html })
      )
    );

    const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok));
    if (failed.length > 0) {
      console.warn("[notifyNewAppointment] Some emails failed:", failed.length, "of", uniqueEmails.length);
    }
  } catch (e) {
    console.error("[notifyNewAppointment] Error:", e);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
