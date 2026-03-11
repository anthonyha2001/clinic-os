import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";
import { z } from "zod";

const schema = z.object({
  invoice_id:        z.string().uuid(),
  payment_method_id: z.string().uuid().optional().nullable(),
  amount:            z.number().positive(),
  reference:         z.string().max(255).optional().nullable(),
  notes:             z.string().optional().nullable(),
  paid_at:           z.string().optional(), // ISO string, defaults to now
});

export const POST = withAuth(async (request, { user }) => {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const { invoice_id, payment_method_id, amount, reference, notes, paid_at } =
      parsed.data;

    // Verify invoice belongs to this org
    const [invoice] = await pgClient`
      SELECT id, total, status FROM invoices
      WHERE id = ${invoice_id} AND organization_id = ${user.organizationId}
      LIMIT 1
    `;
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.status === "voided") {
      return NextResponse.json(
        { error: "Cannot record payment on a voided invoice" },
        { status: 409 }
      );
    }

    // Insert payment
    const [payment] = await pgClient`
      INSERT INTO invoice_payments (
        organization_id, invoice_id, payment_method_id,
        amount, paid_at, reference, notes, recorded_by
      ) VALUES (
        ${user.organizationId},
        ${invoice_id},
        ${payment_method_id ?? null},
        ${amount},
        ${paid_at ? new Date(paid_at).toISOString() : new Date().toISOString()},
        ${reference ?? null},
        ${notes ?? null},
        ${user.id}
      )
      RETURNING *
    `;

    // Check total paid vs invoice total — trigger handles status but return updated invoice
    const [updated] = await pgClient`
      SELECT id, status, total FROM invoices WHERE id = ${invoice_id}
    `;

    return NextResponse.json({ payment, invoice: updated }, { status: 201 });
  } catch (e) {
    console.error("POST /api/invoice-payments error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});

export const GET = withAuth(async (req, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get("invoice_id");

    if (!invoiceId) {
      return NextResponse.json({ error: "invoice_id required" }, { status: 400 });
    }

    const payments = await pgClient`
      SELECT
        ip.*,
        pm.name AS payment_method_name,
        u.full_name AS recorded_by_name
      FROM invoice_payments ip
      LEFT JOIN payment_methods pm ON pm.id = ip.payment_method_id
      LEFT JOIN users u ON u.id = ip.recorded_by
      WHERE ip.invoice_id = ${invoiceId}
        AND ip.organization_id = ${user.organizationId}
      ORDER BY ip.paid_at ASC
    `;

    const total_paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    return NextResponse.json({ payments, total_paid });
  } catch (e) {
    console.error("GET /api/invoice-payments error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});