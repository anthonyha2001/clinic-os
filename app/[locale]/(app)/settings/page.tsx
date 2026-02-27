import { SettingsView } from "@/components/settings/SettingsView";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <SettingsView locale={locale} />;
}
