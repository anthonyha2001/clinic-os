import { setRequestLocale } from "next-intl/server";
import { BillingClient } from "@/components/billing/BillingClient";
import { getUserOrRedirectInfo } from "@/lib/auth/getCurrentUser";

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
