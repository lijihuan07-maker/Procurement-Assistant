import { en } from "./en";
import { fr } from "./fr";
import { es } from "./es";
import { ru } from "./ru";
import { ar } from "./ar";

/** Interface languages: the six official UN languages. Chinese source strings are the message keys. */
export const LANGS = [
  { code: "zh", label: "中文", name: "Chinese", dir: "ltr", html: "zh-CN" },
  { code: "en", label: "English", name: "English", dir: "ltr", html: "en" },
  { code: "fr", label: "Français", name: "French", dir: "ltr", html: "fr" },
  { code: "es", label: "Español", name: "Spanish", dir: "ltr", html: "es" },
  { code: "ru", label: "Русский", name: "Russian", dir: "ltr", html: "ru" },
  { code: "ar", label: "العربية", name: "Arabic", dir: "rtl", html: "ar" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];
export const LANG_COOKIE = "lang";
export const langInfo = (l: Lang) => LANGS.find((x) => x.code === l)!;

const dicts: Record<Lang, Record<string, string> | null> = { zh: null, en, fr, es, ru, ar };

export function isLang(v: unknown): v is Lang {
  return LANGS.some((l) => l.code === v);
}

/** Pick a language from a cookie value or an Accept-Language header (first supported one wins). */
export function pickLang(cookie?: string | null, acceptLanguage?: string | null): Lang {
  if (isLang(cookie)) return cookie;
  for (const part of (acceptLanguage || "").split(",")) {
    const code = part.split(";")[0].trim().toLowerCase().slice(0, 2);
    if (isLang(code)) return code;
  }
  return "en";
}

export type Vars = Record<string, string | number | null | undefined>;

/** Translate a Chinese source string and fill {placeholders}. Missing entries fall back to English, then the source. */
export function translate(lang: Lang, s: string, vars?: Vars): string {
  const d = dicts[lang];
  const out = lang === "zh" ? s : (d && d[s]) || en[s] || s;
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
}

/** A string a server or helper can return untranslated, for the client to translate. */
export type Msg = { k: string; v?: Vars };
export const msg = (k: string, v?: Vars): Msg => ({ k, v });
