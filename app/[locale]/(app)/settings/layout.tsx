import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";
import { getUserOrRedirectInfo } from "@/lib/auth/getCurrentUser";
import { getTranslations } from "next-intl/server";

const ALLOWED_ROLES = ["admin", "manager"] as const;

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const result = await getUserOrRedirectInfo();

  if ("redirectTo" in result) {
    if (result.redirectTo === "/auth/error") {
      return redirect({
        href: `/auth/error?code=${result.code}`,
        locale: locale as Locale,
      });
    }
    return redirect({ href: "/auth/login", locale: locale as Locale });
  }

  const hasAccess = ALLOWED_ROLES.some((r) => result.user.roles.includes(r));
  if (!hasAccess) {
    return redirect({ href: "/", locale: locale as Locale });
  }

  const t = await getTranslations("settings.nav");
  const tNav = await getTranslations("nav");

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">{tNav("settings")}</h1>
      {children}
    </div>
  );
}
