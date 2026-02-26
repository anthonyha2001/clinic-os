import { pgTable, uuid, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { appointments } from "./appointments";
import { services } from "./services";

export const appointmentLines = pgTable("appointment_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  appointmentId: uuid("appointment_id")
    .notNull()
    .references(() => appointments.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id, { onDelete: "cascade" }),
  planItemId: uuid("plan_item_id"),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  notes: text("notes"),
  sequenceOrder: integer("sequence_order").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
