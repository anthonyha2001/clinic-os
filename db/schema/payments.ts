import { pgTable, uuid, numeric, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { patients } from "./patients";
import { paymentMethods } from "./payment-methods";
import { users } from "./users";

// Design note (B-06): payments are immutable records once created.
// Any adjustment should be represented via allocation/edit workflows + audit logs,
// not in-place mutation of the original payment row.
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id, { onDelete: "cascade" }),
  paymentMethodId: uuid("payment_method_id")
    .notNull()
    .references(() => paymentMethods.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  referenceNumber: varchar("reference_number", { length: 100 }),
  notes: text("notes"),
  receivedBy: uuid("received_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
