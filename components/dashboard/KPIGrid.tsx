"use client";

import {
  Calendar,
  DollarSign,
  CheckCircle,
  AlertTriangle,
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
  const cards = [
    {
      label: "Today's Appointments",
      value: todayTotal,
      sub: `${confirmed} confirmed · ${scheduled} pending · ${completed} done`,
      color: "border-blue-200 bg-blue-50 dark:bg-blue-950/30",
      valueColor: "text-blue-700 dark:text-blue-400",
      icon: <Calendar size={16} />,
    },
    {
      label: "Outstanding Balance",
      value: `$${totalUnpaid.toLocaleString("en", { minimumFractionDigits: 0 })}`,
      sub: `${unpaidCount} unpaid invoices`,
      color:
        unpaidCount > 0
          ? "border-orange-200 bg-orange-50 dark:bg-orange-950/30"
          : "border-green-200 bg-green-50 dark:bg-green-950/30",
      valueColor:
        unpaidCount > 0
          ? "text-orange-700 dark:text-orange-400"
          : "text-green-700",
      icon: <DollarSign size={16} />,
    },
    {
      label: "Completion Rate",
      value: `${completionRate}%`,
      sub: `${noShowRate}% no-show rate this month`,
      color:
        completionRate >= 80
          ? "border-green-200 bg-green-50 dark:bg-green-950/30"
          : "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30",
      valueColor:
        completionRate >= 80
          ? "text-green-700 dark:text-green-400"
          : "text-yellow-700",
      icon: <CheckCircle size={16} />,
    },
    {
      label: "At-Risk Patients",
      value: criticalCount,
      sub:
        criticalCount === 0
          ? "No critical patients"
          : "Need immediate follow-up",
      color:
        criticalCount > 0
          ? "border-red-200 bg-red-50 dark:bg-red-950/30"
          : "border-green-200 bg-green-50 dark:bg-green-950/30",
      valueColor:
        criticalCount > 0
          ? "text-red-700 dark:text-red-400"
          : "text-green-700",
      icon: <AlertTriangle size={16} />,
    },
    {
      label: "New Patients",
      value: newPatientsThisMonth,
      sub: "Registered this month",
      color: "border-purple-200 bg-purple-50 dark:bg-purple-950/30",
      valueColor: "text-purple-700 dark:text-purple-400",
      icon: <UserPlus size={16} />,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border p-3 space-y-1 ${card.color}`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {card.label}
            </p>
            <span className="text-muted-foreground shrink-0">{card.icon}</span>
          </div>
          <p className={`text-2xl font-bold ${card.valueColor}`}>
            {card.value}
          </p>
          <p className="text-xs text-muted-foreground leading-tight">
            {card.sub}
          </p>
        </div>
      ))}
    </div>
  );
}
