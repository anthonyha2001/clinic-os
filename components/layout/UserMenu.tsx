"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { ChevronDownIcon } from "./icons";

interface UserMenuProps {
  user: {
    fullName: string;
    roles: string[];
  };
  locale: string;
}

export function UserMenu({ user, locale }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations("common");
  const router = useRouter();
  const params = useParams();
  const currentLocale = (params.locale as string) ?? locale;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setIsOpen(false);
    router.replace("/auth/login", { locale: currentLocale });
  }

  const displayName = user.fullName.includes("@")
    ? user.fullName.split("@")[0].replace(/[._-]+/g, " ").trim() || "User"
    : user.fullName;
  const primaryRole = user.roles[0] ?? "user";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm hover:bg-muted transition-colors duration-150"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="h-6 w-6 rounded-full bg-muted border border-border/60 flex items-center justify-center shrink-0">
          <span className="text-[10px] font-semibold text-muted-foreground">
            {displayName.charAt(0).toUpperCase()}
          </span>
        </div>

        <span className="text-sm font-medium text-foreground hidden sm:block">
          {displayName}
        </span>

        <span className="hidden sm:inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/40 capitalize">
          {primaryRole}
        </span>

        <ChevronDownIcon
          className={`h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-150 ${isOpen ? "rotate-180" : "rotate-0"}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full end-0 z-50 mt-1.5 w-52 rounded-xl border border-border/60 bg-background py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.04)] animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="px-3 py-2.5 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-muted border border-border/60 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-muted-foreground">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {displayName}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {primaryRole}
                </p>
              </div>
            </div>
          </div>
          <div className="px-1.5 pt-1.5">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-lg px-3 py-2 text-start text-sm text-foreground hover:bg-muted transition-colors duration-150"
            >
              {t("signOut")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
