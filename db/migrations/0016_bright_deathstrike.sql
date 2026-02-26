CREATE TABLE "risk_scores" (
	"patient_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"total_appointments" integer DEFAULT 0 NOT NULL,
	"no_show_count" integer DEFAULT 0 NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"last_calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risk_scores_patient_id_organization_id_pk" PRIMARY KEY("patient_id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "risk_scores" ADD CONSTRAINT "risk_scores_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_scores" ADD CONSTRAINT "risk_scores_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;