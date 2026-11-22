import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, HttpError } from "@/lib/http";
import { runPart } from "@/lib/demand";

// Each part is read in its own request, so a long list gets the full time limit per part.
export const maxDuration = 300;

/** Store one part of a demand list and read it after responding; the browser does not need to stay on the page. */
export const POST = route(async ({ req, db, user, params, lang }) => {
  const [job] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.id, params.id), eq(schema.jobs.companyId, user.companyId)));
  if (!job) throw new HttpError(404, "任务不存在");
  if (job.status !== "running") throw new HttpError(409, "这次识别已经取消，请重新上传");
  const b = await body<{ idx?: number; part?: Record<string, unknown> }>(req);
  const idx = Number(b.idx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= job.total || !b.part) throw new HttpError(400, "请求格式不对");
  const [dup] = await db.select({ id: schema.jobParts.id }).from(schema.jobParts).where(and(eq(schema.jobParts.jobId, job.id), eq(schema.jobParts.idx, idx)));
  if (dup) return { ok: true }; // a retried upload
  const [part] = await db.insert(schema.jobParts).values({ jobId: job.id, idx, input: b.part }).returning({ id: schema.jobParts.id });
  after(() => runPart(part.id, lang));
  return { ok: true };
});
