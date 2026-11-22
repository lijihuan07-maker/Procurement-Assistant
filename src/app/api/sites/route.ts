import { schema } from "@/db";
import { route, body, HttpError } from "@/lib/http";
import { listSites } from "@/lib/sites";

export const GET = route(async ({ db, user }) => ({ sites: await listSites(db, user.companyId) }));

export const POST = route(async ({ req, db, user }) => {
  const b = await body<{ name?: string; location?: string; owner?: string }>(req);
  const name = String(b.name || "").trim();
  if (!name) throw new HttpError(400, "请填写工程项目名称");
  const [site] = await db.insert(schema.sites).values({ companyId: user.companyId, name: name.slice(0, 200), location: String(b.location || "").trim().slice(0, 200), owner: String(b.owner || "").trim().slice(0, 200) }).returning();
  return { site };
});
