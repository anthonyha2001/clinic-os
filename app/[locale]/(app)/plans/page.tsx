import { setRequestLocale } from "next-intl/server";
import dynamic from "next/dynamic";

const PlansClient = dynamic(
  () => import("@/components/plans/PlansClient").then((mod) => mod.PlansClient),
  {
    loading: () => <div className="h-24 animate-pulse rounded-xl bg-muted" />,
    ssr: false,
  }
);

export default async function PlansPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PlansClient locale={locale} />;
}
