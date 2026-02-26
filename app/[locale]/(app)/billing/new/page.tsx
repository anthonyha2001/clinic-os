import { setRequestLocale } from "next-intl/server";
import { NewInvoiceClient } from "@/components/billing/NewInvoiceClient";

export default async function NewInvoicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NewInvoiceClient locale={locale} />;
}
