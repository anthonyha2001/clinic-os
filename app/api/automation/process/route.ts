import { NextRequest, NextResponse } from "next/server";
import { sendAppointmentReminders } from "@/lib/automation/handlers/appointmentReminder";
import { sendNoShowFollowups } from "@/lib/automation/handlers/noShowFollowup";
import { runRecallEngine } from "@/lib/automation/handlers/recallEngine";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [reminders, noShows, recalls] = await Promise.all([
      sendAppointmentReminders(),
      sendNoShowFollowups(),
      runRecallEngine(),
    ]);

    return NextResponse.json({
      ok: true,
      reminders,
      no_show_followups: noShows,
      recalls,
      ran_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Automation process error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}