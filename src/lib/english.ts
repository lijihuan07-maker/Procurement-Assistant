import "server-only";
import { askJson } from "./ai";
import { englishPrompt } from "./prompts";

export const hasCjk = (s: string) => /[㐀-鿿豈-﫿]/.test(s || "");

/** English versions of the given texts. Only texts containing Chinese are sent to the AI; the rest come back unchanged. */
export async function toEnglish(texts: string[]): Promise<string[]> {
  const todo = [...new Set(texts.filter(hasCjk))];
  const map = new Map<string, string>();
  for (let i = 0; i < todo.length; i += 80) {
    const batch = todo.slice(i, i + 80);
    const out = await askJson<{ items?: string[] }>("english", englishPrompt(batch), { maxTokens: 8000, mockKey: batch[0] });
    batch.forEach((t, k) => { const v = String(out.items?.[k] ?? "").trim(); if (v && !hasCjk(v)) map.set(t, v); });
  }
  // Anything the AI left in Chinese: drop the Chinese characters rather than send them.
  return texts.map((t) => (hasCjk(t) ? map.get(t) ?? stripCjk(t) : t));
}

/** Last resort: drop Chinese (and brackets around it), keep the rest. */
export function stripCjk(t: string) {
  return t.replace(/[（(][^（）()]*[\u3400-\u9fff][^（）()]*[）)]/g, "").replace(/[\u3400-\u9fff\uf900-\ufaff，。；：、]+/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/^[\s,;:–-]+|[\s,;–-]+$/g, "").trim();
}
