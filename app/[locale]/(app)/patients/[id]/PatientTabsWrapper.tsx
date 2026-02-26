"use client";

import { useState } from "react";
import { PatientTabs } from "@/components/patients/PatientTabs";

type TabId = "overview" | "notes" | "appointments" | "plans" | "billing";

interface PatientTabsWrapperProps {
  patientId: string;
}

export function PatientTabsWrapper({ patientId }: PatientTabsWrapperProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <PatientTabs
      patientId={patientId}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  );
}
