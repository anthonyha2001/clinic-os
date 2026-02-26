import { pgClient } from "@/db/index";

export interface InactivePatientItem {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  lastVisit: string;
  daysSinceLastVisit: number;
  providerName: string | null;
}

export interface InactivePatientsResult {
  warning: InactivePatientItem[];
  critical: InactivePatientItem[];
  thresholds: {
    warningDays: number;
    criticalDays: number;
  };
}

/**
 * Read-only dashboard query intended for low-frequency use (e.g. daily view).
 * Avoid polling this endpoint frequently.
 */
export async function getInactivePatients(
  orgId: string
): Promise<InactivePatientsResult> {
  const [policy] = await pgClient`
    SELECT inactivity_days_warning, inactivity_days_critical
    FROM policy_settings
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;

  const warningDays = Number(policy?.inactivity_days_warning ?? 60);
  const criticalDays = Number(policy?.inactivity_days_critical ?? 90);

  const rows = await pgClient`
    WITH last_completed AS (
      SELECT
        patient_id,
        MAX(start_time) AS last_visit
      FROM appointments
      WHERE organization_id = ${orgId}
        AND status = 'completed'
      GROUP BY patient_id
    ),
    future_booked AS (
      SELECT DISTINCT patient_id
      FROM appointments
      WHERE organization_id = ${orgId}
        AND status IN ('scheduled', 'confirmed')
        AND start_time > now()
    ),
    last_completed_with_provider AS (
      SELECT DISTINCT ON (a.patient_id)
        a.patient_id,
        u.full_name AS provider_name
      FROM appointments a
      LEFT JOIN provider_profiles pp
        ON pp.id = a.provider_id
      LEFT JOIN users u
        ON u.id = pp.user_id
      WHERE a.organization_id = ${orgId}
        AND a.status = 'completed'
      ORDER BY a.patient_id, a.start_time DESC, a.created_at DESC
    )
    SELECT
      p.id,
      p.first_name,
      p.last_name,
      p.phone,
      lc.last_visit,
      FLOOR(EXTRACT(EPOCH FROM (now() - lc.last_visit)) / 86400)::int AS days_since_last_visit,
      lcp.provider_name
    FROM patients p
    JOIN last_completed lc
      ON lc.patient_id = p.id
    LEFT JOIN last_completed_with_provider lcp
      ON lcp.patient_id = p.id
    LEFT JOIN future_booked fb
      ON fb.patient_id = p.id
    WHERE p.organization_id = ${orgId}
      AND p.is_active = true
      AND fb.patient_id IS NULL
      AND FLOOR(EXTRACT(EPOCH FROM (now() - lc.last_visit)) / 86400)::int >= ${warningDays}
    ORDER BY lc.last_visit ASC
  `;

  const warning: InactivePatientItem[] = [];
  const critical: InactivePatientItem[] = [];

  for (const row of rows) {
    const daysSinceLastVisit = Number(row.days_since_last_visit ?? 0);
    const item: InactivePatientItem = {
      id: row.id as string,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      phone: row.phone as string,
      lastVisit: new Date(row.last_visit as string | Date).toISOString(),
      daysSinceLastVisit,
      providerName: (row.provider_name as string | null) ?? null,
    };

    if (daysSinceLastVisit >= criticalDays) {
      critical.push(item);
    } else if (daysSinceLastVisit >= warningDays) {
      warning.push(item);
    }
  }

  return {
    warning,
    critical,
    thresholds: { warningDays, criticalDays },
  };
}
