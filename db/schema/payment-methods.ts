import { pgTable, uuid, varchar, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const paymentMethodTypeEnum = ["cash", "card", "bank_transfer"] as const;

export type PaymentMethodType = (typeof paymentMethodTypeEnum)[number];

export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  labelEn: varchar("label_en", { length: 100 }).notNull(),
  labelFr: varchar("label_fr", { length: 100 }).notNull(),
  labelAr: varchar("label_ar", { length: 100 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
