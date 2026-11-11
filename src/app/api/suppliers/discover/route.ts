import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, HttpError } from "@/lib/http";
import { askJson } from "@/lib/ai";
import { discoverPrompt } from "@/lib/prompts";
import { translate } from "@/lib/i18n";

export const maxDuration = 300;

type Found = { name?: string; city?: string; address?: string; phone?: string; email?: string; website?: string; products?: string; kind?: string; evidence?: string };
const s = (v: unknown) => (v == null ? "" : String(v).trim());

/** Search the web for local suppliers of a category. Returns a preview; nothing is saved. */
export const POST = route(async ({ req, db, user, lang }) => {
  const b = await body<{ category?: string; area?: string; keywords?: string; materials?: string[] }>(req);
  const category = s(b.category), area = s(b.area);
  if (!category) throw new HttpError(400, "请选择要找的材料类别");
  if (!area) throw new HttpError(400, "请填写地区，例如 Jizan, Saudi Arabia");
  const existing = await db.select({ name: schema.suppliers.name, categories: schema.suppliers.categories }).from(schema.suppliers).where(eq(schema.suppliers.companyId, user.companyId));
  const exclude = existing.filter((x) => x.categories.includes(category)).map((x) => x.name).slice(0, 80);
  const out = await askJson<{ suppliers?: Found[] }>("discover", discoverPrompt({ category, area, keywords: s(b.keywords), materials: (b.materials || []).map(s).filter(Boolean), exclude }), { webSearch: true, maxTokens: 8000, mockKey: category, lang });
  const known = new Set(existing.map((x) => x.name.toLowerCase()));
  const seen = new Set<string>();
  const suppliers = (out.suppliers || []).flatMap((f) => {
    const name = s(f.name).replace(/\s+/g, " ");
    if (name.length < 3 || seen.has(name.toLowerCase())) return [];
    seen.add(name.toLowerCase());
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(f.email)) ? s(f.email) : "";
    const website = /^(https?:\/\/|www\.)\S+$/i.test(s(f.website)) ? s(f.website) : "";
    const notes = [s(f.kind), s(f.products), s(f.address) && `${translate(lang, "地址")}: ${s(f.address)}`, s(f.evidence) && `${translate(lang, "来源")}: ${s(f.evidence)}`].filter(Boolean).join("; ");
    return [{ name, categories: [category], contact: "", email, phone: s(f.phone), city: s(f.city), website, notes, exists: known.has(name.toLowerCase()) }];
  });
  if (!suppliers.length) throw new HttpError(422, "网上没有找到合适的公司，可以换个地区或补充关键词再试");
  return { suppliers };
});
