import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("auth");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm"
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        <h1 className="text-center text-2xl font-bold text-foreground">
          {t("signIn")}
        </h1>
        <div className="mt-8">
          <LoginForm errorParam={error} />
        </div>
      </div>
    </div>
  );
}
