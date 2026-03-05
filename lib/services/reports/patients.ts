import { pgClient } from "@/db/index";

interface GetPatientsReportInput {
  orgId: string;
  startDate: string;
  endDate: string;
}

function safeDivide(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function ageGroup(dob: string | Date | null): string | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const age = Math.floor(
    (now.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
  if (age < 18) return "0-17";
  if (age < 30) return "18-29";
  if (age < 45) return "30-44";
  if (age < 60) return "45-59";
  return "60+";
}

function normalizeGender(gender: unknown): "male" | "female" | "other" | null {
  if (typeof gender !== "string") return null;
  const g = gender.trim().toLowerCase();
  if (!g) return null;
  if (g === "male" || g === "m") return "male";
  if (g === "female" || g === "f") return "female";
  if (g === "other") return "other";
  return null;
}

export async function getPatientsReport(input: GetPatientsReportInput) {
  const { orgId, startDate, endDate } = input;
  let newPatients = 0;
  let returningPatients = 0;

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const patientsCreatedInRange = await pgClient`
    SELECT COUNT(*)::int AS cnt
    FROM patients
    WHERE organization_id = ${orgId}
      AND created_at >= ${startDate}::timestamptz
      AND created_at <= ${endDate}::timestamptz
  `;
  const patientsCreatedCount = Number(patientsCreatedInRange[0]?.cnt ?? 0);

  const appointmentsInRange = await pgClient`
    SELECT patient_id, start_time
    FROM appointments
    WHERE organization_id = ${orgId}
      AND start_time >= ${startDate}::timestamptz
      AND start_time <= ${endDate}::timestamptz
  `;

  const firstApptBeforeRange = await pgClient`
    SELECT patient_id, MIN(start_time) AS first_start
    FROM appointments
    WHERE organization_id = ${orgId}
      AND start_time < ${startDate}::timestamptz
    GROUP BY patient_id
  `;
  const hadAppointmentBeforeRange = new Set(
    firstApptBeforeRange.map((r) => String(r.patient_id))
  );

  const patientIdsInRange = [
    ...new Set(appointmentsInRange.map((r) => String(r.patient_id))),
  ];

  // Demographics should represent all patients in the organization,
  // not only patients who visited in the selected period.
  const patientRows = await pgClient`
    SELECT id, date_of_birth, gender
    FROM patients
    WHERE organization_id = ${orgId}
  `;
  const byGenderMap = new Map<string, number>();
  const byAgeGroupMap = new Map<string, number>();
  for (const row of patientRows) {
    const gender = normalizeGender(row.gender);
    const ag = ageGroup(row.date_of_birth as string | Date | null);
    if (gender) {
      byGenderMap.set(gender, (byGenderMap.get(gender) ?? 0) + 1);
    }
    if (ag) {
      byAgeGroupMap.set(ag, (byAgeGroupMap.get(ag) ?? 0) + 1);
    }
  }
  const totalPatients = patientRows.length;

  if (patientIdsInRange.length === 0) {
    const inactiveCount = await pgClient`
      SELECT COUNT(*)::int AS cnt
      FROM patients p
      WHERE p.organization_id = ${orgId}
        AND NOT EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.patient_id = p.id AND a.status = 'completed' AND a.start_time >= ${ninetyDaysAgo.toISOString()}::timestamptz
        )
    `;
    return {
      summary: {
        total_patients: totalPatients,
        new_patients: newPatients,
        patients_created_in_range: patientsCreatedCount,
        returning_patients: 0,
        retention_rate: 0,
        inactive_patients: Number(inactiveCount[0]?.cnt ?? 0),
      },
      new_by_month: [],
      by_gender: Array.from(byGenderMap.entries()).map(([gender, count]) => ({
        gender,
        count,
      })),
      by_age_group: Array.from(byAgeGroupMap.entries()).map(
        ([age_group, count]) => ({ age_group, count })
      ),
    };
  }

  const newByMonthMap = new Map<
    string,
    { new_count: number; returning_count: number }
  >();

  for (const patientId of patientIdsInRange) {
    const hadBefore = hadAppointmentBeforeRange.has(patientId);
    const firstInRange = appointmentsInRange
      .filter((r) => String(r.patient_id) === patientId)
      .map((r) => new Date(r.start_time as string))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const monthKey = firstInRange
      ? `${firstInRange.getUTCFullYear()}-${String(firstInRange.getUTCMonth() + 1).padStart(2, "0")}`
      : "";

    if (hadBefore) {
      returningPatients += 1;
      if (monthKey) {
        const b = newByMonthMap.get(monthKey) ?? {
          new_count: 0,
          returning_count: 0,
        };
        b.returning_count += 1;
        newByMonthMap.set(monthKey, b);
      }
    } else {
      newPatients += 1;
      if (monthKey) {
        const b = newByMonthMap.get(monthKey) ?? {
          new_count: 0,
          returning_count: 0,
        };
        b.new_count += 1;
        newByMonthMap.set(monthKey, b);
      }
    }
  }

  const inactiveRows = await pgClient`
    SELECT COUNT(*)::int AS cnt
    FROM patients p
    WHERE p.organization_id = ${orgId}
      AND NOT EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.patient_id = p.id AND a.status = 'completed' AND a.start_time >= ${ninetyDaysAgo.toISOString()}::timestamptz
      )
  `;
  const inactivePatients = Number(inactiveRows[0]?.cnt ?? 0);

  const totalInRange = newPatients + returningPatients;
  const retentionRate =
    totalInRange > 0 ? safeDivide(returningPatients, totalInRange) * 100 : 0;

  const new_by_month = Array.from(newByMonthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, data]) => ({
      month,
      new_count: data.new_count,
      returning_count: data.returning_count,
    }));

  const by_gender = Array.from(byGenderMap.entries()).map(([gender, count]) => ({
    gender,
    count,
  }));

  const by_age_group = Array.from(byAgeGroupMap.entries()).map(
    ([age_group, count]) => ({ age_group, count })
  );

  return {
    summary: {
      total_patients: totalPatients,
      new_patients: newPatients,
      patients_created_in_range: patientsCreatedCount,
      returning_patients: returningPatients,
      retention_rate: retentionRate,
      inactive_patients: inactivePatients,
    },
    new_by_month,
    by_gender,
    by_age_group,
  };
}
