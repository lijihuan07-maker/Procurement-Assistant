import "server-only";
import { msg, type Msg } from "./i18n";
import { asc, desc, eq } from "drizzle-orm";
import { schema, type DB } from "@/db";
import type { RfqLine, EmailTemplate } from "@/db/schema";
import { buildLines } from "./data";
import { familiesOf, fitOf, materialsBySupplier } from "./materials";
import { nextRfqNo, settingsOf } from "./settings";
import { DEFAULT_EMAIL } from "./email-default";
export { DEFAULT_EMAIL };



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

export async function recommend(db: DB, companyId: string, lines: RfqLine[], supplierType: string) {
  const sups = await db.select().from(schema.suppliers).where(eq(schema.suppliers.companyId, companyId)).orderBy(asc(schema.suppliers.name));
  const recs = await db.select().from(schema.priceRecords).where(eq(schema.priceRecords.companyId, companyId));
  const mats = await materialsBySupplier(db, companyId);
  const invited = await db.select({ supplierId: schema.invites.supplierId, status: schema.invites.status, packageId: schema.invites.packageId }).from(schema.invites);
  const quoted = await db.select({ supplierId: schema.quotes.supplierId, packageId: schema.quotes.packageId }).from(schema.quotes);
  const cats = new Set(lines.map((l) => l.category).filter(Boolean));
  const families = familiesOf(lines.map((l) => `${l.name} ${l.spec.split(";")[0]}`), lines.map((l) => l.category));
  const items = lines.map((l) => l.name);
  return sups.map((s) => {
    const mine = recs.filter((r) => r.supplierName === s.name && (cats.has(r.category) || s.categories.some((c) => cats.has(c))));
    const catMatch = s.categories.some((c) => cats.has(c)) || (supplierType && s.categories.some((c) => supplierType.includes(c) || c.includes(supplierType)));
    const fit = fitOf(s, mats.get(s.id) || [], families, items);
    const sent = invited.filter((i) => i.supplierId === s.id && i.status === "sent");
    const replied = sent.filter((i) => quoted.some((q) => q.supplierId === s.id && q.packageId === i.packageId));
    const last = mine.map((r) => r.date).sort().at(-1) || "";
    const reasons: Msg[] = [];
    const isNew = !recs.some((r) => r.supplierName === s.name) && !(mats.get(s.id) || []).some((m) => m.evidence === "record");
    if (mine.length) reasons.push(last ? msg("同类采购 {n} 次，最近 {date}", { n: mine.length, date: last }) : msg("同类采购 {n} 次", { n: mine.length }));
    if (fit) reasons.push(...fit.reasons);
    else if (!mine.length && catMatch) reasons.push(msg(isNew ? (s.source === "web" ? "网上找到的本地供应商，还没合作过" : "类别匹配，还没合作过") : "类别匹配，暂无同类成交记录"));
    if (sent.length) reasons.push(msg("报价回复 {a}/{b}", { a: replied.length, b: sent.length }));
    if (s.rating) reasons.push(msg("评分 {n}", { n: s.rating }));
    const tierScore = fit ? { 1: 5, 2: 3, 3: 1 }[fit.tier] : 0;
    const score = mine.length * 3 + tierScore + (catMatch ? 2 : 0) + (sent.length ? (replied.length / sent.length) * 2 : 0) + (s.rating || 0) * 0.5 + (last ? 0.5 : 0);
    return { supplier: s, score, reasons, match: mine.length > 0 || !!catMatch || !!fit, isNew, tier: fit?.tier ?? (mine.length ? 1 : catMatch ? 2 : 0) };
  }).sort((a, b) => b.score - a.score);
}

export async function loadPackage(db: DB, packageId: string) {
  const [pkg] = await db.select().from(schema.packages).where(eq(schema.packages.id, packageId));
  const [{ project, site }] = await db.select({ project: schema.projects, site: schema.sites }).from(schema.projects)
    .innerJoin(schema.sites, eq(schema.projects.siteId, schema.sites.id)).where(eq(schema.projects.id, pkg.projectId));
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, project.companyId));
  const settings = settingsOf(project, company);
  const lines = pkg.snapshot?.lines ?? (await buildLines(db, pkg.id));
  const quotes = await db.select().from(schema.quotes).where(eq(schema.quotes.packageId, pkg.id)).orderBy(asc(schema.quotes.createdAt));
  const invites = await db.select({ invite: schema.invites, supplier: schema.suppliers }).from(schema.invites)
    .innerJoin(schema.suppliers, eq(schema.invites.supplierId, schema.suppliers.id)).where(eq(schema.invites.packageId, pkg.id));
  const recs = await db.select().from(schema.priceRecords).where(eq(schema.priceRecords.companyId, company.id)).orderBy(desc(schema.priceRecords.date));
  const history: Record<string, { supplierName: string; unitPrice: number; unit: string; currency: string; date: string; source: string } | null> = {};
  for (const l of lines) { const h = matchHistory(l, recs); history[l.no] = h ? { supplierName: h.supplierName, unitPrice: h.unitPrice, unit: h.unit, currency: h.currency, date: h.date, source: h.source } : null; }
  const recos = await recommend(db, company.id, lines, pkg.supplierType);
  return {
    pkg, project: { id: project.id, name: project.name, siteId: site.id, siteName: site.name, location: site.location, owner: site.owner },
    settings: { ...settings, rfqTemplate: null, email: null }, nextRfqNo: pkg.status === "draft" ? await nextRfqNo(db, company.id, settings) : "",
    lines, quotes, invites: invites.map((r) => ({ ...r.invite, supplier: r.supplier })),
    rfqTemplate: settings.rfqTemplate,
    emailTemplate: settings.email || DEFAULT_EMAIL, customEmail: !!settings.email,
    history,
    recommendations: recos.map((r) => ({ supplier: r.supplier, reasons: r.reasons, score: r.score, match: r.match, isNew: r.isNew, tier: r.tier })),
  };
}

export function fillEmail(t: EmailTemplate, v: Record<string, string>) {
  const f = (s: string) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  // A value that came out empty must not leave a double space behind.
  const tidy = (x: string) => x.replace(/[ \t]{2,}/g, " ").replace(/ ([,.])/g, "$1");
  return { subject: tidy(f(t.subject)), body: tidy(f(t.body)) };
}
