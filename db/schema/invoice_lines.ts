import { pgTable, uuid, varchar, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { invoices } from "./invoices";
import { services } from "./services";
import { planItems } from "./plan_items";

export const invoiceLines = pgTable("invoice_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id")
    .references(() => services.id, { onDelete: "set null" }),
  planItemId: uuid("plan_item_id")
    .references(() => planItems.id, { onDelete: "set null" }),
  descriptionEn: varchar("description_en", { length: 500 }).notNull(),
  descriptionFr: varchar("description_fr", { length: 500 }).notNull(),
  descriptionAr: varchar("description_ar", { length: 500 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  // NOTE: line_total is computed at application layer (B-02) as quantity * unit_price.
  lineTotal: numeric("line_total", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
