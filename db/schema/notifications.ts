import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const notificationTypeEnum = [
  "new_appointment",
  "schedule_change",
  "no_show",
  "eod_summary",
] as const;

export type NotificationType = (typeof notificationTypeEnum)[number];

export const notifications = pgTable("notifications", {
  id:             uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId:         uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type:           varchar("type", { length: 80 }).notNull(),
  title:          varchar("title", { length: 255 }).notNull(),
  body:           text("body").notNull(),
  link:           varchar("link", { length: 500 }),
  isRead:         boolean("is_read").notNull().default(false),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});