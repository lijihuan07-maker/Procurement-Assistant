import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./http";

import type { AiImage } from "./ai-types";
export type { AiImage };

const SYSTEM = "你是严谨的工程采购助理。只输出要求的 JSON 对象，不要输出其他文字或代码块标记。数字不带千分位逗号。";

/**
 * Which model service to use:
 * - AI_PROVIDER=openai : any OpenAI-compatible API (阿里云百炼/通义千问, DeepSeek, Kimi, 智谱…) via AI_BASE_URL + AI_API_KEY
 * - otherwise          : Anthropic Claude via ANTHROPIC_API_KEY
 */
const provider = () => (process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.AI_API_KEY ? "openai" : "anthropic")).toLowerCase();

function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 没有返回 JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
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

class RetryableError extends Error {}

/** Turn common provider errors into instructions the user can act on. */
function friendlyError(status: number, body: string): string | null {
  if (/Arrearage|overdue-payment|insufficient.?(balance|quota)|余额不足|欠费/i.test(body)) return "AI 服务账户余额不足或已欠费：请到模型服务商的费用中心充值（阿里云：费用与成本 → 充值），充值后重试。";
  if (status === 401 || /InvalidApiKey|invalid.?api.?key|Incorrect API key/i.test(body)) return "AI 的 API Key 不正确或已失效：请在 Vercel 的环境变量里检查 AI_API_KEY，修改后重新部署。";
  if (status === 404 || /model.?not.?found|ModelNotFound|does not exist/i.test(body)) return "模型名称在你的账号里不可用：请到模型服务商控制台核对 AI_MODEL / AI_VISION_MODEL 的名称。";
  if (/Access denied|AccessDenied|not.?activated|未开通/i.test(body)) return "AI 服务没有开通或账号状态异常：请到模型服务商控制台检查服务是否已开通、账号是否正常。";
  return null;
}

/* ---------------- Anthropic Claude ---------------- */
async function callAnthropic(prompt: string, images: AiImage[], maxTokens: number, webSearch: boolean): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(500, "服务器没有配置 ANTHROPIC_API_KEY，无法调用 AI");
  const client = new Anthropic();
  const content: Anthropic.ContentBlockParam[] = [
    ...images.map((im) => ({ type: "image" as const, source: { type: "base64" as const, media_type: im.mediaType, data: im.data } })),
    { type: "text", text: prompt },
  ];
  try {
    const tools: Anthropic.ToolUnion[] | undefined = webSearch ? [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }] : undefined;
    const msg = await client.messages.stream({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: maxTokens, system: SYSTEM, messages: [{ role: "user", content }], ...(tools ? { tools } : {}) }).finalMessage();
    return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  } catch (e) {
    if (e instanceof Anthropic.APIError && e.status && e.status < 500 && e.status !== 429) throw e;
    throw new RetryableError(e instanceof Error ? e.message : String(e));
  }
}

/* ---------------- OpenAI-compatible (通义千问 / DeepSeek / Kimi / 智谱 …) ---------------- */
async function callOpenAiCompatible(prompt: string, images: AiImage[], maxTokens: number, webSearch: boolean): Promise<string> {
  const base = (process.env.AI_BASE_URL || "").replace(/\/+$/, "");
  const key = process.env.AI_API_KEY;
  if (!base || !key) throw new HttpError(500, "服务器没有配置 AI_BASE_URL 或 AI_API_KEY，无法调用 AI");
  const model = images.length ? process.env.AI_VISION_MODEL || process.env.AI_MODEL : process.env.AI_MODEL;
  if (!model) throw new HttpError(500, "服务器没有配置 AI_MODEL");
  if (images.length && !process.env.AI_VISION_MODEL) throw new HttpError(500, "这份文件需要按图片识别，但服务器没有配置支持图片的模型 AI_VISION_MODEL");
  const cap = Number(process.env.AI_MAX_OUTPUT_TOKENS) || 16384;
  const content = images.length
    ? [...images.map((im) => ({ type: "image_url", image_url: { url: `data:${im.mediaType};base64,${im.data}` } })), { type: "text", text: prompt }]
    : prompt;
  // Web search (通义千问 enable_search). "max" searches more widely; fall back to the default strategy if the model refuses it.
  let strategy = process.env.AI_SEARCH_STRATEGY || "max";
  const search = () => (webSearch ? { enable_search: true, search_options: { forced_search: true, search_strategy: strategy } } : {});
  const send = (max: number) => fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, stream: true, max_tokens: max, temperature: 0.1, messages: [{ role: "system", content: SYSTEM }, { role: "user", content }], ...search() }),
  });
  let res = await send(Math.min(maxTokens, cap));
  if (res.status === 400 && webSearch && strategy !== "turbo") {
    const t = await res.clone().text();
    if (/search/i.test(t) && !friendlyError(400, t)) { strategy = "turbo"; res = await send(Math.min(maxTokens, cap)); }
  }
  if (res.status === 400) {
    const t = await res.text();
    const friendly = friendlyError(400, t);
    if (friendly) throw new HttpError(502, friendly);
    // Some models accept fewer output tokens: retry once with a smaller limit.
    if (/max_tokens|max_completion|output.*token|range/i.test(t)) res = await send(Math.min(maxTokens, cap, 8192));
    else throw new Error(`模型接口返回 400：${t.slice(0, 300)}`);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const friendly = friendlyError(res.status, t);
    if (friendly) throw new HttpError(502, friendly);
    const err = `模型接口返回 ${res.status}：${t.slice(0, 300)}`;
    if (res.status === 429 || res.status >= 500) throw new RetryableError(err);
    throw new Error(err);
  }
  // Read the server-sent event stream and join the text deltas.
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "", finish = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const j = JSON.parse(data);
        const ch = j.choices?.[0];
        if (ch?.delta?.content) out += ch.delta.content;
        if (ch?.finish_reason) finish = ch.finish_reason;
      } catch { /* ignore keep-alive lines */ }
    }
  }
  if (finish === "length") throw new Error("AI 输出超出长度上限，请把文件拆小后再试");
  return out;
}

/** Ask the configured model for a JSON object. Retries once on transient errors or invalid JSON. */
export async function askJson<T>(task: string, prompt: string, opts: { images?: AiImage[]; maxTokens?: number; mockKey?: string; webSearch?: boolean } = {}): Promise<T> {
  if (process.env.AI_MOCK === "1") return (await mock(task, opts.mockKey)) as T;
  const call = provider() === "openai" ? callOpenAiCompatible : callAnthropic;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return extractJson(await call(prompt, opts.images || [], opts.maxTokens ?? 16000, !!opts.webSearch)) as T;
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError) throw e;
      const retry = e instanceof RetryableError || e instanceof SyntaxError || (e instanceof Error && e.message === "AI 没有返回 JSON");
      if (!retry) break;
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new HttpError(502, "AI 调用失败：" + msg);
}
