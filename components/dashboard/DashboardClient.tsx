"use client";
import { useState, useEffect, useCallback } from "react";
import { KPIGrid } from "./KPIGrid";
import { TodayTimeline } from "./TodayTimeline";
import { ActivityFeed } from "./ActivityFeed";
import { TodaySchedule } from "./TodaySchedule";
import { UnpaidSummary } from "./UnpaidSummary";
import { AtRiskPatients } from "./AtRiskPatients";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardClient({ locale }: { locale: string }) {
  const [data, setData] = useState<{
    todayAppointments: Record<string, unknown>[];
    unpaidInvoices: Record<string, unknown>[];
    inactivePatients: Record<string, unknown>[];
    providers: Record<string, unknown>[];
    revenueThisMonth: number;
    newPatientsThisMonth: number;
    completionRate: number;
    noShowRate: number;
    recentActivity: Record<string, unknown>[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ full_name?: string; fullName?: string } | null>(null);

  const fetchAll = useCallback(async () => {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const fetchOpts: RequestInit = { cache: "no-store", credentials: "include" };

    const [
      apptRes,
      unpaidRes,
      inactiveRes,
      provRes,
      userRes,
      activityRes,
      monthApptRes,
      dashboardStatsRes,
    ] = await Promise.all([
      fetch(
        `/api/appointments?start_date=${startOfDay.toISOString()}&end_date=${endOfDay.toISOString()}`,
        fetchOpts
      ),
      fetch("/api/reports/unpaid", fetchOpts),
      fetch("/api/patients/inactive", fetchOpts),
      fetch("/api/providers", fetchOpts),
      fetch("/api/auth/me", fetchOpts),
      fetch("/api/audit-log?limit=10", fetchOpts).catch(() => ({ ok: false }) as Response),
      fetch(
        `/api/appointments?start_date=${startOfMonth.toISOString()}&end_date=${endOfDay.toISOString()}`,
        fetchOpts
      ),
      fetch("/api/dashboard/stats", fetchOpts).catch(() => ({ ok: false }) as Response),
    ]);

      const [
        apptData,
        unpaidData,
        inactiveData,
        provData,
        userData,
        activityData,
        monthApptData,
        dashboardStatsData,
      ] = await Promise.all([
        apptRes.json(),
        unpaidRes.json(),
        inactiveRes.json(),
        provRes.json(),
        userRes.json(),
        activityRes instanceof Response && activityRes.ok
          ? activityRes.json()
          : Promise.resolve({ logs: [] }),
        monthApptRes.json(),
        dashboardStatsRes instanceof Response && dashboardStatsRes.ok
          ? dashboardStatsRes.json()
          : Promise.resolve({ newPatientsThisMonth: 0 }),
      ]);

      const rawToday =
        (apptData as { error?: string }).error || !Array.isArray(apptData)
          ? []
          : (apptData as { appointments?: unknown[] }).appointments ?? apptData ?? [];
      const rawMonth =
        (monthApptData as { error?: string }).error || !Array.isArray(monthApptData)
          ? []
          : (monthApptData as { appointments?: unknown[] }).appointments ?? monthApptData ?? [];

      const todayAppointments = (Array.isArray(rawToday) ? rawToday : []).map(
        (a: Record<string, unknown>) => ({
          ...a,
          start_time: a.start_time ?? a.startTime,
          end_time: a.end_time ?? a.endTime,
          patient:
            a.patient ??
            (a.patientName
              ? {
                  first_name: String(a.patientName).split(" ")[0],
                  last_name: String(a.patientName)
                    .split(" ")
                    .slice(1)
                    .join(" "),
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
          service:
            a.service ??
            (a.serviceName ? { name_en: a.serviceName } : {}),
        })
      );

      const monthAppts = Array.isArray(rawMonth) ? rawMonth : [];
      const completed = monthAppts.filter(
        (a: Record<string, unknown>) => a.status === "completed"
      ).length;
      const noShows = monthAppts.filter(
        (a: Record<string, unknown>) => a.status === "no_show"
      ).length;
      const totalDone = completed + noShows;
      const completionRate =
        totalDone > 0 ? Math.round((completed / totalDone) * 100) : 0;
      const noShowRate =
        totalDone > 0 ? Math.round((noShows / totalDone) * 100) : 0;

      const criticalRaw =
        (inactiveData as { error?: string }).error || !inactiveData
          ? []
          : inactiveData.critical ?? [];
      const inactivePatients = criticalRaw.map(
        (p: Record<string, unknown> & { firstName?: string; lastName?: string; daysSinceLastVisit?: number }) => ({
          id: p.id,
          first_name: p.first_name ?? p.firstName,
          last_name: p.last_name ?? p.lastName,
          phone: p.phone,
          days_since_last_visit: p.days_since_last_visit ?? p.daysSinceLastVisit ?? 0,
        })
      );

      setUser((userData.user ?? userData) as { full_name?: string } | null);
      setData({
        todayAppointments,
        unpaidInvoices: (unpaidData as { error?: string }).error ? [] : (unpaidData.invoices ?? []),
        inactivePatients,
        providers: (provData as { error?: string }).error ? [] : (provData.providers ?? provData ?? []),
        revenueThisMonth: unpaidData.revenueThisMonth ?? 0,
        newPatientsThisMonth: (dashboardStatsData as { newPatientsThisMonth?: number })?.newPatientsThisMonth ?? 0,
        completionRate,
        noShowRate,
        recentActivity: (activityData as { logs?: Record<string, unknown>[] })?.logs ?? (activityData as { data?: Record<string, unknown>[] })?.data ?? [],
      });
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const onFocus = () => fetchAll();
    window.addEventListener("focus", onFocus);
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchAll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchAll]);

  const today = new Date();
  const dateLabel = today.toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (loading) return <DashboardSkeleton />;

  const confirmed = (data!.todayAppointments as Record<string, unknown>[]).filter(
    (a) => a.status === "confirmed"
  ).length;
  const scheduled = (data!.todayAppointments as Record<string, unknown>[]).filter(
    (a) => a.status === "scheduled"
  ).length;
  const completed = (data!.todayAppointments as Record<string, unknown>[]).filter(
    (a) => a.status === "completed"
  ).length;
  const totalUnpaid = (data!.unpaidInvoices as Record<string, unknown>[]).reduce(
    (s, i) => s + Number(i.balance_due ?? 0),
    0
  );
  const criticalPatients = data!.inactivePatients;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">
            {getGreeting()}
            {(user?.full_name ?? user?.fullName)
              ? `, ${(user?.full_name ?? user?.fullName)!.split(" ")[0]}`
              : ""}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
          System operational
        </div>
      </div>

      <KPIGrid
        todayTotal={data!.todayAppointments.length}
        confirmed={confirmed}
        scheduled={scheduled}
        completed={completed}
        totalUnpaid={totalUnpaid}
        unpaidCount={data!.unpaidInvoices.length}
        criticalCount={criticalPatients.length}
        completionRate={data!.completionRate}
        noShowRate={data!.noShowRate}
        newPatientsThisMonth={data!.newPatientsThisMonth}
        locale={locale}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <TodayTimeline
            appointments={data!.todayAppointments}
            providers={data!.providers}
            locale={locale}
          />
          <TodaySchedule
            appointments={data!.todayAppointments}
            locale={locale}
          />
        </div>

        <div className="space-y-5">
          <ActivityFeed
            activities={data!.recentActivity}
            locale={locale}
          />
          <UnpaidSummary
            invoices={data!.unpaidInvoices}
            locale={locale}
          />
          <AtRiskPatients
            patients={criticalPatients}
            locale={locale}
          />
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-56 bg-muted rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="h-48 bg-muted rounded-xl" />
          <div className="h-64 bg-muted rounded-xl" />
        </div>
        <div className="space-y-5">
          <div className="h-64 bg-muted rounded-xl" />
          <div className="h-40 bg-muted rounded-xl" />
          <div className="h-40 bg-muted rounded-xl" />
        </div>
      </div>
    </div>
  );
}
