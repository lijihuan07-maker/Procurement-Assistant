import "server-only";
import { and, eq, like } from "drizzle-orm";
import { schema, type DB } from "@/db";
import type { EmailTemplate, ReqSettings, RfqTemplate } from "@/db/schema";

export const KINDS = ["material", "subcontract", "rental", "service"] as const;
export const KIND_LABEL: Record<string, string> = { material: "材料", subcontract: "分包", rental: "租赁", service: "服务" };

type Company = typeof schema.companies.$inferSelect;

/** Settings for a new requirement when nothing is copied: the company's old defaults. */
export function defaultSettings(c: Company): ReqSettings {
  return { rfqPrefix: c.rfqPrefix, rfqStart: 1, rfqPad: c.rfqPad, currency: c.currency, vatRate: c.vatRate, paymentTerms: c.paymentTerms, validity: c.validity, rfqTemplate: null, email: null };
}

/** Clean settings coming from the browser; missing fields fall back to `base`. */
export function cleanSettings(v: unknown, base: ReqSettings): ReqSettings {
  const b = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const str = (k: keyof ReqSettings, max = 4000) => (typeof b[k] === "string" ? String(b[k]).slice(0, max) : (base[k] as string));
  const int = (k: "rfqStart" | "rfqPad", min: number, max: number) => { const n = Number(b[k]); return Number.isInteger(n) && n >= min && n <= max ? n : base[k]; };
  const vat = Number(b.vatRate);
  const tpl = b.rfqTemplate === null ? null : b.rfqTemplate && typeof b.rfqTemplate === "object" ? (b.rfqTemplate as RfqTemplate) : base.rfqTemplate;
  const em = b.email && typeof b.email === "object" ? (b.email as EmailTemplate) : b.email === null ? null : base.email;
  return {
    rfqPrefix: str("rfqPrefix", 40), rfqStart: int("rfqStart", 1, 1e9), rfqPad: int("rfqPad", 1, 8),
    currency: str("currency", 10).toUpperCase() || base.currency, vatRate: b.vatRate != null && isFinite(vat) && vat >= 0 && vat < 1 ? vat : base.vatRate,
    paymentTerms: str("paymentTerms"), validity: str("validity", 300),
    rfqTemplate: tpl, email: em ? { subject: String(em.subject || "").slice(0, 300), body: String(em.body || "").slice(0, 8000) } : null,
  };
}

export function settingsOf(p: { settings: ReqSettings | null }, c: Company): ReqSettings {
  return p.settings ? { ...defaultSettings(c), ...p.settings } : defaultSettings(c);
}

/** Next RFQ number for a prefix: one above the highest already issued in the company, never below the start number. */
export async function nextRfqNo(db: DB, companyId: string, s: ReqSettings, exceptPackageId?: string) {
  const used = await db.select({ no: schema.packages.rfqNo, id: schema.packages.id }).from(schema.packages)
    .innerJoin(schema.projects, eq(schema.packages.projectId, schema.projects.id))
    .where(and(eq(schema.projects.companyId, companyId), like(schema.packages.rfqNo, `${s.rfqPrefix.replace(/[%_\\]/g, "\\$&")}%`)));
  let max = s.rfqStart - 1;
  for (const u of used) {
    if (u.id === exceptPackageId || !u.no) continue;
    const n = Number(u.no.slice(s.rfqPrefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return s.rfqPrefix + String(max + 1).padStart(s.rfqPad, "0");
}

/** What a template looks like in the "use an earlier one" list. */
export function templateSummary(s: ReqSettings) {
  return { prefix: s.rfqPrefix, currency: s.currency, vatRate: s.vatRate, file: s.rfqTemplate?.fileName || "", email: !!s.email };
}
