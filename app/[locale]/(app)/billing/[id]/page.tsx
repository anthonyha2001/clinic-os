import { setRequestLocale } from "next-intl/server";
import dynamic from "next/dynamic";

const InvoiceDetailClient = dynamic(
  () =>
    import("@/components/billing/InvoiceDetailClient").then(
      (mod) => mod.InvoiceDetailClient
    ),
  {
    loading: () => <div className="h-24 animate-pulse rounded-xl bg-muted" />,
    ssr: false,
  }
);

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <InvoiceDetailClient invoiceId={id} locale={locale} />;
}
