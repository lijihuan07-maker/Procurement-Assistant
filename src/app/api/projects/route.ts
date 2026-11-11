import { desc, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, HttpError } from "@/lib/http";

export const GET = route(async ({ db, user }) => {
  const rows = await db.select({
    id: schema.projects.id, name: schema.projects.name, location: schema.projects.location, owner: schema.projects.owner, createdAt: schema.projects.createdAt,
    items: sql<number>`(select count(*)::int from demand_items d where d.project_id = projects.id)`,
    packages: sql<number>`(select count(*)::int from packages k where k.project_id = projects.id)`,
    openQuestions: sql<number>`(select count(*)::int from clarifications c join demand_items d on c.item_id = d.id where d.project_id = projects.id and c.status = 'open')`,
  }).from(schema.projects).where(eq(schema.projects.companyId, user.companyId)).orderBy(desc(schema.projects.createdAt));
  return { projects: rows };
});

export const POST = route(async ({ req, db, user }) => {
  const b = await body<{ name?: string; location?: string; owner?: string }>(req);
  const name = String(b.name || "").trim();
  if (!name) throw new HttpError(400, "请填写项目名称");
  const [p] = await db.insert(schema.projects).values({ companyId: user.companyId, name, location: String(b.location || ""), owner: String(b.owner || "") }).returning();
  return { project: p };
});
