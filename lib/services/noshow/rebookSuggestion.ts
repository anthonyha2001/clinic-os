import { pgClient } from "@/db/index";

export interface RebookPlanContext {
  planId: string;
  planNameEn: string;
  planNameFr: string;
  planNameAr: string;
  completedSessions: number;
  totalSessions: number;
  remainingSessions: number;
}

export interface RebookSuggestion {
  patientId: string;
  providerId: string;
  serviceId: string;
  suggestedDate: string;
  providerName: string | null;
  serviceNameEn: string | null;
  serviceNameFr: string | null;
  serviceNameAr: string | null;
  planContext: RebookPlanContext | null;
}

function err404(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 404;
  throw e;
}

function addDays(isoDate: string, days: number): string {
  const base = new Date(isoDate);
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return next.toISOString();
}

export async function getRebookSuggestion(
  appointmentId: string,
  orgId: string
): Promise<RebookSuggestion> {
  const [appointment] = await pgClient`
    SELECT
      a.patient_id,
      a.provider_id,
      a.start_time,
      a.plan_item_id,
      al.service_id,
      u.full_name AS provider_name,
      s.name_en AS service_name_en,
      s.name_fr AS service_name_fr,
      s.name_ar AS service_name_ar
    FROM appointments a
    LEFT JOIN appointment_lines al
      ON al.appointment_id = a.id
      AND al.organization_id = a.organization_id
      AND al.sequence_order = 1
    LEFT JOIN provider_profiles pp
      ON pp.id = a.provider_id
    LEFT JOIN users u
      ON u.id = pp.user_id
    LEFT JOIN services s
      ON s.id = al.service_id
    WHERE a.id = ${appointmentId}
      AND a.organization_id = ${orgId}
      AND a.status = 'completed'
    LIMIT 1
  `;

  if (!appointment) {
    err404("Completed appointment not found");
  }

  const serviceId = appointment.service_id as string | null;
  if (!serviceId) {
    err404("Appointment line not found");
  }

  const suggestedDate = addDays(
    new Date(appointment.start_time as string | Date).toISOString(),
    7
  );

  const planItemId = appointment.plan_item_id as string | null;
  let planContext: RebookPlanContext | null = null;

  if (planItemId) {
    const [planItem] = await pgClient`
      SELECT plan_id
      FROM plan_items
      WHERE id = ${planItemId}
      LIMIT 1
    `;
    if (planItem) {
      const [plan] = await pgClient`
        SELECT id, name_en, name_fr, name_ar, status
        FROM plans
        WHERE id = ${planItem.plan_id}
          AND organization_id = ${orgId}
        LIMIT 1
      `;
      if (plan) {
        const [progress] = await pgClient`
          SELECT
            COALESCE(SUM(quantity_completed), 0)::int AS completed_sessions,
            COALESCE(SUM(quantity_total), 0)::int AS total_sessions
          FROM plan_items
          WHERE plan_id = ${plan.id}
        `;
        const completedSessions = Number(progress?.completed_sessions ?? 0);
        const totalSessions = Number(progress?.total_sessions ?? 0);
        planContext = {
          planId: plan.id as string,
          planNameEn: String(plan.name_en ?? ""),
          planNameFr: String(plan.name_fr ?? ""),
          planNameAr: String(plan.name_ar ?? ""),
          completedSessions,
          totalSessions,
          remainingSessions: Math.max(totalSessions - completedSessions, 0),
        };
      }
    }
  }

  return {
    patientId: appointment.patient_id as string,
    providerId: appointment.provider_id as string,
    serviceId,
    suggestedDate,
    providerName: (appointment.provider_name as string | null) ?? null,
    serviceNameEn: (appointment.service_name_en as string | null) ?? null,
    serviceNameFr: (appointment.service_name_fr as string | null) ?? null,
    serviceNameAr: (appointment.service_name_ar as string | null) ?? null,
    planContext,
  };
}
