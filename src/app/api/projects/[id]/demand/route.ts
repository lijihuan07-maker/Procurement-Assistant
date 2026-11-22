import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownProject, HttpError } from "@/lib/http";
import { assertReplaceable } from "@/lib/demand";

/** Start reading a demand list on the server. The browser then uploads the parts to /api/jobs/{id}/parts. */
export const POST = route(async ({ req, db, user, params }) => {
  const project = await ownProject(db, user, params.id);
  const b = await body<{ fileName?: string; total?: number }>(req);
  const total = Number(b.total);
  if (!Number.isInteger(total) || total < 1 || total > 200) throw new HttpError(400, "请求格式不对");
  await assertReplaceable(db, project.id);
  await db.update(schema.jobs).set({ status: "cancelled" }).where(and(eq(schema.jobs.projectId, project.id), eq(schema.jobs.status, "running")));
  const [job] = await db.insert(schema.jobs).values({ companyId: user.companyId, projectId: project.id, fileName: String(b.fileName || "").slice(0, 300), total }).returning({ id: schema.jobs.id });
  return { jobId: job.id };
});
