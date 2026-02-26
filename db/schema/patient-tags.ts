import { pgTable, uuid, primaryKey } from "drizzle-orm/pg-core";
import { patients } from "./patients";
import { tags } from "./tags";

export const patientTags = pgTable(
  "patient_tags",
  {
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.patientId, table.tagId] }),
  ]
);
