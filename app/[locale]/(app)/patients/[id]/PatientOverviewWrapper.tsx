"use client";

import { useRouter } from "next/navigation";
import { PatientOverview } from "@/components/patients/PatientOverview";
import type { PatientDetail } from "@/lib/services/patients/get";
import type { PatientTagItem } from "@/lib/services/patients/getTags";
import type { TagItem } from "@/lib/services/tags/list";

interface PatientOverviewWrapperProps {
  patient: PatientDetail;
  tags: PatientTagItem[];
  allTags: TagItem[];
  riskScore: number;
}

export function PatientOverviewWrapper({
  patient,
  tags,
  allTags,
  riskScore,
}: PatientOverviewWrapperProps) {
  const router = useRouter();

  return (
    <PatientOverview
      patient={patient}
      tags={tags}
      allTags={allTags}
      riskScore={riskScore}
      onUpdate={() => router.refresh()}
    />
  );
}
