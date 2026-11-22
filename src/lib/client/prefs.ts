/** Appearance settings, kept per browser (they are about this screen, not the account). */
export type Prefs = { mode: "light" | "dark" | "system"; theme: string; accent: string; size: string };

export const THEMES: Record<string, { label: string; color: string }> = {
  ink: { label: "墨蓝", color: "#13203b" },
  graphite: { label: "石墨", color: "#24292f" },
  ocean: { label: "深海", color: "#0d3b4a" },
  forest: { label: "松绿", color: "#1c3d2e" },
  plum: { label: "暮紫", color: "#2f2448" },
  wine: { label: "酒红", color: "#46202a" },
};
export const ACCENTS: Record<string, { label: string; color: string }> = {
  amber: { label: "琥珀", color: "#f0a202" },
  orange: { label: "橙", color: "#e8590c" },
  green: { label: "青绿", color: "#12a37f" },
  blue: { label: "天蓝", color: "#3b82f6" },
  rose: { label: "玫红", color: "#d6336c" },
};
export const SIZES: Record<string, { label: string; zoom: number }> = {
  s: { label: "小", zoom: 0.92 }, m: { label: "标准", zoom: 1 }, l: { label: "大", zoom: 1.08 }, xl: { label: "特大", zoom: 1.16 },
};
export const DEFAULT_PREFS: Prefs = { mode: "light", theme: "ink", accent: "amber", size: "m" };
const KEY = "pa-ui";

export function loadPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULT_PREFS; }
}
export function savePrefs(p: Prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: applies to this visit only */ }
  applyPrefs(p);
}
export function applyPrefs(p: Prefs) {
  const el = document.documentElement;
  const dark = p.mode === "dark" || (p.mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  el.classList.toggle("dark", dark);
  el.style.setProperty("--brand", (THEMES[p.theme] || THEMES.ink).color);
  el.style.setProperty("--signal", (ACCENTS[p.accent] || ACCENTS.amber).color);
  el.style.zoom = String((SIZES[p.size] || SIZES.m).zoom);
}

/** Same as applyPrefs, inlined in <head> so the page never flashes the default look. */
export const PREFS_SCRIPT = `try{var p=JSON.parse(localStorage.getItem("${KEY}")||"{}"),e=document.documentElement,T=${JSON.stringify(Object.fromEntries(Object.entries(THEMES).map(([k, v]) => [k, v.color])))},A=${JSON.stringify(Object.fromEntries(Object.entries(ACCENTS).map(([k, v]) => [k, v.color])))},Z=${JSON.stringify(Object.fromEntries(Object.entries(SIZES).map(([k, v]) => [k, v.zoom])))};if(p.mode==="dark"||(p.mode==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))e.classList.add("dark");if(T[p.theme])e.style.setProperty("--brand",T[p.theme]);if(A[p.accent])e.style.setProperty("--signal",A[p.accent]);if(Z[p.size])e.style.zoom=Z[p.size]}catch(_){}`;
