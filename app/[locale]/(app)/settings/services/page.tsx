import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

export default async function ServicesRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return redirect({
    href: "/settings?section=services",
    locale: locale as Locale,
  });
}
