"use client";
import { createContext, useContext } from "react";
import { translate, LANG_COOKIE, type Lang, type Vars, type Msg } from "./index";

/* Language is fixed for a page load (switching reloads), so helpers outside React can read it from here. */
let current: Lang = "zh";
export function setClientLang(l: Lang) { current = l; }
export function lang(): Lang { return current; }

/** For event handlers and helpers that run in the browser only. Components use useT(). */
export function t(s: string, v?: Vars) { return translate(current, s, v); }
export function tm(m: Msg | string) { return typeof m === "string" ? t(m) : t(m.k, m.v); }

const Ctx = createContext<Lang>("zh");
export function I18nProvider({ lang: l, children }: { lang: Lang; children: React.ReactNode }) {
  if (typeof window !== "undefined") current = l;
  return <Ctx.Provider value={l}>{children}</Ctx.Provider>;
}
export function useLang() { return useContext(Ctx); }
export function useT() {
  const l = useContext(Ctx);
  return (s: string, v?: Vars) => translate(l, s, v);
}

export function switchLang(l: Lang) {
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}
