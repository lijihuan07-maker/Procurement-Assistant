import { pgTable, text, integer, doublePrecision, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";

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

export const projects = pgTable("projects", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  location: text("location").notNull().default(""),
  owner: text("owner").notNull().default(""),
  demandFileName: text("demand_file_name"),
  createdAt: createdAt(),
}, (t) => [index("projects_company_idx").on(t.companyId)]);

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
  createdAt: createdAt(),
}, (t) => [index("suppliers_company_idx").on(t.companyId)]);

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
export type RfqSnapshot = { rfqNo: string; title: string; titleEn: string; project: string; currency: string; vatRate: number; deadline: string; validity: string; payment: string; lines: RfqLine[] };
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
