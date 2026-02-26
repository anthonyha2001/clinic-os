import { setRequestLocale } from "next-intl/server";
import { PatientDetailClient } from "@/components/patients/PatientDetailClient";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <PatientDetailClient patientId={id} locale={locale} />;
}
