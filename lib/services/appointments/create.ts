import { pgClient } from "@/db/index";
import type { CreateAppointment } from "@/lib/validations/appointment";
import { checkDepositRequired } from "@/lib/services/noshow/checkDeposit";

export interface ResolvedLine {
  service_id: string;
  plan_item_id: string | null;
  quantity: number;
  unit_price: string;
  duration_minutes: number;
  notes: string | null;
}

export interface CreatedAppointment {
  id: string;
  organization_id: string;
  patient_id: string;
  provider_id: string;
  plan_item_id: string | null;
  start_time: Date;
  end_time: Date;
  status: string;
  notes: string | null;
  deposit_required: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  lines: Array<{
    id: string;
    appointment_id: string;
    organization_id: string;
    service_id: string;
    plan_item_id: string | null;
    quantity: number;
    unit_price: string;
    duration_minutes: number;
    notes: string | null;
    sequence_order: number;
    created_at: Date;
  }>;
}

function err404(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 404;
  throw e;
}

function err422(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 422;
  throw e;
}

function err409(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 409;
  throw e;
}

export async function createAppointment(
  input: CreateAppointment,
  userId: string,
  orgId: string
): Promise<CreatedAppointment> {
  // 1. Belt check — lines non-empty (Zod already validates)
  if (!input.lines || input.lines.length === 0) {
    err422("At least one service line is required");
  }

  // 2. Resolve each line: fetch service, snapshot price/duration
  const resolvedLines: ResolvedLine[] = [];
  for (const line of input.lines) {
    const [service] = await pgClient`
      SELECT id, price, default_duration_minutes
      FROM services
      WHERE id = ${line.service_id}
        AND organization_id = ${orgId}
        AND is_active = true
    `;
    if (!service) {
      err404("Service not found or inactive");
    }

    const unit_price = line.unit_price_override != null
      ? String(line.unit_price_override)
      : String(service.price);
    const duration_minutes = line.duration_override ?? Number(service.default_duration_minutes);

    if (line.quantity < 1 || duration_minutes < 1) {
      err422("Quantity and duration must be at least 1");
    }

    if (line.plan_item_id) {
      const [planItem] = await pgClient`
        SELECT id, plan_id, quantity_completed, quantity_total
        FROM plan_items
        WHERE id = ${line.plan_item_id}
        LIMIT 1
      `;
      if (!planItem) {
        err404("Plan item not found");
      }

      const [plan] = await pgClient`
        SELECT id, patient_id, status, organization_id
        FROM plans
        WHERE id = ${planItem.plan_id}
        LIMIT 1
      `;
      if (!plan) {
        err404("Plan not found");
      }
      if (plan.organization_id !== orgId) {
        err404("Plan item not found");
      }
      if (plan.patient_id !== input.patient_id) {
        err422("Plan item does not belong to this patient");
      }
      if (!["accepted", "in_progress"].includes(plan.status as string)) {
        err422("Plan is not active");
      }
      if (Number(planItem.quantity_completed) >= Number(planItem.quantity_total)) {
        err422("Plan item is fully completed");
      }
    }

    resolvedLines.push({
      service_id: line.service_id,
      plan_item_id: line.plan_item_id ?? null,
      quantity: line.quantity,
      unit_price,
      duration_minutes,
      notes: line.notes ?? null,
    });
  }

  // 3. Compute total duration and validate bounds
  const totalDurationMinutes = resolvedLines.reduce(
    (sum, line) => sum + line.duration_minutes * line.quantity,
    0
  );
  if (totalDurationMinutes < 5) {
    err422("Total duration must be at least 5 minutes");
  }
  if (totalDurationMinutes > 720) {
    err422("Total duration exceeds maximum of 12 hours");
  }

  // 4. Compute end_time
  const startDate = new Date(input.start_time);
  const endDate = new Date(startDate.getTime() + totalDurationMinutes * 60 * 1000);
  const startTimeIso = startDate.toISOString();
  const endTimeIso = endDate.toISOString();

  // 5. Validate patient exists
  const [patient] = await pgClient`
    SELECT id FROM patients
    WHERE id = ${input.patient_id}
      AND organization_id = ${orgId}
      AND is_active = true
  `;
  if (!patient) {
    err404("Patient not found");
  }

  // 6. Validate provider exists and is accepting appointments
  const [provider] = await pgClient`
    SELECT id FROM provider_profiles
    WHERE id = ${input.provider_id}
      AND organization_id = ${orgId}
      AND is_accepting_appointments = true
  `;
  if (!provider) {
    err404("Provider not found or not accepting appointments");
  }

  // 7. Application-level overlap check
  const [overlap] = await pgClient`
    SELECT id FROM appointments
    WHERE organization_id = ${orgId}
      AND provider_id = ${input.provider_id}
      AND status NOT IN ('canceled', 'no_show')
      AND tstzrange(start_time, end_time, '[)') && tstzrange(${startTimeIso}::timestamptz, ${endTimeIso}::timestamptz, '[)')
    LIMIT 1
  `;
  if (overlap) {
    err409("Provider has a conflicting appointment");
  }

  const depositRequired = await checkDepositRequired(input.patient_id, orgId);

  // 8. Single transaction: insert appointment, lines, history
  try {
    const linkedPlanItemIds = Array.from(
      new Set(
        resolvedLines
          .map((line) => line.plan_item_id)
          .filter((v): v is string => v != null)
      )
    );
    if (linkedPlanItemIds.length > 1) {
      err422("Only one plan item can be linked per appointment");
    }
    const appointmentPlanItemId = linkedPlanItemIds[0] ?? null;

    const result = await pgClient.begin(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sql = tx as any;
      const [appt] = await sql`
        INSERT INTO appointments (
          organization_id, patient_id, provider_id, start_time, end_time,
          status, notes, deposit_required, created_by, plan_item_id
        )
        VALUES (
          ${orgId}, ${input.patient_id}, ${input.provider_id},
          ${startTimeIso}::timestamptz, ${endTimeIso}::timestamptz,
          'scheduled', ${input.notes ?? null}, ${depositRequired}, ${userId}, ${appointmentPlanItemId}
        )
        RETURNING *
      `;

      const createdLines: NonNullable<CreatedAppointment["lines"]>[number][] = [];
      for (let i = 0; i < resolvedLines.length; i++) {
        const line = resolvedLines[i];
        const [inserted] = await sql`
          INSERT INTO appointment_lines (
            appointment_id, organization_id, service_id, plan_item_id,
            quantity, unit_price, duration_minutes, notes, sequence_order
          )
          VALUES (
            ${appt.id}, ${orgId}, ${line.service_id}, ${line.plan_item_id},
            ${line.quantity}, ${line.unit_price}, ${line.duration_minutes},
            ${line.notes}, ${i + 1}
          )
          RETURNING *
        `;
        createdLines.push(inserted as NonNullable<CreatedAppointment["lines"]>[number]);
      }

      await sql`
        INSERT INTO appointment_status_history (
          appointment_id, old_status, new_status, changed_by
        )
        VALUES (${appt.id}, null, 'scheduled', ${userId})
      `;

      return {
        ...appt,
        lines: createdLines,
      } as CreatedAppointment;
    });

    return result;
  } catch (e: unknown) {
    const err = e as Error;
    const msg = err.message ?? "";
    if (
      msg.toLowerCase().includes("no_double_booking") ||
      msg.toLowerCase().includes("exclusion") ||
      msg.toLowerCase().includes("exclude")
    ) {
      err409("Provider has a conflicting appointment (constraint)");
    }
    throw e;
  }
}
