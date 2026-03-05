"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);

      // Only show if not dismissed before
      const dismissed = localStorage.getItem("pwa-install-dismissed");
      if (!dismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
      setInstallEvent(null);
    }
  }

  function handleDismiss() {
    setShowBanner(false);
    localStorage.setItem("pwa-install-dismissed", "1");
  }

  if (!showBanner || isInstalled) return null;

  return (
    <div
      className="fixed bottom-6 left-6 z-[200] flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-xl animate-in slide-in-from-bottom-4 duration-300 max-w-sm"
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10"
      >
        <Download className="size-5 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Install Clinic OS</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Add to your desktop for quick access
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleInstall}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
