import type { WorkingHours, OffDay, DayKey } from "@/types/schedule";
import { DEFAULT_WORKING_HOURS } from "@/types/schedule";

const DAY_MAP: Record<number, DayKey> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function isDateMatch(offDay: OffDay, date: Date): boolean {
  const offDate = offDay.date;
  const d = date;
  const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (dStr === offDate) return true;
  if (offDay.recurring) {
    const parts = offDate.split("-");
    const m = parts[1];
    const day = parts[2];
    const dMonth = String(d.getMonth() + 1).padStart(2, "0");
    const dDay = String(d.getDate()).padStart(2, "0");
    return m === dMonth && day === dDay;
  }
  return false;
}

export interface IsClinicOpenResult {
  open: boolean;
  reason?: string;
}

export function isClinicOpen(
  workingHours: WorkingHours | null | undefined,
  offDays: OffDay[] | null | undefined,
  date: Date
): IsClinicOpenResult {
  const wh = workingHours ?? DEFAULT_WORKING_HOURS;
  const od = offDays ?? [];

  const dayKey = DAY_MAP[date.getDay()];
  const schedule = wh[dayKey];
  if (!schedule?.open) {
    return { open: false, reason: "Clinic is closed on this day" };
  }

  const off = od.find((o) => isDateMatch(o, date));
  if (off) {
    return { open: false, reason: off.label };
  }

  const mins = date.getHours() * 60 + date.getMinutes();
  const fromMins = parseTime(schedule.from);
  const toMins = parseTime(schedule.to);

  if (mins < fromMins) {
    return { open: false, reason: `Opens at ${schedule.from}` };
  }
  if (mins >= toMins) {
    return { open: false, reason: `Closes at ${schedule.to}` };
  }

  if (schedule.break_from && schedule.break_to) {
    const breakFrom = parseTime(schedule.break_from);
    const breakTo = parseTime(schedule.break_to);
    if (mins >= breakFrom && mins < breakTo) {
      return { open: false, reason: `Break: ${schedule.break_from} - ${schedule.break_to}` };
    }
  }

  return { open: true };
}

export function getAvailableSlots(
  workingHours: WorkingHours | null | undefined,
  offDays: OffDay[] | null | undefined,
  date: Date,
  slotDurationMinutes: number,
  existingAppointments: { start: Date; end: Date }[] = []
): Date[] {
  const wh = workingHours ?? DEFAULT_WORKING_HOURS;
  const od = offDays ?? [];

  const result = isClinicOpen(wh, od, date);
  if (!result.open) return [];

  const dayKey = DAY_MAP[date.getDay()];
  const schedule = wh[dayKey];
  if (!schedule?.open) return [];

  const fromMins = parseTime(schedule.from);
  const toMins = parseTime(schedule.to);
  const breakFrom = schedule.break_from ? parseTime(schedule.break_from) : null;
  const breakTo = schedule.break_to ? parseTime(schedule.break_to) : null;

  const slots: Date[] = [];
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  for (let m = fromMins; m + slotDurationMinutes <= toMins; m += slotDurationMinutes) {
    if (breakFrom !== null && breakTo !== null && m < breakTo && m + slotDurationMinutes > breakFrom) {
      continue;
    }
    const slotStart = new Date(year, month, day, Math.floor(m / 60), m % 60, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60 * 1000);

    const overlaps = existingAppointments.some(
      (apt) => slotStart < apt.end && slotEnd > apt.start
    );
    if (!overlaps) slots.push(slotStart);
  }
  return slots;
}

export function getOffDayForDate(
  offDays: OffDay[] | null | undefined,
  date: Date
): OffDay | null {
  const od = offDays ?? [];
  return od.find((o) => isDateMatch(o, date)) ?? null;
}
