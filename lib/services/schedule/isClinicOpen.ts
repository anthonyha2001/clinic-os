import { toZonedTime, fromZonedTime } from "date-fns-tz";
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
  date: Date,
  timezone: string = "Asia/Beirut"
): IsClinicOpenResult {
  const wh = workingHours ?? DEFAULT_WORKING_HOURS;
  const od = offDays ?? [];

  // Convert UTC date to org's local timezone
  const zonedDate = toZonedTime(date, timezone);

  const dayKey = DAY_MAP[zonedDate.getDay()];
  const schedule = wh[dayKey];
  if (!schedule?.open) {
    return { open: false, reason: "Clinic is closed on this day" };
  }

  // Check off days using zoned date
  const off = od.find((o) => isDateMatch(o, zonedDate));
  if (off) {
    return { open: false, reason: off.label };
  }

  const mins = zonedDate.getHours() * 60 + zonedDate.getMinutes();
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
      return {
        open: false,
        reason: `Break: ${schedule.break_from} - ${schedule.break_to}`,
      };
    }
  }

  return { open: true };
}

export function getAvailableSlots(
  workingHours: WorkingHours | null | undefined,
  offDays: OffDay[] | null | undefined,
  date: Date,
  slotDurationMinutes: number,
  existingAppointments: { start: Date; end: Date }[] = [],
  timezone: string = "Asia/Beirut"
): Date[] {
  const wh = workingHours ?? DEFAULT_WORKING_HOURS;
  const od = offDays ?? [];

  const zonedDate = toZonedTime(date, timezone);
  const dayKey = DAY_MAP[zonedDate.getDay()];
  const schedule = wh[dayKey];
  if (!schedule?.open) return [];
  const offDay = od.find((o) => isDateMatch(o, zonedDate));
  if (offDay) return [];

  const fromMins = parseTime(schedule.from);
  const toMins = parseTime(schedule.to);
  const breakFrom = schedule.break_from ? parseTime(schedule.break_from) : null;
  const breakTo = schedule.break_to ? parseTime(schedule.break_to) : null;

  const slots: Date[] = [];
  const year = zonedDate.getFullYear();
  const month = zonedDate.getMonth();
  const day = zonedDate.getDate();

  for (
    let m = fromMins;
    m + slotDurationMinutes <= toMins;
    m += slotDurationMinutes
  ) {
    if (
      breakFrom !== null &&
      breakTo !== null &&
      m < breakTo &&
      m + slotDurationMinutes > breakFrom
    ) {
      continue;
    }

    // Build slot time in org timezone, then convert back to UTC
    const slotStartZoned = new Date(
      year,
      month,
      day,
      Math.floor(m / 60),
      m % 60,
      0,
      0
    );
    const slotStart = fromZonedTime(slotStartZoned, timezone);
    const slotEnd = new Date(
      slotStart.getTime() + slotDurationMinutes * 60 * 1000
    );

    const overlaps = existingAppointments.some(
      (apt) => slotStart < apt.end && slotEnd > apt.start
    );
    if (!overlaps) slots.push(slotStart);
  }
  return slots;
}

export function getOffDayForDate(
  offDays: OffDay[] | null | undefined,
  date: Date,
  timezone: string = "Asia/Beirut"
): OffDay | null {
  const od = offDays ?? [];
  const zonedDate = toZonedTime(date, timezone);
  return od.find((o) => isDateMatch(o, zonedDate)) ?? null;
}
