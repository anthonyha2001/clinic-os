"use client";

import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { MenuIcon } from "./icons";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { UserMenu } from "./UserMenu";

const PATH_KEYS: Record<string, string> = {
  "/": "dashboard",
  "/scheduling": "scheduling",
  "/patients": "patients",
  "/billing": "billing",
  "/plans": "plans",
  "/reports": "reports",
  "/settings": "settings",
};

function getPageTitleKey(pathname: string): string {
  if (pathname === "/" || pathname === "") return "dashboard";
  for (const [path, key] of Object.entries(PATH_KEYS)) {
    if (path !== "/" && pathname.startsWith(path)) return key;
  }
  return "dashboard";
}

interface HeaderProps {
  user: {
    fullName: string;
    roles: string[];
  };
  locale: string;
  title?: string;
  onMenuClick: () => void;
}

export function Header({ user, locale, title, onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const isRtl = locale === "ar";
  const pageTitle = title ?? t(getPageTitleKey(pathname));

  return (
    <header
      className={`sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4 shadow-sm ${isRtl ? "flex-row-reverse" : ""}`}
    >
      {/* Hamburger - left (LTR) / right (RTL) */}
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg p-2 hover:bg-muted lg:hidden"
        aria-label="Toggle menu"
      >
        <MenuIcon className="h-6 w-6" />
      </button>

      {/* Center: page title - use ms-auto/mr-auto to push based on hamburger presence */}
      <h1 className="flex-1 truncate text-center text-lg font-semibold lg:text-start">
        {pageTitle}
      </h1>

      {/* Right (LTR) / Left (RTL): LocaleSwitcher + UserMenu */}
      <div className="flex items-center gap-3">
        <LocaleSwitcher />
        <UserMenu user={user} locale={locale} />
      </div>
    </header>
  );
}
