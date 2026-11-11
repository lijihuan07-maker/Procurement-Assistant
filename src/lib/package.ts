import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { schema, type DB } from "@/db";
import type { RfqLine, RfqTemplate, EmailTemplate } from "@/db/schema";
import { buildLines } from "./data";

export const DEFAULT_EMAIL: EmailTemplate = {
  subject: "Request for Quotation {rfqNo} – {title}",
  body: `Dear {contact},

We are pleased to invite {supplier} to submit your best quotation for the materials listed in the attached RFQ ({rfqNo}) for our project {project}.

Please note:
- Quote every item in the unit stated in the RFQ. If you price in another unit, state the conversion.
- State any deviation from the specification in the Remark column.
- Unit prices shall exclude VAT; please show VAT separately.

Kindly send your signed and stamped quotation by {deadline}, replying to this email and keeping all recipients in copy.

Best regards,
{sender}
{company}`,
};

const norm = (s: string) => s.toLowerCase().replace(/[\s\-_,.;:()（）、，]/g, "");
const dims = (s: string) => (s.match(/\d+(?:\.\d+)?/g) || []).sort().join("x");

/** Most recent purchase price that plausibly matches an RFQ line (same material words; same dimensions if both have them). */
function matchHistory(line: RfqLine, recs: (typeof schema.priceRecords.$inferSelect)[]) {
  const ln = norm(line.name);
  const ld = dims(line.spec.split(";")[0]); // ignore confirmed answers appended after ";"
  const hit = recs.filter((r) => {
    const m = norm(r.material);
    if (!m || !(ln.includes(m) || m.includes(ln))) return false;
    const rd = dims(r.spec);
    return !rd || !ld || rd === ld;
  });
  return hit[0] || null; // recs are sorted newest first
}

export async function recommend(db: DB, companyId: string, categories: string[], supplierType: string) {
  const sups = await db.select().from(schema.suppliers).where(eq(schema.suppliers.companyId, companyId)).orderBy(asc(schema.suppliers.name));
  const recs = await db.select().from(schema.priceRecords).where(eq(schema.priceRecords.companyId, companyId));
  const invited = await db.select({ supplierId: schema.invites.supplierId, status: schema.invites.status, packageId: schema.invites.packageId }).from(schema.invites);
  const quoted = await db.select({ supplierId: schema.quotes.supplierId, packageId: schema.quotes.packageId }).from(schema.quotes);
  const cats = new Set(categories.filter(Boolean));
  return sups.map((s) => {
    const mine = recs.filter((r) => r.supplierName === s.name && (cats.has(r.category) || s.categories.some((c) => cats.has(c))));
    const catMatch = s.categories.some((c) => cats.has(c)) || (supplierType && s.categories.some((c) => supplierType.includes(c) || c.includes(supplierType)));
    const sent = invited.filter((i) => i.supplierId === s.id && i.status === "sent");
    const replied = sent.filter((i) => quoted.some((q) => q.supplierId === s.id && q.packageId === i.packageId));
    const last = mine.map((r) => r.date).sort().at(-1) || "";
    const reasons: string[] = [];
    if (mine.length) reasons.push(`同类采购 ${mine.length} 次${last ? "，最近 " + last : ""}`);
    else if (catMatch) reasons.push("类别匹配，暂无成交记录");
    if (sent.length) reasons.push(`报价回复 ${replied.length}/${sent.length}`);
    if (s.rating) reasons.push(`评分 ${s.rating}`);
    const score = mine.length * 3 + (catMatch ? 2 : 0) + (sent.length ? (replied.length / sent.length) * 2 : 0) + (s.rating || 0) * 0.5 + (last ? 0.5 : 0);
    return { supplier: s, score, reasons, match: mine.length > 0 || !!catMatch };
  }).sort((a, b) => b.score - a.score);
}

export async function loadPackage(db: DB, packageId: string) {
  const [pkg] = await db.select().from(schema.packages).where(eq(schema.packages.id, packageId));
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, pkg.projectId));
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, project.companyId));
  const lines = pkg.snapshot?.lines ?? (await buildLines(db, pkg.id));
  const quotes = await db.select().from(schema.quotes).where(eq(schema.quotes.packageId, pkg.id)).orderBy(asc(schema.quotes.createdAt));
  const invites = await db.select({ invite: schema.invites, supplier: schema.suppliers }).from(schema.invites)
    .innerJoin(schema.suppliers, eq(schema.invites.supplierId, schema.suppliers.id)).where(eq(schema.invites.packageId, pkg.id));
  const [rfqTpl] = await db.select().from(schema.templates).where(and(eq(schema.templates.companyId, company.id), eq(schema.templates.kind, "rfq"))).orderBy(desc(schema.templates.createdAt)).limit(1);
  const [emailTpl] = await db.select().from(schema.templates).where(and(eq(schema.templates.companyId, company.id), eq(schema.templates.kind, "email"))).orderBy(desc(schema.templates.createdAt)).limit(1);
  const recs = await db.select().from(schema.priceRecords).where(eq(schema.priceRecords.companyId, company.id)).orderBy(desc(schema.priceRecords.date));
  const history: Record<string, { supplierName: string; unitPrice: number; unit: string; currency: string; date: string; source: string } | null> = {};
  for (const l of lines) { const h = matchHistory(l, recs); history[l.no] = h ? { supplierName: h.supplierName, unitPrice: h.unitPrice, unit: h.unit, currency: h.currency, date: h.date, source: h.source } : null; }
  const categories = [...new Set(lines.map((l) => l.category))];
  const recos = await recommend(db, company.id, categories, pkg.supplierType);
  return {
    pkg, project: { id: project.id, name: project.name, location: project.location, owner: project.owner },
    company: { name: company.name, currency: company.currency, vatRate: company.vatRate, paymentTerms: company.paymentTerms, validity: company.validity, senderName: company.senderName, rfqPrefix: company.rfqPrefix, rfqNextNo: company.rfqNextNo, rfqPad: company.rfqPad },
    lines, quotes, invites: invites.map((r) => ({ ...r.invite, supplier: r.supplier })),
    rfqTemplate: (rfqTpl?.data as RfqTemplate) || null,
    emailTemplate: (emailTpl?.data as EmailTemplate) || DEFAULT_EMAIL,
    history,
    recommendations: recos.map((r) => ({ supplier: r.supplier, reasons: r.reasons, score: r.score, match: r.match })),
  };
}

export function fillEmail(t: EmailTemplate, v: Record<string, string>) {
  const f = (s: string) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  return { subject: f(t.subject), body: f(t.body) };
}
