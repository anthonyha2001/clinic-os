"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KPIGrid } from "./KPIGrid";
import { TodayTimeline } from "./TodayTimeline";
import { ActivityFeed } from "./ActivityFeed";
import { TodaySchedule } from "./TodaySchedule";
import { UnpaidSummary } from "./UnpaidSummary";
import { AtRiskPatients } from "./AtRiskPatients";
import { UntreatedPlansWidget } from "./UntreatedPlansWidget";
import { RecallDueWidget } from "./RecallDueWidget";
import { EODSummaryWidget } from "./EODSummaryWidget";
import { MiniCalendar } from "@/components/scheduling/MiniCalendar";
import { useFetch, useParallelFetch } from "@/hooks/useFetch";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardClient({ locale }: { locale: string }) {
  const router = useRouter();
  const [loadAudit, setLoadAudit] = useState(false);
  const today = new Date();
  const startOfDay = useMemo(() => {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [today]);
  const endOfDay = useMemo(() => {
    const d = new Date(today);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, [today]);
  const startOfMonth = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), 1).toISOString(),
    [today]
  );

  useEffect(() => {
    const timer = setTimeout(() => setLoadAudit(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const requests = useMemo(
    () => ({
      todayAppointments: `/api/appointments?start_date=${startOfDay}&end_date=${endOfDay}`,
      unpaid: "/api/reports/unpaid",
      inactive: "/api/patients/inactive",
      providers: "/api/providers",
      monthAppointments: `/api/appointments?start_date=${startOfMonth}&end_date=${endOfDay}`,
      dashboardStats: "/api/dashboard/stats",
    }),
    [startOfDay, endOfDay, startOfMonth]
  );

  const { data: parallelData, loading } = useParallelFetch<{
    todayAppointments: Record<string, unknown>[] | { appointments?: Record<string, unknown>[] };
    unpaid: { invoices?: Record<string, unknown>[]; revenueThisMonth?: number };
    inactive: { critical?: Record<string, unknown>[] };
    providers: Record<string, unknown>[] | { providers?: Record<string, unknown>[] };
    monthAppointments: Record<string, unknown>[] | { appointments?: Record<string, unknown>[] };
    dashboardStats: { newPatientsThisMonth?: number };
  }>(requests, 60_000);

  const { data: userData } = useFetch<
    | { user?: { full_name?: string; fullName?: string } }
    | { full_name?: string; fullName?: string }
  >("/api/auth/me", { ttl: 60_000 });

  const { data: auditData } = useFetch<{
    logs?: Record<string, unknown>[];
    data?: Record<string, unknown>[];
  }>(loadAudit ? "/api/audit-log?limit=10" : null, {
    ttl: 60_000,
    initialData: { logs: [] },
  });

  const dateLabel = today.toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const rawToday = parallelData.todayAppointments;
  const rawTodayAppointments = Array.isArray(rawToday)
    ? rawToday
    : rawToday?.appointments ?? [];
  const todayAppointments = rawTodayAppointments.map(
    (a: Record<string, unknown>) => ({
      ...a,
      start_time: a.start_time ?? a.startTime,
      end_time: a.end_time ?? a.endTime,
      patient:
        a.patient ??
        (a.patientName
          ? {
              first_name: String(a.patientName).split(" ")[0],
              last_name: String(a.patientName).split(" ").slice(1).join(" "),
            }
          : {}),
      provider:
        a.provider ??
        (a.providerId
          ? {
              id: a.providerId,
              user: { full_name: a.providerName },
              color_hex: a.providerColor ?? "#3B82F6",
            }
          : {}),
      service: a.service ?? (a.serviceName ? { name_en: a.serviceName } : {}),
    })
  );

  const rawMonth = parallelData.monthAppointments;
  const monthAppointments = Array.isArray(rawMonth)
    ? rawMonth
    : rawMonth?.appointments ?? [];
  const monthCompleted = monthAppointments.filter(
    (a: Record<string, unknown>) => a.status === "completed"
  ).length;
  const monthNoShows = monthAppointments.filter(
    (a: Record<string, unknown>) => a.status === "no_show"
  ).length;
  const monthTotalDone = monthCompleted + monthNoShows;
  const completionRate =
    monthTotalDone > 0 ? Math.round((monthCompleted / monthTotalDone) * 100) : 0;
  const noShowRate =
    monthTotalDone > 0 ? Math.round((monthNoShows / monthTotalDone) * 100) : 0;

  const inactiveRaw = parallelData.inactive?.critical ?? [];
  const criticalPatients = inactiveRaw.map(
    (
      p: Record<string, unknown> & {
        firstName?: string;
        lastName?: string;
        daysSinceLastVisit?: number;
      }
    ) => ({
      id: p.id,
      first_name: p.first_name ?? p.firstName,
      last_name: p.last_name ?? p.lastName,
      phone: p.phone,
      days_since_last_visit:
        p.days_since_last_visit ?? p.daysSinceLastVisit ?? 0,
    })
  );

  const providers = Array.isArray(parallelData.providers)
    ? parallelData.providers
    : parallelData.providers?.providers ?? [];
  const unpaidInvoices = parallelData.unpaid?.invoices ?? [];
  const recentActivity = auditData?.logs ?? auditData?.data ?? [];
  const userProfile = (
    userData && "user" in userData ? userData.user : userData
  ) as { full_name?: string; fullName?: string } | null;
  const firstName = (userProfile?.full_name ?? userProfile?.fullName)
    ? (userProfile?.full_name ?? userProfile?.fullName)!.split(" ")[0]
    : "";

  const todayAppointmentsFiltered = (
    todayAppointments as Record<string, unknown>[]
  ).filter((a) => a.status !== "canceled");

  const confirmed = (todayAppointments as Record<string, unknown>[]).filter(
    (a) => a.status === "confirmed"
  ).length;
  const scheduled = (todayAppointments as Record<string, unknown>[]).filter(
    (a) => a.status === "scheduled"
  ).length;
  const completed = (todayAppointments as Record<string, unknown>[]).filter(
    (a) => a.status === "completed"
  ).length;
  const totalUnpaid = (unpaidInvoices as Record<string, unknown>[]).reduce(
    (s, i) => s + Number(i.balance_due ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {getGreeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          All systems operational
        </div>
      </div>

      {/* KPI Grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <KPIGrid
          todayTotal={todayAppointments.length}
          confirmed={confirmed}
          scheduled={scheduled}
          completed={completed}
          totalUnpaid={totalUnpaid}
          unpaidCount={unpaidInvoices.length}
          criticalCount={criticalPatients.length}
          completionRate={completionRate}
          noShowRate={noShowRate}
          newPatientsThisMonth={
            parallelData.dashboardStats?.newPatientsThisMonth ?? 0
          }
          locale={locale}
        />
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left column — timeline + schedule + revenue widgets */}
        <div className="space-y-6 lg:col-span-2">
          {loading ? (
            <>
              <div className="h-48 bg-muted rounded-xl animate-pulse" />
              <div className="h-64 bg-muted rounded-xl animate-pulse" />
            </>
          ) : (
            <>
              <TodayTimeline
                appointments={todayAppointmentsFiltered}
                providers={providers}
                locale={locale}
              />
              <TodaySchedule
                appointments={todayAppointmentsFiltered}
                locale={locale}
              />
            </>
          )}

          {/* Revenue features — always load independently */}
          <EODSummaryWidget locale={locale} />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <UntreatedPlansWidget locale={locale} />
            <RecallDueWidget locale={locale} />
          </div>
        </div>

        {/* Right column — calendar + activity + unpaid + at-risk */}
        <div className="space-y-6">
          {loading ? (
            <>
              <div className="h-64 bg-muted rounded-xl animate-pulse" />
              <div className="h-40 bg-muted rounded-xl animate-pulse" />
              <div className="h-40 bg-muted rounded-xl animate-pulse" />
            </>
          ) : (
            <>
              <MiniCalendar
                selectedDate={today}
                onSelectDate={(d) =>
                  router.push(
                    `/${locale}/appointments?date=${d
                      .toISOString()
                      .slice(0, 10)}`
                  )
                }
                appointments={monthAppointments as Record<string, unknown>[]}
                locale={locale}
              />
              <ActivityFeed activities={recentActivity} locale={locale} />
              <UnpaidSummary invoices={unpaidInvoices} locale={locale} />
              <AtRiskPatients patients={criticalPatients} locale={locale} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}