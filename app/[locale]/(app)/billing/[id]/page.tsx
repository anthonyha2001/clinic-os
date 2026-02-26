import { setRequestLocale } from "next-intl/server";
import { InvoiceDetailClient } from "@/components/billing/InvoiceDetailClient";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <InvoiceDetailClient invoiceId={id} locale={locale} />;
}
