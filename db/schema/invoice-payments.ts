import {
    pgTable,
    uuid,
    numeric,
    varchar,
    text,
    timestamp,
    index,
    check,
  } from "drizzle-orm/pg-core";
  import { sql } from "drizzle-orm";
  import { organizations } from "./organizations";
  import { invoices } from "./invoices";
  import { users } from "./users";
  
  export const invoicePayments = pgTable(
    "invoice_payments",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      organizationId: uuid("organization_id")
        .notNull()
        .references(() => organizations.id, { onDelete: "cascade" }),
      invoiceId: uuid("invoice_id")
        .notNull()
        .references(() => invoices.id, { onDelete: "cascade" }),
      // payment_method_id is a loose FK — payment_methods table may not be in Drizzle yet
      paymentMethodId: uuid("payment_method_id"),
      amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
      paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
      reference: varchar("reference", { length: 255 }),
      notes: text("notes"),
      recordedBy: uuid("recorded_by").references(() => users.id, {
        onDelete: "set null",
      }),
      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      index("idx_invoice_payments_invoice").on(table.invoiceId),
      index("idx_invoice_payments_org_date").on(
        table.organizationId,
        table.paidAt
      ),
      check("invoice_payments_amount_positive", sql`${table.amount} > 0`),
    ]
  );