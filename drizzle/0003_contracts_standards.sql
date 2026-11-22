CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"project_id" text,
	"package_id" text,
	"supplier_id" text,
	"supplier_name" text DEFAULT '' NOT NULL,
	"project_name" text DEFAULT '' NOT NULL,
	"contract_no" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"sign_date" text DEFAULT '' NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"currency" text DEFAULT '' NOT NULL,
	"tax_included" boolean DEFAULT true NOT NULL,
	"paid" double precision DEFAULT 0 NOT NULL,
	"payment_terms" text DEFAULT '' NOT NULL,
	"delivery_date" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "standards" jsonb;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contracts_company_idx" ON "contracts" USING btree ("company_id");