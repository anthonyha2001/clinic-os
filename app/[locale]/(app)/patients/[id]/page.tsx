import { setRequestLocale } from "next-intl/server";
import dynamic from "next/dynamic";

const PatientDetailClient = dynamic(
  () =>
    import("@/components/patients/PatientDetailClient").then(
      (mod) => mod.PatientDetailClient
    ),
  {
    loading: () => <div className="h-24 animate-pulse rounded-xl bg-muted" />,
    ssr: false,
  }
);

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <PatientDetailClient patientId={id} locale={locale} />;
}
