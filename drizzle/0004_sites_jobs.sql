CREATE TABLE "job_parts" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"idx" integer NOT NULL,
	"input" jsonb,
	"items" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"project_id" text NOT NULL,
	"kind" text DEFAULT 'demand' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"total" integer DEFAULT 1 NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"standards" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "site_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "kind" text DEFAULT 'material' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "settings" jsonb;--> statement-breakpoint
ALTER TABLE "job_parts" ADD CONSTRAINT "job_parts_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_parts_job_idx" ON "job_parts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "jobs_project_idx" ON "jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "sites_company_idx" ON "sites" USING btree ("company_id");--> statement-breakpoint
-- Existing projects become requirements, each inside its own engineering project (users can move them later).
INSERT INTO "sites" ("id", "company_id", "name", "location", "owner", "standards", "created_at")
  SELECT 'site-' || "id", "company_id", "name", "location", "owner", "standards", "created_at" FROM "projects";--> statement-breakpoint
UPDATE "projects" SET "site_id" = 'site-' || "id";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "site_id" SET NOT NULL;--> statement-breakpoint
-- RFQ settings and templates move from the company to each requirement.
UPDATE "projects" p SET "settings" = jsonb_build_object(
  'rfqPrefix', c."rfq_prefix", 'rfqStart', c."rfq_next_no", 'rfqPad', c."rfq_pad", 'currency', c."currency", 'vatRate', c."vat_rate",
  'paymentTerms', c."payment_terms", 'validity', c."validity",
  'rfqTemplate', (SELECT t."data" FROM "templates" t WHERE t."company_id" = c."id" AND t."kind" = 'rfq' ORDER BY t."created_at" DESC LIMIT 1),
  'email', (SELECT t."data" FROM "templates" t WHERE t."company_id" = c."id" AND t."kind" = 'email' ORDER BY t."created_at" DESC LIMIT 1)
) FROM "companies" c WHERE c."id" = p."company_id";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_site_idx" ON "projects" USING btree ("site_id");