import { setRequestLocale } from "next-intl/server";
import dynamic from "next/dynamic";

const PlanDetailClient = dynamic(
  () => import("@/components/plans/PlanDetailClient").then((mod) => mod.PlanDetailClient),
  {
    loading: () => <div className="h-24 animate-pulse rounded-xl bg-muted" />,
    ssr: false,
  }
);

export default async function PatientPlanDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; planId: string }>;
}) {
  const { locale, planId } = await params;
  setRequestLocale(locale);
  return <PlanDetailClient planId={planId} locale={locale} />;
}
