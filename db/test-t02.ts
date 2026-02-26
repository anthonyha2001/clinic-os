/**
 * T-02 Smoke Test: Plans API
 * Run with: TEST_AUTH_BYPASS=true npx tsx db/test-t02.ts
 * Prerequisites: Dev server running, and server env TEST_AUTH_BYPASS=true for auth bypass.
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

async function main() {
  console.log("=== T-02 Smoke Test: Plans API ===\n");
  let passed = 0;
  let failed = 0;

  const createdPlanIds: string[] = [];

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
  if (!provider) {
    console.log("SKIP: No provider found.");
    process.exit(1);
  }
  const providerId = provider.id as string;

  const [patient] = await pgClient`
    SELECT id FROM patients
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  if (!patient) {
    console.log("SKIP: No patient found.");
    process.exit(1);
  }
  const patientId = patient.id as string;

  const services = await pgClient`
    SELECT id, price FROM services
    WHERE organization_id = ${orgId}
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 2
  `;
  if (services.length === 0) {
    console.log("SKIP: No active service found.");
    process.exit(1);
  }
  const service1 = services[0];
  const service2 = services[1] ?? services[0];

  let planId: string | null = null;

  // 1) POST /api/plans with 2 items -> 201
  try {
    const { status, data } = await fetchJson(`${BASE}/api/plans`, {
      method: "POST",
      userId,
      body: {
        patient_id: patientId,
        provider_id: providerId,
        name_en: "Plan T-02 EN",
        name_fr: "Plan T-02 FR",
        name_ar: "خطة T-02",
        notes: "Initial plan notes",
        total_estimated_cost: 150,
        items: [
          {
            service_id: service1.id,
            quantity_total: 2,
            unit_price: Number(service1.price),
            sequence_order: 1,
            description_en: "Item 1 EN",
          },
          {
            service_id: service2.id,
            quantity_total: 1,
            unit_price: Number(service2.price),
            sequence_order: 2,
            description_en: "Item 2 EN",
          },
        ],
      },
    });
    if (status !== 201) {
      throw new Error(`Expected 201, got ${status}: ${JSON.stringify(data)}`);
    }
    const plan = data as { id: string; status: string; items: unknown[] };
    if (plan.status !== "proposed") {
      throw new Error(`Expected proposed, got ${plan.status}`);
    }
    if (!Array.isArray(plan.items) || plan.items.length !== 2) {
      throw new Error("Expected 2 items in response");
    }
    planId = plan.id;
    createdPlanIds.push(planId);
    console.log("✅ 1. POST /api/plans with 2 items -> 201");
    passed++;
  } catch (e) {
    console.log("❌ 1.", (e as Error).message);
    failed++;
  }

  if (!planId) {
    await cleanup(createdPlanIds);
    process.exit(1);
  }

  // 2) GET /api/plans?patient_id=... -> 200
  try {
    const { status, data } = await fetchJson(
      `${BASE}/api/plans?patient_id=${patientId}`,
      { userId }
    );
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    const plans = data as Array<{ id: string }>;
    if (!plans.some((p) => p.id === planId)) {
      throw new Error("Created plan not found in list");
    }
    console.log("✅ 2. GET /api/plans?patient_id=... -> 200 includes plan");
    passed++;
  } catch (e) {
    console.log("❌ 2.", (e as Error).message);
    failed++;
  }

  // 3) GET /api/plans/[id] -> 200 with items ordered + status history
  try {
    const { status, data } = await fetchJson(`${BASE}/api/plans/${planId}`, {
      userId,
    });
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    const plan = data as {
      items: Array<{ sequence_order: number }>;
      status_history: Array<{ new_status: string }>;
    };
    if (!plan.items || plan.items.length !== 2) {
      throw new Error("Expected 2 items");
    }
    if (plan.items[0].sequence_order !== 1 || plan.items[1].sequence_order !== 2) {
      throw new Error("Items not ordered by sequence_order");
    }
    if (!plan.status_history?.some((h) => h.new_status === "proposed")) {
      throw new Error("Expected proposed status history entry");
    }
    console.log("✅ 3. GET /api/plans/[id] includes ordered items and history");
    passed++;
  } catch (e) {
    console.log("❌ 3.", (e as Error).message);
    failed++;
  }

  // 4) PATCH while proposed -> 200
  try {
    const { status } = await fetchJson(`${BASE}/api/plans/${planId}`, {
      method: "PATCH",
      userId,
      body: {
        name_en: "Plan T-02 EN Updated",
      },
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    console.log("✅ 4. PATCH while proposed -> 200");
    passed++;
  } catch (e) {
    console.log("❌ 4.", (e as Error).message);
    failed++;
  }

  // 5) proposed -> accepted -> 200, accepted_at populated
  try {
    const { status, data } = await fetchJson(`${BASE}/api/plans/${planId}/status`, {
      method: "POST",
      userId,
      body: { status: "accepted" },
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    const plan = data as { status: string; accepted_at: string | null };
    if (plan.status !== "accepted") throw new Error(`Expected accepted, got ${plan.status}`);
    if (!plan.accepted_at) throw new Error("Expected accepted_at to be populated");
    console.log("✅ 5. proposed -> accepted -> 200 with accepted_at");
    passed++;
  } catch (e) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  // 6) PATCH while accepted -> 200 (editable)
  try {
    const { status } = await fetchJson(`${BASE}/api/plans/${planId}`, {
      method: "PATCH",
      userId,
      body: {
        notes: "Edited while accepted",
        // Full replace behavior: send complete items array
        items: [
          {
            service_id: service1.id,
            quantity_total: 3,
            unit_price: Number(service1.price),
            sequence_order: 1,
          },
          {
            service_id: service2.id,
            quantity_total: 1,
            unit_price: Number(service2.price),
            sequence_order: 2,
          },
        ],
      },
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    console.log("✅ 6. PATCH while accepted -> 200");
    passed++;
  } catch (e) {
    console.log("❌ 6.", (e as Error).message);
    failed++;
  }

  // 7) accepted -> in_progress -> 200
  try {
    const { status, data } = await fetchJson(`${BASE}/api/plans/${planId}/status`, {
      method: "POST",
      userId,
      body: { status: "in_progress" },
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    const plan = data as { status: string };
    if (plan.status !== "in_progress") {
      throw new Error(`Expected in_progress, got ${plan.status}`);
    }
    console.log("✅ 7. accepted -> in_progress -> 200");
    passed++;
  } catch (e) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  // 8) PATCH while in_progress -> 422
  try {
    const { status } = await fetchJson(`${BASE}/api/plans/${planId}`, {
      method: "PATCH",
      userId,
      body: { notes: "Should fail in progress" },
    });
    if (status === 422) {
      console.log("✅ 8. PATCH while in_progress -> 422");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${status}`);
    }
  } catch (e) {
    console.log("❌ 8.", (e as Error).message);
    failed++;
  }

  // 9) in_progress -> completed -> 200 with completed_at
  try {
    const { status, data } = await fetchJson(`${BASE}/api/plans/${planId}/status`, {
      method: "POST",
      userId,
      body: { status: "completed" },
    });
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    const plan = data as { status: string; completed_at: string | null };
    if (plan.status !== "completed") {
      throw new Error(`Expected completed, got ${plan.status}`);
    }
    if (!plan.completed_at) throw new Error("Expected completed_at to be populated");
    console.log("✅ 9. in_progress -> completed -> 200 with completed_at");
    passed++;
  } catch (e) {
    console.log("❌ 9.", (e as Error).message);
    failed++;
  }

  // 10) invalid transition completed -> accepted -> 422
  try {
    const { status } = await fetchJson(`${BASE}/api/plans/${planId}/status`, {
      method: "POST",
      userId,
      body: { status: "accepted" },
    });
    if (status === 422) {
      console.log("✅ 10. completed -> accepted (invalid) -> 422");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${status}`);
    }
  } catch (e) {
    console.log("❌ 10.", (e as Error).message);
    failed++;
  }

  // 11) POST /api/plans with empty items -> 422
  try {
    const { status } = await fetchJson(`${BASE}/api/plans`, {
      method: "POST",
      userId,
      body: {
        patient_id: patientId,
        provider_id: providerId,
        name_en: "Invalid plan",
        name_fr: "Invalid plan",
        name_ar: "خطة غير صالحة",
        items: [],
      },
    });
    if (status === 422) {
      console.log("✅ 11. POST /api/plans with empty items -> 422");
      passed++;
    } else {
      throw new Error(`Expected 422, got ${status}`);
    }
  } catch (e) {
    console.log("❌ 11.", (e as Error).message);
    failed++;
  }

  await cleanup(createdPlanIds);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function cleanup(planIds: string[]) {
  for (const id of planIds) {
    await pgClient`DELETE FROM plan_status_history WHERE plan_id = ${id}`;
    await pgClient`DELETE FROM plan_items WHERE plan_id = ${id}`;
    await pgClient`DELETE FROM plans WHERE id = ${id}`;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
