/**
 * T-03 Smoke Test: Link Plan Items to Appointments
 * Run with: TEST_AUTH_BYPASS=true npx tsx db/test-t03.ts
 * Prerequisites: dev server running with TEST_AUTH_BYPASS=true
 */
import "dotenv/config";
import { pgClient } from "./index";
import { onPlanSessionCompleted } from "../lib/services/plans/onSessionCompleted";

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

async function createPlanViaApi(params: {
  userId: string;
  patientId: string;
  providerId: string;
  serviceId: string;
  qtyTotal: number;
  name: string;
}) {
  const created = await fetchJson(`${BASE}/api/plans`, {
    method: "POST",
    userId: params.userId,
    body: {
      patient_id: params.patientId,
      provider_id: params.providerId,
      name_en: `${params.name} EN`,
      name_fr: `${params.name} FR`,
      name_ar: `${params.name} AR`,
      items: [
        {
          service_id: params.serviceId,
          quantity_total: params.qtyTotal,
          unit_price: 50,
          sequence_order: 1,
        },
      ],
    },
  });
  if (created.status !== 201) {
    throw new Error(`Plan create failed: ${created.status} ${JSON.stringify(created.data)}`);
  }
  const plan = created.data as { id: string; items: Array<{ id: string }> };
  return { planId: plan.id, planItemId: plan.items[0].id };
}

async function transitionPlanToAccepted(planId: string, userId: string) {
  const res = await fetchJson(`${BASE}/api/plans/${planId}/status`, {
    method: "POST",
    userId,
    body: { status: "accepted" },
  });
  if (res.status !== 200) {
    throw new Error(`Plan accept failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
}

async function completeAppointment(appointmentId: string, userId: string) {
  const confirm = await fetchJson(`${BASE}/api/appointments/${appointmentId}/status`, {
    method: "POST",
    userId,
    body: { status: "confirmed" },
  });
  if (confirm.status !== 200) {
    throw new Error(`Confirm failed: ${confirm.status}`);
  }
  const complete = await fetchJson(`${BASE}/api/appointments/${appointmentId}/status`, {
    method: "POST",
    userId,
    body: { status: "completed" },
  });
  if (complete.status !== 200) {
    throw new Error(`Complete failed: ${complete.status}`);
  }
}

async function main() {
  console.log("=== T-03 Smoke Test: Link Plan Items to Appointments ===\n");
  let passed = 0;
  let failed = 0;

  const createdPlanIds: string[] = [];
  const createdAppointmentIds: string[] = [];
  const createdPatientIds: string[] = [];

  const [user] = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (!user) {
    console.log("SKIP: No user found.");
    process.exit(1);
  }
  const userId = user.id as string;
  const orgId = user.organization_id as string;

  const [provider] = await pgClient`
    SELECT id FROM provider_profiles
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  const [patient] = await pgClient`
    SELECT id FROM patients
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  const [service] = await pgClient`
    SELECT id, price FROM services
    WHERE organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (!provider || !patient || !service) {
    console.log("SKIP: Missing provider/patient/service.");
    process.exit(1);
  }

  const providerId = provider.id as string;
  const patientId = patient.id as string;
  const serviceId = service.id as string;
  const servicePrice = Number(service.price);

  // extra patient for mismatch test
  const [otherPatient] = await pgClient`
    INSERT INTO patients (
      organization_id, first_name, last_name, phone, is_active
    )
    VALUES (
      ${orgId}, 'T03', 'OtherPatient', ${`+1${Date.now().toString().slice(-10)}`}, true
    )
    RETURNING id
  `;
  createdPatientIds.push(otherPatient.id as string);

  let activePlanId = "";
  let activePlanItemId = "";
  try {
    const activePlan = await createPlanViaApi({
      userId,
      patientId,
      providerId,
      serviceId,
      qtyTotal: 2,
      name: "T03 Active Plan",
    });
    activePlanId = activePlan.planId;
    activePlanItemId = activePlan.planItemId;
    createdPlanIds.push(activePlanId);
    await transitionPlanToAccepted(activePlanId, userId);
  } catch (e) {
    console.log("❌ Setup active plan failed:", (e as Error).message);
    await cleanup(createdAppointmentIds, createdPlanIds, createdPatientIds);
    process.exit(1);
  }

  // proposed plan for inactive status test
  const proposedPlan = await createPlanViaApi({
    userId,
    patientId,
    providerId,
    serviceId,
    qtyTotal: 1,
    name: "T03 Proposed Plan",
  });
  createdPlanIds.push(proposedPlan.planId);

  // plan linked to different patient
  const otherPatientPlan = await createPlanViaApi({
    userId,
    patientId: otherPatient.id as string,
    providerId,
    serviceId,
    qtyTotal: 1,
    name: "T03 Other Patient Plan",
  });
  createdPlanIds.push(otherPatientPlan.planId);
  await transitionPlanToAccepted(otherPatientPlan.planId, userId);

  // 1) Create appointment with valid plan_item_id -> 201 + set
  let appointment1Id = "";
  try {
    const res = await fetchJson(`${BASE}/api/appointments`, {
      method: "POST",
      body: {
        patient_id: patientId,
        provider_id: providerId,
        start_time: "2026-04-01T10:00:00.000Z",
        lines: [
          {
            service_id: serviceId,
            quantity: 1,
            unit_price_override: servicePrice,
            plan_item_id: activePlanItemId,
          },
        ],
      },
    });
    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const appt = res.data as { id: string; plan_item_id: string | null };
    appointment1Id = appt.id;
    createdAppointmentIds.push(appointment1Id);
    if (appt.plan_item_id !== activePlanItemId) {
      throw new Error("appointment.plan_item_id was not set");
    }
    console.log("✅ 1. Create appointment with valid plan_item_id -> 201");
    passed++;
  } catch (e) {
    console.log("❌ 1.", (e as Error).message);
    failed++;
  }

  // 2) Create appointment with plan_item from different patient -> 422
  try {
    const res = await fetchJson(`${BASE}/api/appointments`, {
      method: "POST",
      body: {
        patient_id: patientId,
        provider_id: providerId,
        start_time: "2026-04-01T11:00:00.000Z",
        lines: [
          {
            service_id: serviceId,
            quantity: 1,
            unit_price_override: servicePrice,
            plan_item_id: otherPatientPlan.planItemId,
          },
        ],
      },
    });
    if (res.status === 422) {
      console.log("✅ 2. Different patient plan_item -> 422");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 2.", (e as Error).message);
    failed++;
  }

  // 3) plan_item from proposed plan -> 422
  try {
    const res = await fetchJson(`${BASE}/api/appointments`, {
      method: "POST",
      body: {
        patient_id: patientId,
        provider_id: providerId,
        start_time: "2026-04-01T12:00:00.000Z",
        lines: [
          {
            service_id: serviceId,
            quantity: 1,
            unit_price_override: servicePrice,
            plan_item_id: proposedPlan.planItemId,
          },
        ],
      },
    });
    if (res.status === 422) {
      console.log("✅ 3. Proposed plan_item -> 422");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 3.", (e as Error).message);
    failed++;
  }

  // 4) Complete first appointment -> quantity_completed=1, plan in_progress
  try {
    await completeAppointment(appointment1Id, userId);
    const [item] = await pgClient`
      SELECT quantity_completed
      FROM plan_items
      WHERE id = ${activePlanItemId}
    `;
    const [plan] = await pgClient`
      SELECT status
      FROM plans
      WHERE id = ${activePlanId}
    `;
    if (Number(item.quantity_completed) !== 1) {
      throw new Error(`Expected quantity_completed=1, got ${item.quantity_completed}`);
    }
    if (plan.status !== "in_progress") {
      throw new Error(`Expected plan status in_progress, got ${plan.status}`);
    }
    console.log("✅ 4. First completion increments item and moves plan to in_progress");
    passed++;
  } catch (e) {
    console.log("❌ 4.", (e as Error).message);
    failed++;
  }

  // 5) Second appointment complete -> quantity_completed=2 and plan completed
  let appointment2Id = "";
  try {
    const create2 = await fetchJson(`${BASE}/api/appointments`, {
      method: "POST",
      body: {
        patient_id: patientId,
        provider_id: providerId,
        start_time: "2026-04-01T13:00:00.000Z",
        lines: [
          {
            service_id: serviceId,
            quantity: 1,
            unit_price_override: servicePrice,
            plan_item_id: activePlanItemId,
          },
        ],
      },
    });
    if (create2.status !== 201) throw new Error(`Expected 201, got ${create2.status}`);
    appointment2Id = (create2.data as { id: string }).id;
    createdAppointmentIds.push(appointment2Id);

    await completeAppointment(appointment2Id, userId);
    const [item] = await pgClient`
      SELECT quantity_completed
      FROM plan_items
      WHERE id = ${activePlanItemId}
    `;
    const [plan] = await pgClient`
      SELECT status
      FROM plans
      WHERE id = ${activePlanId}
    `;
    if (Number(item.quantity_completed) !== 2) {
      throw new Error(`Expected quantity_completed=2, got ${item.quantity_completed}`);
    }
    if (plan.status !== "completed") {
      throw new Error(`Expected plan status completed, got ${plan.status}`);
    }
    console.log("✅ 5. Second completion auto-completes plan");
    passed++;
  } catch (e) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  // 6) Third appointment for fully-completed plan_item -> 422
  try {
    const res = await fetchJson(`${BASE}/api/appointments`, {
      method: "POST",
      body: {
        patient_id: patientId,
        provider_id: providerId,
        start_time: "2026-04-01T14:00:00.000Z",
        lines: [
          {
            service_id: serviceId,
            quantity: 1,
            unit_price_override: servicePrice,
            plan_item_id: activePlanItemId,
          },
        ],
      },
    });
    if (res.status === 422) {
      console.log("✅ 6. Fully completed plan_item cannot be booked again -> 422");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 6.", (e as Error).message);
    failed++;
  }

  // 7) Idempotency direct call: second call no-op
  try {
    const tempPlan = await createPlanViaApi({
      userId,
      patientId,
      providerId,
      serviceId,
      qtyTotal: 2,
      name: "T03 Idempotency Plan",
    });
    createdPlanIds.push(tempPlan.planId);
    await transitionPlanToAccepted(tempPlan.planId, userId);

    const tempApptRes = await fetchJson(`${BASE}/api/appointments`, {
      method: "POST",
      body: {
        patient_id: patientId,
        provider_id: providerId,
        start_time: "2026-04-01T15:00:00.000Z",
        lines: [
          {
            service_id: serviceId,
            quantity: 1,
            unit_price_override: servicePrice,
            plan_item_id: tempPlan.planItemId,
          },
        ],
      },
    });
    if (tempApptRes.status !== 201) {
      throw new Error(`Temp appointment create failed: ${tempApptRes.status}`);
    }
    const tempApptId = (tempApptRes.data as { id: string }).id;
    createdAppointmentIds.push(tempApptId);
    await completeAppointment(tempApptId, userId);

    const first = await onPlanSessionCompleted(tempPlan.planItemId, tempApptId);
    const second = await onPlanSessionCompleted(tempPlan.planItemId, tempApptId);

    const [item] = await pgClient`
      SELECT quantity_completed
      FROM plan_items
      WHERE id = ${tempPlan.planItemId}
    `;
    if (Number(item.quantity_completed) !== 1) {
      throw new Error(`Expected quantity_completed=1 after duplicate calls, got ${item.quantity_completed}`);
    }
    if (first.newQuantityCompleted !== 1 || second.newQuantityCompleted !== 1) {
      throw new Error("Expected idempotent no-op on second call");
    }
    console.log("✅ 7. onPlanSessionCompleted idempotency no-op on second call");
    passed++;
  } catch (e) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  await cleanup(createdAppointmentIds, createdPlanIds, createdPatientIds);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function cleanup(
  appointmentIds: string[],
  planIds: string[],
  patientIds: string[]
) {
  for (const id of appointmentIds) {
    await pgClient`DELETE FROM appointment_status_history WHERE appointment_id = ${id}`;
    await pgClient`DELETE FROM appointment_lines WHERE appointment_id = ${id}`;
    await pgClient`DELETE FROM appointments WHERE id = ${id}`;
  }
  for (const id of planIds) {
    await pgClient`DELETE FROM plan_status_history WHERE plan_id = ${id}`;
    await pgClient`DELETE FROM plan_items WHERE plan_id = ${id}`;
    await pgClient`DELETE FROM plans WHERE id = ${id}`;
  }
  for (const id of patientIds) {
    await pgClient`DELETE FROM patients WHERE id = ${id}`;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
