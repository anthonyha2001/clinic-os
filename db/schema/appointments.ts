import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, boolean, timestamp, index, check } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { patients } from "./patients";
import { providerProfiles } from "./provider-profiles";
import { users } from "./users";
import { planItems } from "./plan_items";

export const appointments = pgTable(
  "appointments",
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
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("scheduled"),
    planItemId: uuid("plan_item_id")
      .references(() => planItems.id, { onDelete: "set null" }),
    notes: text("notes"),
    depositRequired: boolean("deposit_required").notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_appt_provider_time").on(
      table.organizationId, table.providerId, table.startTime, table.endTime
    ),
    index("idx_appt_patient").on(table.organizationId, table.patientId),
    check(
      "chk_duration_bounds",
      sql`${table.endTime} > ${table.startTime}
          AND ${table.endTime} >= ${table.startTime} + interval '5 minutes'
          AND ${table.endTime} <= ${table.startTime} + interval '12 hours'`
    ),
  ]
);
