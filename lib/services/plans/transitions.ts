export const VALID_PLAN_TRANSITIONS: Record<string, string[]> = {
  proposed: ["accepted", "canceled"],
  accepted: ["in_progress", "canceled"],
  in_progress: ["completed", "canceled"],
  completed: [],
  canceled: [],
};

export function isValidPlanTransition(from: string, to: string): boolean {
  return VALID_PLAN_TRANSITIONS[from]?.includes(to) ?? false;
}
