import { pgClient } from "@/db/index";
import { generateInvoiceNumber } from "./generateNumber";

export interface CreateInvoiceLineInput {
  serviceId?: string | null;
  planItemId?: string | null;
  descriptionEn: string;
  descriptionFr: string;
  descriptionAr: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateInvoiceInput {
  orgId: string;
  patientId: string;
  appointmentId?: string | null;
  createdBy: string;
  lines: CreateInvoiceLineInput[];
  notes?: string | null;
  autoIssue?: boolean; // if true, creates as 'issued' instead of 'draft'
}

function err404(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 404;
  throw e;
}

function err409(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 409;
  throw e;
}

function err422(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 422;
  throw e;
}

export async function createInvoice(input: CreateInvoiceInput) {
  const { orgId, patientId, appointmentId, createdBy, lines, notes, autoIssue = false } = input;

  if (!lines || lines.length === 0) {
    err422("At least one invoice line is required");
  }

  const invoiceStatus = autoIssue ? "issued" : "draft";
  const issuedAt = autoIssue ? new Date().toISOString() : null;

  try {
    return await pgClient.begin(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sql = tx as any;

      const [patient] = await sql`
        SELECT id
        FROM patients
        WHERE id = ${patientId}
          AND organization_id = ${orgId}
        LIMIT 1
      `;
      if (!patient) {
        err404("Patient not found");
      }

      if (appointmentId) {
        const [existing] = await sql`
          SELECT id
          FROM invoices
          WHERE appointment_id = ${appointmentId}
          LIMIT 1
        `;
        if (existing) {
          err409("Invoice already exists for this appointment");
        }

        const [appointment] = await sql`
          SELECT id, status, patient_id
          FROM appointments
          WHERE id = ${appointmentId}
            AND organization_id = ${orgId}
          LIMIT 1
        `;
        if (!appointment) {
          err404("Appointment not found");
        }
        if (appointment.status !== "completed") {
          err422("Appointment must be completed before invoicing");
        }
        if (appointment.patient_id !== patientId) {
          err422("Appointment does not belong to this patient");
        }
      }

      const normalizedLines: Array<
        CreateInvoiceLineInput & { lineTotal: number }
      > = [];
      for (const line of lines) {
        if (line.quantity < 1) {
          err422("Line quantity must be at least 1");
        }
        if (line.unitPrice <= 0) {
          err422("Line unit price must be greater than 0");
        }

        if (line.serviceId) {
          const [service] = await sql`
            SELECT id
            FROM services
            WHERE id = ${line.serviceId}
              AND organization_id = ${orgId}
            LIMIT 1
          `;
          if (!service) {
            err404("Service not found");
          }
        }

        if (line.planItemId) {
          const [planItem] = await sql`
            SELECT pi.id
            FROM plan_items pi
            JOIN plans p ON p.id = pi.plan_id
            WHERE pi.id = ${line.planItemId}
              AND p.organization_id = ${orgId}
            LIMIT 1
          `;
          if (!planItem) {
            err404("Plan item not found");
          }
        }

        normalizedLines.push({
          ...line,
          lineTotal: line.quantity * line.unitPrice,
        });
      }

      const subtotal = normalizedLines.reduce((sum, line) => sum + line.lineTotal, 0);
      const total = subtotal;
      const invoiceNumber = await generateInvoiceNumber(orgId, sql);

      const [invoice] = await sql`
        INSERT INTO invoices (
          organization_id,
          patient_id,
          appointment_id,
          invoice_number,
          status,
          subtotal,
          discount_amount,
          total,
          notes,
          created_by,
          issued_at
        )
        VALUES (
          ${orgId},
          ${patientId},
          ${appointmentId ?? null},
          ${invoiceNumber},
          ${invoiceStatus},
          ${subtotal},
          0,
          ${total},
          ${notes ?? null},
          ${createdBy},
          ${issuedAt}
        )
        RETURNING *
      `;

      const insertedLines: unknown[] = [];
      for (const line of normalizedLines) {
        const [inserted] = await sql`
          INSERT INTO invoice_lines (
            invoice_id,
            service_id,
            plan_item_id,
            description_en,
            description_fr,
            description_ar,
            quantity,
            unit_price,
            line_total
          )
          VALUES (
            ${invoice.id},
            ${line.serviceId ?? null},
            ${line.planItemId ?? null},
            ${line.descriptionEn},
            ${line.descriptionFr},
            ${line.descriptionAr},
            ${line.quantity},
            ${line.unitPrice},
            ${line.lineTotal}
          )
          RETURNING *
        `;
        insertedLines.push(inserted);
      }

      return {
        ...invoice,
        lines: insertedLines,
      };
    });
  } catch (e: unknown) {
    const err = e as { code?: string; constraint?: string };
    if (err.code === "23505" && err.constraint === "invoices_appointment_id_unique") {
      err409("Invoice already exists for this appointment");
    }
    throw e;
  }
}