import { pgTable, uuid, varchar, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { roles } from "./roles";
import { users } from "./users";

export const permissionKeys = [
  "service.edit_price",
  "discount.large",
  "invoice.void",
  "payment.void",
  "settings.edit",
  "user.manage",
  "reports.view",
  "patient.manage",
  "appointment.manage",
  "invoice.create",
  "payment.record",
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export const permissions = pgTable("permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 100 }).unique().notNull(),
  description: text("description"),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
  ]
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
  ]
);
