"use client";

import { useState, useTransition, useCallback, lazy, Suspense } from "react";
import { useTranslations } from "next-intl";

const SECTION_KEYS = [
  "services",
  "providerTypes",
  "clinicInfo",
  "whatsapp",
  "payments",
  "policies",
  "users",
  "providers",
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

// Lazy load all sections for instant initial load; tab switch = instant (chunks cached)
const SettingsClient = lazy(() =>
  import("./SettingsClient").then((m) => ({ default: m.SettingsClient }))
);
const PaymentsSettingsPage = lazy(() =>
  import("@/app/[locale]/(app)/settings/payments/page").then((m) => ({
    default: m.default,
  }))
);
const PoliciesSettingsPage = lazy(() =>
  import("@/app/[locale]/(app)/settings/policies/page").then((m) => ({
    default: m.default,
  }))
);
const UsersSettingsPage = lazy(() =>
  import("@/app/[locale]/(app)/settings/users/page").then((m) => ({
    default: m.default,
  }))
);
const ProvidersSettingsPage = lazy(() =>
  import("@/app/[locale]/(app)/settings/providers/page").then((m) => ({
    default: m.default,
  }))
);

const TAB_TO_TRANSLATION: Record<SectionKey, string> = {
  services: "services",
  providerTypes: "providerTypes",
  clinicInfo: "clinicInfo",
  whatsapp: "whatsapp",
  payments: "payments",
  policies: "policies",
  users: "users",
  providers: "providers",
};

function TabContentSkeleton() {
  return (
    <div className="animate-pulse space-y-4 rounded-xl border bg-card p-6">
      <div className="h-6 w-48 rounded bg-muted" />
      <div className="h-4 w-full rounded bg-muted" />
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="mt-6 h-32 rounded bg-muted" />
    </div>
  );
}

interface SettingsViewProps {
  locale: string;
  initialSection?: SectionKey;
}

export function SettingsView({ locale, initialSection = "services" }: SettingsViewProps) {
  const t = useTranslations("settings.nav");
  const [activeSection, setActiveSection] = useState<SectionKey>(initialSection);
  const [visited, setVisited] = useState<Set<SectionKey>>(
    () => new Set([initialSection])
  );
  const [isPending, startTransition] = useTransition();

  const switchTab = useCallback(
    (section: SectionKey) => {
      if (section === activeSection) return;
      startTransition(() => {
        setActiveSection(section);
        setVisited((prev) => new Set(prev).add(section));
      });
    },
    [activeSection]
  );

  const tabClass = (s: SectionKey) =>
    `rounded-lg px-4 py-2 text-sm font-medium transition-all duration-75 ${
      activeSection === s
        ? "bg-primary text-primary-foreground"
        : "hover:bg-muted text-foreground"
    }`;

  return (
    <div className="flex flex-col gap-4">
      {/* Single tab row - instant switch */}
      <nav
        className="flex flex-wrap gap-2 border-b border-border pb-4"
        role="tablist"
      >
        {SECTION_KEYS.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeSection === key}
            onClick={() => switchTab(key)}
            className={tabClass(key)}
          >
            {t(TAB_TO_TRANSLATION[key])}
          </button>
        ))}
      </nav>

      {/* Content - keep visited tabs mounted (hidden) for instant back-switch */}
      <div className="relative min-h-[200px]">
        {SECTION_KEYS.map((key) => {
          if (!visited.has(key)) return null;
          const isActive = activeSection === key;
          return (
            <div
              key={key}
              className="w-full"
              style={
                !isActive
                  ? {
                      position: "absolute",
                      visibility: "hidden",
                      pointerEvents: "none",
                      top: 0,
                      left: 0,
                    }
                  : undefined
              }
              aria-hidden={!isActive}
            >
              <Suspense fallback={<TabContentSkeleton />}>
                {key === "services" && (
                  <SettingsClient locale={locale} defaultTab="Services" />
                )}
                {key === "providerTypes" && (
                  <SettingsClient locale={locale} defaultTab="Provider Types" />
                )}
                {key === "clinicInfo" && (
                  <SettingsClient locale={locale} defaultTab="Clinic Info" />
                )}
                {key === "whatsapp" && (
                  <SettingsClient locale={locale} defaultTab="WhatsApp" />
                )}
                {key === "payments" && <PaymentsSettingsPage />}
                {key === "policies" && <PoliciesSettingsPage />}
                {key === "users" && <UsersSettingsPage />}
                {key === "providers" && <ProvidersSettingsPage />}
              </Suspense>
            </div>
          );
        })}
      </div>
    </div>
  );
}
