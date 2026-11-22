import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import { askJson } from "./ai";
import { demandPrompt, standardsContext } from "./prompts";
import { HttpError, withSite } from "./http";
import { translate, type Lang } from "./i18n";
import type { DemandItem, DemandPart } from "./ai-types";

type Req = ReturnType<typeof withSite>;

/** Read one part of a demand list with AI. */
export async function parseDemandPart(project: Req, fileName: string, b: Partial<DemandPart>, lang: Lang) {
  const rows = String(b.rows || "").slice(0, 150000);
  const chunk = { part: Number(b.part) || 1, parts: Number(b.parts) || 1, context: String(b.context || "").slice(0, 20000) };
  const images = Array.isArray(b.images) ? b.images : [];
  const out = await askJson<{ items?: DemandItem[] }>("demand", demandPrompt(rows, images.length > 0, chunk) + standardsContext(project), { images, maxTokens: chunk.parts > 1 ? 16000 : 32000, mockKey: fileName, lang });
  // With context rows repeated in each part, keep only items whose row id belongs to this part.
  const own = new Set(rows.match(/^[RL]\d+(?=\|)/gm) || []);
  return (Array.isArray(out.items) ? out.items : []).filter((it) => !chunk.context || !it.row || own.has(String(it.row).trim()));
}

/** Items from all parts, minus the same row read twice. */
export function mergeItems(parts: DemandItem[][]) {
  const seen = new Set<string>();
  return parts.flat().filter((it) => {
    const k = [it.no, it.nameEn || it.nameCn, it.spec, it.qty].map((x) => String(x ?? "").trim().toLowerCase()).join("|");
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

export async function assertReplaceable(db: DB, projectId: string) {
  const issued = await db.select({ id: schema.packages.id }).from(schema.packages).where(and(eq(schema.packages.projectId, projectId), eq(schema.packages.status, "issued")));
  if (issued.length) throw new HttpError(409, "这个采购需求已经有发出的询价单，不能整体替换需求清单。请新建一个采购需求。");
}

/** Replace a requirement's demand items (and their questions, draft packages) with what the AI read. */
export async function saveDemand(db: DB, projectId: string, fileName: string, items: DemandItem[]) {
  if (!items.length) throw new HttpError(422, "清单里没有识别到物资项");
  await assertReplaceable(db, projectId);
  // Image placeholders from Excel (=DISPIMG(...), [图片]) are not text the supplier should see.
  const clean = (v: unknown) => String(v ?? "").replace(/=?_?x?l?f?n?\.?DISPIMG\([^)]*\)|\[图片\]/g, "").trim();
  await db.delete(schema.packages).where(eq(schema.packages.projectId, projectId));
  await db.delete(schema.demandItems).where(eq(schema.demandItems.projectId, projectId));
  for (const [k, it] of items.entries()) {
    const [row] = await db.insert(schema.demandItems).values({
      projectId, seq: k + 1, no: String(it.no ?? k + 1), nameCn: clean(it.nameCn), nameEn: clean(it.nameEn),
      spec: clean(it.spec), unit: String(it.unit || ""), qty: Number(String(it.qty ?? 0).replace(/,/g, "")) || 0,
      dateRequired: String(it.dateRequired || ""), techReq: clean(it.techReq), specRef: clean(it.specRef),
      category: String(it.category || "其他"), issues: Array.isArray(it.issues) ? it.issues.map(String) : [],
    }).returning({ id: schema.demandItems.id });
    const qs = Array.isArray(it.questions) ? it.questions : [];
    if (qs.length) await db.insert(schema.clarifications).values(qs.map((q) => ({ itemId: row.id, question: String(q.question || ""), questionEn: String(q.questionEn || ""), options: Array.isArray(q.options) ? q.options.map(String) : [] })));
  }
  await db.update(schema.projects).set({ demandFileName: fileName }).where(eq(schema.projects.id, projectId));
}

const errText = (e: unknown, lang: Lang) => (e instanceof HttpError ? translate(lang, e.message, e.vars) : e instanceof Error ? e.message : String(e));

/**
 * Read one stored part in the background (called from `after()`), then, if it was the last part to finish, merge and save.
 * Runs on the server, so it completes even if the user has left the page.
 */
export async function runPart(partId: string, lang: Lang) {
  const db = await getDb();
  const [part] = await db.select().from(schema.jobParts).where(eq(schema.jobParts.id, partId));
  if (!part) return;
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, part.jobId));
  if (!job || job.status !== "running") return;
  const [r] = await db.select({ p: schema.projects, s: schema.sites }).from(schema.projects).innerJoin(schema.sites, eq(schema.projects.siteId, schema.sites.id)).where(eq(schema.projects.id, job.projectId));
  if (!r) return;
  let ok = true;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const items = await parseDemandPart(withSite(r.p, r.s), job.fileName, (part.input || {}) as Partial<DemandPart>, lang);
      await db.update(schema.jobParts).set({ items, status: "done", input: null, error: null }).where(eq(schema.jobParts.id, part.id));
      ok = true; break;
    } catch (e) {
      ok = false;
      await db.update(schema.jobParts).set({ status: "failed", error: errText(e, lang) }).where(eq(schema.jobParts.id, part.id));
      if (e instanceof HttpError && [401, 402, 403].includes(e.status)) break; // key or balance problems won't fix themselves
    }
  }
  const [j] = await db.update(schema.jobs).set({ done: sql`${schema.jobs.done} + 1`, failed: sql`${schema.jobs.failed} + ${ok ? 0 : 1}`, updatedAt: new Date() })
    .where(eq(schema.jobs.id, job.id)).returning();
  if (j.done === j.total && j.status === "running") await finish(db, j.id, lang);
}

async function finish(db: DB, jobId: string, lang: Lang) {
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!job || job.status !== "running") return;
  const parts = await db.select().from(schema.jobParts).where(eq(schema.jobParts.jobId, jobId)).orderBy(asc(schema.jobParts.idx));
  const good = parts.filter((p) => p.status === "done");
  try {
    if (!good.length) throw new Error(parts.find((p) => p.error)?.error || translate(lang, "AI 没有识别出内容"));
    await saveDemand(db, job.projectId, job.fileName, mergeItems(good.map((p) => (p.items || []) as DemandItem[])));
    const missed = parts.length - good.length;
    await db.update(schema.jobs).set({ status: "done", error: missed ? translate(lang, "有 {n} 部分没识别出来（{e}），这些行请手工核对或重新上传", { n: missed, e: parts.find((p) => p.error)?.error || "" }) : null, updatedAt: new Date() }).where(eq(schema.jobs.id, jobId));
  } catch (e) {
    await db.update(schema.jobs).set({ status: "failed", error: errText(e, lang), updatedAt: new Date() }).where(eq(schema.jobs.id, jobId));
  }
  await db.delete(schema.jobParts).where(eq(schema.jobParts.jobId, jobId));
}
