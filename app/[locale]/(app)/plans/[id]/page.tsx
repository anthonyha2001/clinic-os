import { setRequestLocale } from "next-intl/server";
import { PlanDetailClient } from "@/components/plans/PlanDetailClient";

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <PlanDetailClient planId={id} locale={locale} />;
}
