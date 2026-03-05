import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";
import { auditLog } from "@/lib/services/auditLog";

const editPaymentSchema = z.object({
  reference_number: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const PATCH = withAuth(
  { permissions: ["payment.edit"] },
  async (request, { user, params }) => {
    try {
      const id = params?.id as string | undefined;
      if (!id) {
        return NextResponse.json({ error: "Payment ID required" }, { status: 400 });
      }

      const body = await request.json();
      const parsed = editPaymentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.issues },
          { status: 422 }
        );
      }

      const [existing] = await pgClient`
        SELECT *
        FROM payments
        WHERE id = ${id}
          AND organization_id = ${user.organizationId}
        LIMIT 1
      `;
      if (!existing) {
        return NextResponse.json({ error: "Payment not found" }, { status: 404 });
      }

      // Phase 1 limitation: payment amount/allocations are immutable after creation.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sqlClient = pgClient as any;
      const result = await sqlClient.begin(async (tx: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sql = tx as any;

        const [updated] = await sql`
          UPDATE payments
          SET
            reference_number = ${
              parsed.data.reference_number !== undefined
                ? parsed.data.reference_number
                : existing.reference_number
            },
            notes = ${parsed.data.notes !== undefined ? parsed.data.notes : existing.notes},
            updated_at = now()
          WHERE id = ${id}
            AND organization_id = ${user.organizationId}
          RETURNING *
        `;

        await auditLog({
          organizationId: user.organizationId,
          userId: user.id,
          action: "payment.edited",
          entityType: "payment",
          entityId: id,
          details: {
            before: {
              reference_number: existing.reference_number,
              notes: existing.notes,
            },
            after: {
              reference_number: updated.reference_number,
              notes: updated.notes,
            },
          },
          tx: sql,
        });

        return updated;
      });

      return NextResponse.json(result);
    } catch (e: unknown) {
      const err = e as Error;
      console.error("PATCH /api/payments/[id] error:", err);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
