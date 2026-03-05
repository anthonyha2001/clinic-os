import { redirect } from "@/i18n/navigation";
import { setRequestLocale } from "next-intl/server";
import dynamic from "next/dynamic";
import { getUserOrRedirectInfo } from "@/lib/auth/getCurrentUser";
import type { Locale } from "@/i18n/config";

const ReportsClient = dynamic(
  () => import("@/components/reports/ReportsClient").then((mod) => mod.ReportsClient),
  {
    loading: () => <div className="h-24 animate-pulse rounded-xl bg-muted" />,
    ssr: false,
  }
);

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const result = await getUserOrRedirectInfo();

  if ("user" in result) {
    const { user } = result;
    const isReceptionistOnly =
      user.roles.includes("receptionist") &&
      !user.roles.includes("admin") &&
      !user.roles.includes("manager") &&
      !user.roles.includes("accountant");
    if (isReceptionistOnly) {
      return redirect({ href: "/reception", locale: locale as Locale });
    }
  }

  return <ReportsClient locale={locale} />;
}
