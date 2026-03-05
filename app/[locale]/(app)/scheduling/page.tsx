import { redirect } from "@/i18n/navigation";
export default async function SchedulingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return redirect({ href: "/appointments", locale: locale as "en" | "fr" | "ar" });
}
