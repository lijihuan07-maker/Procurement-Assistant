import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownProject } from "@/lib/http";
import { loadProject } from "@/lib/data";

export const POST = route(async ({ req, db, user, params }) => {
  await ownProject(db, user, params.id);
  const b = await body<{ titleCn?: string; titleEn?: string; itemIds?: string[] }>(req);
  const all = await db.select({ code: schema.packages.code }).from(schema.packages).where(eq(schema.packages.projectId, params.id));
  const n = 1 + all.reduce((m, p) => Math.max(m, Number(p.code.replace(/\D/g, "")) || 0), 0);
  const [pkg] = await db.insert(schema.packages).values({ projectId: params.id, code: `P${n}`, titleCn: String(b.titleCn || "新询价包"), titleEn: String(b.titleEn || "NEW PACKAGE") }).returning();
  for (const id of b.itemIds || []) await db.update(schema.demandItems).set({ packageId: pkg.id }).where(and(eq(schema.demandItems.id, id), eq(schema.demandItems.projectId, params.id)));
  return { ...(await loadProject(db, params.id)), created: pkg.id };
});
