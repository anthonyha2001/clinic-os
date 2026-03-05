"use client";

import { useCurrency } from "@/lib/context/CurrencyContext";

import {
  Calendar,
  DollarSign,
  TrendingUp,
  AlertCircle,
  UserPlus,
} from "lucide-react";

interface KPIGridProps {
  todayTotal: number;
  confirmed: number;
  scheduled: number;
  completed: number;
  totalUnpaid: number;
  unpaidCount: number;
  criticalCount: number;
  completionRate: number;
  noShowRate: number;
  newPatientsThisMonth: number;
  locale: string;
}

export function KPIGrid({
  todayTotal,
  confirmed,
  scheduled,
  completed,
  totalUnpaid,
  unpaidCount,
  criticalCount,
  completionRate,
  noShowRate,
  newPatientsThisMonth,
}: KPIGridProps) {
  const { format } = useCurrency();

  const cards = [
    {
      label: "Today's Appointments",
      value: todayTotal,
      sub: `${confirmed + scheduled} upcoming · ${completed} completed`,
      icon: Calendar,
      valueClass: "text-foreground",
      urgent: false,
    },
    {
      label: "Outstanding Balance",
      value: format(totalUnpaid),
      sub: unpaidCount > 0 ? `${unpaidCount} unpaid invoices` : "All invoices settled",
      icon: DollarSign,
      valueClass: "text-foreground",
      urgent: unpaidCount > 0,
      urgentSub: unpaidCount > 0,
    },
    {
      label: "Completion Rate",
      value: `${completionRate}%`,
      sub: `${noShowRate}% no-show rate · this month`,
      icon: TrendingUp,
      valueClass: "text-foreground",
      urgent: completionRate < 60,
    },
    {
      label: "At-Risk Patients",
      value: criticalCount,
      sub:
        criticalCount === 0
          ? "No follow-ups needed"
          : `${criticalCount} require follow-up`,
      icon: AlertCircle,
      valueClass: "text-foreground",
      urgent: criticalCount > 0,
    },
    {
      label: "New Patients",
      value: newPatientsThisMonth,
      sub: "Registered this month",
      icon: UserPlus,
      valueClass: "text-foreground",
      urgent: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="app-card app-card-hover flex flex-col justify-between min-h-[140px]"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <p className="text-xs font-medium text-muted-foreground leading-tight pt-0.5">
                {card.label}
              </p>
              <div className="icon-container">
                <Icon className="size-4 text-brand" strokeWidth={1.5} />
              </div>
            </div>

            <div>
              <p className={`text-[2rem] font-semibold tracking-tight leading-none ${card.valueClass}`}>
                {card.value}
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground/70 leading-tight">
              {card.sub}
            </p>
          </div>
        );
      })}
    </div>
  );
}
