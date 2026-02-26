import "dotenv/config";
import { pgClient } from "./index";
import { createAppointment } from "../lib/services/appointments/create";
import type { CreateAppointment } from "../lib/validations/appointment";

const API_URL = "http://localhost:3000/api/appointments";

interface TestContext {
  orgId: string;
  userId: string;
  providerId: string;
  provider2Id: string | null;
  patientId: string;
  service30: { id: string; price: string; default_duration_minutes: number };
  service15: { id: string; price: string; default_duration_minutes: number };
}

const createdAppointmentIds: string[] = [];
const createdServiceIds: string[] = [];
let createdProvider2UserId: string | null = null;

async function setup(): Promise<TestContext | null> {
  const userRes = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (userRes.length === 0) {
    console.log("SKIP: No user found. Run bootstrap first.");
    return null;
  }
  const userId = userRes[0].id;
  const orgId = userRes[0].organization_id;

  const providerRes = await pgClient`
    SELECT id FROM provider_profiles WHERE organization_id = ${orgId} LIMIT 1
  `;
  if (providerRes.length === 0) {
    console.log("SKIP: No provider found.");
    return null;
  }
  const providerId = providerRes[0].id;

  const patientRes = await pgClient`
    SELECT id FROM patients WHERE organization_id = ${orgId} LIMIT 1
  `;
  if (patientRes.length === 0) {
    console.log("SKIP: No patient found. Run test-p01 first.");
    return null;
  }
  const patientId = patientRes[0].id;

  const servicesRes = await pgClient`
    SELECT id, price, default_duration_minutes
    FROM services
    WHERE organization_id = ${orgId} AND is_active = true
    ORDER BY default_duration_minutes DESC
  `;
  if (servicesRes.length === 0) {
    console.log("SKIP: No service found.");
    return null;
  }
  const service30 = servicesRes[0];
  let service15 = servicesRes.find((s) => Number((s as { default_duration_minutes: number }).default_duration_minutes) <= 15);
  if (!service15) {
    const [inserted] = await pgClient`
      INSERT INTO services (organization_id, name_en, name_fr, name_ar, price, default_duration_minutes)
      VALUES (${orgId}, 'S02 Test 15min', 'Test 15min', 'اختبار 15', '25.00', 15)
      RETURNING id, price, default_duration_minutes
    `;
    service15 = inserted;
    createdServiceIds.push(inserted.id);
  }

  let provider2Id: string | null = null;
  const prov2Res = await pgClient`
    SELECT id FROM provider_profiles WHERE organization_id = ${orgId} OFFSET 1 LIMIT 1
  `;
  if (prov2Res.length === 0) {
    const fakeUserId = crypto.randomUUID();
    createdProvider2UserId = fakeUserId;
    await pgClient`
      INSERT INTO users (id, organization_id, email, full_name)
      VALUES (${fakeUserId}, ${orgId}, 's02-prov2@test.com', 'Provider Two')
    `;
    const [prov2] = await pgClient`
      INSERT INTO provider_profiles (organization_id, user_id)
      VALUES (${orgId}, ${fakeUserId})
      RETURNING id
    `;
    provider2Id = prov2.id;
  } else {
    provider2Id = prov2Res[0].id;
  }

  return {
    orgId,
    userId,
    providerId,
    provider2Id,
    patientId,
    service30: service30 as { id: string; price: string; default_duration_minutes: number },
    service15: service15 as { id: string; price: string; default_duration_minutes: number },
  };
}

async function createViaApi(payload: CreateAppointment): Promise<{ status: number; data: unknown }> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function createViaService(payload: CreateAppointment, ctx: TestContext): Promise<{ status: number; data: unknown }> {
  try {
    const result = await createAppointment(payload, ctx.userId, ctx.orgId);
    return { status: 201, data: result };
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    return { status: err.statusCode ?? 500, data: { error: err.message } };
  }
}

async function main() {
  console.log("=== S-02 Appointment API Smoke Test ===\n");

  let useApi = true;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch((e: NodeJS.ErrnoException) => {
      if (e?.code === "ECONNREFUSED" || e?.message?.includes("fetch")) return null;
      throw e;
    });
    if (!res) {
      useApi = false;
      console.log("Dev server not running — using createAppointment() directly\n");
    }
  } catch {
    useApi = false;
    console.log("Dev server not running — using createAppointment() directly\n");
  }

  const ctx = await setup();
  if (!ctx) {
    await pgClient.end();
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  const baseTime = "2026-06-15T10:00:00.000Z";

  const create = useApi
    ? (p: CreateAppointment) => createViaApi(p)
    : (p: CreateAppointment) => createViaService(p, ctx);

  // --- Test 1: Single-line (30min) → 201, end_time = start + 30min ---
  try {
    const payload: CreateAppointment = {
      patient_id: ctx.patientId,
      provider_id: ctx.providerId,
      start_time: baseTime,
      lines: [{ service_id: ctx.service30.id, quantity: 1 }],
    };
    const { status, data } = await create(payload);
    const ok = status === 201;
    if (ok) {
      const appt = data as { end_time: string; start_time: string };
      const start = new Date(appt.start_time).getTime();
      const end = new Date(appt.end_time).getTime();
      const diffMin = (end - start) / (60 * 1000);
      if (Math.abs(diffMin - 30) > 0.1) {
        console.log(`❌ 1. end_time should be start+30min, got ${diffMin}min`);
        failed++;
      } else {
        createdAppointmentIds.push((data as { id: string }).id);
        console.log("✅ 1. Single-line 30min → 201, end_time = start + 30min");
        passed++;
      }
    } else {
      console.log(`❌ 1. Expected 201, got ${status}`, data);
      failed++;
    }
  } catch (e: unknown) {
    console.log("❌ 1.", (e as Error).message);
    failed++;
  }

  // --- Test 2: Multi-line (30min + 15min) → 201, end_time = start + 45min ---
  try {
    const payload: CreateAppointment = {
      patient_id: ctx.patientId,
      provider_id: ctx.providerId,
      start_time: "2026-06-15T11:00:00.000Z",
      lines: [
        { service_id: ctx.service30.id, quantity: 1 },
        { service_id: ctx.service15.id, quantity: 1 },
      ],
    };
    const { status, data } = await create(payload);
    const ok = status === 201;
    if (ok) {
      const appt = data as { end_time: string; start_time: string };
      const start = new Date(appt.start_time).getTime();
      const end = new Date(appt.end_time).getTime();
      const diffMin = (end - start) / (60 * 1000);
      if (Math.abs(diffMin - 45) > 0.1) {
        console.log(`❌ 2. end_time should be start+45min, got ${diffMin}min`);
        failed++;
      } else {
        createdAppointmentIds.push((data as { id: string }).id);
        console.log("✅ 2. Multi-line 30+15min → 201, end_time = start + 45min");
        passed++;
      }
    } else {
      console.log(`❌ 2. Expected 201, got ${status}`, data);
      failed++;
    }
  } catch (e: unknown) {
    console.log("❌ 2.", (e as Error).message);
    failed++;
  }

  // --- Test 3: quantity=2, duration=20min → contributes 40min ---
  try {
    const payload: CreateAppointment = {
      patient_id: ctx.patientId,
      provider_id: ctx.providerId,
      start_time: "2026-06-15T12:00:00.000Z",
      lines: [
        {
          service_id: ctx.service15.id,
          quantity: 2,
          duration_override: 20,
        },
      ],
    };
    const { status, data } = await create(payload);
    const ok = status === 201;
    if (ok) {
      const appt = data as { end_time: string; start_time: string };
      const start = new Date(appt.start_time).getTime();
      const end = new Date(appt.end_time).getTime();
      const diffMin = (end - start) / (60 * 1000);
      if (Math.abs(diffMin - 40) > 0.1) {
        console.log(`❌ 3. quantity=2*20min should give 40min, got ${diffMin}min`);
        failed++;
      } else {
        createdAppointmentIds.push((data as { id: string }).id);
        console.log("✅ 3. quantity=2, duration=20 → 40min total");
        passed++;
      }
    } else {
      console.log(`❌ 3. Expected 201, got ${status}`, data);
      failed++;
    }
  } catch (e: unknown) {
    console.log("❌ 3.", (e as Error).message);
    failed++;
  }

  // --- Test 4: Overlapping → 409 ---
  try {
    const payload: CreateAppointment = {
      patient_id: ctx.patientId,
      provider_id: ctx.providerId,
      start_time: "2026-06-15T10:15:00.000Z",
      lines: [{ service_id: ctx.service30.id, quantity: 1 }],
    };
    const { status } = await create(payload);
    if (status === 409) {
      console.log("✅ 4. Overlapping appointment → 409");
      passed++;
    } else {
      console.log(`❌ 4. Expected 409, got ${status}`);
      failed++;
    }
  } catch (e: unknown) {
    console.log("❌ 4.", (e as Error).message);
    failed++;
  }

  // --- Test 5: Back-to-back (starts when previous ends) → 201 ---
  try {
    const payload: CreateAppointment = {
      patient_id: ctx.patientId,
      provider_id: ctx.providerId,
      start_time: "2026-06-15T10:30:00.000Z",
      lines: [{ service_id: ctx.service30.id, quantity: 1 }],
    };
    const { status, data } = await create(payload);
    if (status === 201) {
      createdAppointmentIds.push((data as { id: string }).id);
      console.log("✅ 5. Back-to-back appointment → 201");
      passed++;
    } else {
      console.log(`❌ 5. Expected 201, got ${status}`, data);
      failed++;
    }
  } catch (e: unknown) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  // --- Test 6: Same time, different provider → 201 ---
  try {
    const payload: CreateAppointment = {
      patient_id: ctx.patientId,
      provider_id: ctx.provider2Id!,
      start_time: baseTime,
      lines: [{ service_id: ctx.service30.id, quantity: 1 }],
    };
    const { status, data } = await create(payload);
    if (status === 201) {
      createdAppointmentIds.push((data as { id: string }).id);
      console.log("✅ 6. Same time, different provider → 201");
      passed++;
    } else {
      console.log(`❌ 6. Expected 201, got ${status}`, data);
      failed++;
    }
  } catch (e: unknown) {
    console.log("❌ 6.", (e as Error).message);
    failed++;
  }

  // --- Test 7: Empty lines → 422 ---
  try {
    const payload = {
      patient_id: ctx.patientId,
      provider_id: ctx.providerId,
      start_time: baseTime,
      lines: [],
    };
    const { status } = await create(payload as CreateAppointment);
    if (status === 422) {
      console.log("✅ 7. Empty lines array → 422");
      passed++;
    } else {
      console.log(`❌ 7. Expected 422, got ${status}`);
      failed++;
    }
  } catch (e: unknown) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  // --- Test 8: Status history entry with old_status=null, new_status='scheduled' ---
  try {
    if (createdAppointmentIds.length > 0) {
      const firstId = createdAppointmentIds[0];
      const hist = await pgClient`
        SELECT old_status, new_status FROM appointment_status_history
        WHERE appointment_id = ${firstId}
        ORDER BY created_at ASC
        LIMIT 1
      `;
      const ok =
        hist.length === 1 &&
        hist[0].old_status === null &&
        hist[0].new_status === "scheduled";
      if (ok) {
        console.log("✅ 8. Status history: old_status=null, new_status='scheduled'");
        passed++;
      } else {
        console.log("❌ 8. Status history missing or wrong:", hist);
        failed++;
      }
    } else {
      console.log("⏭️  8. Skipped (no appointments created)");
    }
  } catch (e: unknown) {
    console.log("❌ 8.", (e as Error).message);
    failed++;
  }

  // --- Cleanup ---
  for (const id of createdAppointmentIds) {
    await pgClient`DELETE FROM appointment_status_history WHERE appointment_id = ${id}`;
    await pgClient`DELETE FROM appointment_lines WHERE appointment_id = ${id}`;
    await pgClient`DELETE FROM appointments WHERE id = ${id}`;
  }
  for (const id of createdServiceIds) {
    await pgClient`DELETE FROM services WHERE id = ${id}`;
  }
  if (createdProvider2UserId) {
    await pgClient`DELETE FROM provider_profiles WHERE user_id = ${createdProvider2UserId}`;
    await pgClient`DELETE FROM users WHERE id = ${createdProvider2UserId}`;
  }
  console.log("\n🧹 Cleanup done");

  console.log(`\n=== Results: ${passed} passed, ${failed} failed out of ${passed + failed} ===`);
  return failed > 0 ? 1 : 0;
}

main()
  .then((code) => {
    pgClient.end();
    process.exit(code);
  })
  .catch((e) => {
    console.error(e);
    pgClient.end();
    process.exit(1);
  });
