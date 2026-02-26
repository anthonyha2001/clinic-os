"use client";

import { useState } from "react";
import {
  DollarSign,
  Clock,
  Calendar,
  Stethoscope,
  User,
  ClipboardList,
} from "lucide-react";
import { RevenueReport } from "./RevenueReport";
import { UnpaidReport } from "./UnpaidReport";
import { PlanConversionReport } from "./PlanConversionReport";
import { ProviderReport } from "./ProviderReport";
import { AppointmentReport } from "./AppointmentReport";
import { PatientReport } from "./PatientReport";

const TABS = [
  { key: "revenue", label: "Revenue", Icon: DollarSign },
  { key: "unpaid", label: "Unpaid", Icon: Clock },
  { key: "appointments", label: "Appointments", Icon: Calendar },
  { key: "providers", label: "Providers", Icon: Stethoscope },
  { key: "patients", label: "Patients", Icon: User },
  { key: "plans", label: "Plan Conversion", Icon: ClipboardList },
] as const;

type Tab = (typeof TABS)[number]["key"];

export function ReportsClient({ locale }: { locale: string }) {
  const [activeTab, setActiveTab] = useState<Tab>("revenue");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Analytics and financial overview
        </p>
      </div>

      <div className="border-b flex gap-0.5 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.Icon className="inline-block size-4 shrink-0" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "revenue" && <RevenueReport locale={locale} />}
      {activeTab === "unpaid" && <UnpaidReport locale={locale} />}
      {activeTab === "appointments" && <AppointmentReport locale={locale} />}
      {activeTab === "providers" && <ProviderReport locale={locale} />}
      {activeTab === "patients" && <PatientReport locale={locale} />}
      {activeTab === "plans" && <PlanConversionReport locale={locale} />}
    </div>
  );
}
