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

function nearlyEqual(a: number, b: number, eps = 0.0001): boolean {
  return Math.abs(a - b) < eps;
}

async function ensureUserWithPermission(params: {
  orgId: string;
  roleName: string;
  emailPrefix: string;
  fullName: string;
  permissionKey?: string;
}): Promise<string> {
  const { orgId, roleName, emailPrefix, fullName, permissionKey } = params;

  const [role] = await pgClient`
    INSERT INTO roles (organization_id, name)
    VALUES (${orgId}, ${roleName})
    ON CONFLICT (organization_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;

  if (permissionKey) {
    const [perm] = await pgClient`
      SELECT id FROM permissions WHERE key = ${permissionKey} LIMIT 1
    `;
    if (perm) {
      await pgClient`
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (${role.id}, ${perm.id})
        ON CONFLICT (role_id, permission_id) DO NOTHING
      `;
    }
  }

  const [user] = await pgClient`
    INSERT INTO users (id, organization_id, email, full_name, is_active)
    VALUES (
      gen_random_uuid(),
      ${orgId},
      ${`${emailPrefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@test.local`},
      ${fullName},
      true
    )
    RETURNING id
  `;

  await pgClient`
    INSERT INTO user_roles (user_id, role_id)
    VALUES (${user.id}, ${role.id})
    ON CONFLICT (user_id, role_id) DO NOTHING
  `;

  return user.id as string;
}

async function createPlan(params: {
  orgId: string;
  patientId: string;
  providerId: string;
  serviceId: string;
  createdBy: string;
  status: "proposed" | "accepted" | "in_progress" | "completed" | "canceled";
  proposedAt: string;
  label: string;
}): Promise<string> {
  const { orgId, patientId, providerId, serviceId, createdBy, status, proposedAt, label } = params;
  const [plan] = await pgClient`
    INSERT INTO plans (
      organization_id, patient_id, provider_id, name_en, name_fr, name_ar,
      status, proposed_at, accepted_at, completed_at, created_by
    )
    VALUES (
      ${orgId}, ${patientId}, ${providerId},
      ${`${label} EN`}, ${`${label} FR`}, ${`${label} AR`},
      ${status},
      ${proposedAt}::timestamptz,
      ${status === "accepted" || status === "in_progress" || status === "completed" ? proposedAt : null}::timestamptz,
      ${status === "completed" ? proposedAt : null}::timestamptz,
      ${createdBy}
    )
    RETURNING id
  `;

  await pgClient`
    INSERT INTO plan_items (
      plan_id, service_id, sequence_order, quantity_total, quantity_completed, unit_price
    )
    VALUES (
      ${plan.id}, ${serviceId}, 1, 1, ${status === "completed" ? 1 : 0}, 50
    )
  `;

  await pgClient`
    INSERT INTO plan_status_history (plan_id, old_status, new_status, changed_by, reason, created_at)
    VALUES (${plan.id}, null, 'proposed', ${createdBy}, null, ${proposedAt}::timestamptz)
  `;
  if (status !== "proposed") {
    await pgClient`
      INSERT INTO plan_status_history (plan_id, old_status, new_status, changed_by, reason, created_at)
      VALUES (${plan.id}, 'proposed', ${status}, ${createdBy}, 'test transition', ${proposedAt}::timestamptz)
    `;
  }

  return plan.id as string;
}

async function main() {
  console.log("=== T-05 Smoke Test: Plan Conversion Tracking Query ===\n");
  let passed = 0;
  let failed = 0;

  const createdPlanIds: string[] = [];
  const createdUserIds: string[] = [];

  const [seedUser] = await pgClient`SELECT id, organization_id FROM users LIMIT 1`;
  if (!seedUser) {
    console.log("SKIP: No user found.");
    process.exit(1);
  }
  const orgId = seedUser.organization_id as string;

  const providerRows = await pgClient`
    SELECT id
    FROM provider_profiles
    WHERE organization_id = ${orgId}
    LIMIT 2
  `;
  if (providerRows.length === 0) {
    console.log("SKIP: No provider found.");
    process.exit(1);
  }
  const provider1Id = providerRows[0].id as string;
  let provider2Id = providerRows[1]?.id as string | undefined;
  if (!provider2Id) {
    const [u] = await pgClient`
      INSERT INTO users (id, organization_id, email, full_name, is_active)
      VALUES (gen_random_uuid(), ${orgId}, ${`t05-provider-${Date.now()}@test.local`}, 'T05 Provider', true)
      RETURNING id
    `;
    createdUserIds.push(u.id as string);
    const [pp] = await pgClient`
      INSERT INTO provider_profiles (user_id, organization_id, is_accepting_appointments, color_hex)
      VALUES (${u.id}, ${orgId}, true, '#8B5CF6')
      RETURNING id
    `;
    provider2Id = pp.id as string;
  }

  const [patient] = await pgClient`
    SELECT id FROM patients
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  const [service] = await pgClient`
    SELECT id FROM services
    WHERE organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (!patient || !service) {
    console.log("SKIP: Missing patient or service.");
    process.exit(1);
  }
  const patientId = patient.id as string;
  const serviceId = service.id as string;

  const adminUserId = await ensureUserWithPermission({
    orgId,
    roleName: `t05-admin-${Date.now()}`,
    emailPrefix: "t05-admin",
    fullName: "T05 Admin",
    permissionKey: "reports.view",
  });
  createdUserIds.push(adminUserId);

  const receptionistUserId = await ensureUserWithPermission({
    orgId,
    roleName: `t05-receptionist-${Date.now()}`,
    emailPrefix: "t05-receptionist",
    fullName: "T05 Receptionist",
  });
  createdUserIds.push(receptionistUserId);

  const jan10 = "2026-01-10T10:00:00.000Z";
  const jan15 = "2026-01-15T10:00:00.000Z";
  const jan20 = "2026-01-20T10:00:00.000Z";
  const feb05 = "2026-02-05T10:00:00.000Z";
  const feb14 = "2026-02-14T10:00:00.000Z";

  createdPlanIds.push(
    await createPlan({
      orgId,
      patientId,
      providerId: provider1Id,
      serviceId,
      createdBy: adminUserId,
      status: "completed",
      proposedAt: jan10,
      label: "T05 Plan A",
    })
  );
  createdPlanIds.push(
    await createPlan({
      orgId,
      patientId,
      providerId: provider1Id,
      serviceId,
      createdBy: adminUserId,
      status: "accepted",
      proposedAt: jan15,
      label: "T05 Plan B",
    })
  );
  createdPlanIds.push(
    await createPlan({
      orgId,
      patientId,
      providerId: provider2Id,
      serviceId,
      createdBy: adminUserId,
      status: "canceled",
      proposedAt: jan20,
      label: "T05 Plan C",
    })
  );
  createdPlanIds.push(
    await createPlan({
      orgId,
      patientId,
      providerId: provider2Id,
      serviceId,
      createdBy: adminUserId,
      status: "completed",
      proposedAt: feb05,
      label: "T05 Plan D",
    })
  );
  createdPlanIds.push(
    await createPlan({
      orgId,
      patientId,
      providerId: provider1Id,
      serviceId,
      createdBy: adminUserId,
      status: "in_progress",
      proposedAt: feb14,
      label: "T05 Plan E",
    })
  );

  const startAll = "2026-01-01T00:00:00.000Z";
  const endAll = "2026-02-28T23:59:59.999Z";

  try {
    const res = await fetchJson(
      `${BASE}/api/reports/plan-conversion?start_date=${encodeURIComponent(startAll)}&end_date=${encodeURIComponent(endAll)}`,
      { userId: adminUserId }
    );
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

    const body = res.data as {
      summary: {
        totalProposed: number;
        totalAccepted: number;
        totalCompleted: number;
        totalCanceled: number;
        conversionRate: number;
        completionRate: number;
      };
      byMonth: Array<{
        month: string;
        proposed: number;
        accepted: number;
        completed: number;
        canceled: number;
        conversionRate: number;
        completionRate: number;
      }>;
      byProvider?: Array<{
        providerId: string;
        proposed: number;
      }>;
    };

    if (
      body.summary.totalProposed !== 5 ||
      body.summary.totalAccepted !== 4 ||
      body.summary.totalCompleted !== 2 ||
      body.summary.totalCanceled !== 1
    ) {
      throw new Error(`Unexpected summary counts: ${JSON.stringify(body.summary)}`);
    }
    if (
      !nearlyEqual(body.summary.conversionRate, 0.8) ||
      !nearlyEqual(body.summary.completionRate, 0.5)
    ) {
      throw new Error(`Unexpected summary rates: ${JSON.stringify(body.summary)}`);
    }

    const jan = body.byMonth.find((m) => m.month === "2026-01");
    const feb = body.byMonth.find((m) => m.month === "2026-02");
    if (!jan || !feb) {
      throw new Error(`Expected Jan/Feb buckets, got ${JSON.stringify(body.byMonth)}`);
    }
    if (
      jan.proposed !== 3 || jan.accepted !== 2 || jan.completed !== 1 || jan.canceled !== 1 ||
      feb.proposed !== 2 || feb.accepted !== 2 || feb.completed !== 1 || feb.canceled !== 0
    ) {
      throw new Error(`Unexpected monthly counts: ${JSON.stringify(body.byMonth)}`);
    }
    if (!body.byProvider || body.byProvider.length < 2) {
      throw new Error("byProvider should include both providers");
    }

    console.log("✅ 1-4. Summary, rates, byMonth and byProvider verified");
    passed += 4;
  } catch (e) {
    console.log("❌ 1-4.", (e as Error).message);
    failed += 4;
  }

  try {
    const res = await fetchJson(
      `${BASE}/api/reports/plan-conversion?start_date=${encodeURIComponent(startAll)}&end_date=${encodeURIComponent(endAll)}&provider_id=${provider1Id}`,
      { userId: adminUserId }
    );
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = res.data as { summary: { totalProposed: number }; byProvider?: unknown[] };
    if (body.summary.totalProposed !== 3) {
      throw new Error(`Provider filter expected 3 proposed, got ${body.summary.totalProposed}`);
    }
    if (body.byProvider !== undefined) {
      throw new Error("byProvider should be omitted when provider_id is specified");
    }
    console.log("✅ 5. provider_id filter works");
    passed++;
  } catch (e) {
    console.log("❌ 5.", (e as Error).message);
    failed++;
  }

  try {
    const res = await fetchJson(
      `${BASE}/api/reports/plan-conversion?start_date=${encodeURIComponent("2026-01-01T00:00:00.000Z")}&end_date=${encodeURIComponent("2026-01-31T23:59:59.999Z")}`,
      { userId: adminUserId }
    );
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = res.data as { summary: { totalProposed: number } };
    if (body.summary.totalProposed !== 3) {
      throw new Error(`Month1-only expected 3 proposed, got ${body.summary.totalProposed}`);
    }
    console.log("✅ 6. Date range filter excludes Month 2 plans");
    passed++;
  } catch (e) {
    console.log("❌ 6.", (e as Error).message);
    failed++;
  }

  try {
    const res = await fetchJson(
      `${BASE}/api/reports/plan-conversion?start_date=${encodeURIComponent("2027-01-01T00:00:00.000Z")}&end_date=${encodeURIComponent("2027-01-31T23:59:59.999Z")}`,
      { userId: adminUserId }
    );
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const body = res.data as { summary: { totalProposed: number; conversionRate: number; completionRate: number } };
    if (
      body.summary.totalProposed !== 0 ||
      !nearlyEqual(body.summary.conversionRate, 0) ||
      !nearlyEqual(body.summary.completionRate, 0)
    ) {
      throw new Error(`Expected zero-safe summary, got ${JSON.stringify(body.summary)}`);
    }
    console.log("✅ 7. Empty date range returns zero-safe metrics");
    passed++;
  } catch (e) {
    console.log("❌ 7.", (e as Error).message);
    failed++;
  }

  try {
    const res = await fetchJson(
      `${BASE}/api/reports/plan-conversion?start_date=${encodeURIComponent(startAll)}&end_date=${encodeURIComponent(endAll)}`,
      { userId: receptionistUserId }
    );
    if (res.status === 403) {
      console.log("✅ 8. receptionist without reports.view is forbidden (403)");
      passed++;
    } else {
      throw new Error(`Expected 403, got ${res.status}`);
    }
  } catch (e) {
    console.log("❌ 8.", (e as Error).message);
    failed++;
  }

  await cleanup(createdPlanIds, createdUserIds, orgId);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function cleanup(planIds: string[], userIds: string[], orgId: string) {
  for (const planId of planIds) {
    await pgClient`DELETE FROM plan_status_history WHERE plan_id = ${planId}`;
    await pgClient`DELETE FROM plan_items WHERE plan_id = ${planId}`;
    await pgClient`DELETE FROM plans WHERE id = ${planId}`;
  }

  for (const userId of userIds) {
    await pgClient`DELETE FROM user_roles WHERE user_id = ${userId}`;
    await pgClient`DELETE FROM users WHERE id = ${userId} AND organization_id = ${orgId}`;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
