import type { Metadata } from "next";
import localFont from "next/font/local";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { SessionRefresher } from "@/components/providers/SessionRefresher";
import "../globals.css";

const geistSans = localFont({
  src: "../fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "../fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Clinic OS",
  description: "Clinic management system",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) {
    redirect(`/${defaultLocale}`);
  }
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <div lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <SessionRefresher />
      <NextIntlClientProvider messages={messages}>
        {children}
      </NextIntlClientProvider>
    </div>
  );
}
