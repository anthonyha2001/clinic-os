import { setRequestLocale } from "next-intl/server";
import { PatientsClient } from "@/components/patients/PatientsClient";

export default async function PatientsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PatientsClient locale={locale} />;
}
