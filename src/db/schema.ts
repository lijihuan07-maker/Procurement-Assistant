import { pgTable, text, integer, doublePrecision, timestamp, jsonb, uniqueIndex, index, boolean } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  rfqPrefix: text("rfq_prefix").notNull().default("RFQ-"),
  rfqNextNo: integer("rfq_next_no").notNull().default(1),
  rfqPad: integer("rfq_pad").notNull().default(3),
  currency: text("currency").notNull().default("SAR"),
  vatRate: doublePrecision("vat_rate").notNull().default(0.15),
  paymentTerms: text("payment_terms").notNull().default("Payment will be released within 45 days upon delivery of the materials to site, acceptance by the Buyer and receipt of the correct official invoice."),
  validity: text("validity").notNull().default("Within 90 days"),
  senderName: text("sender_name").notNull().default(""),
  /** English forms used in RFQs and emails to suppliers (filled by AI translation if left empty). */
  nameEn: text("name_en").notNull().default(""),
  senderEn: text("sender_en").notNull().default(""),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("buyer"), // admin | manager | buyer
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** An engineering project (工程项目), e.g. a villa compound or a seawater cooling plant. Holds the site location and its standards. */
export const sites = pgTable("sites", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  nameEn: text("name_en").notNull().default(""), // used in RFQs and supplier emails
  location: text("location").notNull().default(""),
  owner: text("owner").notNull().default(""),
  /** Material standards that apply where the project is, identified by AI from the location. */
  standards: jsonb("standards").$type<ProjectStandards | null>(),
  createdAt: createdAt(),
}, (t) => [index("sites_company_idx").on(t.companyId)]);

/** A procurement requirement (采购需求) inside an engineering project: one demand list, its specs, packages and RFQ settings. */
export const projects = pgTable("projects", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  siteId: text("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("material"), // material | subcontract | rental | service
  demandFileName: text("demand_file_name"),
  specsSkipped: boolean("specs_skipped").notNull().default(false), // simple materials: no specification book needed
  /** RFQ numbering, terms and templates for this requirement; copied from an earlier one when created from a template. */
  settings: jsonb("settings").$type<ReqSettings | null>(),
  createdAt: createdAt(),
}, (t) => [index("projects_company_idx").on(t.companyId), index("projects_site_idx").on(t.siteId)]);

/** Long-running work done on the server (reading a demand list), so it finishes even if the user leaves the page. */
export const jobs = pgTable("jobs", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("demand"),
  status: text("status").notNull().default("running"), // running | done | failed | cancelled
  fileName: text("file_name").notNull().default(""),
  total: integer("total").notNull().default(1),
  done: integer("done").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("jobs_project_idx").on(t.projectId)]);

export const jobParts = pgTable("job_parts", {
  id: id(),
  jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  idx: integer("idx").notNull(),
  input: jsonb("input").$type<Record<string, unknown> | null>(),
  items: jsonb("items").$type<unknown[] | null>(),
  status: text("status").notNull().default("pending"), // pending | done | failed
  error: text("error"),
}, (t) => [index("job_parts_job_idx").on(t.jobId)]);

export const packages = pgTable("packages", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  titleCn: text("title_cn").notNull().default(""),
  titleEn: text("title_en").notNull().default(""),
  supplierType: text("supplier_type").notNull().default(""),
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("draft"), // draft | issued | awarded
  rfqNo: text("rfq_no"),
  deadline: text("deadline"),
  snapshot: jsonb("snapshot").$type<RfqSnapshot | null>(),
  overrides: jsonb("overrides").$type<Overrides>().notNull().default({ price: {}, factor: {} }),
  review: jsonb("review").$type<{ flags: Flag[]; summary: string } | null>(),
  award: jsonb("award").$type<Award | null>(),
  createdAt: createdAt(),
}, (t) => [index("packages_project_idx").on(t.projectId)]);

export const demandItems = pgTable("demand_items", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  no: text("no").notNull().default(""),
  nameCn: text("name_cn").notNull().default(""),
  nameEn: text("name_en").notNull().default(""),
  spec: text("spec").notNull().default(""),
  unit: text("unit").notNull().default(""),
  qty: doublePrecision("qty").notNull().default(0),
  dateRequired: text("date_required").notNull().default(""),
  techReq: text("tech_req").notNull().default(""),
  specRef: text("spec_ref").notNull().default(""),
  category: text("category").notNull().default(""),
  quoteHint: text("quote_hint").notNull().default(""),
  issues: jsonb("issues").$type<string[]>().notNull().default([]),
  packageId: text("package_id").references(() => packages.id, { onDelete: "set null" }),
}, (t) => [index("items_project_idx").on(t.projectId)]);

export const clarifications = pgTable("clarifications", {
  id: id(),
  itemId: text("item_id").notNull().references(() => demandItems.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  questionEn: text("question_en").notNull().default(""),
  options: jsonb("options").$type<string[]>().notNull().default([]),
  answer: text("answer").notNull().default(""),
  status: text("status").notNull().default("open"), // open | answered | ignored
  specQuote: text("spec_quote").notNull().default(""),
});

export const specDocs = pgTable("spec_docs", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  pages: integer("pages").notNull().default(0),
  createdAt: createdAt(),
});

export const specSections = pgTable("spec_sections", {
  id: id(),
  docId: text("doc_id").notNull().references(() => specDocs.id, { onDelete: "cascade" }),
  sectionNo: text("section_no").notNull(), // digits only, e.g. 321413
  title: text("title").notNull().default(""),
  pageFrom: integer("page_from").notNull(),
  pageTo: integer("page_to").notNull(),
  body: text("body").notNull(),
}, (t) => [index("sections_doc_idx").on(t.docId)]);

export const suppliers = pgTable("suppliers", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
  contact: text("contact").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  city: text("city").notNull().default(""),
  website: text("website").notNull().default(""),
  rating: doublePrecision("rating"),
  notes: text("notes").notNull().default(""),
  source: text("source").notNull().default("manual"), // manual | import | web
  country: text("country").notNull().default(""),
  /** Material families (taxonomy keys) the AI judged this kind of company usually also supplies. */
  likely: jsonb("likely").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
}, (t) => [index("suppliers_company_idx").on(t.companyId)]);

/** What a supplier has supplied or quoted, one row per material. Private to the company. */
export const supplierMaterials = pgTable("supplier_materials", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  supplierId: text("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  family: text("family").notNull(), // taxonomy key, e.g. "cable"
  item: text("item").notNull().default(""), // the material as recorded, e.g. "光纤电缆"
  evidence: text("evidence").notNull().default("declared"), // record (bought/contract/award) | quote | declared (ledger category, typed by user)
  note: text("note").notNull().default(""),
  date: text("date").notNull().default(""),
  createdAt: createdAt(),
}, (t) => [index("sm_supplier_idx").on(t.supplierId), index("sm_company_family_idx").on(t.companyId, t.family)]);

export const invites = pgTable("invites", {
  id: id(),
  packageId: text("package_id").notNull().references(() => packages.id, { onDelete: "cascade" }),
  supplierId: text("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  status: text("status").notNull().default("draft"), // draft | sent
  sentAt: timestamp("sent_at", { withTimezone: true }),
  recommended: text("recommended").notNull().default(""),
});

export const quotes = pgTable("quotes", {
  id: id(),
  packageId: text("package_id").notNull().references(() => packages.id, { onDelete: "cascade" }),
  supplierId: text("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  fileName: text("file_name").notNull(),
  status: text("status").notNull().default("done"), // done | error
  error: text("error"),
  data: jsonb("data").$type<QuoteData>().notNull(),
  createdAt: createdAt(),
});

export const priceRecords = pgTable("price_records", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  supplierName: text("supplier_name").notNull(),
  material: text("material").notNull(),
  spec: text("spec").notNull().default(""),
  category: text("category").notNull().default(""),
  unit: text("unit").notNull().default(""),
  unitPrice: doublePrecision("unit_price").notNull(),
  currency: text("currency").notNull().default(""),
  date: text("date").notNull(),
  source: text("source").notNull().default("import"), // import | award
  packageId: text("package_id"),
}, (t) => [index("price_company_idx").on(t.companyId)]);

export const templates = pgTable("templates", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // rfq | email
  name: text("name").notNull(),
  data: jsonb("data").$type<RfqTemplate | EmailTemplate>().notNull(),
  createdAt: createdAt(),
});

export const editLog = pgTable("edit_log", {
  id: id(),
  companyId: text("company_id").notNull(),
  userId: text("user_id").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  at: createdAt(),
});

/* ---------- JSON shapes ---------- */
export type RfqLine = { no: string; itemId: string; name: string; spec: string; unit: string; qty: number; techReq: string; hint: string; category: string };
export type RfqSnapshot = { rfqNo: string; title: string; titleEn: string; project: string; projectEn?: string; currency: string; vatRate: number; deadline: string; validity: string; payment: string; lines: RfqLine[]; standards?: string[]; en?: RfqEnglish };
/** English-only version of a locked RFQ's text, made once by AI when first exported in English. */
export type RfqEnglish = { title: string; project: string; validity: string; payment: string; standards: string[]; lines: Record<string, { name: string; spec: string; techReq: string }>; extra?: Record<string, string> };
export type Overrides = { price: Record<string, Record<string, number>>; factor: Record<string, number> };
export type Flag = { level: "高" | "中" | "低" | "信息"; category: string; title: string; detail: string; action: string; source?: string };
export type Award = { mode: "whole" | "items"; quoteId?: string; items?: Record<string, string>; at: string };
export type QuoteLine = { rfqNo: string; quotedDesc: string; quotedQty: number | null; quotedUnit: string; unitPrice: number | null; perRfqUnit: number; conversionNote: string; deviation: string | null };
export type QuoteData = {
  supplier: string; quoteNo: string | null; date: string | null; currency: string; vatIncluded: boolean; isBlank: boolean;
  statedTotalExVat: number | null; statedTotalInclVat: number | null;
  terms: { payment: string; delivery: string; leadTime: string; validity: string; priceAdjustment: string; other: string };
  lines: QuoteLine[]; missing: string[]; issues: string[];
};
export type RfqTemplate = { fileName: string; titleSuffix: string; headerLines: string[]; blocks: { label: string; values: string[] }[]; fileB64?: string };
export type EmailTemplate = { subject: string; body: string };
export type ReqSettings = {
  rfqPrefix: string; rfqStart: number; rfqPad: number;
  currency: string; vatRate: number; paymentTerms: string; validity: string;
  rfqTemplate: RfqTemplate | null; email: EmailTemplate | null;
};

export type ProjectStandards = {
  location: string; // the location text these were identified for
  country: string;
  summary: string;
  systems: { name: string; scope: string; note: string }[];
  checkedAt: string;
};

/** Contract ledger: one row per purchase contract / PO with a supplier. */
export const contracts = pgTable("contracts", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  packageId: text("package_id").references(() => packages.id, { onDelete: "set null" }),
  supplierId: text("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  supplierName: text("supplier_name").notNull().default(""),
  projectName: text("project_name").notNull().default(""), // free text when the project is not in the tool
  contractNo: text("contract_no").notNull().default(""),
  title: text("title").notNull().default(""),
  signDate: text("sign_date").notNull().default(""),
  amount: doublePrecision("amount").notNull().default(0),
  currency: text("currency").notNull().default(""),
  taxIncluded: boolean("tax_included").notNull().default(true),
  paid: doublePrecision("paid").notNull().default(0),
  paymentTerms: text("payment_terms").notNull().default(""),
  deliveryDate: text("delivery_date").notNull().default(""),
  status: text("status").notNull().default("active"), // pending (to sign) | active | completed | terminated
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
}, (t) => [index("contracts_company_idx").on(t.companyId)]);

