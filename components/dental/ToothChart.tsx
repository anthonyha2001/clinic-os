"use client";
import { useState } from "react";

export type ToothCondition =
  | "healthy"
  | "cavity"
  | "filled"
  | "crown"
  | "missing"
  | "root_canal"
  | "implant"
  | "cracked"
  | "bridge";

export const CONDITION_COLORS: Record<ToothCondition, string> = {
  healthy:    "#22c55e",
  cavity:     "#ef4444",
  filled:     "#3b82f6",
  crown:      "#f59e0b",
  missing:    "#6b7280",
  root_canal: "#8b5cf6",
  implant:    "#06b6d4",
  cracked:    "#f97316",
  bridge:     "#ec4899",
};

export const CONDITION_LABELS: Record<ToothCondition, string> = {
  healthy:    "Healthy",
  cavity:     "Cavity",
  filled:     "Filled",
  crown:      "Crown",
  missing:    "Missing",
  root_canal: "Root Canal",
  implant:    "Implant",
  cracked:    "Cracked",
  bridge:     "Bridge",
};

// FDI notation: upper right 18-11, upper left 21-28, lower left 31-38, lower right 41-48
const UPPER_RIGHT = [18,17,16,15,14,13,12,11];
const UPPER_LEFT  = [21,22,23,24,25,26,27,28];
const LOWER_LEFT  = [31,32,33,34,35,36,37,38];
const LOWER_RIGHT = [41,42,43,44,45,46,47,48];

export interface ToothData {
  tooth_number: number;
  conditions: ToothCondition[];
  notes?: string;
}

interface ToothChartProps {
  teeth: ToothData[];
  onToothClick: (toothNumber: number, current: ToothData | null) => void;
  readOnly?: boolean;
}

function Tooth({
  number,
  data,
  onClick,
  readOnly,
}: {
  number: number;
  data: ToothData | undefined;
  onClick: () => void;
  readOnly?: boolean;
}) {
  const conditions = data?.conditions ?? [];
  const primaryCondition = conditions[0] as ToothCondition | undefined;
  const color = primaryCondition ? CONDITION_COLORS[primaryCondition] : "#e5e7eb";
  const hasMultiple = conditions.length > 1;

  return (
    <div
      onClick={readOnly ? undefined : onClick}
      className={`flex flex-col items-center gap-0.5 ${readOnly ? "" : "cursor-pointer group"}`}
    >
      <span className="text-[9px] text-gray-400 font-medium">{number}</span>
      <div
        className={`relative h-8 w-6 rounded-sm border-2 transition-all ${
          readOnly ? "" : "group-hover:scale-110 group-hover:shadow-md"
        }`}
        style={{
          backgroundColor: color,
          borderColor: primaryCondition ? color : "#d1d5db",
        }}
        title={conditions.map(c => CONDITION_LABELS[c]).join(", ") || "Healthy"}
      >
        {hasMultiple && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-gray-800 text-white text-[7px] flex items-center justify-center">
            {conditions.length}
          </span>
        )}
        {conditions.includes("missing") && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">✕</span>
          </div>
        )}
        {conditions.includes("crown") && (
          <div className="absolute inset-x-0 top-0 h-2 rounded-sm opacity-60" style={{ backgroundColor: CONDITION_COLORS.crown }} />
        )}
      </div>
    </div>
  );
}

export function ToothChart({ teeth, onToothClick, readOnly }: ToothChartProps) {
  const toothMap = new Map(teeth.map(t => [t.tooth_number, t]));

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-3">
        {Object.entries(CONDITION_LABELS).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: CONDITION_COLORS[k as ToothCondition] }} />
            <span className="text-xs text-gray-500">{v}</span>
          </div>
        ))}
      </div>

      {/* Upper jaw */}
      <div className="bg-muted/30 rounded-xl p-3 border">
        <p className="text-xs text-center text-muted-foreground mb-2 font-medium">Upper Jaw</p>
        <div className="flex justify-center gap-1">
          {UPPER_RIGHT.map(n => (
            <Tooth key={n} number={n} data={toothMap.get(n)} onClick={() => onToothClick(n, toothMap.get(n) ?? null)} readOnly={readOnly} />
          ))}
          <div className="w-3" />
          {UPPER_LEFT.map(n => (
            <Tooth key={n} number={n} data={toothMap.get(n)} onClick={() => onToothClick(n, toothMap.get(n) ?? null)} readOnly={readOnly} />
          ))}
        </div>
      </div>

      {/* Center labels */}
      <div className="flex justify-center gap-2 text-xs text-muted-foreground py-1">
        <span>Right →</span>
        <span className="flex-1 text-center border-t mt-2" />
        <span>← Left</span>
      </div>

      {/* Lower jaw */}
      <div className="bg-muted/30 rounded-xl p-3 border">
        <div className="flex justify-center gap-1">
          {LOWER_RIGHT.map(n => (
            <Tooth key={n} number={n} data={toothMap.get(n)} onClick={() => onToothClick(n, toothMap.get(n) ?? null)} readOnly={readOnly} />
          ))}
          <div className="w-3" />
          {LOWER_LEFT.map(n => (
            <Tooth key={n} number={n} data={toothMap.get(n)} onClick={() => onToothClick(n, toothMap.get(n) ?? null)} readOnly={readOnly} />
          ))}
        </div>
        <p className="text-xs text-center text-muted-foreground mt-2 font-medium">Lower Jaw</p>
      </div>
    </div>
  );
}