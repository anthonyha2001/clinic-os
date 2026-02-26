import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

export default async function ClinicInfoRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return redirect({
    href: "/settings?section=clinicInfo",
    locale: locale as Locale,
  });
}
