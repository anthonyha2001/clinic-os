import { pgClient } from "@/db/index";

type SortBy = "balance_due" | "days_outstanding" | "created_at";
type SortOrder = "asc" | "desc";

interface GetUnpaidInvoicesInput {
  orgId: string;
  sortBy?: SortBy;
  sortOrder?: SortOrder;
  startDate?: string;
  endDate?: string;
}

interface UnpaidInvoiceRow {
  invoiceId: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  providerName: string | null;
  total: number;
  amountPaid: number;
  balanceDue: number;
  daysOutstanding: number;
  status: "issued" | "partially_paid";
  issuedAt: string;
  createdAt: string;
}

export async function getUnpaidInvoices(input: GetUnpaidInvoicesInput) {
  const sortBy: SortBy = input.sortBy ?? "days_outstanding";
  const sortOrder: SortOrder = input.sortOrder ?? "desc";

  const rows = await pgClient`
    SELECT
      i.id AS invoice_id,
      i.invoice_number,
      i.patient_id,
      p.first_name,
      p.last_name,
      p.phone,
      u.full_name AS provider_name,
      i.total,
      COALESCE(SUM(pa.amount), 0)::numeric(10,2) AS amount_paid,
      (i.total - COALESCE(SUM(pa.amount), 0))::numeric(10,2) AS balance_due,
      FLOOR(EXTRACT(EPOCH FROM (now() - i.issued_at)) / 86400)::int AS days_outstanding,
      i.status,
      i.issued_at,
      i.created_at
    FROM invoices i
    JOIN patients p ON p.id = i.patient_id
    LEFT JOIN payment_allocations pa ON pa.invoice_id = i.id
    LEFT JOIN appointments a ON a.id = i.appointment_id
    LEFT JOIN provider_profiles pp ON pp.id = a.provider_id
    LEFT JOIN users u ON u.id = pp.user_id
    WHERE i.organization_id = ${input.orgId}
      AND i.status IN ('issued', 'partially_paid')
      AND (
        ${input.startDate ?? null}::date IS NULL
        OR i.issued_at::date >= (${input.startDate ?? null}::date)
      )
      AND (
        ${input.endDate ?? null}::date IS NULL
        OR i.issued_at::date <= (${input.endDate ?? null}::date)
      )
    GROUP BY
      i.id, i.invoice_number, i.patient_id, p.first_name, p.last_name, p.phone,
      u.full_name, i.total, i.status, i.issued_at, i.created_at
  `;

  const invoices: UnpaidInvoiceRow[] = rows.map((r) => ({
    invoiceId: String(r.invoice_id),
    invoiceNumber: String(r.invoice_number),
    patientId: String(r.patient_id),
    patientName: `${String(r.first_name)} ${String(r.last_name)}`.trim(),
    patientPhone: String(r.phone ?? ""),
    providerName: (r.provider_name as string | null) ?? null,
    total: Number(r.total ?? 0),
    amountPaid: Number(r.amount_paid ?? 0),
    balanceDue: Number(r.balance_due ?? 0),
    daysOutstanding: Number(r.days_outstanding ?? 0),
    status: String(r.status) as "issued" | "partially_paid",
    issuedAt: new Date(r.issued_at as string | Date).toISOString(),
    createdAt: new Date(r.created_at as string | Date).toISOString(),
  }));

  const dir = sortOrder === "asc" ? 1 : -1;
  invoices.sort((a, b) => {
    const av =
      sortBy === "balance_due"
        ? a.balanceDue
        : sortBy === "days_outstanding"
          ? a.daysOutstanding
          : new Date(a.createdAt).getTime();
    const bv =
      sortBy === "balance_due"
        ? b.balanceDue
        : sortBy === "days_outstanding"
          ? b.daysOutstanding
          : new Date(b.createdAt).getTime();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return a.invoiceNumber.localeCompare(b.invoiceNumber);
  });

  const summary = invoices.reduce(
    (acc, row) => {
      acc.totalUnpaidAmount += row.balanceDue;
      acc.totalUnpaidCount += 1;
      if (row.status === "partially_paid") acc.totalPartiallyPaid += 1;
      if (row.status === "issued") acc.totalIssued += 1;
      return acc;
    },
    {
      totalUnpaidAmount: 0,
      totalUnpaidCount: 0,
      totalPartiallyPaid: 0,
      totalIssued: 0,
    }
  );

  return {
    summary,
    invoices: invoices.map((row) => ({
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      patientId: row.patientId,
      patientName: row.patientName,
      patientPhone: row.patientPhone,
      providerName: row.providerName,
      total: row.total,
      amountPaid: row.amountPaid,
      balanceDue: row.balanceDue,
      daysOutstanding: row.daysOutstanding,
      status: row.status,
      issuedAt: row.issuedAt,
    })),
  };
}
