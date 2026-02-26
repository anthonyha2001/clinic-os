import { pgEnum, pgTable, uuid, varchar, numeric, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { patients } from "./patients";
import { appointments } from "./appointments";
import { users } from "./users";

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "voided",
]);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    appointmentId: uuid("appointment_id")
      .unique()
      .references(() => appointments.id, { onDelete: "set null" }),
    invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }),
    discountReason: text("discount_reason"),
    discountApprovedBy: uuid("discount_approved_by")
      .references(() => users.id, { onDelete: "set null" }),
    total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("invoices_org_invoice_number_unique").on(
      table.organizationId,
      table.invoiceNumber
    ),
    index("idx_invoices_org_status").on(table.organizationId, table.status),
    index("idx_invoices_patient").on(table.patientId),
  ]
);
