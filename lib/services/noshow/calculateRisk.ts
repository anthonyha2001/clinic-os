import { pgClient } from "@/db/index";

export interface CalculatedRiskScore {
  patientId: string;
  orgId: string;
  totalAppointments: number;
  noShowCount: number;
  riskScore: number;
  isHighRisk: boolean;
  threshold: number;
}

export async function calculateRiskScore(
  patientId: string,
  orgId: string
): Promise<CalculatedRiskScore> {
  const [agg] = await pgClient`
    SELECT
      COUNT(*)::int AS total_appointments,
      COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show_count
    FROM appointments
    WHERE patient_id = ${patientId}
      AND organization_id = ${orgId}
      AND status NOT IN ('draft', 'scheduled', 'confirmed')
  `;

  const totalAppointments = Number(agg?.total_appointments ?? 0);
  const noShowCount = Number(agg?.no_show_count ?? 0);

  // Base score: no-show rate as percentage (0-100)
  // Minimum 3 appointments before scoring to avoid false positives on new patients
  const baseRate =
    totalAppointments >= 3 ? (noShowCount / totalAppointments) * 100 : 0;

  // Fetch recent no-shows (last 90 days) for recency weight
  const [recentAgg] = await pgClient`
    SELECT
      COUNT(*)::int AS recent_total,
      COUNT(*) FILTER (WHERE status = 'no_show')::int AS recent_no_shows
    FROM appointments
    WHERE patient_id = ${patientId}
      AND organization_id = ${orgId}
      AND status NOT IN ('draft', 'scheduled', 'confirmed')
      AND start_time >= now() - interval '90 days'
  `;
  const recentTotal = Number(recentAgg?.recent_total ?? 0);
  const recentNoShows = Number(recentAgg?.recent_no_shows ?? 0);
  const recentRate =
    recentTotal >= 2 ? (recentNoShows / recentTotal) * 100 : 0;

  // Final score: 60% weight on overall rate, 40% on recent rate
  // Rounded to nearest integer, capped at 100
  const riskScore = Math.min(
    Math.round(baseRate * 0.6 + recentRate * 0.4),
    100
  );

  await pgClient`
    INSERT INTO risk_scores (
      patient_id, organization_id, total_appointments, no_show_count, risk_score, last_calculated_at
    )
    VALUES (
      ${patientId}, ${orgId}, ${totalAppointments}, ${noShowCount}, ${riskScore}, now()
    )
    ON CONFLICT (patient_id, organization_id)
    DO UPDATE SET
      total_appointments = EXCLUDED.total_appointments,
      no_show_count = EXCLUDED.no_show_count,
      risk_score = EXCLUDED.risk_score,
      last_calculated_at = now()
  `;

  const [policy] = await pgClient`
    SELECT no_show_risk_threshold
    FROM policy_settings
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  const threshold = Number(policy?.no_show_risk_threshold ?? 3);

  return {
    patientId,
    orgId,
    totalAppointments,
    noShowCount,
    riskScore,
    isHighRisk: riskScore >= threshold,
    threshold,
  };
}
