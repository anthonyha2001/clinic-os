import "dotenv/config";
import { pgClient } from "./index";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function fetchJson(
  url: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json" },
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

async function createTestPatient(orgId: string, label: string): Promise<string> {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const [patient] = await pgClient`
    INSERT INTO patients (
      organization_id, first_name, last_name, phone, is_active
    )
    VALUES (
      ${orgId},
      ${`N02-${label}`},
      'Patient',
      ${`+1${unique.slice(-10)}`},
      true
    )
    RETURNING id
  `;
  return patient.id as string;
}

async function upsertRiskScore(params: {
  patientId: string;
  orgId: string;
  riskScore: number;
}) {
  await pgClient`
    INSERT INTO risk_scores (
      patient_id, organization_id, total_appointments, no_show_count, risk_score, last_calculated_at
    )
    VALUES (
      ${params.patientId},
      ${params.orgId},
      ${params.riskScore},
      ${params.riskScore},
      ${params.riskScore},
      now()
    )
    ON CONFLICT (patient_id, organization_id)
    DO UPDATE SET
      total_appointments = EXCLUDED.total_appointments,
      no_show_count = EXCLUDED.no_show_count,
      risk_score = EXCLUDED.risk_score,
      last_calculated_at = now()
  `;
}

async function createAppointmentViaApi(params: {
  patientId: string;
  providerId: string;
  serviceId: string;
  startTime: string;
}) {
  return fetchJson(`${BASE}/api/appointments`, {
    method: "POST",
    body: {
      patient_id: params.patientId,
      provider_id: params.providerId,
      start_time: params.startTime,
      lines: [{ service_id: params.serviceId, quantity: 1 }],
    },
  });
}

function nextStartTime(slot: number): string {
  const base = Date.parse("2026-06-01T09:00:00.000Z");
  return new Date(base + slot * 60 * 60 * 1000).toISOString();
}

async function cleanup(appointmentIds: string[], patientIds: string[], orgId: string) {
  for (const id of appointmentIds) {
    await pgClient`DELETE FROM appointment_status_history WHERE appointment_id = ${id}`;
    await pgClient`DELETE FROM appointment_lines WHERE appointment_id = ${id}`;
    await pgClient`DELETE FROM appointments WHERE id = ${id}`;
  }
  for (const id of patientIds) {
    await pgClient`DELETE FROM risk_scores WHERE patient_id = ${id} AND organization_id = ${orgId}`;
    await pgClient`DELETE FROM patients WHERE id = ${id}`;
  }
  await pgClient`
    UPDATE policy_settings
    SET deposit_required_above_risk = true,
        no_show_risk_threshold = 3,
        updated_at = now()
    WHERE organization_id = ${orgId}
  `;
}

async function main() {
  console.log("=== N-02 Smoke Test: Deposit Required Flag Logic ===\n");

  let passed = 0;
  let failed = 0;
  const createdAppointmentIds: string[] = [];
  const createdPatientIds: string[] = [];

  const [user] = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (!user) {
    console.log("SKIP: No user found.");
    process.exit(1);
  }
  const orgId = user.organization_id as string;

  const [provider] = await pgClient`
    SELECT id FROM provider_profiles
    WHERE organization_id = ${orgId}
      AND is_accepting_appointments = true
    LIMIT 1
  `;
  const [service] = await pgClient`
    SELECT id FROM services
    WHERE organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (!provider || !service) {
    console.log("SKIP: Missing provider/service.");
    process.exit(1);
  }
  const providerId = provider.id as string;
  const serviceId = service.id as string;

  await pgClient`
    INSERT INTO policy_settings (
      organization_id, no_show_risk_threshold, deposit_required_above_risk
    )
    VALUES (${orgId}, 3, true)
    ON CONFLICT (organization_id)
    DO UPDATE SET
      no_show_risk_threshold = 3,
      deposit_required_above_risk = true,
      updated_at = now()
  `;

  let slot = 0;

  try {
    const patient0 = await createTestPatient(orgId, "risk0");
    createdPatientIds.push(patient0);
    await upsertRiskScore({ patientId: patient0, orgId, riskScore: 0 });
    const res = await createAppointmentViaApi({
      patientId: patient0,
      providerId,
      serviceId,
      startTime: nextStartTime(slot++),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const appt = res.data as { id: string; deposit_required?: boolean };
    createdAppointmentIds.push(appt.id);
    if (appt.deposit_required !== false) throw new Error(`Expected false, got ${String(appt.deposit_required)}`);
    console.log("✅ 1. risk_score=0 => deposit_required=false");
    passed++;
  } catch (e) {
    console.log("❌ 1.", (e as Error).message);
    failed++;
  }

  try {
    const patient2 = await createTestPatient(orgId, "risk2");
    createdPatientIds.push(patient2);
    await upsertRiskScore({ patientId: patient2, orgId, riskScore: 2 });
    const res = await createAppointmentViaApi({
      patientId: patient2,
      providerId,
      serviceId,
      startTime: nextStartTime(slot++),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const appt = res.data as { id: string; deposit_required?: boolean };
    createdAppointmentIds.push(appt.id);
    if (appt.deposit_required !== false) throw new Error(`Expected false, got ${String(appt.deposit_required)}`);
    console.log("✅ 2. risk_score=2 (below threshold) => deposit_required=false");
    passed++;
  } catch (e) {
    console.log("❌ 2.", (e as Error).message);
    failed++;
  }

  try {
    const patient3 = await createTestPatient(orgId, "risk3");
    createdPatientIds.push(patient3);
    await upsertRiskScore({ patientId: patient3, orgId, riskScore: 3 });
    const res = await createAppointmentViaApi({
      patientId: patient3,
      providerId,
      serviceId,
      startTime: nextStartTime(slot++),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const appt = res.data as { id: string; deposit_required?: boolean };
    createdAppointmentIds.push(appt.id);
    if (appt.deposit_required !== true) throw new Error(`Expected true, got ${String(appt.deposit_required)}`);
    console.log("✅ 3. risk_score=3 (at threshold) => deposit_required=true");
    passed++;
  } catch (e) {
    console.log("❌ 3.", (e as Error).message);
    failed++;
  }

  let highRiskPatientId = "";
  try {
    highRiskPatientId = await createTestPatient(orgId, "risk5");
    createdPatientIds.push(highRiskPatientId);
    await upsertRiskScore({ patientId: highRiskPatientId, orgId, riskScore: 5 });
    const res = await createAppointmentViaApi({
      patientId: highRiskPatientId,
      providerId,
      serviceId,
      startTime: nextStartTime(slot++),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const appt = res.data as { id: string; deposit_required?: boolean };
    createdAppointmentIds.push(appt.id);
    if (appt.deposit_required !== true) throw new Error(`Expected true, got ${String(appt.deposit_required)}`);
    console.log("✅ 4. risk_score=5 => deposit_required=true");
    passed++;
  } catch (e) {
    console.log("❌ 4.", (e as Error).message);
    failed++;
  }

  try {
    await pgClient`
      UPDATE policy_settings
      SET deposit_required_above_risk = false,
          updated_at = now()
      WHERE organization_id = ${orgId}
    `;
    const res = await createAppointmentViaApi({
      patientId: highRiskPatientId,
      providerId,
      serviceId,
      startTime: nextStartTime(slot++),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const appt = res.data as { id: string; deposit_required?: boolean };
    createdAppointmentIds.push(appt.id);
    if (appt.deposit_required !== false) throw new Error(`Expected false, got ${String(appt.deposit_required)}`);
    console.log("✅ 5. policy toggle OFF => high-risk still deposit_required=false");
    passed++;
  } catch (e) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  try {
    await pgClient`
      UPDATE policy_settings
      SET deposit_required_above_risk = true,
          no_show_risk_threshold = 3,
          updated_at = now()
      WHERE organization_id = ${orgId}
    `;
    const res = await createAppointmentViaApi({
      patientId: highRiskPatientId,
      providerId,
      serviceId,
      startTime: nextStartTime(slot++),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const appt = res.data as { id: string; deposit_required?: boolean };
    createdAppointmentIds.push(appt.id);
    if (appt.deposit_required !== true) throw new Error(`Expected true, got ${String(appt.deposit_required)}`);
    console.log("✅ 6. policy toggle ON => high-risk deposit_required=true again");
    passed++;
  } catch (e) {
    console.log("❌ 6.", (e as Error).message);
    failed++;
  }

  try {
    const newPatient = await createTestPatient(orgId, "new");
    createdPatientIds.push(newPatient);
    const res = await createAppointmentViaApi({
      patientId: newPatient,
      providerId,
      serviceId,
      startTime: nextStartTime(slot++),
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const appt = res.data as { id: string; deposit_required?: boolean };
    createdAppointmentIds.push(appt.id);
    if (typeof appt.deposit_required !== "boolean") throw new Error("deposit_required missing in response");
    if (appt.deposit_required !== false) throw new Error(`Expected false, got ${String(appt.deposit_required)}`);
    console.log("✅ 7. new patient with no risk row => deposit_required=false + field present");
    passed++;
  } catch (e) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  await cleanup(createdAppointmentIds, createdPatientIds, orgId);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
