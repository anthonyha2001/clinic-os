import { pgClient } from "@/db/index";

function parseInvoiceSeq(invoiceNumber: string | null | undefined): number {
  if (!invoiceNumber) return 0;
  const match = invoiceNumber.match(/-(\d+)$/);
  if (!match) return 0;
  return Number(match[1]) || 0;
}

export async function generateInvoiceNumber(
  orgId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any
): Promise<string> {
  const sql = tx ?? pgClient;

  const [org] = await sql`
    SELECT slug
    FROM organizations
    WHERE id = ${orgId}
    LIMIT 1
  `;
  if (!org) {
    throw new Error("Organization not found");
  }
  const orgPrefix = String(org.slug).slice(0, 4).toUpperCase();

  await sql`
    INSERT INTO invoice_sequences (organization_id, last_seq)
    VALUES (${orgId}, 0)
    ON CONFLICT (organization_id) DO NOTHING
  `;

  const [seqRow] = await sql`
    SELECT last_seq
    FROM invoice_sequences
    WHERE organization_id = ${orgId}
    FOR UPDATE
  `;

  const [maxRow] = await sql`
    SELECT invoice_number
    FROM invoices
    WHERE organization_id = ${orgId}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const seqFromCounter = Number(seqRow?.last_seq ?? 0);
  const seqFromInvoices = parseInvoiceSeq((maxRow?.invoice_number as string | undefined) ?? null);
  const nextSeq = Math.max(seqFromCounter, seqFromInvoices) + 1;

  await sql`
    UPDATE invoice_sequences
    SET last_seq = ${nextSeq}
    WHERE organization_id = ${orgId}
  `;

  const padded = String(nextSeq).padStart(4, "0");
  return `INV-${orgPrefix}-${padded}`;
}
