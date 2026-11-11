import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, HttpError } from "@/lib/http";
import { guessCategory } from "@/lib/data";

type Sup = { name?: string; categories?: string[]; email?: string; contact?: string; phone?: string; city?: string; notes?: string };
type Row = { supplier?: string; material?: string; spec?: string; unit?: string; unitPrice?: number | string; currency?: string; date?: string; category?: string };

/** Save the suppliers and price records the user confirmed in the import preview. */
export const POST = route(async ({ req, db, user }) => {
  const b = await body<{ suppliers?: Sup[]; rows?: Row[] }>(req);
  const sups = (b.suppliers || []).filter((x) => String(x.name || "").trim());
  const rows = (b.rows || []).filter((r) => String(r.supplier || "").trim());
  if (!sups.length && !rows.length) throw new HttpError(400, "没有勾选要导入的供应商");
  const existing = await db.select().from(schema.suppliers).where(eq(schema.suppliers.companyId, user.companyId));
  const byName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));
  let newSuppliers = 0, records = 0;
  const created = new Set<string>(), updated = new Set<string>();

  async function upsert(x: Sup) {
    const name = String(x.name).trim();
    const cats = (x.categories || []).map(String).filter(Boolean);
    let s = byName.get(name.toLowerCase());
    if (!s) {
      [s] = await db.insert(schema.suppliers).values({ companyId: user.companyId, name, categories: cats, email: String(x.email || ""), contact: String(x.contact || ""), phone: String(x.phone || ""), city: String(x.city || ""), notes: String(x.notes || ""), source: "import" }).returning();
      newSuppliers++; created.add(name.toLowerCase());
    } else {
      const patch: Record<string, unknown> = {};
      const add = cats.filter((c) => !s!.categories.includes(c));
      if (add.length) patch.categories = [...s.categories, ...add];
      for (const k of ["email", "contact", "phone", "city", "notes"] as const) if (!s[k] && x[k]) patch[k] = String(x[k]);
      if (Object.keys(patch).length) { [s] = await db.update(schema.suppliers).set(patch).where(eq(schema.suppliers.id, s.id)).returning(); if (!created.has(name.toLowerCase())) updated.add(name.toLowerCase()); }
    }
    byName.set(name.toLowerCase(), s);
    return s;
  }

  for (const x of sups) await upsert(x);
  for (const r of rows) {
    const category = String(r.category || "").trim() || guessCategory(`${r.material || ""} ${r.spec || ""}`);
    const s = byName.get(String(r.supplier).trim().toLowerCase()) || (await upsert({ name: r.supplier, categories: [category] }));
    const price = Number(String(r.unitPrice ?? "").replace(/,/g, ""));
    if (!r.material || !(price > 0)) continue;
    if (!s.categories.includes(category)) await upsert({ name: s.name, categories: [category] });
    await db.insert(schema.priceRecords).values({ companyId: user.companyId, supplierName: s.name, material: String(r.material), spec: String(r.spec || ""), category, unit: String(r.unit || ""), unitPrice: price, currency: String(r.currency || ""), date: /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || "")) ? String(r.date) : new Date().toISOString().slice(0, 10), source: "import" });
    records++;
  }
  return { newSuppliers, updated: updated.size, records };
});
