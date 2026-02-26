import { pgClient } from "@/db/index";
import { auditLog } from "@/lib/services/auditLog";

export interface ApplyDiscountInput {
  invoiceId: string;
  orgId: string;
  appliedBy: string;
  discountPercent?: number;
  discountAmount?: number;
  reason: string;
  permissions?: string[];
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function applyDiscount(input: ApplyDiscountInput) {
  const {
    invoiceId,
    orgId,
    appliedBy,
    discountPercent,
    discountAmount,
    reason,
    permissions = [],
  } = input;

  const hasPercent = discountPercent != null;
  const hasAmount = discountAmount != null;
  if ((hasPercent && hasAmount) || (!hasPercent && !hasAmount)) {
    err422("Provide exactly one of discountPercent or discountAmount");
  }

  const [invoice] = await pgClient`
    SELECT *
    FROM invoices
    WHERE id = ${invoiceId}
      AND organization_id = ${orgId}
    LIMIT 1
  `;
  if (!invoice) {
    err404("Invoice not found");
  }
  if (invoice.status === "voided") {
    err422("Cannot apply discount to a voided invoice");
  }
  if (invoice.status === "paid") {
    err422("Cannot apply discount to a paid invoice");
  }

  const [policy] = await pgClient`
    SELECT large_discount_threshold_percent
    FROM policy_settings
    WHERE organization_id = ${orgId}
    LIMIT 1
  `;
  const threshold = Number(policy?.large_discount_threshold_percent ?? 20);

  const subtotal = Number(invoice.subtotal);
  let resolvedDiscountAmount: number;
  let resolvedDiscountPercent: number;

  if (hasPercent) {
    resolvedDiscountPercent = Number(discountPercent);
    resolvedDiscountAmount = round2((subtotal * resolvedDiscountPercent) / 100);
  } else {
    resolvedDiscountAmount = Number(discountAmount);
    resolvedDiscountPercent = subtotal > 0
      ? round2((resolvedDiscountAmount / subtotal) * 100)
      : 0;
  }

  if (resolvedDiscountAmount > subtotal) {
    err422("Discount cannot exceed subtotal");
  }

  let discountApprovedBy: string | null = null;
  if (resolvedDiscountPercent > threshold) {
    if (!permissions.includes("discount.large")) {
      err403("Large discount requires elevated permission");
    }
    discountApprovedBy = appliedBy;
  }

  const oldTotal = Number(invoice.total);
  const total = round2(subtotal - resolvedDiscountAmount);

  return pgClient.begin(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql = tx as any;

    const [updated] = await sql`
      UPDATE invoices
      SET
        discount_amount = ${resolvedDiscountAmount},
        discount_percent = ${resolvedDiscountPercent},
        discount_reason = ${reason},
        discount_approved_by = ${discountApprovedBy},
        total = ${total},
        updated_at = now()
      WHERE id = ${invoiceId}
        AND organization_id = ${orgId}
      RETURNING *
    `;

    await auditLog({
      organizationId: orgId,
      userId: appliedBy,
      action: "discount.applied",
      entityType: "invoice",
      entityId: invoiceId,
      details: {
        before: { total: oldTotal, discount: 0 },
        after: {
          total,
          discountAmount: resolvedDiscountAmount,
          discountPercent: resolvedDiscountPercent,
        },
        reason,
      },
      tx: sql,
    });

    return updated;
  });
}
