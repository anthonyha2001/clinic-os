"use client";

import { useEffect, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { MenuIcon } from "./icons";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { UserMenu } from "./UserMenu";
import { Sun, Moon } from "lucide-react";

const PATH_KEYS: Record<string, string> = {
  "/": "dashboard",
  "/appointments": "appointments",
  "/patients": "patients",
  "/billing": "billing",
  "/plans": "plans",
  "/reports": "reports",
  "/settings": "settings",
  "/automation": "automation",
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
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isRtl = locale === "ar";
  const pageTitle = title ?? t(getPageTitleKey(pathname));
  const isDark = mounted ? resolvedTheme === "dark" : theme === "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className={`sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/60 bg-background px-5 ${isRtl ? "flex-row-reverse" : ""}`}>
      {/* Hamburger */}
      <button
        type="button"
        onClick={onMenuClick}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-150 lg:hidden"
        aria-label="Toggle menu"
      >
        <MenuIcon className="h-4 w-4" />
      </button>

      {/* Page title */}
      <h1 className="flex-1 truncate text-sm font-semibold tracking-tight text-foreground lg:text-start text-center">
        {pageTitle}
      </h1>

      {/* Right controls */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-150"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          disabled={!mounted}
        >
          {mounted
            ? (isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />)
            : <Moon className="h-4 w-4" />}
        </button>
        <LocaleSwitcher />
        <UserMenu user={user} locale={locale} />
      </div>
    </header>
  );
}
