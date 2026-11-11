import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./http";

import type { AiImage } from "./ai-types";
export type { AiImage };

const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 没有返回 JSON");
  return JSON.parse(text.slice(start, end + 1));
}

async function mock(task: string, mockKey?: string): Promise<unknown> {
  const dir = process.env.AI_MOCK_DIR;
  if (!dir) throw new HttpError(500, "AI_MOCK=1 但没有设置 AI_MOCK_DIR");
  const files = (await readdir(dir)).filter((f) => f.startsWith(task) && f.endsWith(".json"));
  const key = (mockKey || "").toLowerCase();
  const pick = files.find((f) => { const k = f.slice(task.length + 1, -5).toLowerCase(); return k && key.includes(k); }) || files.find((f) => f === `${task}.json`);
  if (!pick) throw new HttpError(500, `没有 ${task} 的模拟结果（${mockKey || ""}）`);
  await new Promise((r) => setTimeout(r, 300));
  return JSON.parse(await readFile(path.join(dir, pick), "utf8"));
}

/** Ask Claude for a JSON object. Retries once if the answer is not valid JSON. */
export async function askJson<T>(task: string, prompt: string, opts: { images?: AiImage[]; maxTokens?: number; mockKey?: string } = {}): Promise<T> {
  if (process.env.AI_MOCK === "1") return (await mock(task, opts.mockKey)) as T;
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(500, "服务器没有配置 ANTHROPIC_API_KEY，无法调用 AI");
  const client = new Anthropic();
  const content: Anthropic.ContentBlockParam[] = [
    ...(opts.images || []).map((im) => ({ type: "image" as const, source: { type: "base64" as const, media_type: im.mediaType, data: im.data } })),
    { type: "text", text: prompt },
  ];
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const stream = client.messages.stream({
        model: MODEL(),
        max_tokens: opts.maxTokens ?? 16000,
        system: "你是严谨的工程采购助理。只输出要求的 JSON 对象，不要输出其他文字或代码块标记。数字不带千分位逗号。",
        messages: [{ role: "user", content }],
      });
      const msg = await stream.finalMessage();
      const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return extractJson(text) as T;
    } catch (e) {
      lastErr = e;
      if (e instanceof Anthropic.APIError && e.status && e.status < 500 && e.status !== 429) break;
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new HttpError(502, "AI 调用失败：" + msg);
}
