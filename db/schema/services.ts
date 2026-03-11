import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  unique,
  primaryKey,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { tags } from "./tags";

export const serviceCategoryEnum = [
  "consultation",
  "procedure",
  "imaging",
  "lab",
  "other",
] as const;

export type ServiceCategory = (typeof serviceCategoryEnum)[number];

export const services = pgTable(
  "services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    nameEn: varchar("name_en", { length: 255 }).notNull(),
    nameFr: varchar("name_fr", { length: 255 }).notNull(),
    nameAr: varchar("name_ar", { length: 255 }).notNull(),
    descriptionEn: text("description_en"),
    descriptionFr: text("description_fr"),
    descriptionAr: text("description_ar"),
    category: varchar("category", { length: 50 }).notNull().default("other"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    defaultDurationMinutes: integer("default_duration_minutes")
      .notNull()
      .default(30),
    // Recall: if set, patients who had this service are due back after N days.
    // e.g. cleaning = 180, check-up = 365. NULL = no automatic recall.
    recallIntervalDays: integer("recall_interval_days"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("services_org_name_en_unique").on(table.organizationId, table.nameEn),
  ]
);

export const serviceTags = pgTable(
  "service_tags",
  {
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.serviceId, table.tagId] })]
);