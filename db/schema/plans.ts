import { pgEnum, pgTable, uuid, varchar, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { patients } from "./patients";
import { providerProfiles } from "./provider-profiles";
import { users } from "./users";

export const planStatusEnum = pgEnum("plan_status", [
  "proposed",
  "accepted",
  "in_progress",
  "completed",
  "canceled",
]);

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providerProfiles.id, { onDelete: "cascade" }),
    nameEn: varchar("name_en", { length: 255 }).notNull(),
    nameFr: varchar("name_fr", { length: 255 }).notNull(),
    nameAr: varchar("name_ar", { length: 255 }).notNull(),
    status: planStatusEnum("status").notNull().default("proposed"),
    totalEstimatedCost: numeric("total_estimated_cost", {
      precision: 10,
      scale: 2,
    }),
    notes: text("notes"),
    proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_plans_org_patient_status").on(
      table.organizationId,
      table.patientId,
      table.status
    ),
  ]
);
