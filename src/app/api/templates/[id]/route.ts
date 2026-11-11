import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route } from "@/lib/http";

export const DELETE = route(async ({ db, user, params }) => {
  await db.delete(schema.templates).where(and(eq(schema.templates.id, params.id), eq(schema.templates.companyId, user.companyId)));
  return { ok: true };
});
