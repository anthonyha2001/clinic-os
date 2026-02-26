import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pgClient } from "./index";

interface TestContext {
  org1Id: string;
  org2Id: string;
  userAId: string;
  userBId: string;
  userAEmail: string;
  userBEmail: string;
  userAPassword: string;
  userBPassword: string;
  provider1Id: string;
  provider2Id: string;
  patient1Id: string;
  patient2Id: string;
  appointment1Id: string;
  appointment2Id: string;
  invoice1Id: string;
  invoice2Id: string;
  invoiceLine1Id: string;
  invoiceLine2Id: string;
  audit1Id: string;
  audit2Id: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function makeAnonClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function makeServiceClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function setupData(service: SupabaseClient): Promise<TestContext> {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const userAEmail = `k14-user-a-${nonce}@test.local`;
  const userBEmail = `k14-user-b-${nonce}@test.local`;
  const userAPassword = "K14Pass!12345";
  const userBPassword = "K14Pass!12345";

  const [org1] = await pgClient`
    INSERT INTO organizations (name, slug, timezone, currency)
    VALUES (${`K14 Org 1 ${nonce}`}, ${`k14-org1-${nonce}`}, 'UTC', 'USD')
    RETURNING id
  `;
  const [org2] = await pgClient`
    INSERT INTO organizations (name, slug, timezone, currency)
    VALUES (${`K14 Org 2 ${nonce}`}, ${`k14-org2-${nonce}`}, 'UTC', 'USD')
    RETURNING id
  `;
  const org1Id = org1.id as string;
  const org2Id = org2.id as string;

  const createdA = await service.auth.admin.createUser({
    email: userAEmail,
    password: userAPassword,
    email_confirm: true,
  });
  if (createdA.error || !createdA.data.user) {
    throw new Error(`Failed creating auth user A: ${createdA.error?.message}`);
  }
  const createdB = await service.auth.admin.createUser({
    email: userBEmail,
    password: userBPassword,
    email_confirm: true,
  });
  if (createdB.error || !createdB.data.user) {
    throw new Error(`Failed creating auth user B: ${createdB.error?.message}`);
  }

  const userAId = createdA.data.user.id;
  const userBId = createdB.data.user.id;

  await pgClient`
    INSERT INTO users (id, organization_id, email, full_name, is_active)
    VALUES
      (${userAId}, ${org1Id}, ${userAEmail}, 'K14 User A', true),
      (${userBId}, ${org2Id}, ${userBEmail}, 'K14 User B', true)
  `;

  const [provider1] = await pgClient`
    INSERT INTO provider_profiles (user_id, organization_id, is_accepting_appointments, color_hex)
    VALUES (${userAId}, ${org1Id}, true, '#3B82F6')
    RETURNING id
  `;
  const [provider2] = await pgClient`
    INSERT INTO provider_profiles (user_id, organization_id, is_accepting_appointments, color_hex)
    VALUES (${userBId}, ${org2Id}, true, '#10B981')
    RETURNING id
  `;
  const provider1Id = provider1.id as string;
  const provider2Id = provider2.id as string;

  const [service1] = await pgClient`
    INSERT INTO services (
      organization_id, name_en, name_fr, name_ar, price, default_duration_minutes, is_active
    )
    VALUES (
      ${org1Id}, ${`K14 S1 EN ${nonce}`}, 'K14 S1 FR', 'K14 S1 AR', 100.00, 30, true
    )
    RETURNING id
  `;
  const [service2] = await pgClient`
    INSERT INTO services (
      organization_id, name_en, name_fr, name_ar, price, default_duration_minutes, is_active
    )
    VALUES (
      ${org2Id}, ${`K14 S2 EN ${nonce}`}, 'K14 S2 FR', 'K14 S2 AR', 120.00, 30, true
    )
    RETURNING id
  `;

  const [patient1] = await pgClient`
    INSERT INTO patients (
      organization_id, first_name, last_name, phone, is_active
    )
    VALUES (${org1Id}, 'K14', 'Patient1', ${`+1${nonce.slice(-10)}1`}, true)
    RETURNING id
  `;
  const [patient2] = await pgClient`
    INSERT INTO patients (
      organization_id, first_name, last_name, phone, is_active
    )
    VALUES (${org2Id}, 'K14', 'Patient2', ${`+1${nonce.slice(-10)}2`}, true)
    RETURNING id
  `;
  const patient1Id = patient1.id as string;
  const patient2Id = patient2.id as string;

  const start1 = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const end1 = new Date(start1.getTime() + 30 * 60 * 1000);
  const start2 = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
  const end2 = new Date(start2.getTime() + 30 * 60 * 1000);

  const [appointment1] = await pgClient`
    INSERT INTO appointments (
      organization_id, patient_id, provider_id, start_time, end_time, status, created_by
    )
    VALUES (
      ${org1Id}, ${patient1Id}, ${provider1Id},
      ${start1.toISOString()}::timestamptz, ${end1.toISOString()}::timestamptz,
      'completed', ${userAId}
    )
    RETURNING id
  `;
  const [appointment2] = await pgClient`
    INSERT INTO appointments (
      organization_id, patient_id, provider_id, start_time, end_time, status, created_by
    )
    VALUES (
      ${org2Id}, ${patient2Id}, ${provider2Id},
      ${start2.toISOString()}::timestamptz, ${end2.toISOString()}::timestamptz,
      'completed', ${userBId}
    )
    RETURNING id
  `;
  const appointment1Id = appointment1.id as string;
  const appointment2Id = appointment2.id as string;

  const [invoice1] = await pgClient`
    INSERT INTO invoices (
      organization_id, patient_id, appointment_id, invoice_number, status,
      subtotal, discount_amount, total, created_by
    )
    VALUES (
      ${org1Id}, ${patient1Id}, ${appointment1Id}, ${`INV-K14-1-${nonce}`}, 'issued',
      100.00, 0.00, 100.00, ${userAId}
    )
    RETURNING id
  `;
  const [invoice2] = await pgClient`
    INSERT INTO invoices (
      organization_id, patient_id, appointment_id, invoice_number, status,
      subtotal, discount_amount, total, created_by
    )
    VALUES (
      ${org2Id}, ${patient2Id}, ${appointment2Id}, ${`INV-K14-2-${nonce}`}, 'issued',
      120.00, 0.00, 120.00, ${userBId}
    )
    RETURNING id
  `;
  const invoice1Id = invoice1.id as string;
  const invoice2Id = invoice2.id as string;

  const [invoiceLine1] = await pgClient`
    INSERT INTO invoice_lines (
      invoice_id, service_id, description_en, description_fr, description_ar,
      quantity, unit_price, line_total
    )
    VALUES (
      ${invoice1Id}, ${service1.id as string}, 'K14 Line 1 EN', 'K14 Line 1 FR', 'K14 Line 1 AR',
      1, 100.00, 100.00
    )
    RETURNING id
  `;
  const [invoiceLine2] = await pgClient`
    INSERT INTO invoice_lines (
      invoice_id, service_id, description_en, description_fr, description_ar,
      quantity, unit_price, line_total
    )
    VALUES (
      ${invoice2Id}, ${service2.id as string}, 'K14 Line 2 EN', 'K14 Line 2 FR', 'K14 Line 2 AR',
      1, 120.00, 120.00
    )
    RETURNING id
  `;

  const [audit1] = await pgClient`
    INSERT INTO audit_logs (
      organization_id, user_id, action, entity_type, entity_id, details
    )
    VALUES (
      ${org1Id}, ${userAId}, 'k14.test', 'patient', ${patient1Id}, '{"scope":"org1"}'::jsonb
    )
    RETURNING id
  `;
  const [audit2] = await pgClient`
    INSERT INTO audit_logs (
      organization_id, user_id, action, entity_type, entity_id, details
    )
    VALUES (
      ${org2Id}, ${userBId}, 'k14.test', 'patient', ${patient2Id}, '{"scope":"org2"}'::jsonb
    )
    RETURNING id
  `;

  return {
    org1Id,
    org2Id,
    userAId,
    userBId,
    userAEmail,
    userBEmail,
    userAPassword,
    userBPassword,
    provider1Id,
    provider2Id,
    patient1Id,
    patient2Id,
    appointment1Id,
    appointment2Id,
    invoice1Id,
    invoice2Id,
    invoiceLine1Id: invoiceLine1.id as string,
    invoiceLine2Id: invoiceLine2.id as string,
    audit1Id: audit1.id as string,
    audit2Id: audit2.id as string,
  };
}

async function cleanupData(ctx: TestContext, service: SupabaseClient) {
  await pgClient`DELETE FROM invoice_lines WHERE id IN (${ctx.invoiceLine1Id}, ${ctx.invoiceLine2Id})`;
  await pgClient`DELETE FROM invoices WHERE id IN (${ctx.invoice1Id}, ${ctx.invoice2Id})`;
  await pgClient`DELETE FROM appointments WHERE id IN (${ctx.appointment1Id}, ${ctx.appointment2Id})`;
  await pgClient`DELETE FROM audit_logs WHERE id IN (${ctx.audit1Id}, ${ctx.audit2Id})`;
  await pgClient`DELETE FROM patients WHERE id IN (${ctx.patient1Id}, ${ctx.patient2Id})`;
  await pgClient`DELETE FROM services WHERE organization_id IN (${ctx.org1Id}, ${ctx.org2Id})`;
  await pgClient`DELETE FROM provider_profiles WHERE id IN (${ctx.provider1Id}, ${ctx.provider2Id})`;
  await pgClient`DELETE FROM users WHERE id IN (${ctx.userAId}, ${ctx.userBId})`;
  await pgClient`DELETE FROM organizations WHERE id IN (${ctx.org1Id}, ${ctx.org2Id})`;

  await service.auth.admin.deleteUser(ctx.userAId);
  await service.auth.admin.deleteUser(ctx.userBId);
}

async function signInAnon(email: string, password: string): Promise<SupabaseClient> {
  const client = makeAnonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Sign in failed for ${email}: ${error.message}`);
  }
  return client;
}

async function main() {
  console.log("=== K-14 Smoke Test: RLS Policies ===\n");
  let passed = 0;
  let failed = 0;

  const service = makeServiceClient();
  let ctx: TestContext | null = null;

  try {
    ctx = await setupData(service);
    const context = ctx;

    const anonNoSession = makeAnonClient();
    const userAClient = await signInAnon(context.userAEmail, context.userAPassword);
    const userBClient = await signInAnon(context.userBEmail, context.userBPassword);

    // 1) User A: patients only org1
    try {
      const { data, error } = await userAClient
        .from("patients")
        .select("id, organization_id");
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) throw new Error("Expected user A to see at least org1 patients");
      if (rows.some((r) => r.organization_id !== context.org1Id)) {
        throw new Error("User A can see cross-org patients");
      }
      if (!rows.some((r) => r.id === context.patient1Id)) {
        throw new Error("User A cannot see own org patient");
      }
      console.log("✅ 1. User A sees only Org 1 patients");
      passed++;
    } catch (e) {
      console.log("❌ 1.", (e as Error).message);
      failed++;
    }

    // 2) User A direct query for org2 patient by id
    try {
      const { data, error } = await userAClient
        .from("patients")
        .select("id")
        .eq("id", context.patient2Id);
      if (error) throw error;
      if ((data ?? []).length !== 0) {
        throw new Error("Expected empty rows for cross-org patient lookup");
      }
      console.log("✅ 2. User A cannot fetch Org 2 patient by id");
      passed++;
    } catch (e) {
      console.log("❌ 2.", (e as Error).message);
      failed++;
    }

    // 3) User B appointments only org2
    try {
      const { data, error } = await userBClient
        .from("appointments")
        .select("id, organization_id");
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) throw new Error("Expected user B to see org2 appointments");
      if (rows.some((r) => r.organization_id !== context.org2Id)) {
        throw new Error("User B can see cross-org appointments");
      }
      if (!rows.some((r) => r.id === context.appointment2Id)) {
        throw new Error("User B cannot see own org appointment");
      }
      console.log("✅ 3. User B sees only Org 2 appointments");
      passed++;
    } catch (e) {
      console.log("❌ 3.", (e as Error).message);
      failed++;
    }

    // 4) Unauthenticated sees 0 patients
    try {
      const { data, error } = await anonNoSession.from("patients").select("id");
      if (error) throw error;
      if ((data ?? []).length !== 0) {
        throw new Error("Expected unauthenticated query to return 0 rows");
      }
      console.log("✅ 4. Unauthenticated access is blocked");
      passed++;
    } catch (e) {
      console.log("❌ 4.", (e as Error).message);
      failed++;
    }

    // 5) User A invoices only org1
    try {
      const { data, error } = await userAClient
        .from("invoices")
        .select("id, organization_id");
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) throw new Error("Expected user A to see org1 invoices");
      if (rows.some((r) => r.organization_id !== context.org1Id)) {
        throw new Error("User A can see cross-org invoices");
      }
      if (!rows.some((r) => r.id === context.invoice1Id)) {
        throw new Error("User A cannot see own org invoice");
      }
      console.log("✅ 5. User A sees only Org 1 invoices");
      passed++;
    } catch (e) {
      console.log("❌ 5.", (e as Error).message);
      failed++;
    }

    // 6) User A invoice lines only for org1 invoices
    try {
      const { data, error } = await userAClient
        .from("invoice_lines")
        .select("id, invoice_id");
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) throw new Error("Expected invoice lines for org1");
      const allowed = new Set([context.invoice1Id]);
      if (rows.some((r) => !allowed.has(r.invoice_id))) {
        throw new Error("User A can see invoice lines from other orgs");
      }
      console.log("✅ 6. User A sees only Org 1 invoice lines");
      passed++;
    } catch (e) {
      console.log("❌ 6.", (e as Error).message);
      failed++;
    }

    // 7) User A audit logs only org1
    try {
      const { data, error } = await userAClient
        .from("audit_logs")
        .select("id, organization_id");
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) throw new Error("Expected audit logs for org1");
      if (rows.some((r) => r.organization_id !== context.org1Id)) {
        throw new Error("User A can see cross-org audit logs");
      }
      console.log("✅ 7. User A sees only Org 1 audit logs");
      passed++;
    } catch (e) {
      console.log("❌ 7.", (e as Error).message);
      failed++;
    }

    // 8) current_user_org_id() should match auth user org
    try {
      const { data, error } = await userAClient.rpc("current_user_org_id");
      if (error) throw error;
      if (data !== context.org1Id) {
        throw new Error(`Expected ${context.org1Id}, got ${String(data)}`);
      }
      console.log("✅ 8. current_user_org_id() returns correct org");
      passed++;
    } catch (e) {
      console.log("❌ 8.", (e as Error).message);
      failed++;
    }

    // 9) Service role bypass sees both org records
    try {
      const { data, error } = await service
        .from("patients")
        .select("id, organization_id")
        .in("id", [context.patient1Id, context.patient2Id]);
      if (error) throw error;
      const rows = data ?? [];
      const orgs = new Set(rows.map((r) => r.organization_id));
      if (!orgs.has(context.org1Id) || !orgs.has(context.org2Id)) {
        throw new Error("Service role did not bypass RLS as expected");
      }
      console.log("✅ 9. Service role bypass confirmed");
      passed++;
    } catch (e) {
      console.log("❌ 9.", (e as Error).message);
      failed++;
    }
  } catch (e) {
    console.log("❌ Setup/Global failure:", (e as Error).message);
    failed++;
  } finally {
    if (ctx) {
      try {
        await cleanupData(ctx, service);
      } catch (e) {
        console.error("Cleanup failed:", e);
      }
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
