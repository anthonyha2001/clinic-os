import { pgClient } from "@/db/index";
import { onPlanSessionCompleted } from "@/lib/services/plans/onSessionCompleted";
import { createInvoice } from "@/lib/services/invoices/create";

export interface AppointmentInvoiceLinePayload {
  serviceId: string;
  planItemId: string | null;
  quantity: number;
  unitPrice: number;
  descriptionEn: string;
  descriptionFr: string;
  descriptionAr: string;
}

export interface AppointmentInvoicePayload {
  appointmentId: string;
  patientId: string;
  providerId: string;
  createdBy: string;
  orgId: string;
  lines: AppointmentInvoiceLinePayload[];
}

export interface OnAppointmentCompletedResult {
  invoicePayload: AppointmentInvoicePayload | null;
  planUpdated: boolean;
}

function err404(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 404;
  throw e;
}

export async function onAppointmentCompleted(
  appointmentId: string
): Promise<OnAppointmentCompletedResult> {
  const [existing] = await pgClient`
    SELECT id
    FROM appointments
    WHERE id = ${appointmentId}
    LIMIT 1
  `;

  if (!existing) {
    err404("Appointment not found");
  }

  // Idempotency: skip invoice generation if one already exists.
  try {
    const [invoice] = await pgClient`
      SELECT id
      FROM invoices
      WHERE appointment_id = ${appointmentId}
      LIMIT 1
    `;
    if (invoice) {
      console.warn(
        `[onAppointmentCompleted] invoice already exists for appointment ${appointmentId}; skipping`
      );
      return { invoicePayload: null, planUpdated: false };
    }
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    // B-02 may not have created the invoices table yet.
    if (err.code !== "42P01") {
      throw error;
    }
  }

  const [row] = await pgClient`
    SELECT
      a.id AS appointment_id,
      a.organization_id,
      a.patient_id,
      a.provider_id,
      a.created_by,
      al.service_id,
      al.plan_item_id,
      al.unit_price AS line_unit_price,
      s.price AS service_price,
      s.name_en,
      s.name_fr,
      s.name_ar
    FROM appointments a
    JOIN appointment_lines al ON al.appointment_id = a.id
    JOIN services s ON s.id = al.service_id
    WHERE a.id = ${appointmentId}
    ORDER BY al.sequence_order ASC
    LIMIT 1
  `;

  if (!row) {
    err404("Appointment line not found");
  }

  let planUpdated = false;
  const planItemId = row.plan_item_id as string | null;

  if (planItemId) {
    await onPlanSessionCompleted(planItemId, appointmentId);
    planUpdated = true;
  }

  let unitPrice = Number(row.service_price ?? row.line_unit_price ?? 0);
  if (planItemId) {
    // T-03/B-02 schemas may add this table later; fallback to line/service price.
    try {
      const [planItem] = await pgClient`
        SELECT unit_price
        FROM plan_items
        WHERE id = ${planItemId}
        LIMIT 1
      `;
      if (planItem?.unit_price != null) {
        unitPrice = Number(planItem.unit_price);
      }
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code !== "42P01") {
        throw error;
      }
    }
  }

  const line: AppointmentInvoiceLinePayload = {
    serviceId: row.service_id,
    planItemId,
    quantity: 1,
    unitPrice,
    descriptionEn: planItemId ? `${row.name_en} (Plan session)` : row.name_en,
    descriptionFr: planItemId ? `${row.name_fr} (Séance plan)` : row.name_fr,
    descriptionAr: planItemId ? `${row.name_ar} (جلسة خطة)` : row.name_ar,
  };

  const invoicePayload: AppointmentInvoicePayload = {
    appointmentId: row.appointment_id,
    patientId: row.patient_id,
    providerId: row.provider_id,
    createdBy: row.created_by,
    orgId: row.organization_id,
    lines: [line],
  };

  await createInvoice({
    orgId: invoicePayload.orgId,
    patientId: invoicePayload.patientId,
    appointmentId: invoicePayload.appointmentId,
    createdBy: invoicePayload.createdBy,
    lines: invoicePayload.lines.map((l) => ({
      serviceId: l.serviceId,
      planItemId: l.planItemId,
      descriptionEn: l.descriptionEn,
      descriptionFr: l.descriptionFr,
      descriptionAr: l.descriptionAr,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    })),
  });

  return { invoicePayload, planUpdated };
}
