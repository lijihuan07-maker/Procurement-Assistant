import "server-only";
import { cookies, headers } from "next/headers";
import { pickLang, translate, LANG_COOKIE, type Lang, type Vars } from "./index";

export async function getLang(): Promise<Lang> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return pickLang(c.get(LANG_COOKIE)?.value, h.get("accept-language"));
}

export async function serverT() {
  const lang = await getLang();
  return { lang, t: (s: string, v?: Vars) => translate(lang, s, v) };
}
