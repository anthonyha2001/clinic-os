import { redirect } from "@/i18n/navigation";
import { setRequestLocale } from "next-intl/server";
import { getUserOrRedirectInfo } from "@/lib/auth/getCurrentUser";
import { ReceptionClient } from "@/components/reception/ReceptionClient";

export default async function ReceptionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const result = await getUserOrRedirectInfo();

  if ("redirectTo" in result) {
    if (result.redirectTo === "/auth/error" && result.code) {
      return redirect({
        href: `/auth/error?code=${result.code}`,
        locale: locale as "en" | "fr" | "ar",
      });
    }
    return redirect({ href: "/auth/login", locale: locale as "en" | "fr" | "ar" });
  }

  const { user } = result;
  const allowed = ["admin", "manager", "receptionist"];
  if (!user.roles.some((r) => allowed.includes(r))) {
    return redirect({ href: "/", locale: locale as "en" | "fr" | "ar" });
  }

  return <ReceptionClient locale={locale} />;
}
