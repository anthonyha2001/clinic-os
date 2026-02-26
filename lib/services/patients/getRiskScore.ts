import { pgClient } from "@/db/index";

export async function getRiskScore(
  patientId: string,
  orgId: string
): Promise<number> {
  const [row] = await pgClient`
    SELECT risk_score
    FROM risk_scores
    WHERE patient_id = ${patientId} AND organization_id = ${orgId}
    LIMIT 1
  `;
  return row ? Number(row.risk_score) : 0;
}
