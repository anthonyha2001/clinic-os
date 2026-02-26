import { setRequestLocale } from "next-intl/server";
import { PlansClient } from "@/components/plans/PlansClient";

export default async function PlansPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PlansClient locale={locale} />;
}
