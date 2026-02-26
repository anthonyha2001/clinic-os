import { setRequestLocale } from "next-intl/server";
import { SchedulingClient } from "@/components/scheduling/SchedulingClient";

export default async function SchedulingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SchedulingClient locale={locale} />;
}
