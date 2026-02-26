import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const providerProfiles = pgTable("provider_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  specialtyEn: varchar("specialty_en", { length: 255 }),
  specialtyFr: varchar("specialty_fr", { length: 255 }),
  specialtyAr: varchar("specialty_ar", { length: 255 }),
  bioEn: text("bio_en"),
  bioFr: text("bio_fr"),
  bioAr: text("bio_ar"),
  isAcceptingAppointments: boolean("is_accepting_appointments").notNull().default(true),
  colorHex: varchar("color_hex", { length: 7 }).notNull().default("#3B82F6"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
