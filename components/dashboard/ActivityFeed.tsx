"use client";

type Activity = Record<string, unknown>;

function timeAgo(dateStr: string, locale: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return rtf.format(-days, "day");
}

function humanizeAction(action: string, entity: string): string {
  const normalized = `${action} ${entity}`
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.includes("discount applied") && normalized.includes("invoice")) {
    return "Applied discount to invoice";
  }
  if (normalized.includes("service price") && normalized.includes("change")) {
    return "Updated service price";
  }
  if (normalized.includes("status")) return "Updated status";
  if (normalized.includes("payment")) return "Recorded payment";
  if (normalized.includes("create")) return `Created ${entity || "record"}`;
  if (normalized.includes("delete")) return `Deleted ${entity || "record"}`;
  if (normalized.includes("update")) return `Updated ${entity || "record"}`;

  return normalized.replace(/\b\w/g, (m) => m.toUpperCase());
}

function getInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "S";
}

export function ActivityFeed({
  activities,
  locale,
}: {
  activities: Activity[];
  locale: string;
}) {
  return (
    <div className="app-card">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
        <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
        <div className="text-xs">
          <span className="text-xs text-muted-foreground">
            {activities.length} events
          </span>
        </div>
      </div>
 
      {activities.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No recent activity.
        </p>
      ) : (
        <div>
          {activities.slice(0, 10).map((activity, i) => {
            const action = (activity.action as string) ?? "update";
            const entity = (activity.entity_type as string) ?? "";
            const actor =
              (activity.actor as Record<string, string> | undefined)
                ?.full_name ?? "System";
            const createdAt = (activity.created_at as string) ?? "";
            const description =
              (activity.description as string) ??
              humanizeAction(action, entity);
 
            return (
              <div
                key={i}
                className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/30 -mx-1 px-1 rounded transition-colors duration-150"
              >
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5 border border-[hsl(213,87%,53%)]/50">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {getInitial(actor)}
                  </span>
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-xs text-foreground leading-snug">
                    <span className="font-medium">{actor}</span>{" "}
                    <span className="text-muted-foreground">
                      {description}
                    </span>
                  </p>
                  {createdAt && (
                    <p className="text-[11px] text-muted-foreground/50">
                      {timeAgo(createdAt, locale)}
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
