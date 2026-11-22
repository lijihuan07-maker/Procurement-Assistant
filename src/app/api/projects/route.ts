import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownSite, ownCompany, HttpError } from "@/lib/http";
import { KINDS, cleanSettings, defaultSettings, settingsOf } from "@/lib/settings";
import { listTemplates } from "@/lib/sites";

/** Templates (earlier requirements' RFQ settings) and the defaults for a new one. */
export const GET = route(async ({ db, user }) => listTemplates(db, user.companyId));

/** New procurement requirement inside an engineering project. Settings are copied from `fromId` or taken from the form. */
export const POST = route(async ({ req, db, user }) => {
  const b = await body<{ siteId?: string; name?: string; kind?: string; fromId?: string; settings?: unknown }>(req);
  const site = await ownSite(db, user, String(b.siteId || ""));
  const name = String(b.name || "").trim();
  if (!name) throw new HttpError(400, "请填写采购需求名称");
  const company = await ownCompany(db, user);
  let settings = cleanSettings(b.settings, defaultSettings(company));
  if (b.fromId) {
    const [src] = await db.select().from(schema.projects).where(and(eq(schema.projects.id, b.fromId), eq(schema.projects.companyId, user.companyId)));
    if (!src) throw new HttpError(404, "选中的模板不存在");
    settings = settingsOf(src, company);
  }
  const kind = (KINDS as readonly string[]).includes(String(b.kind)) ? String(b.kind) : "material";
  const [p] = await db.insert(schema.projects).values({ companyId: user.companyId, siteId: site.id, name: name.slice(0, 200), kind, settings }).returning({ id: schema.projects.id });
  return { project: p };
});
