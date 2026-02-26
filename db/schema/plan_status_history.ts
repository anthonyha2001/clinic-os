import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { plans, planStatusEnum } from "./plans";
import { users } from "./users";

export const planStatusHistory = pgTable("plan_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  oldStatus: planStatusEnum("old_status"),
  newStatus: planStatusEnum("new_status").notNull(),
  changedBy: uuid("changed_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
