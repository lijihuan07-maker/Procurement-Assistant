import { eq } from "drizzle-orm";
import { schema } from "@/db";
import type { Flag } from "@/db/schema";
import { route, ownPackage, HttpError } from "@/lib/http";
import { askJson } from "@/lib/ai";
import { reviewPrompt } from "@/lib/prompts";
import { compute, type QuoteRow } from "@/lib/compare";
import { loadPackage } from "@/lib/package";
import { snapshotTerms } from "@/lib/data";

export const maxDuration = 300;

export const POST = route(async ({ db, user, params, lang }) => {
  const { pkg } = await ownPackage(db, user, params.id);
  if (!pkg.snapshot) throw new HttpError(409, "询价单还没有锁定");
  const quotes = await db.select().from(schema.quotes).where(eq(schema.quotes.packageId, pkg.id));
  const c = compute(pkg.snapshot.lines, quotes as QuoteRow[], pkg.overrides, pkg.snapshot.vatRate);
  if (!c.sup.length) throw new HttpError(400, "还没有可以比较的报价");
  const data = {
    rfq: { rfqNo: pkg.snapshot.rfqNo, terms: snapshotTerms(pkg.snapshot), lines: pkg.snapshot.lines.map((l) => ({ no: l.no, name: l.name, spec: l.spec, unit: l.unit, qty: l.qty })) },
    quotes: c.sup.map((s) => ({ supplier: s.q.data.supplier, fileName: s.q.fileName, quoteNo: s.q.data.quoteNo, date: s.q.data.date, terms: s.q.data.terms, issues: s.q.data.issues, totalExVatAtRfqQty: Math.round(s.total), coverage: `${s.covered}/${c.rows.length}`,
      lines: s.q.data.lines.map((l) => ({ rfqNo: l.rfqNo, desc: l.quotedDesc, qty: l.quotedQty, unit: l.quotedUnit, unitPrice: l.unitPrice, deviation: l.deviation })) })),
  };
  const out = await askJson<{ flags?: Flag[]; summary?: string }>("review", reviewPrompt(data), { maxTokens: 6000, lang });
  const flags = (Array.isArray(out.flags) ? out.flags : []).map((f) => ({ ...f, source: "AI" }));
  await db.update(schema.packages).set({ review: { flags, summary: String(out.summary || "") } }).where(eq(schema.packages.id, pkg.id));
  return loadPackage(db, pkg.id);
});
