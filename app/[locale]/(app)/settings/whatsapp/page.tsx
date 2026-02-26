import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

export default async function WhatsAppRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return redirect({
    href: "/settings?section=whatsapp",
    locale: locale as Locale,
  });
}
