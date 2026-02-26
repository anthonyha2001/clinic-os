"use client";

export interface KPICardDef {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  trend?: { value: number; label: string };
}

export function KPICards({ cards }: { cards: KPICardDef[] }) {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
          <p
            className={`text-2xl font-bold ${card.color ?? "text-foreground"}`}
          >
            {card.value}
          </p>
          {card.sub && (
            <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
          )}
          {card.trend !== undefined && (
            <div
              className={`flex items-center gap-1 mt-1 text-xs font-medium ${card.trend.value >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              <span>{card.trend.value >= 0 ? "▲" : "▼"}</span>
              <span>
                {Math.abs(card.trend.value).toFixed(1)}% {card.trend.label}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
