import { NextRequest, NextResponse } from "next/server";
import { pgClient } from "@/db/index";
import { sendAppointmentReminders } from "@/lib/automation/handlers/appointmentReminder";
import { sendNoShowFollowups } from "@/lib/automation/handlers/noShowFollowup";
import { runRecallEngine } from "@/lib/automation/handlers/recallEngine";
import { autoMarkNoShows } from "@/lib/automation/handlers/autoNoShow";
import { runEndOfDaySummary } from "@/lib/automation/handlers/endOfDaySummary";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orgs = await pgClient`
      SELECT id FROM organizations WHERE is_active = true
    `;

    // EOD summary runs once (not per-org loop) — it handles all orgs internally
    const now = new Date();
    const isEodWindow = now.getHours() >= 20 && now.getHours() < 21; // 8–9 PM

    const results: Record<string, unknown>[] = [];

    for (const org of orgs) {
      const orgId = String(org.id);
      try {
        const [reminders, noShows, recalls, autoNoShows] = await Promise.all([
          sendAppointmentReminders(orgId).catch((e) => ({ error: String(e) })),
          sendNoShowFollowups(orgId).catch((e) => ({ error: String(e) })),
          runRecallEngine(orgId).catch((e) => ({ error: String(e) })),
          autoMarkNoShows(orgId).catch((e) => ({ error: String(e) })),
        ]);

        let eodSummary: unknown = { skipped: "outside EOD window" };
        if (isEodWindow) {
          eodSummary = await runEndOfDaySummary(orgId).catch((e) => ({ error: String(e) }));
        }

        results.push({ orgId, reminders, noShows, recalls, autoNoShows, eodSummary });
      } catch (orgErr) {
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