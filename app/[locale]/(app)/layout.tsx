import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";
import { getUserOrRedirectInfo } from "@/lib/auth/getCurrentUser";
import { AppShell } from "@/components/layout/AppShell";

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AuthenticatedLayout({
  children,
  params,
}: AuthenticatedLayoutProps) {
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

  return (
    <AppShell user={result.user} permissions={result.user.permissions} locale={locale}>
      {children}
    </AppShell>
  );
}
