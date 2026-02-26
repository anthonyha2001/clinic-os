CREATE TABLE "policy_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"no_show_risk_threshold" integer DEFAULT 3 NOT NULL,
	"deposit_required_above_risk" boolean DEFAULT true NOT NULL,
	"inactivity_days_warning" integer DEFAULT 60 NOT NULL,
	"inactivity_days_critical" integer DEFAULT 90 NOT NULL,
	"large_discount_threshold_percent" integer DEFAULT 20 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "policy_settings_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "policy_settings" ADD CONSTRAINT "policy_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_settings" ADD CONSTRAINT "policy_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;