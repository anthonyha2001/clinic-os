import { pgTable, uuid, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const policySettings = pgTable("policy_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  noShowRiskThreshold: integer("no_show_risk_threshold").notNull().default(3),
  depositRequiredAboveRisk: boolean("deposit_required_above_risk").notNull().default(true),
  inactivityDaysWarning: integer("inactivity_days_warning").notNull().default(60),
  inactivityDaysCritical: integer("inactivity_days_critical").notNull().default(90),
  largeDiscountThresholdPercent: integer("large_discount_threshold_percent").notNull().default(20),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});
