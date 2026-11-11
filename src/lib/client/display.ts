import type { Lang } from "@/lib/i18n";

/** Main and secondary name in the reader's language (Chinese source data keeps both). */
export function names(lang: Lang, cn: string, en: string): [string, string] {
  const a = (cn || "").trim(), b = (en || "").trim();
  return lang === "zh" ? [a || b, a ? b : ""] : [b || a, b ? a : ""];
}

const hasCjk = (s: string) => /[\u4e00-\u9fff]/.test(s);
/** Question text for the reader: older questions may only exist in Chinese + English. */
export function questionText(lang: Lang, q: string, qEn: string): [string, string] {
  if (lang === "zh") return [q || qEn, q ? qEn : ""];
  if (lang === "en") return [qEn || q, ""];
  return hasCjk(q) && qEn ? [qEn, ""] : [q || qEn, q && qEn && q !== qEn ? qEn : ""];
}
