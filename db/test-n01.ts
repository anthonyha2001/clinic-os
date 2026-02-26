import "dotenv/config";
import { pgClient } from "./index";
import { calculateRiskScore } from "../lib/services/noshow/calculateRisk";

async function createTestPatient(orgId: string, suffix: string): Promise<string> {
  const [patient] = await pgClient`
    INSERT INTO patients (
      organization_id, first_name, last_name, phone, is_active
    )
    VALUES (
      ${orgId},
      ${`N01-${suffix}`},
      'Patient',
      ${`+1${Date.now().toString().slice(-10)}${Math.floor(Math.random() * 9)}`},
      true
    )
    RETURNING id
  `;
  return patient.id as string;
}

async function insertAppointments(params: {
  orgId: string;
  patientId: string;
  providerId: string;
  userId: string;
  statuses: string[];
  baseStartMs: number;
}) {
  for (let i = 0; i < params.statuses.length; i++) {
    const start = new Date(params.baseStartMs + i * 60 * 60 * 1000).toISOString();
    const end = new Date(params.baseStartMs + i * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString();
    await pgClient`
      INSERT INTO appointments (
        organization_id, patient_id, provider_id, start_time, end_time, status, created_by
      )
      VALUES (
        ${params.orgId},
        ${params.patientId},
        ${params.providerId},
        ${start}::timestamptz,
        ${end}::timestamptz,
        ${params.statuses[i]},
        ${params.userId}
      )
    `;
  }
}

async function cleanupPatient(patientId: string) {
  await pgClient`DELETE FROM appointment_status_history WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = ${patientId})`;
  await pgClient`DELETE FROM appointment_lines WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = ${patientId})`;
  await pgClient`DELETE FROM appointments WHERE patient_id = ${patientId}`;
  await pgClient`DELETE FROM risk_scores WHERE patient_id = ${patientId}`;
  await pgClient`DELETE FROM patients WHERE id = ${patientId}`;
}

async function testN01() {
  console.log("=== N-01 Smoke Test (Risk Score Calculation) ===\n");
  let passed = 0;
  let failed = 0;

  const createdPatientIds: string[] = [];
  let slotBase = Date.now() + 7 * 24 * 60 * 60 * 1000;

  const [user] = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (!user) {
    console.log("SKIP: No user found.");
    process.exit(1);
  }
  const userId = user.id as string;
  const orgId = user.organization_id as string;

  let [provider] = await pgClient`
    SELECT id FROM provider_profiles
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  if (!provider) {
    const [providerUser] = await pgClient`
      INSERT INTO users (id, organization_id, email, full_name, is_active)
      VALUES (gen_random_uuid(), ${orgId}, ${`n01-provider-${Date.now()}@test.local`}, 'N01 Provider', true)
      RETURNING id
    `;
    const [newProvider] = await pgClient`
      INSERT INTO provider_profiles (user_id, organization_id, is_accepting_appointments, color_hex)
      VALUES (${providerUser.id}, ${orgId}, true, '#3B82F6')
      RETURNING id
    `;
    provider = newProvider;
  }
  const providerId = provider.id as string;

  // ensure service exists (requested setup parity, though not required for direct appointment inserts)
  const [service] = await pgClient`
    SELECT id FROM services
    WHERE organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (!service) {
    await pgClient`
      INSERT INTO services (
        organization_id, name_en, name_fr, name_ar, price, default_duration_minutes, is_active
      )
      VALUES (
        ${orgId}, ${`N01 Service ${Date.now()}`}, 'Service N01 FR', 'خدمة N01', 50.00, 30, true
      )
    `;
  }

  // Case 1: 0 no-shows
  try {
    const patientId = await createTestPatient(orgId, "zero");
    createdPatientIds.push(patientId);
    await insertAppointments({
      orgId,
      patientId,
      providerId,
      userId,
      statuses: ["completed", "canceled"],
      baseStartMs: slotBase,
    });
    slotBase += 48 * 60 * 60 * 1000;
    const res = await calculateRiskScore(patientId, orgId);
    if (res.riskScore !== 0 || res.isHighRisk !== false) {
      throw new Error(`Expected risk 0 false, got ${res.riskScore} ${res.isHighRisk}`);
    }
    console.log("✅ 1. 0 no-shows -> risk_score 0, isHighRisk false");
    passed++;
  } catch (e) {
    console.log("❌ 1.", (e as Error).message);
    failed++;
  }

  // Case 2: 2 no-shows below threshold
  try {
    const patientId = await createTestPatient(orgId, "two");
    createdPatientIds.push(patientId);
    await insertAppointments({
      orgId,
      patientId,
      providerId,
      userId,
      statuses: ["no_show", "no_show", "completed"],
      baseStartMs: slotBase,
    });
    slotBase += 48 * 60 * 60 * 1000;
    const res = await calculateRiskScore(patientId, orgId);
    if (res.riskScore !== 2 || res.isHighRisk !== false) {
      throw new Error(`Expected risk 2 false, got ${res.riskScore} ${res.isHighRisk}`);
    }
    console.log("✅ 2. 2 no-shows -> risk_score 2, isHighRisk false");
    passed++;
  } catch (e) {
    console.log("❌ 2.", (e as Error).message);
    failed++;
  }

  // Case 3: 3 no-shows at threshold
  try {
    const patientId = await createTestPatient(orgId, "three");
    createdPatientIds.push(patientId);
    await insertAppointments({
      orgId,
      patientId,
      providerId,
      userId,
      statuses: ["no_show", "no_show", "no_show"],
      baseStartMs: slotBase,
    });
    slotBase += 48 * 60 * 60 * 1000;
    const res = await calculateRiskScore(patientId, orgId);
    if (res.riskScore !== 3 || res.isHighRisk !== true) {
      throw new Error(`Expected risk 3 true, got ${res.riskScore} ${res.isHighRisk}`);
    }
    console.log("✅ 3. 3 no-shows -> risk_score 3, isHighRisk true");
    passed++;
  } catch (e) {
    console.log("❌ 3.", (e as Error).message);
    failed++;
  }

  // Case 4 + 5 + 6 + 7 + 8 + 9 on one patient
  try {
    const patientId = await createTestPatient(orgId, "complex");
    createdPatientIds.push(patientId);
    await insertAppointments({
      orgId,
      patientId,
      providerId,
      userId,
      statuses: [
        "no_show", "no_show", "no_show", "no_show", "no_show", // 5 no-shows
        "canceled", // should count in total only
        "completed", // should count in total only
        "scheduled", // should not count
        "confirmed", // should not count
      ],
      baseStartMs: slotBase,
    });
    slotBase += 48 * 60 * 60 * 1000;

    const res1 = await calculateRiskScore(patientId, orgId);
    if (res1.riskScore !== 5 || res1.isHighRisk !== true) {
      throw new Error(`Expected risk 5 true, got ${res1.riskScore} ${res1.isHighRisk}`);
    }
    if (res1.totalAppointments !== 7) {
      throw new Error(`Expected totalAppointments 7, got ${res1.totalAppointments}`);
    }

    const res2 = await calculateRiskScore(patientId, orgId);
    if (res2.riskScore !== 5 || res2.totalAppointments !== 7) {
      throw new Error("Second recalculation changed values unexpectedly");
    }

    const rows = await pgClient`
      SELECT *
      FROM risk_scores
      WHERE patient_id = ${patientId}
        AND organization_id = ${orgId}
    `;
    if (rows.length !== 1) {
      throw new Error(`Expected 1 upserted row, got ${rows.length}`);
    }
    if (Number(rows[0].risk_score) !== 5 || Number(rows[0].total_appointments) !== 7) {
      throw new Error("risk_scores row has unexpected values");
    }

    console.log("✅ 4-9. 5 no-shows/high-risk + non-counting statuses + upsert behavior verified");
    passed += 6;
  } catch (e) {
    console.log("❌ 4-9.", (e as Error).message);
    failed += 6;
  }

  // Case 10: new patient no history
  try {
    const patientId = await createTestPatient(orgId, "empty");
    createdPatientIds.push(patientId);
    const res = await calculateRiskScore(patientId, orgId);
    if (res.riskScore !== 0 || res.totalAppointments !== 0) {
      throw new Error(`Expected 0/0, got ${res.riskScore}/${res.totalAppointments}`);
    }
    console.log("✅ 10. New patient no history -> risk 0, total 0");
    passed++;
  } catch (e) {
    console.log("❌ 10.", (e as Error).message);
    failed++;
  }

  for (const patientId of createdPatientIds) {
    await cleanupPatient(patientId);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

testN01().catch((e) => {
  console.error(e);
  process.exit(1);
});
