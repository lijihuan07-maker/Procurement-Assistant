import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { schema, type DB } from "@/db";

export const CONTRACT_STATUS = ["pending", "active", "completed", "terminated"] as const;
type Row = typeof schema.contracts.$inferInsert;

const str = (v: unknown, max = 500) => (v == null ? "" : String(v).trim().slice(0, max));
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[,\s]/g, "")); return Number.isFinite(n) ? n : 0; };
export const toDate = (v: unknown) => { const m = str(v).replace(/[./年月]/g, "-").replace(/日/, "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : ""; };

/** Clean user/AI input into contract columns (only the fields present). */
export function contractFields(b: Record<string, unknown>): Partial<Row> {
  const out: Partial<Row> = {};
  for (const k of ["contractNo", "title", "supplierName", "projectName", "currency", "paymentTerms", "notes"] as const) if (k in b) out[k] = str(b[k], k === "notes" || k === "paymentTerms" ? 2000 : 300);
  for (const k of ["signDate", "deliveryDate"] as const) if (k in b) out[k] = toDate(b[k]);
  for (const k of ["amount", "paid"] as const) if (k in b) out[k] = num(b[k]);
  if ("taxIncluded" in b) out.taxIncluded = b.taxIncluded !== false;
  if ("status" in b) out.status = (CONTRACT_STATUS as readonly string[]).includes(String(b.status)) ? String(b.status) : "active";
  for (const k of ["projectId", "supplierId"] as const) if (k in b) out[k] = str(b[k]) || null;
  return out;
}

export async function listContracts(db: DB, companyId: string) {
  const rows = await db.select({ c: schema.contracts, project: schema.projects.name }).from(schema.contracts)
    .leftJoin(schema.projects, eq(schema.contracts.projectId, schema.projects.id))
    .where(eq(schema.contracts.companyId, companyId)).orderBy(desc(schema.contracts.signDate), desc(schema.contracts.createdAt));
  const projects = await db.select({ id: schema.projects.id, name: schema.projects.name }).from(schema.projects).where(eq(schema.projects.companyId, companyId)).orderBy(asc(schema.projects.name));
  const suppliers = await db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.companyId, companyId)).orderBy(asc(schema.suppliers.name));
  return { contracts: rows.map((r) => ({ ...r.c, project: r.project || r.c.projectName })), projects, suppliers };
}

/** Link free-text supplier/project names to existing records where the names match. */
export async function linkNames(db: DB, companyId: string, row: Partial<Row>) {
  if (!row.supplierId && row.supplierName) {
    const sups = await db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.companyId, companyId));
    const hit = sups.find((s) => s.name.trim().toLowerCase() === row.supplierName!.trim().toLowerCase());
    if (hit) row.supplierId = hit.id;
  }
  if (!row.projectId && row.projectName) {
    const ps = await db.select({ id: schema.projects.id, name: schema.projects.name }).from(schema.projects).where(eq(schema.projects.companyId, companyId));
    const hit = ps.find((p) => p.name.trim().toLowerCase() === row.projectName!.trim().toLowerCase());
    if (hit) row.projectId = hit.id;
  }
  return row;
}

/** After an award: one "to sign" contract per winning supplier, kept in sync if the award changes. */
export async function contractsFromAward(db: DB, companyId: string, pkg: typeof schema.packages.$inferSelect, perSupplier: Map<string, { name: string; amount: number }>, note: string) {
  const s = pkg.snapshot!;
  const existing = await db.select().from(schema.contracts).where(and(eq(schema.contracts.companyId, companyId), eq(schema.contracts.packageId, pkg.id)));
  for (const [supplierId, v] of perSupplier) {
    const prev = existing.find((c) => c.supplierId === supplierId);
    const fields = { amount: Math.round(v.amount * 100) / 100, currency: s.currency, taxIncluded: false };
    if (prev) { if (prev.status === "pending") await db.update(schema.contracts).set(fields).where(eq(schema.contracts.id, prev.id)); continue; }
    await db.insert(schema.contracts).values({
      companyId, projectId: pkg.projectId, packageId: pkg.id, supplierId, supplierName: v.name, title: s.titleEn || s.title,
      paymentTerms: s.payment, status: "pending", notes: note, ...fields,
    });
  }
  // Suppliers no longer winning lose their unsigned contract.
  for (const c of existing) if (c.status === "pending" && c.supplierId && !perSupplier.has(c.supplierId)) await db.delete(schema.contracts).where(eq(schema.contracts.id, c.id));
}
