import { pgTable, uuid, varchar, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const preferredLocaleEnum = ["ar", "fr", "en"] as const;

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(), // matches Supabase auth.users.id — NOT defaultRandom
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    email: varchar("email", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    preferredLocale: varchar("preferred_locale", { length: 2 })
      .notNull()
      .default("en"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("users_org_email_unique").on(table.organizationId, table.email),
  ]
);
