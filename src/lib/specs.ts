/** Split a specification book (text per page) into CSI-style sections, e.g. "SECTION 32 14 13.13 - PRECAST CONCRETE UNIT PAVING". */
const HEAD = /(?:^|\n)\s*SECTION\s+(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{1,2}))?\s*[-–—:]?\s*([^\n]{0,120})/i;

export type SplitSection = { sectionNo: string; title: string; pageFrom: number; pageTo: number; body: string };

export function splitSections(pages: { page: number; text: string }[]): SplitSection[] {
  const out: SplitSection[] = [];
  let cur: SplitSection | null = null;
  for (const p of pages) {
    const m = p.text.match(HEAD);
    const no = m ? `${m[1]}${m[2]}${m[3]}${m[4] ? m[4].padStart(2, "0") : ""}` : null;
    if (no && (!cur || cur.sectionNo !== no)) {
      if (cur) out.push(cur);
      cur = { sectionNo: no, title: (m![5] || "").trim(), pageFrom: p.page, pageTo: p.page, body: p.text };
    } else if (cur) {
      cur.pageTo = p.page;
      if (cur.body.length < 80000) cur.body += `\n[p.${p.page}]\n` + p.text;
    }
  }
  if (cur) out.push(cur);
  return out;
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
