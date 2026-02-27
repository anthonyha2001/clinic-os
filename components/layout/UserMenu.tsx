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
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="font-medium">{displayName}</span>
        <span className="rounded bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
          {primaryRole}
        </span>
        <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
      </button>

      {isOpen && (
        <div className="absolute top-full end-0 z-50 mt-2 w-56 rounded-lg border border-border bg-card py-2 shadow-lg">
          <div className="px-4 py-2">
            <p className="font-medium text-foreground">{displayName}</p>
            <p className="text-xs text-muted-foreground capitalize">{primaryRole}</p>
          </div>
          <hr className="my-2 border-border" />
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full px-4 py-2 text-start text-sm text-foreground hover:bg-muted"
          >
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
