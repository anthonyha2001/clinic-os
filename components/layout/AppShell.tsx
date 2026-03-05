"use client";

import { useState } from "react";
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

export function AppShell({ user, permissions, locale, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const isAppointmentsPage = pathname?.includes("/appointments") ?? false;

  return (
    <CurrencyProvider>
    <SessionKeeper />
    <NavigationProgress />
    <div className="min-h-screen w-full bg-muted">
      {/* Sidebar — fixed left, full height */}
      <Sidebar
        user={user}
        permissions={permissions}
        locale={locale}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content area — offset by sidebar width (w-64 = 16rem) */}
      <div
        className="min-h-screen flex flex-col lg:ml-64"
        style={{ minHeight: "100vh" }}
      >
        <Header
          user={user}
          locale={locale}
          onMenuClick={() => setSidebarOpen((o) => !o)}
        />
        <main
          className={`flex-1 p-6 lg:p-8 ${isAppointmentsPage ? "overflow-hidden min-h-0 flex flex-col" : "overflow-y-auto"}`}
        >
          <div
            className={`mx-auto w-full max-w-[1440px] ${isAppointmentsPage ? "flex-1 min-h-0 flex flex-col" : ""}`}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
    </CurrencyProvider>
  );
}