import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { schema, type DB } from "@/db";
import { FAMILY, classify } from "./taxonomy";
import { msg, type Msg } from "./i18n";

export type MaterialIn = { family: string; item?: string; evidence?: string; note?: string; date?: string };
type Mat = typeof schema.supplierMaterials.$inferSelect;
type Sup = typeof schema.suppliers.$inferSelect;

const EVIDENCE = ["record", "quote", "declared"];
const norm = (s: string) => String(s || "").toLowerCase().replace(/[\s\-_,.;:()（）、，/]/g, "");

/** Record what a supplier supplied/quoted. Same family + item + evidence is kept once (newest date wins). */
export async function addMaterials(db: DB, companyId: string, supplierId: string, list: MaterialIn[]) {
  const clean = list
    .map((m) => ({ family: String(m.family || ""), item: String(m.item || "").trim().slice(0, 120), evidence: EVIDENCE.includes(String(m.evidence)) ? String(m.evidence) : "declared", note: String(m.note || "").slice(0, 300), date: /^\d{4}-\d{2}-\d{2}$/.test(String(m.date || "")) ? String(m.date) : "" }))
    .filter((m) => FAMILY[m.family]);
  if (!clean.length) return 0;
  const have = await db.select().from(schema.supplierMaterials).where(eq(schema.supplierMaterials.supplierId, supplierId));
  let added = 0;
  for (const m of clean) {
    // "联锁块" and "联锁块 INTERLOCK PAVER" are the same material: one contains the other.
    const n = norm(m.item);
    const same = have.find((h) => { const hn = norm(h.item); return h.family === m.family && h.evidence === m.evidence && (hn === n || (!!hn && !!n && (hn.includes(n) || n.includes(hn)))); });
    if (same) {
      if (m.date && m.date > same.date) await db.update(schema.supplierMaterials).set({ date: m.date, note: m.note || same.note }).where(eq(schema.supplierMaterials.id, same.id));
      continue;
    }
    const [row] = await db.insert(schema.supplierMaterials).values({ companyId, supplierId, ...m }).returning();
    have.push(row); added++;
  }
  return added;
}

/** Families + item names for an RFQ line or a free-text query. */
export function familiesOf(texts: string[], legacyCategories: string[] = []) {
  const fams = new Set<string>();
  texts.forEach((t, i) => { const c = classify(t, legacyCategories[i]); if (c[0]) fams.add(c[0]); for (const k of c.slice(1, 2)) fams.add(k); });
  return [...fams];
}

export type Fit = { tier: 1 | 2 | 3; reasons: Msg[]; items: string[] };

/**
 * How well a supplier fits the wanted materials:
 * 1 = has supplied/quoted this very material, 2 = has supplied the same family, 3 = likely (related family or AI judgement).
 */
export function fitOf(s: Sup, mats: Mat[], families: string[], items: string[]): Fit | null {
  const want = new Set(families);
  const nItems = items.map(norm).filter((x) => x.length >= 2);
  const inFam = mats.filter((m) => want.has(m.family));
  const exact = inFam.filter((m) => { const n = norm(m.item); return n && nItems.some((i) => i.includes(n) || n.includes(i)); });
  const label = (ms: Mat[]) => [...new Set(ms.map((m) => m.item || `@fam:${m.family}`))].slice(0, 3).join(", ");
  const ev = (ms: Mat[]) => (ms.some((m) => m.evidence === "record") ? "record" : ms.some((m) => m.evidence === "quote") ? "quote" : "declared");
  if (exact.length) {
    const e = ev(exact);
    return { tier: 1, items: exact.map((m) => m.item), reasons: [msg(e === "record" ? "供过 {items}" : e === "quote" ? "报过价：{items}" : "台账记录供应 {items}", { items: label(exact) })] };
  }
  if (inFam.length) {
    return { tier: 2, items: inFam.map((m) => m.item), reasons: [msg("供过同类材料：{items}", { items: label(inFam) })] };
  }
  for (const m of mats) {
    const rel = FAMILY[m.family]?.related.find((r) => want.has(r));
    if (rel) return { tier: 3, items: [], reasons: [msg("供过 {item}，可能也做{fam}", { item: m.item || `@fam:${m.family}`, fam: `@fam:${rel}` })] };
  }
  const ai = (s.likely || []).find((k) => want.has(k));
  if (ai) return { tier: 3, items: [], reasons: [msg("AI 判断这类公司通常也供应{fam}", { fam: `@fam:${ai}` })] };
  return null;
}

export async function materialsBySupplier(db: DB, companyId: string, supplierIds?: string[]) {
  const rows = await db.select().from(schema.supplierMaterials).where(supplierIds ? and(eq(schema.supplierMaterials.companyId, companyId), inArray(schema.supplierMaterials.supplierId, supplierIds.length ? supplierIds : ["-"])) : eq(schema.supplierMaterials.companyId, companyId));
  const by = new Map<string, Mat[]>();
  for (const r of rows) { const a = by.get(r.supplierId) || []; a.push(r); by.set(r.supplierId, a); }
  for (const a of by.values()) a.sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  return by;
}
