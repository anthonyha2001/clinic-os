import { setRequestLocale } from "next-intl/server";
import dynamic from "next/dynamic";

const PatientsClient = dynamic(
  () => import("@/components/patients/PatientsClient").then((mod) => mod.PatientsClient),
  {
    loading: () => <div className="h-24 animate-pulse rounded-xl bg-muted" />,
    ssr: false,
  }
);

export default async function PatientsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PatientsClient locale={locale} />;
}
