import { pgClient } from "@/db/index";

export interface AllocationInput {
  invoice_id: string;
  amount: number;
}

export interface ValidateAndAllocateInput {
  orgId: string;
  patientId: string;
  paymentAmount: number;
  allocations: AllocationInput[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db?: any;
}

export interface EnrichedAllocation extends AllocationInput {
  invoice_number: string;
  invoice_total: number;
  currently_paid: number;
  remaining_balance: number;
  new_remaining_balance: number;
  current_status: string;
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function validateAndAllocate(
  input: ValidateAndAllocateInput
): Promise<EnrichedAllocation[]> {
  const { orgId, patientId, paymentAmount, allocations, db } = input;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql = (db as any) ?? pgClient;

  if (!allocations || allocations.length === 0) {
    err422("At least one allocation is required");
  }

  const allocationSum = round2(
    allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0)
  );
  const paymentAmountRounded = round2(Number(paymentAmount));
  if (allocationSum !== paymentAmountRounded) {
    err422("Allocation amounts must equal payment amount");
  }

  const enriched: EnrichedAllocation[] = [];
  for (const allocation of allocations) {
    const allocationAmount = round2(Number(allocation.amount));
    const [invoice] = await sql`
      SELECT id, invoice_number, status, total
      FROM invoices
      WHERE id = ${allocation.invoice_id}
        AND organization_id = ${orgId}
        AND patient_id = ${patientId}
      LIMIT 1
    `;
    if (!invoice) {
      err404("Invoice not found");
    }

    const status = String(invoice.status);
    if (status === "voided" || status === "draft") {
      err422(`Cannot allocate to a ${status} invoice`);
    }

    const [paidRow] = await sql`
      SELECT COALESCE(SUM(amount), 0) AS paid_amount
      FROM payment_allocations
      WHERE invoice_id = ${allocation.invoice_id}
    `;
    const currentlyPaid = round2(Number(paidRow.paid_amount ?? 0));
    const invoiceTotal = round2(Number(invoice.total));
    const remainingBalance = round2(invoiceTotal - currentlyPaid);

    if (allocationAmount > remainingBalance) {
      err422(
        `Allocation of ${allocationAmount.toFixed(2)} exceeds remaining balance of ${remainingBalance.toFixed(2)} on invoice ${invoice.invoice_number}`
      );
    }

    enriched.push({
      invoice_id: allocation.invoice_id,
      amount: allocationAmount,
      invoice_number: String(invoice.invoice_number),
      invoice_total: invoiceTotal,
      currently_paid: currentlyPaid,
      remaining_balance: remainingBalance,
      new_remaining_balance: round2(remainingBalance - allocationAmount),
      current_status: status,
    });
  }

  return enriched;
}
