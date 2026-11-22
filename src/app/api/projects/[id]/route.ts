import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownProject, ownSite, ownCompany, HttpError } from "@/lib/http";
import { loadProject } from "@/lib/data";
import { KINDS, cleanSettings, settingsOf } from "@/lib/settings";

export const GET = route(async ({ db, user, params }) => {
  await ownProject(db, user, params.id);
  return loadProject(db, params.id);
});

/** Rename, change type, move to another engineering project, or change RFQ settings. */
export const PATCH = route(async ({ req, db, user, params }) => {
  const p = await ownProject(db, user, params.id);
  const b = await body<{ name?: string; kind?: string; siteId?: string; settings?: unknown }>(req);
  const patch: Partial<typeof schema.projects.$inferInsert> = {};
  if (typeof b.name === "string") { if (!b.name.trim()) throw new HttpError(400, "请填写采购需求名称"); patch.name = b.name.trim().slice(0, 200); }
  if (typeof b.kind === "string" && (KINDS as readonly string[]).includes(b.kind)) patch.kind = b.kind;
  if (typeof b.siteId === "string" && b.siteId !== p.siteId) patch.siteId = (await ownSite(db, user, b.siteId)).id;
  if (b.settings !== undefined) patch.settings = cleanSettings(b.settings, settingsOf(p, await ownCompany(db, user)));
  if (Object.keys(patch).length) await db.update(schema.projects).set(patch).where(eq(schema.projects.id, params.id));
  return loadProject(db, params.id);
});

export const DELETE = route(async ({ db, user, params }) => {
  await ownProject(db, user, params.id);
  await db.delete(schema.projects).where(eq(schema.projects.id, params.id));
  return { ok: true };
});
