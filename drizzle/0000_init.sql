CREATE TABLE "clarifications" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"question" text NOT NULL,
	"question_en" text DEFAULT '' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"spec_quote" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"rfq_prefix" text DEFAULT 'RFQ-' NOT NULL,
	"rfq_next_no" integer DEFAULT 1 NOT NULL,
	"rfq_pad" integer DEFAULT 3 NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"vat_rate" double precision DEFAULT 0.15 NOT NULL,
	"payment_terms" text DEFAULT 'Payment will be released within 45 days upon delivery of the materials to site, acceptance by the Buyer and receipt of the correct official invoice.' NOT NULL,
	"validity" text DEFAULT 'Within 90 days' NOT NULL,
	"sender_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demand_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"seq" integer NOT NULL,
	"no" text DEFAULT '' NOT NULL,
	"name_cn" text DEFAULT '' NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"spec" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"qty" double precision DEFAULT 0 NOT NULL,
	"date_required" text DEFAULT '' NOT NULL,
	"tech_req" text DEFAULT '' NOT NULL,
	"spec_ref" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"quote_hint" text DEFAULT '' NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"package_id" text
);
--> statement-breakpoint
CREATE TABLE "edit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"package_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"recommended" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"code" text NOT NULL,
	"title_cn" text DEFAULT '' NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"supplier_type" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"rfq_no" text,
	"deadline" text,
	"snapshot" jsonb,
	"overrides" jsonb DEFAULT '{"price":{},"factor":{}}'::jsonb NOT NULL,
	"review" jsonb,
	"award" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_records" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"supplier_name" text NOT NULL,
	"material" text NOT NULL,
	"spec" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"unit_price" double precision NOT NULL,
	"currency" text DEFAULT '' NOT NULL,
	"date" text NOT NULL,
	"source" text DEFAULT 'import' NOT NULL,
	"package_id" text
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"demand_file_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"package_id" text NOT NULL,
	"supplier_id" text,
	"file_name" text NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"error" text,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spec_docs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"file_name" text NOT NULL,
	"pages" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spec_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"doc_id" text NOT NULL,
	"section_no" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"page_from" integer NOT NULL,
	"page_to" integer NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"rating" double precision,
	"notes" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'buyer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_item_id_demand_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."demand_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_items" ADD CONSTRAINT "demand_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_items" ADD CONSTRAINT "demand_items_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_records" ADD CONSTRAINT "price_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_docs" ADD CONSTRAINT "spec_docs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_sections" ADD CONSTRAINT "spec_sections_doc_id_spec_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."spec_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_project_idx" ON "demand_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "packages_project_idx" ON "packages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "price_company_idx" ON "price_records" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "projects_company_idx" ON "projects" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "sections_doc_idx" ON "spec_sections" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "suppliers_company_idx" ON "suppliers" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");