import { route, body, HttpError } from "@/lib/http";
import { askJson, type AiImage } from "@/lib/ai";
import { supplierImportPrompt } from "@/lib/prompts";
import { CATEGORIES } from "@/lib/checklist";

export const maxDuration = 300;

type Sup = { name: string; categories: string[]; contact: string; email: string; phone: string; city: string; notes: string };
type Price = { supplier: string; material: string; spec: string; unit: string; unitPrice: number; currency: string; date: string; kind: string };

const s = (v: unknown) => (v == null ? "" : String(v).trim());
/** Names that are clearly not companies: numbers, phone lines, header words, terms. */
const junk = (n: string) => n.length < 3 || /^[\d\s.,%+\-()/:]+$/.test(n) || /^(tel|fax|mob|phone|email|e-mail|电话|邮箱|联系人)\b/i.test(n) || /单价|总价|合计|金额|评标|供应商名称|付款|交货|days|total|price|amount/i.test(n);

/** Read any supplier-related file with AI and return a preview. Nothing is saved here. */
export const POST = route(async ({ req }) => {
  const b = await body<{ fileName: string; text: string; images?: AiImage[] }>(req);
  const out = await askJson<{ fileKind?: string; suppliers?: Partial<Sup>[]; prices?: Partial<Price>[] }>(
    "suppliers", supplierImportPrompt(s(b.fileName), s(b.text).slice(0, 120000), !!b.images?.length), { images: b.images, maxTokens: 16000, mockKey: b.fileName });
  const seen = new Set<string>();
  const suppliers: Sup[] = [];
  for (const x of out.suppliers || []) {
    const name = s(x.name).replace(/\s+/g, " ");
    if (!name || junk(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    suppliers.push({ name, categories: (Array.isArray(x.categories) ? x.categories.map(s) : []).filter((c) => (CATEGORIES as readonly string[]).includes(c)), contact: s(x.contact), email: s(x.email), phone: s(x.phone), city: s(x.city), notes: s(x.notes) });
  }
  const prices: Price[] = (out.prices || []).map((p) => ({
    supplier: s(p.supplier), material: s(p.material), spec: s(p.spec), unit: s(p.unit),
    unitPrice: Number(s(p.unitPrice).replace(/,/g, "")), currency: s(p.currency), date: s(p.date).slice(0, 10), kind: s(p.kind) === "purchase" ? "purchase" : "quote",
  })).filter((p) => p.material && p.unitPrice > 0 && seen.has(p.supplier.toLowerCase()));
  if (!suppliers.length) throw new HttpError(422, "这份文件里没有识别到供应商公司");
  return { fileKind: s(out.fileKind), suppliers, prices };
});
