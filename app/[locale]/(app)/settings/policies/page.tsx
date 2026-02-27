import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

export default async function PoliciesRedirect({
  params,
}: {
  params?: Promise<{ locale: string }>;
}) {
  const locale = (await params)?.locale ?? "en";
  return redirect({
    href: "/settings?section=policies",
    locale: locale as Locale,
  });
}
