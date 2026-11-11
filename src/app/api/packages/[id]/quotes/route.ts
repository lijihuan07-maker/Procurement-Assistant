import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import type { QuoteData } from "@/db/schema";
import { route, body, ownPackage, HttpError } from "@/lib/http";
import { askJson, type AiImage } from "@/lib/ai";
import { quotePrompt } from "@/lib/prompts";
import { loadPackage } from "@/lib/package";
import { snapshotTerms } from "@/lib/data";

export const maxDuration = 300;

const norm = (s: string) => s.toLowerCase().replace(/co\.?|ltd\.?|llc|company|est\.?|trading|establishment|[^a-z0-9一-鿿]/g, "");

export const POST = route(async ({ req, db, user, params }) => {
  const { pkg } = await ownPackage(db, user, params.id);
  if (!pkg.snapshot) throw new HttpError(409, "请先锁定询价单，再上传报价");
  const b = await body<{ fileName: string; text: string; images?: AiImage[]; supplierId?: string }>(req);
  const s = pkg.snapshot;
  await db.delete(schema.quotes).where(and(eq(schema.quotes.packageId, pkg.id), eq(schema.quotes.fileName, String(b.fileName || "")), eq(schema.quotes.status, "error")));
  let data: QuoteData;
  try {
    data = await askJson<QuoteData>("quote", quotePrompt(String(b.fileName || "报价"), String(b.text || "").slice(0, 120000), !!b.images?.length, {
      lines: s.lines.map((l) => ({ no: l.no, name: l.name, spec: l.spec, unit: l.unit, qty: l.qty })), terms: snapshotTerms(s), currency: s.currency, vatRate: s.vatRate,
    }), { images: b.images, maxTokens: 16000, mockKey: b.fileName });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.insert(schema.quotes).values({ packageId: pkg.id, fileName: String(b.fileName || ""), status: "error", error: message, data: emptyQuote(String(b.fileName || "")) });
    return loadPackage(db, pkg.id);
  }
  data.lines = (data.lines || []).map((l) => ({ ...l, rfqNo: String(l.rfqNo) }));
  const t: Partial<QuoteData["terms"]> = data.terms || {};
  data.terms = { payment: t.payment || "", delivery: t.delivery || "", leadTime: t.leadTime || "", validity: t.validity || "", priceAdjustment: t.priceAdjustment || "", other: t.other || "" };
  data.issues = Array.isArray(data.issues) ? data.issues : [];
  // Match to a supplier in the library: explicit choice, then invited suppliers by name.
  let supplierId = b.supplierId || null;
  if (!supplierId) {
    const invited = await db.select({ supplier: schema.suppliers }).from(schema.invites).innerJoin(schema.suppliers, eq(schema.invites.supplierId, schema.suppliers.id)).where(eq(schema.invites.packageId, pkg.id));
    const n = norm(data.supplier || "");
    const hit = invited.find((r) => { const m = norm(r.supplier.name); return m && n && (m.includes(n) || n.includes(m)); });
    supplierId = hit?.supplier.id || null;
  }
  await db.insert(schema.quotes).values({ packageId: pkg.id, fileName: String(b.fileName || ""), supplierId, data });
  return loadPackage(db, pkg.id);
});

function emptyQuote(name: string): QuoteData {
  return { supplier: name, quoteNo: null, date: null, currency: "", vatIncluded: false, isBlank: false, statedTotalExVat: null, statedTotalInclVat: null, terms: { payment: "", delivery: "", leadTime: "", validity: "", priceAdjustment: "", other: "" }, lines: [], missing: [], issues: [] };
}
