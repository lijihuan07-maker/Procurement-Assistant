import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, HttpError } from "@/lib/http";
import { currentJob } from "@/lib/data";

/** Progress of a background job (polled by the page while it runs). */
export const GET = route(async ({ db, user, params }) => {
  const [j] = await db.select({ projectId: schema.jobs.projectId }).from(schema.jobs).where(and(eq(schema.jobs.id, params.id), eq(schema.jobs.companyId, user.companyId)));
  if (!j) throw new HttpError(404, "任务不存在");
  const cur = await currentJob(db, j.projectId);
  return { job: cur && cur.id === params.id ? cur : { id: params.id, status: "cancelled" } };
});
