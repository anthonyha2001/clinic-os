import "dotenv/config";
import { pgClient } from "./index";
import { onAppointmentCompleted } from "../lib/services/appointments/onCompleted";

type ServiceRow = {
  id: string;
  price: string;
  name_en: string;
  name_fr: string;
  name_ar: string;
};

function isPgUndefinedTable(error: unknown): boolean {
  const err = error as { code?: string };
  return err?.code === "42P01";
}

async function ensureInvoicesTableForTest(): Promise<void> {
  await pgClient`
    CREATE TABLE IF NOT EXISTS invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid,
      appointment_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

async function ensurePlanItemsTableForTest(): Promise<void> {
  await pgClient`
    CREATE TABLE IF NOT EXISTS plan_items (
      id uuid PRIMARY KEY,
      organization_id uuid,
      unit_price numeric(10, 2)
    )
  `;
}

async function createCompletedAppointment(params: {
  orgId: string;
  userId: string;
  patientId: string;
  providerId: string;
  service: ServiceRow;
  startTime: string;
  endTime: string;
  planItemId?: string | null;
}): Promise<string> {
  const [appt] = await pgClient`
    INSERT INTO appointments (
      organization_id,
      patient_id,
      provider_id,
      start_time,
      end_time,
      status,
      notes,
      created_by
    )
    VALUES (
      ${params.orgId},
      ${params.patientId},
      ${params.providerId},
      ${params.startTime}::timestamptz,
      ${params.endTime}::timestamptz,
      'completed',
      'S-05 test appointment',
      ${params.userId}
    )
    RETURNING id
  `;

  await pgClient`
    INSERT INTO appointment_lines (
      appointment_id,
      organization_id,
      service_id,
      plan_item_id,
      quantity,
      unit_price,
      duration_minutes,
      sequence_order
    )
    VALUES (
      ${appt.id},
      ${params.orgId},
      ${params.service.id},
      ${params.planItemId ?? null},
      1,
      ${params.service.price},
      30,
      1
    )
  `;

  return appt.id as string;
}

async function run() {
  console.log("=== S-05 Smoke Test (service-level) ===\n");

  let passed = 0;
  let failed = 0;

  const appointmentIds: string[] = [];
  const planItemIds: string[] = [];

  const [user] = await pgClient`
    SELECT id, organization_id FROM users LIMIT 1
  `;
  if (!user) {
    console.log("SKIP: No users found.");
    process.exit(1);
  }

  const orgId = user.organization_id as string;
  const userId = user.id as string;

  const [provider] = await pgClient`
    SELECT id FROM provider_profiles
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  if (!provider) {
    console.log("SKIP: No provider found.");
    process.exit(1);
  }

  const [patient] = await pgClient`
    SELECT id FROM patients
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  if (!patient) {
    console.log("SKIP: No patient found.");
    process.exit(1);
  }

  const [service] = await pgClient`
    SELECT id, price, name_en, name_fr, name_ar
    FROM services
    WHERE organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (!service) {
    console.log("SKIP: No active service found.");
    process.exit(1);
  }

  await ensureInvoicesTableForTest();
  await ensurePlanItemsTableForTest();

  // 1) Base completed appointment -> returns invoice payload
  let baseAppointmentId: string | null = null;
  try {
    baseAppointmentId = await createCompletedAppointment({
      orgId,
      userId,
      patientId: patient.id,
      providerId: provider.id,
      service: service as ServiceRow,
      startTime: "2026-03-10T09:00:00.000Z",
      endTime: "2026-03-10T09:30:00.000Z",
    });
    appointmentIds.push(baseAppointmentId);

    const result = await onAppointmentCompleted(baseAppointmentId);

    if (!result.invoicePayload) {
      throw new Error("Expected invoice payload, got null");
    }
    if (result.invoicePayload.patientId !== patient.id) {
      throw new Error("Wrong patientId in payload");
    }
    if (result.invoicePayload.lines.length !== 1) {
      throw new Error("Expected one invoice line");
    }
    if (result.invoicePayload.lines[0].serviceId !== service.id) {
      throw new Error("Wrong serviceId in invoice line");
    }
    if (!(result.invoicePayload.lines[0].unitPrice > 0)) {
      throw new Error("unitPrice must be > 0");
    }

    console.log("✅ 1. onAppointmentCompleted returns invoice payload");
    passed++;
  } catch (error) {
    console.log("❌ 1.", (error as Error).message);
    failed++;
  }

  // 2) Idempotency: second call should skip if invoice already exists
  try {
    if (!baseAppointmentId) {
      throw new Error("Missing base appointment");
    }

    await pgClient`
      INSERT INTO invoices (organization_id, appointment_id)
      VALUES (${orgId}, ${baseAppointmentId})
    `;

    const warnings: string[] = [];
    const originalWarn = console.warn;
    let second: Awaited<ReturnType<typeof onAppointmentCompleted>> | null = null;
    try {
      console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(" "));
        originalWarn(...args);
      };
      second = await onAppointmentCompleted(baseAppointmentId);
    } finally {
      console.warn = originalWarn;
    }

    if (!second) {
      throw new Error("Missing second-call result");
    }
    if (second.invoicePayload !== null) {
      throw new Error("Expected invoicePayload=null on idempotent call");
    }
    if (!warnings.some((w) => w.includes("invoice already exists"))) {
      throw new Error("Expected idempotency warning log");
    }

    console.log("✅ 2. idempotency guard skips double-billing");
    passed++;
  } catch (error) {
    console.log("❌ 2.", (error as Error).message);
    failed++;
  }

  // 3) Plan-linked appointment triggers plan callback and includes planItemId
  try {
    const [planItem] = await pgClient`
      INSERT INTO plan_items (id, organization_id, unit_price)
      VALUES (gen_random_uuid(), ${orgId}, 25.00)
      RETURNING id
    `;
    const planItemId = planItem.id as string;
    planItemIds.push(planItemId);

    const planAppointmentId = await createCompletedAppointment({
      orgId,
      userId,
      patientId: patient.id,
      providerId: provider.id,
      service: service as ServiceRow,
      startTime: "2026-03-11T09:00:00.000Z",
      endTime: "2026-03-11T09:30:00.000Z",
      planItemId,
    });
    appointmentIds.push(planAppointmentId);

    const logs: string[] = [];
    const originalLog = console.log;
    let result: Awaited<ReturnType<typeof onAppointmentCompleted>> | null = null;
    try {
      console.log = (...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
        originalLog(...args);
      };
      result = await onAppointmentCompleted(planAppointmentId);
    } finally {
      console.log = originalLog;
    }

    if (!result) {
      throw new Error("Missing plan-linked result");
    }
    if (!result.planUpdated) {
      throw new Error("Expected planUpdated=true");
    }
    if (!result.invoicePayload) {
      throw new Error("Expected invoicePayload for plan-linked appointment");
    }
    if (result.invoicePayload.lines[0].planItemId !== planItemId) {
      throw new Error("Expected planItemId in invoice line");
    }
    if (!logs.some((l) => l.includes("Plan session completed stub:"))) {
      throw new Error("Expected onPlanSessionCompleted stub log");
    }

    console.log("✅ 3. plan-linked appointment calls plan stub and sets line.planItemId");
    passed++;
  } catch (error) {
    console.log("❌ 3.", (error as Error).message);
    failed++;
  }

  // 4) Non-existent appointment -> 404-style error
  try {
    await onAppointmentCompleted("00000000-0000-0000-0000-000000000099");
    throw new Error("Expected 404-style error");
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    if (err.statusCode === 404) {
      console.log("✅ 4. non-existent appointment throws 404-style error");
      passed++;
    } else {
      console.log("❌ 4. wrong error:", err.message);
      failed++;
    }
  }

  // Cleanup
  try {
    for (const appointmentId of appointmentIds) {
      await pgClient`
        DELETE FROM appointment_status_history
        WHERE appointment_id = ${appointmentId}
      `;
      await pgClient`
        DELETE FROM appointment_lines
        WHERE appointment_id = ${appointmentId}
      `;
      await pgClient`
        DELETE FROM appointments
        WHERE id = ${appointmentId}
      `;
      await pgClient`
        DELETE FROM invoices
        WHERE appointment_id = ${appointmentId}
      `;
    }

    for (const planItemId of planItemIds) {
      await pgClient`
        DELETE FROM plan_items
        WHERE id = ${planItemId}
      `;
    }
  } catch (error: unknown) {
    if (!isPgUndefinedTable(error)) {
      console.log("Cleanup warning:", (error as Error).message);
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
