import { pgTable, uuid, varchar, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    nameEn: varchar("name_en", { length: 100 }).notNull(),
    nameFr: varchar("name_fr", { length: 100 }).notNull(),
    nameAr: varchar("name_ar", { length: 100 }).notNull(),
    colorHex: varchar("color_hex", { length: 7 }).notNull().default("#6B7280"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("tags_org_name_en_unique").on(table.organizationId, table.nameEn),
  ]
);
