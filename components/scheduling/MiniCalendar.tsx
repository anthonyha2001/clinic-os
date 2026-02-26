"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Appointment = Record<string, unknown>;

export function MiniCalendar({
  selectedDate,
  onSelectDate,
  appointments,
  locale,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  appointments: Appointment[];
  locale: string;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0

  const daysInMonth = lastDay.getDate();
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  function hasAppointments(day: number) {
    return appointments.some((a) => {
      const start = (a.start_time ?? a.startTime) as string | undefined;
      if (!start) return false;
      const d = new Date(start);
      return (
        d.getFullYear() === viewYear &&
        d.getMonth() === viewMonth &&
        d.getDate() === day
      );
    });
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    locale,
    { month: "long", year: "numeric" }
  );

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="text-muted-foreground hover:text-foreground text-sm px-1"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-xs font-semibold">{monthLabel}</span>
        <button
          onClick={nextMonth}
          className="text-muted-foreground hover:text-foreground text-sm px-1"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div
            key={d}
            className="text-center text-xs text-muted-foreground font-medium py-0.5"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;

          const isSelected =
            day === selectedDate.getDate() &&
            viewMonth === selectedDate.getMonth() &&
            viewYear === selectedDate.getFullYear();

          const isTodayCell =
            day === today.getDate() &&
            viewMonth === today.getMonth() &&
            viewYear === today.getFullYear();

          const hasDot = hasAppointments(day);

          return (
            <button
              key={i}
              onClick={() => onSelectDate(new Date(viewYear, viewMonth, day))}
              className={`relative flex items-center justify-center text-xs rounded-full w-7 h-7 mx-auto transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground font-semibold"
                  : isTodayCell
                    ? "border border-primary text-primary font-semibold"
                    : "hover:bg-muted text-foreground"
              }`}
            >
              {day}
              {hasDot && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
