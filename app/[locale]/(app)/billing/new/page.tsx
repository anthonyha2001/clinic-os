import { setRequestLocale } from "next-intl/server";
import dynamic from "next/dynamic";

const NewInvoiceClient = dynamic(
  () => import("@/components/billing/NewInvoiceClient").then((mod) => mod.NewInvoiceClient),
  {
    loading: () => <div className="h-24 animate-pulse rounded-xl bg-muted" />,
    ssr: false,
  }
);

export default async function NewInvoicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NewInvoiceClient locale={locale} />;
}
