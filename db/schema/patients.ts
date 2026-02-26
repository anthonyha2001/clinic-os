import { pgTable, uuid, varchar, text, date, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const patients = pgTable(
  "patients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    firstName: varchar("first_name", { length: 255 }).notNull(),
    lastName: varchar("last_name", { length: 255 }).notNull(),
    dateOfBirth: date("date_of_birth"),
    gender: varchar("gender", { length: 20 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }).notNull(),
    phoneSecondary: varchar("phone_secondary", { length: 50 }),
    address: text("address"),
    preferredLocale: varchar("preferred_locale", { length: 5 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("patients_org_phone_unique").on(table.organizationId, table.phone),
  ]
);
