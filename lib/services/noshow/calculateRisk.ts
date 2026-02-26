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
  // Phase 1 formula intentionally simple and isolated for future swaps.
  const riskScore = noShowCount;

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
