/**
 * Valid status transitions for appointments.
 * Key: current status → Value: array of allowed next statuses
 */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["confirmed", "canceled", "completed", "no_show"],
  confirmed: ["completed", "canceled", "no_show"],
  completed: [],
  canceled: ["scheduled"],
  no_show: ["scheduled"],
};

/**
 * Check if a transition from one status to another is valid.
 */
export function isValidTransition(
  from: string,
  to: string
): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}
