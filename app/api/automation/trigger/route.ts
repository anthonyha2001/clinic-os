import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { sendAppointmentReminders } from "@/lib/automation/handlers/appointmentReminder";
import { sendNoShowFollowups } from "@/lib/automation/handlers/noShowFollowup";
import { runRecallEngine } from "@/lib/automation/handlers/recallEngine";

export const POST = withAuth(
  { roles: ["admin", "manager"] },
  async (request, { user }) => {
    const body = await request.json();
    const action = body?.action;

    try {
      if (action === "send_reminders") {
        const result = await sendAppointmentReminders(user.organizationId);
        return NextResponse.json({ ok: true, ...result });
      }

      if (action === "send_noshows") {
        const result = await sendNoShowFollowups(user.organizationId);
        return NextResponse.json({ ok: true, ...result });
      }

      if (action === "run_recalls") {
        const result = await runRecallEngine(user.organizationId);
        return NextResponse.json({ ok: true, ...result });
      }

      if (action === "run_all") {
        const [reminders, noShows, recalls] = await Promise.all([
          sendAppointmentReminders(user.organizationId),
          sendNoShowFollowups(user.organizationId),
          runRecallEngine(user.organizationId),
        ]);
        return NextResponse.json({ ok: true, reminders, no_show_followups: noShows, recalls });
      }

      return NextResponse.json({ error: "Invalid action" }, { status: 422 });
    } catch (e) {
      console.error("Automation trigger error:", e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }
);