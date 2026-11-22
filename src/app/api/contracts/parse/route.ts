import { route, body, HttpError } from "@/lib/http";
import { askJson, type AiImage } from "@/lib/ai";
import { contractImportPrompt } from "@/lib/prompts";
import { contractFields } from "@/lib/contracts";

export const maxDuration = 300;

/** Read one part of a contract ledger with AI. Nothing is saved; the client merges parts and the user confirms. */
export const POST = route(async ({ req, lang }) => {
  const b = await body<{ fileName: string; rows?: string; text?: string; context?: string; part?: number; parts?: number; images?: AiImage[] }>(req);
  const content = String(b.rows ?? b.text ?? "").slice(0, 120000);
  const chunk = { part: Number(b.part) || 1, parts: Number(b.parts) || 1, context: String(b.context || "").slice(0, 20000) };
  const out = await askJson<{ contracts?: Record<string, unknown>[] }>("contracts", contractImportPrompt(String(b.fileName || ""), content, !!b.images?.length, chunk), { images: b.images, maxTokens: 16000, mockKey: b.fileName, lang });
  const contracts = (out.contracts || []).map((c) => ({ ...contractFields({ status: "active", ...c }), projectId: null, supplierId: null }))
    .filter((c) => c.contractNo || c.title || c.supplierName);
  if (!contracts.length && chunk.parts === 1) throw new HttpError(422, "这份文件里没有识别到合同");
  return { contracts };
});
