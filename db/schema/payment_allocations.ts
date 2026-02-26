import { sql } from "drizzle-orm";
import { pgTable, uuid, numeric, timestamp, check } from "drizzle-orm/pg-core";
import { payments } from "./payments";
import { invoices } from "./invoices";

// Design note (B-05): over-allocation checks (invoice/payment aggregate sums)
// are validated in the service layer, not as DB constraints.
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("payment_allocations_amount_gt_zero", sql`${table.amount} > 0`),
  ]
);
