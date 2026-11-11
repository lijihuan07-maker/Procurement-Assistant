import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, HttpError } from "@/lib/http";
import { guessCategory } from "@/lib/data";

type Row = { supplier?: string; material?: string; spec?: string; unit?: string; unitPrice?: number | string; currency?: string; date?: string; category?: string; email?: string; contact?: string; phone?: string; city?: string };

/** Import purchase history (one row per purchased item). Creates missing suppliers and price records. */
export const POST = route(async ({ req, db, user }) => {
  const b = await body<{ rows: Row[] }>(req);
  const rows = (b.rows || []).filter((r) => String(r.supplier || "").trim());
  if (!rows.length) throw new HttpError(400, "没有读到带供应商名称的行");
  const existing = await db.select().from(schema.suppliers).where(eq(schema.suppliers.companyId, user.companyId));
  const byName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));
  let newSuppliers = 0, records = 0;
  for (const r of rows) {
    const name = String(r.supplier).trim();
    const category = String(r.category || "").trim() || guessCategory(`${r.material || ""} ${r.spec || ""}`);
    let s = byName.get(name.toLowerCase());
    if (!s) {
      [s] = await db.insert(schema.suppliers).values({ companyId: user.companyId, name, categories: [category], email: String(r.email || ""), contact: String(r.contact || ""), phone: String(r.phone || ""), city: String(r.city || ""), source: "import" }).returning();
      byName.set(name.toLowerCase(), s); newSuppliers++;
    } else {
      const patch: Record<string, unknown> = {};
      if (!s.categories.includes(category)) patch.categories = [...s.categories, category];
      for (const k of ["email", "contact", "phone", "city"] as const) if (!s[k] && r[k]) patch[k] = String(r[k]);
      if (Object.keys(patch).length) { [s] = await db.update(schema.suppliers).set(patch).where(eq(schema.suppliers.id, s.id)).returning(); byName.set(name.toLowerCase(), s); }
    }
    const price = Number(String(r.unitPrice ?? "").replace(/,/g, ""));
    if (r.material && price > 0) {
      await db.insert(schema.priceRecords).values({ companyId: user.companyId, supplierName: s.name, material: String(r.material), spec: String(r.spec || ""), category, unit: String(r.unit || ""), unitPrice: price, currency: String(r.currency || ""), date: String(r.date || "").slice(0, 10) || new Date().toISOString().slice(0, 10), source: "import" });
      records++;
    }
  }
  return { newSuppliers, records };
});
