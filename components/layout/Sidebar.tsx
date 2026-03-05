"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import logo from "@/components/ui/logo/logo.png";
import {
  HomeIcon,
  CalendarIcon,
  UsersIcon,
  ReceiptIcon,
  ClipboardIcon,
  ChartBarIcon,
  CogIcon,
  ZapIcon,
} from "./icons";

type NavItem = {
  key: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  permissions?: string[];
};

let unpaidCountCache: { value: number; fetchedAt: number } | null = null;
let fetchInProgress = false;
let consecutiveFailures = 0;

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/", icon: HomeIcon, roles: [] },
  { key: "appointments", href: "/appointments", icon: CalendarIcon, roles: [] },
  { key: "patients", href: "/patients", icon: UsersIcon, roles: [] },
  { key: "billing", href: "/billing", icon: ReceiptIcon, roles: [] },
  { key: "plans", href: "/plans", icon: ClipboardIcon, roles: [] },
  {
    key: "reports",
    href: "/reports",
    icon: ChartBarIcon,
    roles: ["admin", "manager", "accountant"],
  },
  {
    key: "automation",
    href: "/automation",
    icon: ZapIcon,
    roles: ["admin", "manager"],
  },
  {
    key: "settings",
    href: "/settings",
    icon: CogIcon,
    roles: ["admin", "manager"],
  },
];

interface SidebarProps {
  user: {
    roles: string[];
    permissions: string[];
  };
  permissions: string[];
  locale: string;
  isOpen: boolean;
  onClose: () => void;
}

function canShowItem(
  item: NavItem,
  userRoles: string[],
  userPermissions: string[]
): boolean {
  // If no restrictions at all → show to everyone
  if (!item.roles?.length && !item.permissions?.length) return true;
  // If role restriction → check roles
  if (item.roles?.length) {
    if (item.roles.some((r) => userRoles.includes(r))) return true;
  }
  // If permission restriction → check permissions
  if (item.permissions?.length) {
    if (item.permissions.some((p) => userPermissions.includes(p))) return true;
  }
  return false;
}

export function Sidebar({ user, permissions, locale, isOpen, onClose }: SidebarProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const isRtl = locale === "ar";
  const userPermissions = permissions.length ? permissions : user.permissions;
  const prefetchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [billingUnreadCount, setBillingUnreadCount] = useState(0);

  async function loadUnpaidCount(force = false) {
    // Stop hammering if repeated failures.
    if (consecutiveFailures >= 3) return;
    // Prevent concurrent fetches.
    if (fetchInProgress) return;

    const now = Date.now();
    // Use cache if fresh (60 seconds).
    if (!force && unpaidCountCache && now - unpaidCountCache.fetchedAt < 60_000) {
      setUnpaidCount(unpaidCountCache.value);
      return;
    }

    fetchInProgress = true;
    try {
      const lastSeen =
        typeof window !== "undefined" ? localStorage.getItem("billing_last_seen") : null;
      const url = lastSeen
        ? `/api/billing/unpaid-count?lastSeen=${encodeURIComponent(lastSeen)}`
        : "/api/billing/unpaid-count";
      const res = await fetch(url, {
        credentials: "include",
        headers: { "Cache-Control": "no-cache" },
      });

      if (res.status === 401 || res.status === 403) {
        consecutiveFailures = 3;
        return;
      }

      if (!res.ok) {
        consecutiveFailures++;
        return;
      }

      const data = (await res.json()) as { count?: number; new_from_appointment_count?: number };
      const count = Number(data.count ?? 0);
      const newFromAppt = Number(data.new_from_appointment_count ?? 0);
      unpaidCountCache = { value: count, fetchedAt: now };
      consecutiveFailures = 0;
      setUnpaidCount(count);
      setBillingUnreadCount(newFromAppt);
    } catch {
      consecutiveFailures++;
    } finally {
      fetchInProgress = false;
    }
  }

  useEffect(() => {
    return () => {
      Object.values(prefetchTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    loadUnpaidCount();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      consecutiveFailures = 0;
      loadUnpaidCount(true);
    }, 120_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/billing")) {
      // User is viewing billing - clear badges and update last seen
      setUnpaidCount(0);
      setBillingUnreadCount(0);
      if (typeof window !== "undefined") {
        localStorage.setItem("billing_last_seen", new Date().toISOString());
      }
      unpaidCountCache = null; // force fresh fetch next time
    }
    // Do not load here to avoid retry storms on route changes.
  }, [pathname]);

  useEffect(() => {
    function onBillingInvoiceFromAppointment() {
      loadUnpaidCount(true);
    }
    window.addEventListener("billing:invoice-from-appointment", onBillingInvoiceFromAppointment);
    return () => window.removeEventListener("billing:invoice-from-appointment", onBillingInvoiceFromAppointment);
  }, []);

  const visibleItems = NAV_ITEMS.filter((item) =>
    canShowItem(item, user.roles, userPermissions)
  );

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          sidebar-scroll fixed top-0 left-0 z-50 h-screen w-64 overflow-y-auto
          flex flex-col border-e border-slate-700/40 bg-[#0F172A]/95
          transition-transform duration-200
          lg:translate-x-0
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <nav className="flex h-full flex-col gap-2 p-4">
          {/* Brand */}
          <div className="mt-4 mb-6 shrink-0 px-3 pt-2 sm:mb-8 sm:mt-6">
            <img
              src={logo.src}
              alt="Clinic OS"
              className="block w-full max-w-full h-auto max-h-10 object-contain object-left sm:max-h-12 md:max-h-14 lg:max-h-none"
            />
            <p className="mt-0.5 text-center text-xs text-white/40">Dentist ERP</p>
          </div>

          {/* Nav items — grow to fill space */}
          <div className="flex flex-1 flex-col gap-2">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/" || pathname === ""
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  prefetch={true}
                  onClick={onClose}
                  onMouseEnter={() => {
                    clearTimeout(prefetchTimers.current[item.key]);
                    prefetchTimers.current[item.key] = setTimeout(() => {
                      router.prefetch(item.href);
                    }, 150);
                  }}
                  onMouseLeave={() => {
                    clearTimeout(prefetchTimers.current[item.key]);
                  }}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium tracking-tight transition-all duration-150 ${
                    isActive
                      ? "bg-[hsl(213,87%,53%)]/10 text-white"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 shrink-0 ${
                      isActive ? "text-[#1E88E5]" : "text-[#64748B] group-hover:text-[#1E88E5]"
                    }`}
                  />
                  <span>{t(item.key)}</span>
                  {item.key === "billing" && (
                    <>
                      {unpaidCount > 0 && (
                        <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white min-w-[18px] text-center">
                          {unpaidCount > 99 ? "99+" : unpaidCount}
                        </span>
                      )}
                      {unpaidCount === 0 && billingUnreadCount > 0 && (
                        <span className="ml-auto h-2 w-2 rounded-full bg-primary shrink-0" title="New invoices from appointments" />
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Bottom: version */}
          <div className="px-3 py-2 text-xs text-white/30">v1.0.0</div>
        </nav>
      </aside>
    </>
  );
}
