import { asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, HttpError } from "@/lib/http";
import { askJson } from "@/lib/ai";
import { fitOf, materialsBySupplier } from "@/lib/materials";
import { FAMILY, classify, familyList } from "@/lib/taxonomy";

export const maxDuration = 60;

/** Who can supply this material? Suppliers that supplied it, then the same family, then likely ones, with reasons. */
export const GET = route(async ({ req, db, user, lang }) => {
  const q = new URL(req.url).searchParams.get("q")?.trim() || "";
  if (!q) throw new HttpError(400, "请输入要找的材料");
  let families = classify(q);
  // Keep only the best-matching families; ask the AI when no keyword fits.
  if (families.length > 2) families = families.slice(0, 2);
  let byAi = false;
  if (!families.length) {
    const out = await askJson<{ families?: string[] }>("classify", `判断下面这个材料或服务属于哪个类别，只能用这些 key：\n${familyList()}\n\n只输出 JSON：{"families":["最贴切的 key，最多 2 个"]}\n材料：${q}`, { maxTokens: 200, mockKey: q, lang });
    families = (out.families || []).filter((k) => FAMILY[k]).slice(0, 2);
    byAi = true;
  }
  if (!families.length) return { families: [], byAi, results: [] };
  const sups = await db.select().from(schema.suppliers).where(eq(schema.suppliers.companyId, user.companyId)).orderBy(asc(schema.suppliers.name));
  const mats = await materialsBySupplier(db, user.companyId);
  const results = sups.flatMap((s) => {
    const m = mats.get(s.id) || [];
    const fit = fitOf(s, m, families, [q]);
    if (!fit) return [];
    const last = m.filter((x) => families.includes(x.family)).map((x) => x.date).sort().at(-1) || "";
    const dealt = m.some((x) => x.evidence === "record");
    return [{ supplier: { id: s.id, name: s.name, email: s.email, phone: s.phone, contact: s.contact, city: s.city, country: s.country, rating: s.rating }, tier: fit.tier, reasons: fit.reasons, last, dealt }];
  }).sort((a, b) => a.tier - b.tier || Number(b.dealt) - Number(a.dealt) || (b.supplier.rating || 0) - (a.supplier.rating || 0) || b.last.localeCompare(a.last));
  return { families, byAi, results };
});
