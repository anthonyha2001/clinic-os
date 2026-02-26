import { pgClient } from "@/db/index";
import { auditLog } from "@/lib/services/auditLog";
import { isValidInvoiceTransition } from "./transitions";

export interface UpdateInvoiceStatusInput {
  invoiceId: string;
  orgId: string;
  newStatus: string;
  changedBy: string;
  reason?: string | null;
  permissions?: string[];
  isSystemTransition?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any;
}

function err403(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 403;
  throw e;
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

export async function updateInvoiceStatus(input: UpdateInvoiceStatusInput) {
  const {
    invoiceId,
    orgId,
    newStatus,
    changedBy,
    reason,
    permissions = [],
    isSystemTransition = false,
    tx,
  } = input;

  const sql = tx ?? pgClient;
  const [existing] = await sql`
    SELECT *
    FROM invoices
    WHERE id = ${invoiceId}
      AND organization_id = ${orgId}
    LIMIT 1
  `;
  if (!existing) {
    err404("Invoice not found");
  }

  const currentStatus = String(existing.status);
  if (!isValidInvoiceTransition(currentStatus, newStatus)) {
    err422(`Invalid transition: ${currentStatus} → ${newStatus}`);
  }

  if (newStatus === "voided") {
    if (!permissions.includes("invoice.void")) {
      err403("Forbidden");
    }
    if (!reason || !reason.trim()) {
      err422("Reason is required when voiding an invoice");
    }
    if (currentStatus === "paid") {
      err422("Cannot void a fully paid invoice");
    }
  }

  const run = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runner: any
  ) => {
    if ((newStatus === "partially_paid" || newStatus === "paid") && !isSystemTransition) {
      err422("This transition is system-controlled");
    }

    const [updated] = await runner`
      UPDATE invoices
      SET
        status = ${newStatus},
        issued_at = CASE
          WHEN ${newStatus} = 'issued' THEN now()
          ELSE issued_at
        END,
        updated_at = now()
      WHERE id = ${invoiceId}
        AND organization_id = ${orgId}
      RETURNING *
    `;

    if (newStatus === "voided") {
      await auditLog({
        organizationId: orgId,
        userId: changedBy,
        action: "invoice.voided",
        entityType: "invoice",
        entityId: invoiceId,
        details: {
          before: currentStatus,
          reason: reason ?? null,
        },
        tx: runner,
      });
    }

    return updated;
  };

  if (tx) {
    return run(tx);
  }

  return pgClient.begin(async (trx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runner = trx as any;
    return run(runner);
  });
}
