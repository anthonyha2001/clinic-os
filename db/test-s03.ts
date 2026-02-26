/**
 * S-03 Smoke Test: Update Appointment & Status Transition API
 * Run with: TEST_AUTH_BYPASS=true npx tsx db/test-s03.ts
 * Prerequisites: Dev server running (npm run dev), org, user, provider, patient, service exist.
 * TEST_AUTH_BYPASS=true enables X-Test-User-Id header auth for PATCH/POST status (no Supabase session needed).
 */
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
  const headers: Record<string, string> = { "Content-Type": "application/json", ...authHeaders(opts.userId ?? "") };
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

async function main() {
  console.log("=== S-03 Smoke Test: Update Appointment & Status API ===\n");
  let passed = 0;
  let failed = 0;
  const createdAppointmentIds: string[] = [];

  // Use same logic as POST /api/appointments: first user determines org
  const userRes = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (userRes.length === 0) {
    console.log("SKIP: No user found.");
    process.exit(1);
  }
  const userId = userRes[0].id;
  const orgId = userRes[0].organization_id;

  const providerRes = await pgClient`SELECT id FROM provider_profiles WHERE organization_id = ${orgId} LIMIT 1`;
  if (providerRes.length === 0) {
    console.log("SKIP: No provider found.");
    process.exit(1);
  }
  const providerId = providerRes[0].id;

  const patientRes = await pgClient`SELECT id FROM patients WHERE organization_id = ${orgId} LIMIT 1`;
  if (patientRes.length === 0) {
    console.log("SKIP: No patient found. Run test-p01 first.");
    process.exit(1);
  }
  const patientId = patientRes[0].id;

  const serviceRes = await pgClient`
    SELECT id, price, default_duration_minutes
    FROM services WHERE organization_id = ${orgId} LIMIT 1
  `;
  if (serviceRes.length === 0) {
    console.log("SKIP: No service found.");
    process.exit(1);
  }
  const service = serviceRes[0];

  const startBase = "2026-03-01T10:00:00.000Z";
  const endBase = "2026-03-01T10:30:00.000Z";

  // --- Create fresh appointment via POST ---
  let apptId: string | null = null;
  try {
    const { status, data } = await fetchJson(`${BASE}/api/appointments`, {
      method: "POST",
      body: {
        patient_id: patientId,
        provider_id: providerId,
        start_time: startBase,
        notes: "Original notes",
        lines: [
          {
            service_id: service.id,
            quantity: 1,
          },
        ],
      },
    });
    if (status !== 201) {
      throw new Error(`Expected 201, got ${status}: ${JSON.stringify(data)}`);
    }
    const appt = data as { id: string };
    apptId = appt.id;
    createdAppointmentIds.push(apptId);
    console.log("✅ Setup: Created appointment via POST, id:", apptId);
    passed++;
  } catch (e) {
    console.log("❌ Setup: Failed to create appointment:", (e as Error).message);
    failed++;
    await cleanup(createdAppointmentIds);
    process.exit(1);
  }

  // --- Test 1: PATCH notes only → 200, notes changed ---
  try {
    const { status, data } = await fetchJson(`${BASE}/api/appointments/${apptId}`, {
      method: "PATCH",
      body: { notes: "Updated notes via PATCH" },
      userId,
    });
    if (status !== 200) {
      const err = data as { error?: string };
      throw new Error(`Expected 200, got ${status}: ${err.error ?? JSON.stringify(data)}`);
    }
    const appt = data as { notes: string };
    if (appt.notes !== "Updated notes via PATCH") {
      throw new Error(`Notes not updated: ${appt.notes}`);
    }
    console.log("✅ 1. PATCH notes only → 200, notes changed");
    passed++;
  } catch (e) {
    console.log("❌ 1.", (e as Error).message);
    failed++;
  }

  // --- Test 2: PATCH change start_time/end_time to non-conflicting slot → 200 ---
  try {
    const newStart = "2026-03-02T14:00:00.000Z";
    const newEnd = "2026-03-02T14:30:00.000Z";
    const { status, data } = await fetchJson(`${BASE}/api/appointments/${apptId}`, {
      method: "PATCH",
      body: { start_time: newStart, end_time: newEnd },
      userId,
    });
    if (status !== 200) {
      const err = data as { error?: string };
      throw new Error(`Expected 200, got ${status}: ${err.error ?? JSON.stringify(data)}`);
    }
    const appt = data as { start_time: string; end_time: string };
    const gotStart = new Date(appt.start_time).toISOString();
    const gotEnd = new Date(appt.end_time).toISOString();
    if (!gotStart.startsWith("2026-03-02T14:00") || !gotEnd.startsWith("2026-03-02T14:30")) {
      throw new Error(`Times not updated: ${gotStart} / ${gotEnd}`);
    }
    console.log("✅ 2. PATCH non-conflicting time → 200");
    passed++;
  } catch (e) {
    console.log("❌ 2.", (e as Error).message);
    failed++;
  }

  // --- Test 3: Create second appointment, then PATCH first to overlap → 409 ---
  let appt2Id: string | null = null;
  try {
    const { status, data } = await fetchJson(`${BASE}/api/appointments`, {
      method: "POST",
      body: {
        patient_id: patientId,
        provider_id: providerId,
        start_time: "2026-03-03T09:00:00.000Z",
        lines: [{ service_id: service.id, quantity: 1 }],
      },
    });
    if (status !== 201) throw new Error(`Create appt2 failed: ${status}`);
    appt2Id = (data as { id: string }).id;
    createdAppointmentIds.push(appt2Id);
  } catch (e) {
    console.log("❌ 3. Setup second appt failed:", (e as Error).message);
    failed++;
  }

  if (appt2Id) {
    try {
      const { status, data } = await fetchJson(`${BASE}/api/appointments/${apptId}`, {
        method: "PATCH",
        body: {
          start_time: "2026-03-03T09:00:00.000Z",
          end_time: "2026-03-03T09:30:00.000Z",
        },
        userId,
      });
      if (status === 409) {
        console.log("✅ 3. PATCH overlapping time → 409");
        passed++;
      } else {
        throw new Error(`Expected 409, got ${status}: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      console.log("❌ 3.", (e as Error).message);
      failed++;
    }
  }

  // --- Test 4: POST status scheduled → confirmed → 200 ---
  try {
    const { status, data } = await fetchJson(`${BASE}/api/appointments/${apptId}/status`, {
      method: "POST",
      body: { status: "confirmed" },
      userId,
    });
    if (status !== 200) {
      const err = data as { error?: string };
      throw new Error(`Expected 200, got ${status}: ${err.error ?? JSON.stringify(data)}`);
    }
    const appt = data as { status: string };
    if (appt.status !== "confirmed") throw new Error(`Status not confirmed: ${appt.status}`);
    console.log("✅ 4. POST status scheduled → confirmed → 200");
    passed++;
  } catch (e) {
    console.log("❌ 4.", (e as Error).message);
    failed++;
  }

  // --- Test 5: POST status confirmed → completed → 200 ---
  try {
    const { status, data } = await fetchJson(`${BASE}/api/appointments/${apptId}/status`, {
      method: "POST",
      body: { status: "completed" },
      userId,
    });
    if (status !== 200) {
      const err = data as { error?: string };
      throw new Error(`Expected 200, got ${status}: ${err.error ?? JSON.stringify(data)}`);
    }
    const appt = data as { status: string };
    if (appt.status !== "completed") throw new Error(`Status not completed: ${appt.status}`);
    console.log("✅ 5. POST status confirmed → completed → 200");
    passed++;
  } catch (e) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  // --- Test 6: Create new scheduled appt, attempt invalid transition scheduled → completed → 422 ---
  let apptForInvalid: string | null = null;
  try {
    const { status, data } = await fetchJson(`${BASE}/api/appointments`, {
      method: "POST",
      body: {
        patient_id: patientId,
        provider_id: providerId,
        start_time: "2026-03-05T10:00:00.000Z",
        lines: [{ service_id: service.id, quantity: 1 }],
      },
    });
    if (status !== 201) throw new Error(`Create failed: ${status}`);
    apptForInvalid = (data as { id: string }).id;
    createdAppointmentIds.push(apptForInvalid);
  } catch (e) {
    console.log("❌ 6. Setup failed:", (e as Error).message);
    failed++;
  }

  if (apptForInvalid) {
    try {
      const { status } = await fetchJson(`${BASE}/api/appointments/${apptForInvalid}/status`, {
        method: "POST",
        body: { status: "completed" },
        userId,
      });
      if (status === 422) {
        console.log("✅ 6. POST status scheduled → completed (invalid) → 422");
        passed++;
      } else {
        throw new Error(`Expected 422, got ${status}`);
      }
    } catch (e) {
      console.log("❌ 6.", (e as Error).message);
      failed++;
    }
  }

  // --- Test 7: POST status on non-existent id → 404 ---
  try {
    const fakeId = "00000000-0000-0000-0000-000000000099";
    const { status } = await fetchJson(`${BASE}/api/appointments/${fakeId}/status`, {
      method: "POST",
      body: { status: "confirmed" },
      userId,
    });
    if (status === 404) {
      console.log("✅ 7. POST status on non-existent id → 404");
      passed++;
    } else {
      throw new Error(`Expected 404, got ${status}`);
    }
  } catch (e) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  // --- Test 8: confirmed → canceled → 200, then canceled → scheduled (rebook) → 200 ---
  let apptForCancel: string | null = null;
  try {
    const { status, data } = await fetchJson(`${BASE}/api/appointments`, {
      method: "POST",
      body: {
        patient_id: patientId,
        provider_id: providerId,
        start_time: "2026-03-06T10:00:00.000Z",
        lines: [{ service_id: service.id, quantity: 1 }],
      },
    });
    if (status !== 201) throw new Error(`Create failed: ${status}`);
    apptForCancel = (data as { id: string }).id;
    createdAppointmentIds.push(apptForCancel);
  } catch (e) {
    console.log("❌ 8. Setup failed:", (e as Error).message);
    failed++;
  }

  if (apptForCancel) {
    try {
      const res1 = await fetchJson(`${BASE}/api/appointments/${apptForCancel}/status`, {
        method: "POST",
        body: { status: "confirmed" },
        userId,
      });
      if (res1.status !== 200) throw new Error(`confirm failed: ${res1.status}`);
      const res2 = await fetchJson(`${BASE}/api/appointments/${apptForCancel}/status`, {
        method: "POST",
        body: { status: "canceled", reason: "Patient requested" },
        userId,
      });
      if (res2.status !== 200) throw new Error(`cancel failed: ${res2.status}`);
      const apptAfterCancel = res2.data as { status: string };
      if (apptAfterCancel.status !== "canceled") throw new Error(`Not canceled: ${apptAfterCancel.status}`);
      const res3 = await fetchJson(`${BASE}/api/appointments/${apptForCancel}/status`, {
        method: "POST",
        body: { status: "scheduled" },
        userId,
      });
      if (res3.status !== 200) throw new Error(`rebook failed: ${res3.status}`);
      const apptRebook = res3.data as { status: string };
      if (apptRebook.status !== "scheduled") throw new Error(`Not rebooked: ${apptRebook.status}`);
      console.log("✅ 8. confirmed → canceled → 200, canceled → scheduled (rebook) → 200");
      passed++;
    } catch (e) {
      console.log("❌ 8.", (e as Error).message);
      failed++;
    }
  }

  // --- Verify status_history entry created ---
  try {
    const hist = await pgClient`
      SELECT * FROM appointment_status_history
      WHERE appointment_id = ${apptId}
      ORDER BY created_at ASC
    `;
    const rows = hist as unknown as { new_status: string }[];
    const hasScheduled = rows.some((h) => h.new_status === "scheduled");
    const hasConfirmed = rows.some((h) => h.new_status === "confirmed");
    const hasCompleted = rows.some((h) => h.new_status === "completed");
    if (hasScheduled && hasConfirmed && hasCompleted) {
      console.log("✅ 9. status_history entries created (scheduled, confirmed, completed)");
      passed++;
    } else {
      throw new Error(`Missing history: scheduled=${hasScheduled} confirmed=${hasConfirmed} completed=${hasCompleted}`);
    }
  } catch (e) {
    console.log("❌ 9.", (e as Error).message);
    failed++;
  }

  await cleanup(createdAppointmentIds);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function cleanup(ids: string[]) {
  for (const id of ids) {
    await pgClient`DELETE FROM appointment_status_history WHERE appointment_id = ${id}`;
    await pgClient`DELETE FROM appointment_lines WHERE appointment_id = ${id}`;
    await pgClient`DELETE FROM appointments WHERE id = ${id}`;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
