import { NextRequest, NextResponse } from "next/server";
import { pgClient } from "@/db/index";
import { sendAppointmentReminders } from "@/lib/automation/handlers/appointmentReminder";
import { sendNoShowFollowups } from "@/lib/automation/handlers/noShowFollowup";
import { runRecallEngine } from "@/lib/automation/handlers/recallEngine";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch all active orgs
    const orgs = await pgClient`
      SELECT id FROM organizations
      WHERE is_active = true
    `;

    const results: Record<string, unknown>[] = [];

    for (const org of orgs) {
      const orgId = String(org.id);
      try {
        const [reminders, noShows, recalls] = await Promise.all([
          sendAppointmentReminders(orgId).catch((e) => ({ error: String(e) })),
          sendNoShowFollowups(orgId).catch((e) => ({ error: String(e) })),
          runRecallEngine(orgId).catch((e) => ({ error: String(e) })),
        ]);
        results.push({ orgId, reminders, noShows, recalls });
      } catch (orgErr) {
        // One org failing must never block others
        console.error(`Automation failed for org ${orgId}:`, orgErr);
        results.push({ orgId, error: String(orgErr) });
      }
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
      results,
      ran_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Automation process error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}