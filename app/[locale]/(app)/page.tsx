import { setRequestLocale } from "next-intl/server";
import dynamic from "next/dynamic";

const DashboardClient = dynamic(
  () => import("@/components/dashboard/DashboardClient").then((mod) => mod.DashboardClient),
  {
    loading: () => <div className="h-24 animate-pulse rounded-xl bg-muted" />,
    ssr: false,
  }
);

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DashboardClient locale={locale} />;
}
