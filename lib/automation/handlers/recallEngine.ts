import { pgClient } from "@/db/index";

export async function runRecallEngine(orgId?: string) {
  // Find patients whose last appointment was 6+ months ago
  // and don't already have a pending recall
  const orgFilter = orgId ? pgClient`AND a.organization_id = ${orgId}` : pgClient``;

  const candidates = await pgClient`
    SELECT DISTINCT ON (p.id)
      p.id AS patient_id,
      p.organization_id,
      p.first_name,
      p.last_name,
      p.phone,
      MAX(a.start_time)::date AS last_visit_date,
      (MAX(a.start_time)::date + INTERVAL '6 months')::date AS recall_due_date
    FROM patients p
    JOIN appointments a ON a.patient_id = p.id
      AND a.status = 'completed'
    LEFT JOIN patient_recalls pr ON pr.patient_id = p.id
      AND pr.status IN ('pending', 'contacted')
    WHERE p.is_active = true
      AND pr.id IS NULL
      ${orgId ? pgClient`AND p.organization_id = ${orgId}` : pgClient``}
    GROUP BY p.id, p.organization_id, p.first_name, p.last_name, p.phone
    HAVING MAX(a.start_time) < now() - INTERVAL '6 months'
    ORDER BY p.id, MAX(a.start_time) ASC
  `;

  let created = 0;
  for (const candidate of candidates as Record<string, unknown>[]) {
    await pgClient`
      INSERT INTO patient_recalls (
        organization_id, patient_id, recall_type,
        due_date, last_visit_date, status
      ) VALUES (
        ${candidate.organization_id}, ${candidate.patient_id},
        'routine_checkup', ${candidate.recall_due_date},
        ${candidate.last_visit_date}, 'pending'
      )
      ON CONFLICT (patient_id, recall_type, due_date) DO NOTHING
    `;

    // Queue automation event
    await pgClient`
      INSERT INTO automation_events (
        organization_id, event_type, entity_type, entity_id,
        patient_id, payload, scheduled_for
      ) VALUES (
        ${candidate.organization_id}, 'recall_due', 'patient',
        ${candidate.patient_id}, ${candidate.patient_id},
        ${JSON.stringify({
          patient_name: `${candidate.first_name} ${candidate.last_name}`,
          patient_phone: candidate.phone,
          last_visit_date: candidate.last_visit_date,
          recall_due_date: candidate.recall_due_date,
        })},
        now()
      )
      ON CONFLICT DO NOTHING
    `;
    created++;
  }

  return { candidates_found: candidates.length, recalls_created: created };
}

export async function getRecallList(orgId: string) {
  return pgClient`
    SELECT
      pr.*,
      p.first_name, p.last_name, p.phone, p.email,
      (SELECT COUNT(*) FROM appointments a
       WHERE a.patient_id = pr.patient_id AND a.status = 'completed') AS total_visits
    FROM patient_recalls pr
    JOIN patients p ON p.id = pr.patient_id
    WHERE pr.organization_id = ${orgId}
      AND pr.status IN ('pending', 'contacted')
    ORDER BY pr.due_date ASC
  `;
}