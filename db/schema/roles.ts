import { pgTable, uuid, varchar, timestamp, unique } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const roleNameEnum = [
  "admin",
  "manager",
  "receptionist",
  "provider",
  "accountant",
] as const;

export type RoleName = (typeof roleNameEnum)[number];

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("roles_org_name_unique").on(table.organizationId, table.name),
  ]
);
