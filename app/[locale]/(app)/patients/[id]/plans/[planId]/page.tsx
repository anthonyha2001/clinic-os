import { setRequestLocale } from "next-intl/server";
import { PlanDetailClient } from "@/components/plans/PlanDetailClient";

export default async function PatientPlanDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; planId: string }>;
}) {
  const { locale, planId } = await params;
  setRequestLocale(locale);
  return <PlanDetailClient planId={planId} locale={locale} />;
}
