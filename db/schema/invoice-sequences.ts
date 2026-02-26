import { pgTable, uuid, integer } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const invoiceSequences = pgTable("invoice_sequences", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  lastSeq: integer("last_seq").notNull().default(0),
});
