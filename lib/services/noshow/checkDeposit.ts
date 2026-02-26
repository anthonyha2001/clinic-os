import { pgClient } from "@/db/index";

export async function checkDepositRequired(
  patientId: string,
  orgId: string
): Promise<boolean> {
  const [policy] = await pgClient`
    SELECT deposit_required_above_risk, no_show_risk_threshold
    FROM policy_settings
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;

  if (!policy) {
    return false;
  }

  if (!policy.deposit_required_above_risk) {
    return false;
  }

  const [risk] = await pgClient`
    SELECT risk_score
    FROM risk_scores
    WHERE patient_id = ${patientId}
      AND organization_id = ${orgId}
    LIMIT 1
  `;

  if (!risk) {
    return false;
  }

  return Number(risk.risk_score) >= Number(policy.no_show_risk_threshold);
}
