import { route, body, HttpError } from "@/lib/http";
import { askJson, type AiImage } from "@/lib/ai";
import { supplierImportPrompt } from "@/lib/prompts";
import { FAMILY, classify, familyList } from "@/lib/taxonomy";

export const maxDuration = 300;

export type ParsedMaterial = { item: string; family: string; evidence: "record" | "declared"; note: string; date: string };
export type ParsedSupplier = { name: string; country: string; city: string; contact: string; email: string; phone: string; website: string; cooperated: boolean | null; grade: string; materials: ParsedMaterial[]; likely: string[]; notes: string };
export type ParsedPrice = { supplier: string; material: string; spec: string; unit: string; unitPrice: number; currency: string; date: string; kind: string };
type Raw = Partial<Omit<ParsedSupplier, "materials">> & { materials?: Partial<ParsedMaterial>[] };

const s = (v: unknown) => (v == null ? "" : String(v).trim());
const date = (v: unknown) => { const m = s(v).replace(/[./年月]/g, "-").replace(/日/, "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : ""; };
/** Names that are clearly not companies: numbers, phone lines, header words, terms, template examples. */
const junk = (n: string) => n.length < 3 || /^company$/i.test(n) || /^[\d\s.,%+\-()/:]+$/.test(n) || /^(tel|fax|mob|phone|email|e-mail|电话|邮箱|联系人)\b/i.test(n) || /单价|总价|合计|金额|评标|供应商名称|单位名称|付款|交货|days|total price|amount/i.test(n);

/** Read one part of a supplier list / purchase ledger with AI. Nothing is saved; the client merges parts and confirms. */
export const POST = route(async ({ req, lang }) => {
  const b = await body<{ fileName: string; text?: string; rows?: string; context?: string; part?: number; parts?: number; images?: AiImage[] }>(req);
  const content = s(b.rows ?? b.text).slice(0, 120000);
  const chunk = { part: Number(b.part) || 1, parts: Number(b.parts) || 1, context: s(b.context).slice(0, 20000) };
  const out = await askJson<{ fileKind?: string; suppliers?: Raw[]; prices?: Partial<ParsedPrice>[] }>(
    "suppliers", supplierImportPrompt(s(b.fileName), content, !!b.images?.length, chunk, familyList()), { images: b.images, maxTokens: 16000, mockKey: b.fileName, lang });

  const seen = new Map<string, ParsedSupplier>();
  for (const x of out.suppliers || []) {
    const name = s(x.name).replace(/\s+/g, " ");
    if (!name || junk(name)) continue;
    const materials: ParsedMaterial[] = (Array.isArray(x.materials) ? x.materials : []).map((m) => {
      const item = s(m.item).slice(0, 120);
      const family = FAMILY[s(m.family)] ? s(m.family) : classify(item)[0] || "";
      return { item, family, evidence: (s(m.evidence) === "record" ? "record" : "declared") as ParsedMaterial["evidence"], note: s(m.note).slice(0, 200), date: date(m.date) };
    }).filter((m) => m.family);
    const prev = seen.get(name.toLowerCase());
    if (prev) { prev.materials.push(...materials); continue; }
    seen.set(name.toLowerCase(), {
      name, country: s(x.country), city: s(x.city), contact: s(x.contact), email: /@/.test(s(x.email)) ? s(x.email) : "", phone: s(x.phone), website: s(x.website),
      cooperated: typeof x.cooperated === "boolean" ? x.cooperated : null, grade: /^[ABC]$/i.test(s(x.grade)) ? s(x.grade).toUpperCase() : "",
      materials, likely: (Array.isArray(x.likely) ? x.likely.map(s) : []).filter((k) => FAMILY[k]).slice(0, 4), notes: s(x.notes).slice(0, 300),
    });
  }
  const suppliers = [...seen.values()];
  const prices: ParsedPrice[] = (out.prices || []).map((p) => ({
    supplier: s(p.supplier), material: s(p.material), spec: s(p.spec), unit: s(p.unit),
    unitPrice: Number(s(p.unitPrice).replace(/,/g, "")), currency: s(p.currency), date: date(p.date), kind: s(p.kind) === "purchase" ? "purchase" : "quote",
  })).filter((p) => p.material && p.unitPrice > 0 && seen.has(p.supplier.toLowerCase()));
  if (!suppliers.length && chunk.parts === 1) throw new HttpError(422, "这份文件里没有识别到供应商公司");
  return { fileKind: s(out.fileKind), suppliers, prices };
});
