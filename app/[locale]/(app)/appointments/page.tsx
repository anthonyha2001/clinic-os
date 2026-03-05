import { setRequestLocale } from "next-intl/server";
import dynamic from "next/dynamic";

const AppointmentsClient = dynamic(
  () => import("@/components/appointments/AppointmentsClient").then((mod) => mod.AppointmentsClient),
  {
    loading: () => <div className="h-24 animate-pulse rounded-xl bg-muted" />,
    ssr: false,
  }
);

export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { locale } = await params;
  const { date } = await searchParams;
  setRequestLocale(locale);
  return <AppointmentsClient locale={locale} initialDate={date} />;
}
