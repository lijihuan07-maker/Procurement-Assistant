import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, ownProject, HttpError } from "@/lib/http";
import { loadProject } from "@/lib/data";

export const DELETE = route(async ({ db, user, params }) => {
  const [doc] = await db.select().from(schema.specDocs).where(eq(schema.specDocs.id, params.id));
  if (!doc) throw new HttpError(404, "规格书不存在");
  await ownProject(db, user, doc.projectId);
  await db.delete(schema.specDocs).where(eq(schema.specDocs.id, doc.id));
  return loadProject(db, doc.projectId);
});
