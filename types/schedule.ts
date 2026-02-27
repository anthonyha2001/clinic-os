export type DaySchedule = {
  open: boolean;
  from: string; // "HH:MM"
  to: string; // "HH:MM"
  break_from: string | null;
  break_to: string | null;
};

export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type WorkingHours = {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
};

export type OffDay = {
  id: string;
  date: string; // "YYYY-MM-DD"
  label: string;
  recurring: boolean;
};

export type ClinicSchedule = {
  working_hours: WorkingHours;
  off_days: OffDay[];
};

const defaultDaySchedule = (
  open: boolean,
  from = "08:00",
  to = "18:00",
  breakFrom: string | null = "13:00",
  breakTo: string | null = "14:00"
): DaySchedule => ({
  open,
  from,
  to,
  break_from: breakFrom,
  break_to: breakTo,
});

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  monday: defaultDaySchedule(true),
  tuesday: defaultDaySchedule(true),
  wednesday: defaultDaySchedule(true),
  thursday: defaultDaySchedule(true),
  friday: defaultDaySchedule(true),
  saturday: defaultDaySchedule(true, "09:00", "14:00", null, null),
  sunday: defaultDaySchedule(false, "08:00", "18:00", null, null),
};
