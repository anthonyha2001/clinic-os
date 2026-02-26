"use client";
import { useState, useEffect, useCallback } from "react";
import { ToothChart, type ToothCondition } from "./ToothChart";

interface ToothData {
  tooth_number: number;
  conditions: ToothCondition[];
  notes?: string;
}

export function DentalChartClient({ patientId }: { patientId: string }) {
  const [teeth, setTeeth] = useState<ToothData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeeth = useCallback(async () => {
    const res = await fetch(`/api/dental/chart/${patientId}`, {
      credentials: "include",
    });
    const data = await res.json();
    const rows = Array.isArray(data) ? data : data.teeth ?? [];
    setTeeth(
      rows.map((r: Record<string, unknown>) => ({
        tooth_number: Number(r.tooth_number),
        conditions: Array.isArray(r.conditions)
          ? r.conditions
          : typeof r.conditions === "string"
            ? JSON.parse(r.conditions || "[]")
            : [],
        notes: r.notes as string | undefined,
      }))
    );
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    fetchTeeth();
  }, [fetchTeeth]);

  async function onToothClick(toothNumber: number, current: ToothData | null) {
    const conditions = current?.conditions ?? [];
    const next: ToothCondition[] =
      conditions.length === 0
        ? ["cavity"]
        : conditions[0] === "cavity"
          ? ["filled"]
          : conditions[0] === "filled"
            ? ["crown"]
            : conditions[0] === "crown"
              ? ["root_canal"]
              : conditions[0] === "root_canal"
                ? ["missing"]
                : conditions[0] === "missing"
                  ? ["implant"]
                  : ["healthy"];
    await fetch(`/api/dental/chart/${patientId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        tooth_number: toothNumber,
        conditions: next,
        notes: current?.notes ?? null,
      }),
    });
    await fetchTeeth();
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Loading chart...
      </div>
    );
  }

  return (
    <ToothChart
      teeth={teeth}
      onToothClick={onToothClick}
      readOnly={false}
    />
  );
}
