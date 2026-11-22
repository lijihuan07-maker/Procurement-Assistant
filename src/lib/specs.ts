/** Split a specification book (text per page) into CSI-style sections, e.g. "SECTION 32 14 13.13 - PRECAST CONCRETE UNIT PAVING". */
const HEAD = /(?:^|\n)\s*SECTION\s+(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{1,2}))?\s*[-–—:]?\s*([^\n]{0,120})/i;
/** Page footer/header like "PRECAST CONCRETE UNIT PAVING   32 14 13 - 3" (section number, dash, page within the section). */
const FOOT = /(?:^|\n)([^\n]{0,120}?)\b(\d{2})\s(\d{2})\s(\d{2})(?:\.(\d{2}))?\s*[-–—]\s*\d{1,3}\s*(?=\n|$)/;

export type SplitSection = { sectionNo: string; title: string; pageFrom: number; pageTo: number; body: string };
export type SplitResult = { sections: SplitSection[]; mode: "csi" | "pages" | "scanned" };

const PAGES_PER_CHUNK = 3;

function sectionOf(text: string): { no: string; title: string } | null {
  const m = text.match(HEAD);
  if (m) return { no: `${m[1]}${m[2]}${m[3]}${m[4] ? m[4].padStart(2, "0") : ""}`, title: (m[5] || "").trim() };
  const f = text.match(FOOT);
  if (f) return { no: `${f[2]}${f[3]}${f[4]}${f[5] || ""}`, title: (f[1] || "").replace(/\s+/g, " ").trim().slice(0, 120) };
  return null;
}

/**
 * Index a specification book. CSI MasterFormat books ("SECTION 32 14 13", or footers "32 14 13 - 3") are split by section;
 * other books are split every few pages so they can still be searched by keyword. Scanned books have no text to index.
 */
export function splitSpec(pages: { page: number; text: string }[], fileName = ""): SplitResult {
  const chars = pages.reduce((n, p) => n + (p.text.match(/[0-9A-Za-z一-鿿]/g) || []).length, 0);
  if (!pages.length || chars < 40 * pages.length) return { sections: [], mode: "scanned" };
  const out: SplitSection[] = [];
  let cur: SplitSection | null = null;
  for (const p of pages) {
    const s = sectionOf(p.text);
    if (s && (!cur || cur.sectionNo !== s.no)) {
      if (cur) out.push(cur);
      cur = { sectionNo: s.no, title: s.title, pageFrom: p.page, pageTo: p.page, body: p.text };
    } else if (cur) {
      cur.pageTo = p.page;
      if (cur.body.length < 80000) cur.body += `\n[p.${p.page}]\n` + p.text;
    }
  }
  if (cur) out.push(cur);
  // A real CSI book has several sections; one or two stray matches mean the numbering is something else.
  if (out.length >= 3 || (out.length && pages.length <= 40)) return { sections: out, mode: "csi" };
  // One section per file is common ("SECTION 10 14 53 TRAFFIC SIGNAGE.pdf"): take the number from the file name.
  const fn = fileName.replace(/\.[a-z]+$/i, "").match(/(?:^|\D)(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{2}))?(?!\d)/);
  if (fn && pages.length <= 60) {
    return { mode: "csi", sections: [{ sectionNo: `${fn[1]}${fn[2]}${fn[3]}${fn[4] || ""}`, title: fileName.replace(/\.[a-z]+$/i, "").replace(/^\s*SECTION\s*[\d\s.]+[-–—]?\s*/i, "").slice(0, 120), pageFrom: pages[0].page, pageTo: pages[pages.length - 1].page, body: pages.map((p) => `[p.${p.page}]\n${p.text}`).join("\n").slice(0, 80000) }] };
  }
  const chunks: SplitSection[] = [];
  for (let i = 0; i < pages.length; i += PAGES_PER_CHUNK) {
    const ps = pages.slice(i, i + PAGES_PER_CHUNK);
    const first = ps.map((p) => p.text.split("\n").map((l) => l.trim()).find((l) => l.length > 3) || "").find(Boolean) || "";
    chunks.push({ sectionNo: `p${ps[0].page}`, title: first.slice(0, 120), pageFrom: ps[0].page, pageTo: ps[ps.length - 1].page, body: ps.map((p) => `[p.${p.page}]\n${p.text}`).join("\n").slice(0, 80000) });
  }
  return { sections: chunks, mode: "pages" };
}

/** Digits of a spec reference like "Spec 32 14 13.13" or "SPEC.32 93 00 2.6.A" → { base: "329300", full: "32930026", article: "2.6" } */
export function parseSpecRef(ref: string) {
  const m = ref.match(/(\d{2})\s?(\d{2})\s?(\d{2})(?:[.\s]+(\d{1,2}))?(?:[.\s]+(\d{1,2}(?:\.\d{1,2})?))?/);
  if (!m) return null;
  const base = `${m[1]}${m[2]}${m[3]}`;
  return { base, sub: m[4] ? m[4].padStart(2, "0") : "", article: m[5] || "" };
}

export function excerpt(body: string, article: string, keywords: string[], max = 5000) {
  if (body.length <= max) return body;
  let at = -1;
  if (article) at = body.search(new RegExp(`\\n\\s*${article.replace(/\./g, "\\.")}\\s`));
  if (at < 0) for (const k of keywords) { if (k.length < 3) continue; const i = body.toLowerCase().indexOf(k.toLowerCase()); if (i >= 0) { at = i; break; } }
  if (at < 0) at = 0;
  const start = Math.max(0, at - 500);
  return body.slice(start, start + max);
}

const STOP = new Set("with from that this shall each other type size sizes mm thk thick per the and for all any into used use made color colour approved approval as per refer drawing drawings dwg spec specification specifications section item items unit units total".split(" "));
/** Words that identify an item in a spec book: English words of 4+ letters and Chinese terms of 2–6 characters. */
export function keywordsOf(...texts: string[]) {
  const words = new Set<string>();
  for (const t of texts) {
    for (const w of (t || "").toLowerCase().match(/[a-z][a-z-]{3,}/g) || []) if (!STOP.has(w)) words.add(w.replace(/-+$/, ""));
    for (const w of t.match(/[一-鿿]{2,6}/g) || []) words.add(w);
  }
  return [...words].slice(0, 12);
}

export type SpecIndex = { words: Set<string>; text: string };
export function indexSection(body: string): SpecIndex {
  const text = body.toLowerCase();
  return { words: new Set((text.match(/[a-z][a-z-]{3,}/g) || []).map((w) => w.replace(/-+$/, ""))), text };
}

/** The section that mentions most of the item's keywords (needs at least two different ones). */
export function bestByKeywords<S>(sections: S[], index: Map<S, SpecIndex>, keys: string[]) {
  let best: S | null = null, score = 1;
  for (const s of sections) {
    const ix = index.get(s)!;
    let n = 0;
    for (const k of keys) if (/^[a-z]/.test(k) ? ix.words.has(k) : ix.text.includes(k)) n++;
    if (n > score) { score = n; best = s; }
  }
  return best;
}
