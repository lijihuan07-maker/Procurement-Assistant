import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownPackage, HttpError } from "@/lib/http";
import { compute, type QuoteRow } from "@/lib/compare";
import { loadPackage } from "@/lib/package";

/** Award the whole package to one quote, or line by line. Awarded prices become history records for future comparisons. */
export const POST = route(async ({ req, db, user, params }) => {
  const { pkg } = await ownPackage(db, user, params.id);
  if (!pkg.snapshot) throw new HttpError(409, "询价单还没有锁定");
  const b = await body<{ mode: "whole" | "items" | "cancel"; quoteId?: string; items?: Record<string, string> }>(req);
  if (b.mode === "cancel") {
    await db.delete(schema.priceRecords).where(and(eq(schema.priceRecords.packageId, pkg.id), eq(schema.priceRecords.source, "award")));
    await db.update(schema.packages).set({ award: null, status: "issued" }).where(eq(schema.packages.id, pkg.id));
    return loadPackage(db, pkg.id);
  }
  const quotes = (await db.select().from(schema.quotes).where(eq(schema.quotes.packageId, pkg.id))) as QuoteRow[];
  const c = compute(pkg.snapshot.lines, quotes, pkg.overrides, pkg.snapshot.vatRate);
  const pick: Record<string, string> = {};
  if (b.mode === "whole") {
    if (!b.quoteId || !c.qs.some((q) => q.id === b.quoteId)) throw new HttpError(400, "请选择中标的报价");
    c.rows.forEach((r) => { pick[r.line.no] = b.quoteId!; });
  } else {
    for (const [no, qid] of Object.entries(b.items || {})) if (qid && c.qs.some((q) => q.id === qid)) pick[no] = qid;
    if (!Object.keys(pick).length) throw new HttpError(400, "请至少为一项选择中标供应商");
  }
  const date = new Date().toISOString().slice(0, 10);
  await db.delete(schema.priceRecords).where(and(eq(schema.priceRecords.packageId, pkg.id), eq(schema.priceRecords.source, "award")));
  for (const r of c.rows) {
    const qid = pick[r.line.no]; if (!qid) continue;
    const i = c.qs.findIndex((q) => q.id === qid);
    const cell = r.cells[i]; if (!cell) continue;
    const q = c.qs[i];
    const nameCn = r.line.name;
    await db.insert(schema.priceRecords).values({
      companyId: user.companyId, supplierName: q.data.supplier, material: nameCn, spec: r.line.spec, category: r.line.category,
      unit: r.cUnit, unitPrice: Math.round(cell.pCmp * 10000) / 10000, currency: pkg.snapshot.currency, date, source: "award", packageId: pkg.id,
    });
  }
  await db.update(schema.packages).set({ award: { mode: b.mode, quoteId: b.mode === "whole" ? b.quoteId : undefined, items: pick, at: new Date().toISOString() }, status: "awarded" }).where(eq(schema.packages.id, pkg.id));
  return loadPackage(db, pkg.id);
});
