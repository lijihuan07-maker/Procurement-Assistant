import { route, body, ownProject } from "@/lib/http";
import { askJson, type AiImage } from "@/lib/ai";
import { demandPrompt } from "@/lib/prompts";
import type { DemandItem } from "../route";

export const maxDuration = 300;

/** Read one part of a demand list with AI. Nothing is saved; the client merges the parts and saves them. */
export const POST = route(async ({ req, db, user, params, lang }) => {
  await ownProject(db, user, params.id);
  const b = await body<{ fileName: string; part?: number; parts?: number; context?: string; rows?: string; images?: AiImage[] }>(req);
  const rows = String(b.rows || "").slice(0, 150000);
  const chunk = { part: Number(b.part) || 1, parts: Number(b.parts) || 1, context: String(b.context || "").slice(0, 20000) };
  const out = await askJson<{ items?: DemandItem[] }>("demand", demandPrompt(rows, !!b.images?.length, chunk), { images: b.images, maxTokens: chunk.parts > 1 ? 16000 : 32000, mockKey: b.fileName, lang });
  // With context rows repeated in each part, keep only items whose row id belongs to this part.
  const own = new Set(rows.match(/^[RL]\d+(?=\|)/gm) || []);
  const items = (Array.isArray(out.items) ? out.items : []).filter((it) => !chunk.context || !it.row || own.has(String(it.row).trim()));
  return { items };
});
