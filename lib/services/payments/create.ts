import { pgClient } from "@/db/index";
import { validateAndAllocate, type AllocationInput } from "./allocate";
import { updateInvoiceStatus } from "@/lib/services/invoices/updateStatus";

export interface CreatePaymentInput {
  orgId: string;
  patientId: string;
  paymentMethodId: string;
  amount: number;
  referenceNumber?: string | null;
  notes?: string | null;
  receivedBy: string;
  allocations: AllocationInput[];
}

function err422(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 422;
  throw e;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function createPayment(input: CreatePaymentInput) {
  const {
    orgId,
    patientId,
    paymentMethodId,
    amount,
    referenceNumber,
    notes,
    receivedBy,
    allocations,
  } = input;

  const [paymentMethod] = await pgClient`
    SELECT id
    FROM payment_methods
    WHERE id = ${paymentMethodId}
      AND organization_id = ${orgId}
      AND is_active = true
    LIMIT 1
  `;
  if (!paymentMethod) {
    err422("Payment method is invalid or inactive");
  }

  const validatedAllocations = await validateAndAllocate({
    orgId,
    patientId,
    paymentAmount: amount,
    allocations,
    db: pgClient,
  });

  return pgClient.begin(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql = tx as any;

    const [payment] = await sql`
      INSERT INTO payments (
        organization_id,
        patient_id,
        payment_method_id,
        amount,
        reference_number,
        notes,
        received_by
      )
      VALUES (
        ${orgId},
        ${patientId},
        ${paymentMethodId},
        ${amount},
        ${referenceNumber ?? null},
        ${notes ?? null},
        ${receivedBy}
      )
      RETURNING *
    `;

    const insertedAllocations: unknown[] = [];
    const updatedInvoices: Array<{ invoiceId: string; status: string }> = [];

    for (const allocation of validatedAllocations) {
      const [inserted] = await sql`
        INSERT INTO payment_allocations (
          payment_id, invoice_id, amount
        )
        VALUES (
          ${payment.id},
          ${allocation.invoice_id},
          ${allocation.amount}
        )
        RETURNING *
      `;
      insertedAllocations.push(inserted);

      const [paidRow] = await sql`
        SELECT COALESCE(SUM(amount), 0) AS paid_amount
        FROM payment_allocations
        WHERE invoice_id = ${allocation.invoice_id}
      `;
      const totalPaid = round2(Number(paidRow.paid_amount ?? 0));
      const invoiceTotal = round2(allocation.invoice_total);

      const targetStatus = totalPaid >= invoiceTotal ? "paid" : "partially_paid";
      if (allocation.current_status !== targetStatus) {
        const updatedInvoice = await updateInvoiceStatus({
          invoiceId: allocation.invoice_id,
          orgId,
          newStatus: targetStatus,
          changedBy: receivedBy,
          isSystemTransition: true,
          tx: sql,
        });
        updatedInvoices.push({
          invoiceId: String(updatedInvoice.id),
          status: String(updatedInvoice.status),
        });
      } else {
        updatedInvoices.push({
          invoiceId: allocation.invoice_id,
          status: allocation.current_status,
        });
      }
    }

    return {
      ...payment,
      allocations: insertedAllocations,
      updatedInvoices,
    };
  });
}
