import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownProject, HttpError } from "@/lib/http";
import { loadProject } from "@/lib/data";

export const PATCH = route(async ({ req, db, user, params }) => {
  const [row] = await db.select({ q: schema.clarifications, item: schema.demandItems }).from(schema.clarifications)
    .innerJoin(schema.demandItems, eq(schema.clarifications.itemId, schema.demandItems.id)).where(eq(schema.clarifications.id, params.id));
  if (!row) throw new HttpError(404, "问题不存在");
  await ownProject(db, user, row.item.projectId);
  const b = await body<{ answer?: string; status?: string }>(req);
  const status = ["open", "answered", "ignored"].includes(String(b.status)) ? String(b.status) : row.q.status;
  const answer = typeof b.answer === "string" ? b.answer.trim() : row.q.answer;
  await db.update(schema.clarifications).set({ status: status === "answered" && !answer ? "open" : status, answer }).where(eq(schema.clarifications.id, row.q.id));
  return loadProject(db, row.item.projectId);
});
