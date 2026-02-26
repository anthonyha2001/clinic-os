import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function LocaleNotFound() {
  const t = await getTranslations("common");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold">{t("pageNotFound")}</h1>
      <p className="max-w-md text-center text-muted-foreground">
        {t("pageNotFoundHint")}
      </p>
      <Link
        href="/"
        className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
      >
        {t("goHome")}
      </Link>
    </div>
  );
}
