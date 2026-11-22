import { route, body, ownProject, HttpError } from "@/lib/http";
import { askJson, type AiImage } from "@/lib/ai";
import { ocrPrompt } from "@/lib/prompts";

export const maxDuration = 120;

/** Text of one scanned or photographed specification page (the browser sends pages one by one). */
export const POST = route(async ({ req, db, user, params }) => {
  await ownProject(db, user, params.id);
  const b = await body<{ image?: AiImage; page?: number; fileName?: string }>(req);
  if (!b.image?.data) throw new HttpError(400, "请求格式不对");
  const out = await askJson<{ text?: string }>("ocr", ocrPrompt(String(b.fileName || ""), Number(b.page) || 1), { images: [b.image], maxTokens: 6000, mockKey: String(b.fileName || "") });
  return { text: String(out.text || "") };
});
