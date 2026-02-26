import { getPendingEvents, markEventStatus } from "./queue";
import { handleNoShowFollowup } from "./handlers/noShowFollowup";
import { runRecallEngine } from "./handlers/recallEngine";
import type { AutomationEvent } from "./types";

export async function processAutomationEvents() {
  const events = await getPendingEvents(50);
  const results = { processed: 0, failed: 0, skipped: 0 };

  for (const event of events as unknown as AutomationEvent[]) {
    try {
      // Mark as processing
      await markEventStatus(event.id, "completed"); // optimistic, will revert on fail

      let result: Record<string, unknown> = {};

      switch (event.event_type) {
        case "no_show_followup":
          result = await handleNoShowFollowup(event);
          break;

        case "recall_due":
          // Log recall — actual WhatsApp send when ready
          console.log(`[Recall] Patient ${event.patient_id} due for recall`);
          result = { logged: true };
          break;

        case "plan_completed":
          console.log(`[PlanCompleted] Plan ${event.entity_id} fully completed`);
          result = { logged: true };
          break;

        case "auto_invoice":
          // Already handled in status route — just log
          result = { logged: true };
          break;

        default:
          await markEventStatus(event.id, "skipped", "Unknown event type");
          results.skipped++;
          continue;
      }

      if (result.skipped) {
        await markEventStatus(event.id, "skipped", result.reason as string);
        results.skipped++;
      } else {
        await markEventStatus(event.id, "completed");
        results.processed++;
      }
    } catch (err) {
      const error = err as Error;
      await markEventStatus(event.id, "failed", error.message);
      results.failed++;
      console.error(`[Automation] Event ${event.id} failed:`, error.message);
    }
  }

  return results;
}