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

  const rows = await pgClient`
    SELECT
      a.id AS appointment_id,
      a.organization_id,
      a.patient_id,
      a.provider_id,
      a.created_by,
      al.service_id,
      al.plan_item_id,
      al.unit_price AS line_unit_price,
      al.quantity,
      s.price AS service_price,
      s.name_en,
      s.name_fr,
      s.name_ar
    FROM appointments a
    JOIN appointment_lines al ON al.appointment_id = a.id
    JOIN services s ON s.id = al.service_id
    WHERE a.id = ${appointmentId}
    ORDER BY al.sequence_order ASC
  `;

  if (!rows || rows.length === 0) {
    err404("Appointment lines not found");
  }

  const firstRow = rows[0] as Record<string, unknown>;

  // Only call onPlanSessionCompleted once, for the first plan-linked line (if any)
  let planUpdated = false;
  const planLinkedLine = rows.find((r) => (r as Record<string, unknown>).plan_item_id != null);
  if (planLinkedLine) {
    await onPlanSessionCompleted(
      planLinkedLine.plan_item_id as string,
      appointmentId
    );
    planUpdated = true;
  }

  // Batch fetch plan item prices for plan-linked lines
  const planItemIds = Array.from(
    new Set(
      (rows as Record<string, unknown>[])
        .filter((r) => r.plan_item_id != null)
        .map((r) => r.plan_item_id as string)
    )
  );
  const planPrices: Record<string, number> = {};
  if (planItemIds.length > 0) {
    try {
      const planRows = await pgClient`
        SELECT id, unit_price FROM plan_items
        WHERE id = ANY(${planItemIds})
      `;
      for (const pr of planRows as unknown as { id: string; unit_price: unknown }[]) {
        if (pr.unit_price != null) {
          planPrices[pr.id] = Number(pr.unit_price);
        }
      }
    } catch {
      // plan_items table may not exist in older schemas; fallback to line price
    }
  }

  const lines: AppointmentInvoiceLinePayload[] = rows.map((row) => {
    const r = row as Record<string, unknown>;
    const planItemId = r.plan_item_id as string | null;
    const basePrice = Number(r.service_price ?? r.line_unit_price ?? 0);
    const unitPrice =
      planItemId && planPrices[planItemId] != null ? planPrices[planItemId] : basePrice;
    return {
      serviceId: r.service_id as string,
      planItemId,
      quantity: Number(r.quantity ?? 1),
      unitPrice,
      descriptionEn: planItemId
        ? `${r.name_en ?? ""} (Plan session)`
        : String(r.name_en ?? ""),
      descriptionFr: planItemId
        ? `${r.name_fr ?? ""} (Séance plan)`
        : String(r.name_fr ?? ""),
      descriptionAr: planItemId
        ? `${r.name_ar ?? ""} (جلسة خطة)`
        : String(r.name_ar ?? ""),
    };
  });

  const invoicePayload: AppointmentInvoicePayload = {
    appointmentId: firstRow.appointment_id as string,
    patientId: firstRow.patient_id as string,
    providerId: firstRow.provider_id as string,
    createdBy: firstRow.created_by as string,
    orgId: firstRow.organization_id as string,
    lines,
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
    autoIssue: true, // appointment-completion invoices are immediately issued
  });

  return { invoicePayload, planUpdated };
}