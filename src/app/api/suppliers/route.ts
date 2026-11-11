import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, HttpError } from "@/lib/http";

export const GET = route(async ({ db, user }) => {
  const rows = await db.select({
    supplier: schema.suppliers,
    purchases: sql<number>`(select count(*)::int from price_records r where r.company_id = suppliers.company_id and r.supplier_name = suppliers.name)`,
    lastDate: sql<string | null>`(select max(r.date) from price_records r where r.company_id = suppliers.company_id and r.supplier_name = suppliers.name)`,
  }).from(schema.suppliers).where(eq(schema.suppliers.companyId, user.companyId)).orderBy(asc(schema.suppliers.name));
  const records = await db.select({ n: sql<number>`count(*)::int` }).from(schema.priceRecords).where(eq(schema.priceRecords.companyId, user.companyId));
  return { suppliers: rows.map((r) => ({ ...r.supplier, purchases: r.purchases, lastDate: r.lastDate })), priceRecords: records[0]?.n ?? 0 };
});

export const POST = route(async ({ req, db, user }) => {
  const b = await body<{ name?: string; categories?: string[]; contact?: string; email?: string; phone?: string; city?: string; website?: string; notes?: string }>(req);
  const name = String(b.name || "").trim();
  if (!name) throw new HttpError(400, "请填写供应商名称");
  const [s] = await db.insert(schema.suppliers).values({
    companyId: user.companyId, name, categories: (b.categories || []).map(String).filter(Boolean),
    contact: String(b.contact || ""), email: String(b.email || "").trim(), phone: String(b.phone || ""), city: String(b.city || ""), website: String(b.website || "").trim(), notes: String(b.notes || ""),
  }).returning();
  return { supplier: s };
});

/** Delete several suppliers at once (e.g. to clean up a bad import). Their price records are removed too. */
export const DELETE = route(async ({ req, db, user }) => {
  const b = await body<{ ids?: string[] }>(req);
  const ids = (b.ids || []).map(String).filter(Boolean);
  if (!ids.length) throw new HttpError(400, "没有选择要删除的供应商");
  const gone = await db.delete(schema.suppliers).where(and(eq(schema.suppliers.companyId, user.companyId), inArray(schema.suppliers.id, ids))).returning({ name: schema.suppliers.name });
  const names = gone.map((g) => g.name);
  if (names.length) await db.delete(schema.priceRecords).where(and(eq(schema.priceRecords.companyId, user.companyId), eq(schema.priceRecords.source, "import"), inArray(schema.priceRecords.supplierName, names)));
  return { deleted: gone.length };
});
