import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "Clinic OS <onboarding@resend.dev>";

/**
 * Send an email via Resend. No-op if RESEND_API_KEY is not set.
 * Fails silently so appointment creation is never blocked by email errors.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    if (process.env.NODE_ENV === "development") {
      console.log("[Email] RESEND_API_KEY not set — skipping send to", to);
    }
    return { ok: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error("[Email] Resend error:", error);
      return { ok: false, error: String(error) };
    }

    return { ok: true };
  } catch (e) {
    console.error("[Email] Send failed:", e);
    return { ok: false, error: String(e) };
  }
}
