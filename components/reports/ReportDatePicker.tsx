"use client";

export function ReportDatePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
}: {
  startDate: string;
  endDate: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
}) {
  function setPreset(months: number) {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    onStartChange(start.toISOString().split("T")[0]);
    onEndChange(end.toISOString().split("T")[0]);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex rounded-lg border overflow-hidden text-xs">
        {[
          { label: "1M", months: 1 },
          { label: "3M", months: 3 },
          { label: "6M", months: 6 },
          { label: "1Y", months: 12 },
        ].map((p) => (
          <button
            key={p.label}
            onClick={() => setPreset(p.months)}
            className="px-3 py-1.5 font-medium hover:bg-muted transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
      <input
        type="date"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        className="rounded-lg border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <span className="text-muted-foreground text-sm">to</span>
      <input
        type="date"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        className="rounded-lg border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}
