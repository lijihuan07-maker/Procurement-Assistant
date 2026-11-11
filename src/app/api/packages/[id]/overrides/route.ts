import { eq } from "drizzle-orm";
import { schema } from "@/db";
import type { Overrides } from "@/db/schema";
import { route, body, ownPackage, logEdit, HttpError } from "@/lib/http";
import { loadPackage } from "@/lib/package";

/** Manual corrections to the comparison: a unit price (in the comparison unit) or a conversion factor. Every change is logged. */
export const POST = route(async ({ req, db, user, params }) => {
  const { pkg } = await ownPackage(db, user, params.id);
  if (pkg.award) throw new HttpError(409, "已经定标，不能再修改比价");
  const b = await body<{ type: "price" | "factor"; quoteId?: string; no: string; value: number | null; previous?: number | null }>(req);
  const ov: Overrides = { price: { ...(pkg.overrides?.price || {}) }, factor: { ...(pkg.overrides?.factor || {}) } };
  const v = b.value == null || !isFinite(Number(b.value)) || Number(b.value) <= 0 ? null : Number(b.value);
  if (b.type === "price") {
    if (!b.quoteId) throw new HttpError(400, "缺少报价");
    const m = { ...(ov.price[b.quoteId] || {}) };
    if (v == null) delete m[b.no]; else m[b.no] = v;
    ov.price[b.quoteId] = m;
    await logEdit(db, user, "quote_price", b.quoteId, `line ${b.no}`, b.previous ?? null, v);
  } else {
    if (v == null) delete ov.factor[b.no]; else ov.factor[b.no] = v;
    await logEdit(db, user, "package_factor", pkg.id, `line ${b.no}`, b.previous ?? null, v);
  }
  await db.update(schema.packages).set({ overrides: ov }).where(eq(schema.packages.id, pkg.id));
  return loadPackage(db, pkg.id);
});
