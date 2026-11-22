import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownSite, HttpError } from "@/lib/http";
import { loadSite } from "@/lib/sites";

export const GET = route(async ({ db, user, params }) => {
  await ownSite(db, user, params.id);
  return loadSite(db, user.companyId, params.id);
});

export const PATCH = route(async ({ req, db, user, params }) => {
  const before = await ownSite(db, user, params.id);
  const b = await body<{ name?: string; location?: string; owner?: string }>(req);
  const patch: Record<string, string> = {};
  for (const k of ["name", "location", "owner"] as const) if (typeof b[k] === "string") patch[k] = b[k]!.trim().slice(0, 200);
  if (patch.name === "") throw new HttpError(400, "请填写工程项目名称");
  const moved = "location" in patch && patch.location !== before.location;
  if (Object.keys(patch).length) await db.update(schema.sites).set({ ...patch, ...(moved ? { standards: null } : {}) }).where(eq(schema.sites.id, params.id));
  return loadSite(db, user.companyId, params.id);
});

/** Deletes the engineering project with all its requirements, packages and quotes. */
export const DELETE = route(async ({ db, user, params }) => {
  await ownSite(db, user, params.id);
  await db.delete(schema.sites).where(eq(schema.sites.id, params.id));
  return { ok: true };
});
