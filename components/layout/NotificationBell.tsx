"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, Check, CheckCheck, Calendar, Clock, AlertTriangle, BarChart2, X } from "lucide-react";
import { useRouter } from "next/navigation";

type Notification = {
  id: string;
  type: "new_appointment" | "schedule_change" | "no_show" | "eod_summary";
  title: string;
  body: string;
  link?: string;
  is_read: boolean;
  created_at: string;
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  new_appointment: <Calendar className="size-4 text-blue-500" />,
  schedule_change: <Clock className="size-4 text-amber-500" />,
  no_show:         <AlertTriangle className="size-4 text-red-500" />,
  eod_summary:     <BarChart2 className="size-4 text-green-500" />,
};

const TYPE_BG: Record<string, string> = {
  new_appointment: "bg-blue-50",
  schedule_change: "bg-amber-50",
  no_show:         "bg-red-50",
  eod_summary:     "bg-green-50",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell({ locale }: { locale: string }) {
  const router = useRouter();
  const [open, setOpen]               = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading]         = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=30", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {}
    finally { setLoading(false); }
  }, []);

  // Initial load + poll every 60s
  useEffect(() => {
    fetchNotifications();
    pollRef.current = setInterval(() => fetchNotifications(true), 60_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const markRead = async (id: string) => {
    setNotifications((ns) => ns.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id }),
    });
  };

  const markAllRead = async () => {
    setNotifications((ns) => ns.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.is_read) await markRead(n.id);
    setOpen(false);
    if (n.link) router.push(`/${locale}${n.link}`);
  };

  const handleEodDownload = (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation();
    const date = new Date(n.created_at).toISOString().split("T")[0];
    window.open(`/api/reports/eod?date=${date}&format=html`, "_blank");
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen((o) => !o); if (!open) fetchNotifications(); }}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-150"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 rounded-2xl border border-border/80 bg-background shadow-2xl z-[200] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="size-3.5" />
                  All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-border/40">
            {loading ? (
              <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/40 ${
                    !n.is_read ? "bg-primary/3" : ""
                  }`}
                >
                  {/* Icon */}
                  <div className={`mt-0.5 h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${TYPE_BG[n.type] ?? "bg-muted"}`}>
                    {TYPE_ICON[n.type] ?? <Bell className="size-4 text-muted-foreground" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs font-semibold leading-tight truncate ${!n.is_read ? "text-foreground" : "text-muted-foreground"}`}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {timeAgo(n.created_at)}
                        </span>
                        {!n.is_read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                      {n.body}
                    </p>

                    {/* EOD download button */}
                    {n.type === "eod_summary" && (
                      <button
                        onClick={(e) => handleEodDownload(e, n)}
                        className="mt-1.5 flex items-center gap-1 rounded-md bg-green-50 border border-green-200 px-2 py-0.5 text-[11px] font-medium text-green-700 hover:bg-green-100 transition-colors"
                      >
                        <BarChart2 className="size-3" />
                        Download PDF
                      </button>
                    )}
                  </div>

                  {/* Mark read */}
                  {!n.is_read && (
                    <button
                      onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                      className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Mark as read"
                    >
                      <Check className="size-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t">
              <button
                onClick={() => { setOpen(false); router.push(`/${locale}/reports`); }}
                className="text-xs text-primary hover:underline"
              >
                View all reports →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}