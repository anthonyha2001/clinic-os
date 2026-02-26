import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";
import { createInvoice } from "@/lib/services/invoices/create";
import { listInvoices } from "@/lib/services/invoices/list";

const fromAppointmentSchema = z.object({
  appointment_id: z.string().uuid(),
  notes: z.string().optional(),
});

const manualLineSchema = z.object({
  service_id: z.string().uuid().optional(),
  plan_item_id: z.string().uuid().optional(),
  description_en: z.string().min(1).max(500),
  description_fr: z.string().min(1).max(500),
  description_ar: z.string().min(1).max(500),
  quantity: z.number().int().min(1),
  unit_price: z.number().gt(0),
});

const manualInvoiceSchema = z.object({
  patient_id: z.string().uuid(),
  notes: z.string().optional(),
  lines: z.array(manualLineSchema).min(1, "At least one invoice line is required"),
});

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

export const POST = withAuth(async (request, { user }) => {
  try {
    const body = await request.json();

    const isAppointmentMode = typeof body?.appointment_id === "string";
    if (isAppointmentMode) {
      const parsed = fromAppointmentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.issues },
          { status: 422 }
        );
      }

      const [appointment] = await pgClient`
        SELECT id, organization_id, patient_id, status
        FROM appointments
        WHERE id = ${parsed.data.appointment_id}
          AND organization_id = ${user.organizationId}
        LIMIT 1
      `;
      if (!appointment) {
        err404("Appointment not found");
      }
      if (appointment.status !== "completed") {
        err422("Appointment must be completed before invoicing");
      }

      const apptLines = await pgClient`
        SELECT
          al.service_id,
          al.plan_item_id,
          al.quantity,
          s.name_en,
          s.name_fr,
          s.name_ar,
          s.price AS service_price,
          pi.unit_price AS plan_unit_price,
          pi.quantity_completed,
          pi.quantity_total
        FROM appointment_lines al
        JOIN services s ON s.id = al.service_id
        LEFT JOIN plan_items pi ON pi.id = al.plan_item_id
        LEFT JOIN plans p ON p.id = pi.plan_id
        WHERE al.appointment_id = ${appointment.id}
          AND al.organization_id = ${user.organizationId}
          AND (p.id IS NULL OR p.organization_id = ${user.organizationId})
        ORDER BY al.sequence_order ASC
      `;
      if (apptLines.length === 0) {
        err422("Appointment has no billable lines");
      }

      const lines = apptLines.map((line) => {
        const isPlanLinked = line.plan_item_id != null;
        const sessionSuffixEn = isPlanLinked
          ? ` - Session ${line.quantity_completed}/${line.quantity_total}`
          : "";
        const sessionSuffixFr = isPlanLinked
          ? ` - Seance ${line.quantity_completed}/${line.quantity_total}`
          : "";
        const sessionSuffixAr = isPlanLinked
          ? ` - جلسة ${line.quantity_completed}/${line.quantity_total}`
          : "";

        return {
          serviceId: line.service_id as string,
          planItemId: (line.plan_item_id as string | null) ?? null,
          descriptionEn: `${line.name_en}${sessionSuffixEn}`,
          descriptionFr: `${line.name_fr}${sessionSuffixFr}`,
          descriptionAr: `${line.name_ar}${sessionSuffixAr}`,
          quantity: Number(line.quantity),
          unitPrice: Number(
            line.plan_item_id ? line.plan_unit_price ?? line.service_price : line.service_price
          ),
        };
      });

      const invoice = await createInvoice({
        orgId: user.organizationId,
        patientId: appointment.patient_id,
        appointmentId: appointment.id,
        createdBy: user.id,
        lines,
        notes: parsed.data.notes ?? null,
      });

      return NextResponse.json(invoice, { status: 201 });
    }

    const parsed = manualInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const [patient] = await pgClient`
      SELECT id
      FROM patients
      WHERE id = ${parsed.data.patient_id}
        AND organization_id = ${user.organizationId}
      LIMIT 1
    `;
    if (!patient) {
      err404("Patient not found");
    }

    for (const line of parsed.data.lines) {
      if (line.service_id) {
        const [service] = await pgClient`
          SELECT id
          FROM services
          WHERE id = ${line.service_id}
            AND organization_id = ${user.organizationId}
          LIMIT 1
        `;
        if (!service) {
          err404("Service not found");
        }
      }
      if (line.plan_item_id) {
        const [planItem] = await pgClient`
          SELECT pi.id
          FROM plan_items pi
          JOIN plans p ON p.id = pi.plan_id
          WHERE pi.id = ${line.plan_item_id}
            AND p.organization_id = ${user.organizationId}
          LIMIT 1
        `;
        if (!planItem) {
          err404("Plan item not found");
        }
      }
    }

    const invoice = await createInvoice({
      orgId: user.organizationId,
      patientId: parsed.data.patient_id,
      createdBy: user.id,
      notes: parsed.data.notes ?? null,
      lines: parsed.data.lines.map((line) => ({
        serviceId: line.service_id ?? null,
        planItemId: line.plan_item_id ?? null,
        descriptionEn: line.description_en,
        descriptionFr: line.description_fr,
        descriptionAr: line.description_ar,
        quantity: line.quantity,
        unitPrice: line.unit_price,
      })),
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;

    if (statusCode === 404) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (statusCode === 409) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (statusCode === 422) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }

    console.error("POST /api/invoices error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

const invoiceListQuerySchema = z.object({
  patient_id: z.string().uuid().optional(),
  status: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  provider_id: z.string().uuid().optional(),
});

export const GET = withAuth(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = invoiceListQuerySchema.safeParse({
      patient_id: searchParams.get("patient_id") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      start_date: searchParams.get("start_date") ?? undefined,
      end_date: searchParams.get("end_date") ?? undefined,
      provider_id: searchParams.get("provider_id") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const statusFilter = parsed.data.status
      ? parsed.data.status.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const rows = await listInvoices({
      orgId: user.organizationId,
      patientId: parsed.data.patient_id,
      status: statusFilter,
      startDate: parsed.data.start_date,
      endDate: parsed.data.end_date,
      providerId: parsed.data.provider_id,
    });

    const invoices = (rows as unknown as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      invoice_number: r.invoice_number,
      patient_id: r.patient_id,
      status: r.status,
      created_at: r.created_at,
      total: r.total,
      balance_due: r.balance_due,
      patient: {
        first_name: r.patient_first_name,
        last_name: r.patient_last_name,
        phone: r.patient_phone,
      },
      provider: r.provider_name
        ? { user: { full_name: r.provider_name }, full_name: r.provider_name }
        : undefined,
    }));

    return NextResponse.json(invoices);
  } catch (e: unknown) {
    console.error("GET /api/invoices error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
