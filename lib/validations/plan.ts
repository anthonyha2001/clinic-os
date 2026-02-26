import { z } from "zod";
import { planStatusEnum } from "@/db/schema/plans";

export const planItemSchema = z.object({
  service_id: z.string().uuid().optional().nullable(),
  quantity_total: z.number().int().min(1).default(1),
  unit_price: z.number().min(0),
  sequence_order: z.number().int().min(1),
  description_en: z.string().min(1).max(500),
  description_fr: z.string().max(500).optional(),
  description_ar: z.string().max(500).optional(),
  notes: z.string().optional(),
});

export const createPlanSchema = z.object({
  patient_id: z.string().uuid(),
  provider_id: z.string().uuid(),
  name_en: z.string().min(1).max(255),
  name_fr: z.string().max(255).optional(),
  name_ar: z.string().max(255).optional(),
  notes: z.string().optional().nullable(),
  total_estimated_cost: z.number().min(0).optional().nullable(),
  items: z.array(planItemSchema).min(1, "At least one plan item is required"),
});

export const updatePlanSchema = z.object({
  name_en: z.string().min(1).max(255).optional(),
  name_fr: z.string().min(1).max(255).optional(),
  name_ar: z.string().min(1).max(255).optional(),
  notes: z.string().optional().nullable(),
  total_estimated_cost: z.number().min(0).optional().nullable(),
  items: z.array(planItemSchema).min(1, "At least one plan item is required").optional(),
});

export const updatePlanStatusSchema = z.object({
  status: z.enum(planStatusEnum.enumValues),
  reason: z.string().optional(),
});

export const listPlansQuerySchema = z.object({
  patient_id: z.string().uuid().optional(),
  provider_id: z.string().uuid().optional(),
  status: z.enum(planStatusEnum.enumValues).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});
