"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { CurrencyProvider } from "@/lib/context/CurrencyContext";
import { NavigationProgress } from "@/components/ui/NavigationProgress";
import type { AuthUser } from "@/lib/auth/getCurrentUser";

interface AppShellProps {
  user: AuthUser;
  permissions: string[];
  locale: string;
  children: React.ReactNode;
}

export function AppShell({ user, permissions, locale, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <CurrencyProvider>
    <NavigationProgress />
    <div className="min-h-screen w-full bg-background">
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
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
    </CurrencyProvider>
  );
}