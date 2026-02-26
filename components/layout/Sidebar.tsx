"use client";

import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  HomeIcon,
  CalendarIcon,
  UsersIcon,
  ReceiptIcon,
  ClipboardIcon,
  ChartBarIcon,
  CogIcon,
  UserCheckIcon,
  ZapIcon,
} from "./icons";

type NavItem = {
  key: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  permissions?: string[];
};

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/", icon: HomeIcon, roles: [] },
  { key: "scheduling", href: "/scheduling", icon: CalendarIcon, roles: [] },
  { key: "patients", href: "/patients", icon: UsersIcon, roles: [] },
  { key: "billing", href: "/billing", icon: ReceiptIcon, roles: [] },
  { key: "plans", href: "/plans", icon: ClipboardIcon, roles: [] },
  {
    key: "reception",
    href: "/reception",
    icon: UserCheckIcon,
    roles: ["admin", "manager", "receptionist"],
  },
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
  const isRtl = locale === "ar";
  const userPermissions = permissions.length ? permissions : user.permissions;

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
          fixed top-0 left-0 z-50 h-screen w-64 overflow-y-auto
          flex flex-col border-e border-white/10 bg-[#0f172a]
          transition-transform duration-200
          lg:translate-x-0
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <nav className="flex h-full flex-col gap-1 p-4">
          {/* Brand */}
          <div className="mb-8 px-3 pt-2">
            <h1 className="text-xl font-bold tracking-tight text-white">
              Clinic OS
            </h1>
            <p className="mt-0.5 text-xs text-white/40">Medical ERP</p>
          </div>

          {/* Nav items — grow to fill space */}
          <div className="flex flex-1 flex-col gap-1">
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
                  onClick={onClose}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {t(item.key)}
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
