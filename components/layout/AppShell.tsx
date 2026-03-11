"use client";
import { useState, useEffect } from "react";
import { usePathname } from "@/i18n/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { CurrencyProvider } from "@/lib/context/CurrencyContext";
import { NavigationProgress } from "@/components/ui/NavigationProgress";
import { SessionKeeper } from "@/components/auth/SessionKeeper";
import type { AuthUser } from "@/lib/auth/getCurrentUser";

interface AppShellProps {
  user: AuthUser;
  permissions: string[];
  locale: string;
  children: React.ReactNode;
}

const STORAGE_KEY = "sidebar_collapsed";

export function AppShell({ user, permissions, locale, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const isAppointmentsPage = pathname?.includes("/appointments") ?? false;

  // Restore persisted preference on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "true") setCollapsed(true);
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  };

  return (
    <CurrencyProvider>
      <SessionKeeper />
      <NavigationProgress />
      <div className="min-h-screen w-full bg-muted">
        <Sidebar
          user={user}
          permissions={permissions}
          locale={locale}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />

        {/* Offset shifts between w-16 (collapsed) and w-64 (expanded) */}
        <div
          className={`min-h-screen flex flex-col transition-[margin] duration-200 ${
            collapsed ? "lg:ml-16" : "lg:ml-64"
          }`}
          style={{ minHeight: "100vh" }}
        >
          <Header
            user={user}
            locale={locale}
            onMenuClick={() => setSidebarOpen((o) => !o)}
          />
          <main
            className={`flex-1 p-6 lg:p-8 ${
              isAppointmentsPage
                ? "overflow-hidden min-h-0 flex flex-col"
                : "overflow-y-auto"
            }`}
          >
            <div
              className={`mx-auto w-full max-w-[1440px] ${
                isAppointmentsPage ? "flex-1 min-h-0 flex flex-col" : ""
              }`}
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </CurrencyProvider>
  );
}