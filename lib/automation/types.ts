export type EventType =
  | "no_show_followup"
  | "plan_completed"
  | "recall_due"
  | "auto_invoice";

export type EntityType = "appointment" | "plan" | "patient" | "invoice";

export interface AutomationPayload {
  patient_name?: string;
  patient_phone?: string;
  appointment_time?: string;
  plan_name?: string;
  invoice_number?: string;
  invoice_amount?: number;
  recall_due_date?: string;
  [key: string]: unknown;
}

export interface AutomationEvent {
  id: string;
  organization_id: string;
  event_type: EventType;
  entity_type: EntityType;
  entity_id: string;
  patient_id: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "skipped";
  payload: AutomationPayload;
  error_message: string | null;
  scheduled_for: string;
  processed_at: string | null;
  created_at: string;
}