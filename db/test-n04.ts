import "dotenv/config";
import { pgClient } from "./index";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

function authHeaders(userId: string): Record<string, string> {
  if (process.env.TEST_AUTH_BYPASS !== "true") return {};
  return { "X-Test-User-Id": userId };
}

async function fetchJson(
  url: string,
  opts: { method?: string; body?: unknown; userId?: string } = {}
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(opts.userId ?? ""),
  };
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = await res.text();
  }
  return { status: res.status, data };
}

async function createPatient(orgId: string, firstName: string): Promise<string> {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const [p] = await pgClient`
    INSERT INTO patients (
      organization_id, first_name, last_name, phone, is_active
    )
    VALUES (
      ${orgId},
      ${firstName},
      'N04',
      ${`+1${suffix.slice(-10)}`},
      true
    )
    RETURNING id
  `;
  return p.id as string;
}

async function insertAppointment(params: {
  orgId: string;
  patientId: string;
  providerId: string;
  userId: string;
  status: "completed" | "scheduled" | "confirmed";
  startTime: Date;
}) {
  const endTime = new Date(params.startTime.getTime() + 30 * 60 * 1000);
  await pgClient`
    INSERT INTO appointments (
      organization_id, patient_id, provider_id, start_time, end_time, status, created_by
    )
    VALUES (
      ${params.orgId},
      ${params.patientId},
      ${params.providerId},
      ${params.startTime.toISOString()}::timestamptz,
      ${endTime.toISOString()}::timestamptz,
      ${params.status},
      ${params.userId}
    )
  `;
}

async function cleanup(patientIds: string[], orgId: string) {
  await pgClient`
    DELETE FROM appointment_status_history
    WHERE appointment_id IN (
      SELECT id FROM appointments WHERE patient_id = ANY(${patientIds}::uuid[])
    )
  `;
  await pgClient`
    DELETE FROM appointment_lines
    WHERE appointment_id IN (
      SELECT id FROM appointments WHERE patient_id = ANY(${patientIds}::uuid[])
    )
  `;
  await pgClient`
    DELETE FROM appointments
    WHERE patient_id = ANY(${patientIds}::uuid[])
  `;
  await pgClient`
    DELETE FROM patients
    WHERE id = ANY(${patientIds}::uuid[])
  `;
  await pgClient`
    UPDATE policy_settings
    SET inactivity_days_warning = 60,
        inactivity_days_critical = 90,
        updated_at = now()
    WHERE organization_id = ${orgId}
  `;
}

interface InactiveResponseItem {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  lastVisit: string;
  daysSinceLastVisit: number;
  providerName: string | null;
}

interface InactiveResponse {
  warning: InactiveResponseItem[];
  critical: InactiveResponseItem[];
  thresholds: { warningDays: number; criticalDays: number };
}

async function main() {
  console.log("=== N-04 Smoke Test: Inactive Patients List ===\n");
  let passed = 0;
  let failed = 0;

  const createdPatientIds: string[] = [];

  const [user] = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (!user) {
    console.log("SKIP: No user found.");
    process.exit(1);
  }
  const userId = user.id as string;
  const orgId = user.organization_id as string;

  const [provider] = await pgClient`
    SELECT id
    FROM provider_profiles
    WHERE organization_id = ${orgId}
      AND is_accepting_appointments = true
    LIMIT 1
  `;
  const [service] = await pgClient`
    SELECT id
    FROM services
    WHERE organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (!provider || !service) {
    console.log("SKIP: Missing provider/service.");
    process.exit(1);
  }
  const providerId = provider.id as string;

  await pgClient`
    INSERT INTO policy_settings (
      organization_id, inactivity_days_warning, inactivity_days_critical
    )
    VALUES (${orgId}, 60, 90)
    ON CONFLICT (organization_id)
    DO UPDATE SET
      inactivity_days_warning = 60,
      inactivity_days_critical = 90,
      updated_at = now()
  `;

  const now = Date.now();
  const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000);
  const futureDays = (d: number) => new Date(now + d * 24 * 60 * 60 * 1000);

  const patientA = await createPatient(orgId, "N04-A");
  const patientB = await createPatient(orgId, "N04-B");
  const patientC = await createPatient(orgId, "N04-C");
  const patientD = await createPatient(orgId, "N04-D");
  const patientE = await createPatient(orgId, "N04-E");
  createdPatientIds.push(patientA, patientB, patientC, patientD, patientE);

  await insertAppointment({
    orgId,
    patientId: patientA,
    providerId,
    userId,
    status: "completed",
    startTime: new Date(daysAgo(30).getTime() + 1 * 60 * 60 * 1000),
  });
  await insertAppointment({
    orgId,
    patientId: patientB,
    providerId,
    userId,
    status: "completed",
    startTime: new Date(daysAgo(65).getTime() + 2 * 60 * 60 * 1000),
  });
  await insertAppointment({
    orgId,
    patientId: patientC,
    providerId,
    userId,
    status: "completed",
    startTime: new Date(daysAgo(95).getTime() + 3 * 60 * 60 * 1000),
  });
  await insertAppointment({
    orgId,
    patientId: patientD,
    providerId,
    userId,
    status: "completed",
    startTime: new Date(daysAgo(65).getTime() + 4 * 60 * 60 * 1000),
  });
  await insertAppointment({
    orgId,
    patientId: patientD,
    providerId,
    userId,
    status: "scheduled",
    startTime: new Date(futureDays(5).getTime() + 5 * 60 * 60 * 1000),
  });

  try {
    const res = await fetchJson(`${BASE}/api/patients/inactive`, { userId });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = res.data as InactiveResponse;
    const warningIds = new Set(data.warning.map((p) => p.id));
    const criticalIds = new Set(data.critical.map((p) => p.id));

    if (warningIds.has(patientA) || criticalIds.has(patientA)) {
      throw new Error("Patient A should be excluded (30 days, below warning)");
    }
    if (!warningIds.has(patientB) || criticalIds.has(patientB)) {
      throw new Error("Patient B should be warning only");
    }
    if (!criticalIds.has(patientC)) {
      throw new Error("Patient C should be critical");
    }
    if (warningIds.has(patientD) || criticalIds.has(patientD)) {
      throw new Error("Patient D should be excluded due to future appointment");
    }
    if (warningIds.has(patientE) || criticalIds.has(patientE)) {
      throw new Error("Patient E should be excluded (never completed visit)");
    }

    const patientBRow = data.warning.find((p) => p.id === patientB);
    const patientCRow = data.critical.find((p) => p.id === patientC);
    if (!patientBRow?.lastVisit || patientBRow.daysSinceLastVisit < 60) {
      throw new Error("Patient B response missing lastVisit/daysSinceLastVisit");
    }
    if (!patientCRow?.providerName) {
      throw new Error("Patient C provider name missing");
    }
    if (
      data.thresholds.warningDays !== 60 ||
      data.thresholds.criticalDays !== 90
    ) {
      throw new Error("Thresholds do not match default policy");
    }

    console.log("✅ 1-9. Base tiering, exclusions, fields, and thresholds verified");
    passed += 9;
  } catch (e) {
    console.log("❌ 1-9.", (e as Error).message);
    failed += 9;
  }

  try {
    await pgClient`
      UPDATE policy_settings
      SET inactivity_days_warning = 25,
          inactivity_days_critical = 90,
          updated_at = now()
      WHERE organization_id = ${orgId}
    `;
    const res = await fetchJson(`${BASE}/api/patients/inactive`, { userId });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = res.data as InactiveResponse;
    const warningIds = new Set(data.warning.map((p) => p.id));
    if (!warningIds.has(patientA)) {
      throw new Error("Patient A should appear in warning after threshold update");
    }
    if (data.thresholds.warningDays !== 25) {
      throw new Error("Response threshold warningDays should be 25");
    }
    console.log("✅ 10. Policy update (warning=25) reflects immediately");
    passed++;
  } catch (e) {
    console.log("❌ 10.", (e as Error).message);
    failed++;
  }

  try {
    await pgClient`
      UPDATE policy_settings
      SET inactivity_days_warning = 60,
          inactivity_days_critical = 90,
          updated_at = now()
      WHERE organization_id = ${orgId}
    `;
    const res = await fetchJson(`${BASE}/api/patients/inactive`, { userId });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = res.data as InactiveResponse;
    const warningIds = new Set(data.warning.map((p) => p.id));
    const criticalIds = new Set(data.critical.map((p) => p.id));
    if (warningIds.has(patientA) || criticalIds.has(patientA)) {
      throw new Error("Patient A should disappear again after restore");
    }
    console.log("✅ 11. Policy restore removes Patient A from inactive tiers");
    passed++;
  } catch (e) {
    console.log("❌ 11.", (e as Error).message);
    failed++;
  }

  await cleanup(createdPatientIds, orgId);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
