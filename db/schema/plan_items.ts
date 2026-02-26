import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, integer, numeric, timestamp, check } from "drizzle-orm/pg-core";
import { plans } from "./plans";
import { services } from "./services";

export const planItems = pgTable(
  "plan_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "cascade" }),
    descriptionEn: varchar("description_en", { length: 500 }),
    descriptionFr: varchar("description_fr", { length: 500 }),
    descriptionAr: varchar("description_ar", { length: 500 }),
    sequenceOrder: integer("sequence_order").notNull(),
    quantityTotal: integer("quantity_total").notNull().default(1),
    quantityCompleted: integer("quantity_completed").notNull().default(0),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "plan_items_quantity_completed_lte_total",
      sql`${table.quantityCompleted} <= ${table.quantityTotal}`
    ),
  ]
);
