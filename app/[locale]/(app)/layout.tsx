import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";
import { getCurrentUserCached } from "@/lib/auth/getCurrentUser";
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
  const user = await getCurrentUserCached();

  if (!user) {
    return redirect({ href: "/auth/login", locale: locale as Locale });
  }

  return (
    <AppShell user={user} permissions={user.permissions} locale={locale}>
      {children}
    </AppShell>
  );
}
