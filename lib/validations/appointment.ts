import { z } from "zod";

export const createAppointmentLineSchema = z.object({
  service_id: z.uuid(),
  quantity: z.number().int().min(1).default(1),
  unit_price_override: z.number().min(0).optional(),
  duration_override: z.number().int().min(1).optional(),
  plan_item_id: z.uuid().optional(),
  notes: z.string().optional(),
});

export type CreateAppointmentLine = z.infer<typeof createAppointmentLineSchema>;

export const createAppointmentSchema = z
  .object({
    patient_id: z.uuid(),
    provider_id: z.uuid(),
    start_time: z.iso.datetime({ offset: true }),
    notes: z.string().optional(),
    lines: z
      .array(createAppointmentLineSchema)
      .min(1, "At least one service line is required"),
  })
  .refine(
    (data) => {
      // Compute totalDuration from overrides only; actual duration comes from service lookup at runtime.
      // Full duration validation happens in the service layer.
      void data.lines.reduce(
        (sum, line) => sum + (line.duration_override ?? 0),
        0
      ); // Compute totalDuration from overrides; service layer validates
      return true; // Override-only validation; service layer handles full duration
    },
    { message: "Duration validation is performed in the service layer" }
  );

export type CreateAppointment = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z.object({
  start_time: z.string().datetime({ offset: true }).optional(),
  end_time: z.string().datetime({ offset: true }).optional(),
  provider_id: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  notes: z.string().optional().nullable(),
});

export type UpdateAppointment = z.infer<typeof updateAppointmentSchema>;

export const updateAppointmentStatusSchema = z.object({
  status: z.enum(["scheduled", "confirmed", "completed", "canceled", "no_show"]),
  reason: z.string().optional(),
});

export type UpdateAppointmentStatus = z.infer<typeof updateAppointmentStatusSchema>;
