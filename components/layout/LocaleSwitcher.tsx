"use client";

import { useRouter, usePathname } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { locales, type Locale } from "@/i18n/config";

export function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const currentLocale = (params.locale as Locale) ?? "en";

  function switchLocale(newLocale: Locale) {
    router.replace(pathname, { locale: newLocale });
  }

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5">
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => switchLocale(locale)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium tracking-wide transition-all duration-150 ${
            currentLocale === locale
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground hover:bg-background/60"
          }`}
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
