import { pgClient } from "@/db/index";

function err404(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 404;
  throw e;
}

export interface GetInvoiceInput {
  invoiceId: string;
  orgId: string;
}

export async function getInvoice(input: GetInvoiceInput) {
  const { invoiceId, orgId } = input;

  const [invoice] = await pgClient`
    SELECT
      i.*,
      p.id AS patient_id_ref,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.phone AS patient_phone,
      u.full_name AS discount_approved_by_name,
      a.id AS appointment_id_ref,
      a.start_time AS appointment_start_time,
      pu.full_name AS appointment_provider_name
    FROM invoices i
    JOIN patients p ON p.id = i.patient_id
    LEFT JOIN users u ON u.id = i.discount_approved_by
    LEFT JOIN appointments a ON a.id = i.appointment_id
    LEFT JOIN provider_profiles pp ON pp.id = a.provider_id
    LEFT JOIN users pu ON pu.id = pp.user_id
    WHERE i.id = ${invoiceId}
      AND i.organization_id = ${orgId}
    LIMIT 1
  `;
  if (!invoice) {
    err404("Invoice not found");
  }

  const lines = await pgClient`
    SELECT
      il.*,
      s.name_en AS service_name_en,
      s.name_fr AS service_name_fr,
      s.name_ar AS service_name_ar,
      pi.description_en AS plan_item_description_en,
      pi.description_fr AS plan_item_description_fr,
      pi.description_ar AS plan_item_description_ar
    FROM invoice_lines il
    LEFT JOIN services s ON s.id = il.service_id
    LEFT JOIN plan_items pi ON pi.id = il.plan_item_id
    WHERE il.invoice_id = ${invoiceId}
    ORDER BY il.created_at ASC
  `;

  const paymentRows = await pgClient`
    SELECT
      pa.id AS allocation_id,
      pa.amount AS allocation_amount,
      pa.created_at AS allocation_created_at,
      pay.id AS payment_id,
      pay.amount AS payment_amount,
      pay.reference_number,
      pay.created_at AS payment_created_at,
      pm.id AS payment_method_id,
      pm.type AS payment_method_type,
      pm.label_en AS payment_method_label_en
    FROM payment_allocations pa
    JOIN payments pay ON pay.id = pa.payment_id
    JOIN payment_methods pm ON pm.id = pay.payment_method_id
    WHERE pa.invoice_id = ${invoiceId}
    ORDER BY pa.created_at ASC
  `;

  const [sumRow] = await pgClient`
    SELECT COALESCE(SUM(amount), 0) AS amount_paid
    FROM payment_allocations
    WHERE invoice_id = ${invoiceId}
  `;
  const amountPaid = Number(sumRow.amount_paid ?? 0);
  const balanceDue = Number(invoice.total) - amountPaid;

  const payments = (paymentRows as unknown as Record<string, unknown>[]).map((row) => ({
    id: row.payment_id,
    created_at: row.payment_created_at,
    payment_method: {
      type: row.payment_method_type,
      label_en: row.payment_method_label_en,
    },
    reference_number: row.reference_number,
    amount: row.allocation_amount,
  }));

  return {
    ...invoice,
    lines,
    payments,
    patient: {
      id: invoice.patient_id_ref,
      first_name: invoice.patient_first_name,
      last_name: invoice.patient_last_name,
      phone: invoice.patient_phone,
    },
    appointment: invoice.appointment_id_ref
      ? {
          id: invoice.appointment_id_ref,
          start_time: invoice.appointment_start_time,
          provider_name: invoice.appointment_provider_name,
        }
      : null,
    discount: {
      discount_amount: invoice.discount_amount,
      discount_percent: invoice.discount_percent,
      discount_reason: invoice.discount_reason,
      approved_by_name: invoice.discount_approved_by_name,
    },
    balance_due: balanceDue,
  };
}
