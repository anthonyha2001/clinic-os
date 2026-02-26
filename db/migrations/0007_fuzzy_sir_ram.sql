CREATE TABLE "service_tags" (
	"service_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "service_tags_service_id_tag_id_pk" PRIMARY KEY("service_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name_en" varchar(255) NOT NULL,
	"name_fr" varchar(255) NOT NULL,
	"name_ar" varchar(255) NOT NULL,
	"description_en" text,
	"description_fr" text,
	"description_ar" text,
	"category" varchar(50) DEFAULT 'other' NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"default_duration_minutes" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_org_name_en_unique" UNIQUE("organization_id","name_en")
);
--> statement-breakpoint
ALTER TABLE "service_tags" ADD CONSTRAINT "service_tags_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tags" ADD CONSTRAINT "service_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;