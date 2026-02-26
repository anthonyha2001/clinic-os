"use client";

import { Plus, Pencil, Trash2, RefreshCw, CreditCard, Lock, ClipboardList } from "lucide-react";

type Activity = Record<string, unknown>;

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  status_change: RefreshCw,
  payment: CreditCard,
  login: Lock,
};

const ACTION_COLORS: Record<string, string> = {
  create: "text-green-600",
  update: "text-blue-600",
  delete: "text-red-600",
  status_change: "text-purple-600",
  payment: "text-orange-600",
  login: "text-gray-600",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function ActivityFeed({
  activities,
  locale,
}: {
  activities: Activity[];
  locale: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Recent Activity</h2>
        <span className="text-xs text-muted-foreground">
          {activities.length} events
        </span>
      </div>

      {activities.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No recent activity.
        </p>
      ) : (
        <div className="space-y-2">
          {activities.slice(0, 10).map((activity, i) => {
            const action = (activity.action as string) ?? "update";
            const entity = (activity.entity_type as string) ?? "";
            const entityId = (activity.entity_id as string) ?? "";
            const actor =
              (activity.actor as Record<string, string> | undefined)
                ?.full_name ?? "System";
            const createdAt = (activity.created_at as string) ?? "";
            const description =
              (activity.description as string) ?? `${action} ${entity}`;

            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 mt-0.5">
                  {(function IconWrap() {
                    const Icon = ACTION_ICONS[action] ?? ClipboardList;
                    return <Icon className="inline-block size-4" />;
                  })()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="leading-tight">
                    <span className="font-medium">{actor}</span>{" "}
                    <span
                      className={
                        ACTION_COLORS[action] ?? "text-muted-foreground"
                      }
                    >
                      {description}
                    </span>
                  </p>
                  {createdAt && (
                    <p className="text-muted-foreground mt-0.5">
                      {timeAgo(createdAt)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
