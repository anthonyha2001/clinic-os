"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Bell, Calendar, Clock, X, CheckCircle } from "lucide-react";

type BookingNotification = {
  id: string;
  patient_name: string;
  patient_phone: string;
  requested_date: string;
  requested_time: string;
  status: string;
  created_at: string;
  service_name: string | null;
  provider_name: string | null;
};

export function NotificationCenter({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<BookingNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("notifications_last_seen");
  });
  const panelRef = useRef<HTMLDivElement>(null);

  async function fetchNotifications() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: BookingNotification[];
        unread_count: number;
      };
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unread_count ?? 0);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem("notifications_last_seen");
    if (stored) setLastSeen(stored);
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleOpen() {
    setOpen((v) => !v);
    if (!open) {
      const iso = new Date().toISOString();
      setLastSeen(iso);
      localStorage.setItem("notifications_last_seen", iso);
      setUnreadCount(0);
    }
  }

  const displayedUnread =
    lastSeen
      ? notifications.filter((n) => new Date(n.created_at) > new Date(lastSeen)).length
      : unreadCount;

  function formatTime(created_at: string) {
    const d = new Date(created_at);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-150"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {displayedUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
            {displayedUnread > 9 ? "9+" : displayedUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-[200] w-80 rounded-2xl border bg-card shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-foreground" />
              <h3 className="text-sm font-semibold">Notifications</h3>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="p-4 space-y-3 animate-pulse">
                <div className="h-14 rounded-lg bg-muted" />
                <div className="h-14 rounded-lg bg-muted" />
                <div className="h-14 rounded-lg bg-muted" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Bell className="size-5 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-foreground">All caught up</p>
                <p className="text-xs text-muted-foreground">No new booking requests</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((n) => {
                  const isNew = lastSeen
                    ? new Date(n.created_at) > new Date(lastSeen)
                    : new Date(n.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000);

                  return (
                    <div
                      key={n.id}
                      className={`px-4 py-3 hover:bg-muted/30 transition-colors ${
                        isNew ? "bg-primary/5 border-l-2 border-l-primary" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            n.status === "confirmed" ? "bg-green-100" : "bg-orange-100"
                          }`}
                        >
                          {n.status === "confirmed" ? (
                            <CheckCircle className="size-4 text-green-600" />
                          ) : (
                            <Calendar className="size-4 text-orange-600" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {n.patient_name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {n.service_name ?? "Appointment"}
                            {n.provider_name ? ` · Dr. ${n.provider_name}` : ""}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Calendar className="size-3" />
                              {n.requested_date}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Clock className="size-3" />
                              {n.requested_time}
                            </span>
                          </div>
                        </div>

                        <span className="shrink-0 text-[10px] text-muted-foreground/60">
                          {formatTime(n.created_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t px-4 py-2.5 bg-muted/20">
              <Link
                href="/appointments"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                View all appointments →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
