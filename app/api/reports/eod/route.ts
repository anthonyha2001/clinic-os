import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (req, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const format = searchParams.get("format");
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    const dateStr = targetDate.toISOString().split("T")[0];
    const orgId = user.organizationId;

    const [stats] = await pgClient`
      SELECT
        COUNT(*)                                                    AS total,
        COUNT(*) FILTER (WHERE status = 'completed')                AS completed,
        COUNT(*) FILTER (WHERE status = 'no_show')                  AS no_shows,
        COUNT(*) FILTER (WHERE status = 'canceled')                 AS canceled,
        COUNT(*) FILTER (WHERE status IN ('scheduled','confirmed'))  AS scheduled
      FROM appointments
      WHERE organization_id = ${orgId}
        AND DATE(start_time AT TIME ZONE 'UTC') = ${dateStr}::date
        AND deleted_at IS NULL
    `;

    const [newPatients] = await pgClient`
      SELECT COUNT(*) AS count
      FROM patients
      WHERE organization_id = ${orgId}
        AND DATE(created_at AT TIME ZONE 'UTC') = ${dateStr}::date
        AND deleted_at IS NULL
    `;

    const [revenue] = await pgClient`
      SELECT
        COALESCE(SUM(total), 0)              AS total_revenue,
        COUNT(*)                              AS invoice_count
      FROM invoices
      WHERE organization_id = ${orgId}
        AND status IN ('paid', 'partially_paid')
        AND DATE(updated_at AT TIME ZONE 'UTC') = ${dateStr}::date
    `;

    const paymentRows = await pgClient`
      SELECT
        COALESCE(pm.label_en, 'Other')        AS method_name,
        SUM(ip.amount)                         AS amount,
        COUNT(*)                               AS count
      FROM invoice_payments ip
      LEFT JOIN payment_methods pm ON pm.id = ip.payment_method_id
      WHERE ip.organization_id = ${orgId}
        AND DATE(ip.paid_at AT TIME ZONE 'UTC') = ${dateStr}::date
      GROUP BY pm.label_en
      ORDER BY amount DESC
    `;

    const topServices = await pgClient`
      SELECT
        COALESCE(s.name_en, 'General')        AS service_name,
        COUNT(*)                               AS count
      FROM appointments a
      LEFT JOIN appointment_lines al ON al.appointment_id = a.id
      LEFT JOIN services s ON s.id = al.service_id
      WHERE a.organization_id = ${orgId}
        AND DATE(a.start_time AT TIME ZONE 'UTC') = ${dateStr}::date
        AND a.status = 'completed'
        AND a.deleted_at IS NULL
      GROUP BY s.name_en
      ORDER BY count DESC
      LIMIT 5
    `;

    const providerRows = await pgClient`
      SELECT
        u.full_name                                                  AS provider_name,
        COUNT(*) FILTER (WHERE a.status = 'completed')               AS completed,
        COUNT(*) FILTER (WHERE a.status = 'no_show')                 AS no_shows
      FROM appointments a
      JOIN provider_profiles pp ON pp.id = a.provider_id
      JOIN users u ON u.id = pp.user_id
      WHERE a.organization_id = ${orgId}
        AND DATE(a.start_time AT TIME ZONE 'UTC') = ${dateStr}::date
        AND a.deleted_at IS NULL
      GROUP BY u.full_name
      ORDER BY completed DESC
    `;

    const data = {
      date: dateStr,
      appointments: {
        total:     Number(stats.total),
        completed: Number(stats.completed),
        no_shows:  Number(stats.no_shows),
        canceled:  Number(stats.canceled),
        scheduled: Number(stats.scheduled),
      },
      new_patients: Number(newPatients.count),
      revenue: {
        total:         Number(revenue.total_revenue),
        invoice_count: Number(revenue.invoice_count),
        by_method: paymentRows.map((r) => ({
          method: r.method_name as string,
          amount: Number(r.amount),
          count:  Number(r.count),
        })),
      },
      top_services: topServices.map((r) => ({
        service_name: r.service_name as string,
        count:        Number(r.count),
      })),
      providers: providerRows.map((r) => ({
        provider_name: r.provider_name as string,
        completed:     Number(r.completed),
        no_shows:      Number(r.no_shows),
      })),
    };

    if (format === "html") {
      return new NextResponse(buildHtml(data), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return NextResponse.json(data);
  } catch (e) {
    console.error("GET /api/reports/eod error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});

function fmt(n: number) {
  return n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function buildHtml(d: ReturnType<typeof Object.assign>) {
  const data = d as {
    date: string;
    appointments: { total: number; completed: number; no_shows: number; canceled: number };
    new_patients: number;
    revenue: { total: number; by_method: { method: string; amount: number }[] };
    top_services: { service_name: string; count: number }[];
    providers: { provider_name: string; completed: number; no_shows: number }[];
  };

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>End of Day Report – ${data.date}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:720px;margin:32px auto;color:#111}
  h1{font-size:22px;margin-bottom:4px}
  .sub{color:#6b7280;font-size:13px;margin-bottom:24px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
  .card{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:14px}
  .card .val{font-size:28px;font-weight:700;margin:4px 0}
  .card .lbl{font-size:12px;color:#6b7280}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  th{text-align:left;font-size:12px;color:#6b7280;padding:6px 8px;border-bottom:2px solid #e5e7eb}
  td{padding:8px;font-size:14px;border-bottom:1px solid #f1f5f9}
  h2{font-size:14px;font-weight:700;margin:20px 0 8px;text-transform:uppercase;color:#374151;letter-spacing:.05em}
  @media print{body{margin:16px}}
</style></head><body>
<h1>📊 End of Day Report</h1>
<p class="sub">${new Date(data.date).toLocaleDateString("en",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
<div class="grid">
  <div class="card"><div class="lbl">Patients Seen</div><div class="val">${data.appointments.completed}</div></div>
  <div class="card"><div class="lbl">Revenue</div><div class="val">$${fmt(data.revenue.total)}</div></div>
  <div class="card"><div class="lbl">No-Shows</div><div class="val">${data.appointments.no_shows}</div></div>
  <div class="card"><div class="lbl">New Patients</div><div class="val">${data.new_patients}</div></div>
</div>
${data.revenue.by_method.length > 0 ? `<h2>Revenue by Payment Method</h2><table><thead><tr><th>Method</th><th>Amount</th></tr></thead><tbody>${data.revenue.by_method.map(m => `<tr><td>${m.method}</td><td>$${fmt(m.amount)}</td></tr>`).join("")}<tr><td><strong>Total</strong></td><td><strong>$${fmt(data.revenue.total)}</strong></td></tr></tbody></table>` : ""}
${data.providers.length > 0 ? `<h2>Provider Summary</h2><table><thead><tr><th>Provider</th><th>Completed</th><th>No-Shows</th></tr></thead><tbody>${data.providers.map(p => `<tr><td>${p.provider_name}</td><td>${p.completed}</td><td>${p.no_shows}</td></tr>`).join("")}</tbody></table>` : ""}
${data.top_services.length > 0 ? `<h2>Top Services</h2><table><thead><tr><th>Service</th><th>Count</th></tr></thead><tbody>${data.top_services.map(s => `<tr><td>${s.service_name}</td><td>${s.count}</td></tr>`).join("")}</tbody></table>` : ""}
</body></html>`;
}