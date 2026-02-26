"use client";

interface BarChartRow {
  label: string;
  value: number;
  secondaryValue?: number;
  color?: string;
  secondaryColor?: string;
}

const COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#6366f1",
];

export function BarChart({
  rows,
  primaryLabel = "Current",
  secondaryLabel,
  formatValue = (v) => String(v),
  height = 32,
  multiColor = false,
}: {
  rows: BarChartRow[];
  primaryLabel?: string;
  secondaryLabel?: string;
  formatValue?: (v: number) => string;
  height?: number;
  multiColor?: boolean;
}) {
  const maxValue = Math.max(
    ...rows.map((r) => Math.max(r.value, r.secondaryValue ?? 0)),
    1
  );

  return (
    <div className="space-y-2.5">
      {secondaryLabel && (
        <div className="flex gap-4 text-xs text-muted-foreground mb-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ backgroundColor: "#3b82f6" }} />
            {primaryLabel}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ backgroundColor: "#93c5fd" }} />
            {secondaryLabel}
          </div>
        </div>
      )}
      {rows.map((row, index) => {
        const primaryColor = row.color ?? (multiColor ? COLORS[index % COLORS.length] : "#3b82f6");
        const secondaryColor = row.secondaryColor ?? "#93c5fd";
        const widthPct = maxValue > 0 ? (row.value / maxValue) * 100 : 0;
        const secWidthPct = row.secondaryValue !== undefined && maxValue > 0
          ? (row.secondaryValue / maxValue) * 100
          : 0;

        return (
          <div key={row.label} className="flex items-center gap-3">
            {/* Label */}
            <span className="text-xs text-muted-foreground w-24 shrink-0 text-end truncate leading-tight">
              {row.label}
            </span>

            {/* Bars */}
            <div className="flex-1 space-y-1">
              {/* Primary bar */}
              <div
                className="w-full rounded overflow-hidden bg-muted"
                style={{ height }}
              >
                <div
                  className="h-full rounded flex items-center justify-end pe-2 transition-all duration-700"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: primaryColor,
                    minWidth: row.value > 0 ? "2rem" : "0",
                  }}
                >
                  {row.value > 0 && widthPct > 10 && (
                    <span className="text-xs font-semibold text-white truncate">
                      {formatValue(row.value)}
                    </span>
                  )}
                </div>
              </div>

              {/* Secondary bar (comparison) */}
              {row.secondaryValue !== undefined && (
                <div
                  className="w-full rounded overflow-hidden bg-muted/50"
                  style={{ height: Math.round(height * 0.55) }}
                >
                  <div
                    className="h-full rounded transition-all duration-700"
                    style={{
                      width: `${secWidthPct}%`,
                      backgroundColor: secondaryColor,
                      minWidth: row.secondaryValue > 0 ? "1rem" : "0",
                    }}
                  />
                </div>
              )}
            </div>

            {/* Value label */}
            <span className="text-xs font-medium w-20 shrink-0 text-end tabular-nums">
              {formatValue(row.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
