import { setRequestLocale } from "next-intl/server";
import dynamic from "next/dynamic";
import { getUserOrRedirectInfo } from "@/lib/auth/getCurrentUser";

const BillingClient = dynamic(
  () => import("@/components/billing/BillingClient").then((mod) => mod.BillingClient),
  {
    loading: () => <div className="h-24 animate-pulse rounded-xl bg-muted" />,
  }
);

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const result = await getUserOrRedirectInfo();
  const isReceptionistOnly =
    "user" in result &&
    result.user.roles.includes("receptionist") &&
    !result.user.roles.includes("admin") &&
    !result.user.roles.includes("manager") &&
    !result.user.roles.includes("accountant");

  return (
    <BillingClient
      locale={locale}
      hideFinancialSummary={!!isReceptionistOnly}
    />
  );
}
