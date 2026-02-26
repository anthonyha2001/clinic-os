import { pgTable, uuid, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { patients } from "./patients";
import { organizations } from "./organizations";

export const riskScores = pgTable(
  "risk_scores",
  {
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    totalAppointments: integer("total_appointments").notNull().default(0),
    noShowCount: integer("no_show_count").notNull().default(0),
    riskScore: integer("risk_score").notNull().default(0),
    lastCalculatedAt: timestamp("last_calculated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.patientId, table.organizationId] }),
  ]
);
