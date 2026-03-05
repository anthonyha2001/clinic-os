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

  function getAppointmentCount(day: number) {
    return appointments.reduce((count, a) => {
      const start = (a.start_time ?? a.startTime) as string | undefined;
      if (!start) return count;
      const d = new Date(start);
      const matches =
        d.getFullYear() === viewYear &&
        d.getMonth() === viewMonth &&
        d.getDate() === day;
      return matches ? count + 1 : count;
    }, 0);
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
    <div className="app-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="rounded-lg px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-xs font-semibold text-foreground">{monthLabel}</span>
        <button
          onClick={nextMonth}
          className="rounded-lg px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
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

      <div className="grid grid-cols-7 gap-y-1">
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

          const appointmentCount = getAppointmentCount(day);
          const dots = Math.min(3, appointmentCount);

          return (
            <button
              key={i}
              onClick={() => onSelectDate(new Date(viewYear, viewMonth, day))}
              className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-xs transition-colors ${
                isSelected
                  ? "bg-primary/12 text-primary font-semibold"
                  : isTodayCell
                    ? "border border-primary/40 text-primary font-semibold"
                    : "text-foreground hover:bg-muted"
              }`}
            >
              {day}
              {dots > 0 && (
                <span className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5">
                  {Array.from({ length: dots }).map((_, idx) => (
                    <span
                      key={idx}
                      className="h-1 w-1 rounded-full bg-primary"
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
