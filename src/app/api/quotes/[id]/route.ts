import type { DB } from "@/db";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownPackage, HttpError } from "@/lib/http";
import { loadPackage } from "@/lib/package";

async function load(db: DB, id: string) {
  const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id));
  if (!q) throw new HttpError(404, "报价不存在");
  return q;
}

export const PATCH = route(async ({ req, db, user, params }) => {
  const q = await load(db, params.id);
  await ownPackage(db, user, q.packageId);
  const b = await body<{ supplierId?: string | null; supplierName?: string }>(req);
  const patch: Record<string, unknown> = {};
  if ("supplierId" in b) {
    if (b.supplierId) {
      const [s] = await db.select().from(schema.suppliers).where(and(eq(schema.suppliers.id, b.supplierId), eq(schema.suppliers.companyId, user.companyId)));
      if (!s) throw new HttpError(400, "供应商不存在");
      patch.data = { ...q.data, supplier: s.name };
    }
    patch.supplierId = b.supplierId || null;
  }
  if (typeof b.supplierName === "string" && b.supplierName.trim()) patch.data = { ...q.data, supplier: b.supplierName.trim() };
  if (Object.keys(patch).length) await db.update(schema.quotes).set(patch).where(eq(schema.quotes.id, q.id));
  return loadPackage(db, q.packageId);
});

export const DELETE = route(async ({ db, user, params }) => {
  const q = await load(db, params.id);
  const { pkg } = await ownPackage(db, user, q.packageId);
  if (pkg.award) throw new HttpError(409, "已经定标，不能删除报价");
  await db.delete(schema.quotes).where(eq(schema.quotes.id, q.id));
  return loadPackage(db, q.packageId);
});
