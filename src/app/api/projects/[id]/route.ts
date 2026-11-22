import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownProject } from "@/lib/http";
import { loadProject } from "@/lib/data";

export const GET = route(async ({ db, user, params }) => {
  await ownProject(db, user, params.id);
  return loadProject(db, params.id);
});

export const PATCH = route(async ({ req, db, user, params }) => {
  const before = await ownProject(db, user, params.id);
  const b = await body<{ name?: string; location?: string; owner?: string }>(req);
  const patch: Record<string, string> = {};
  for (const k of ["name", "location", "owner"] as const) if (typeof b[k] === "string") patch[k] = b[k]!.trim();
  const moved = "location" in patch && patch.location !== before.location;
  if (Object.keys(patch).length) await db.update(schema.projects).set({ ...patch, ...(moved ? { standards: null } : {}) }).where(eq(schema.projects.id, params.id));
  return loadProject(db, params.id);
});

export const DELETE = route(async ({ db, user, params }) => {
  await ownProject(db, user, params.id);
  await db.delete(schema.projects).where(eq(schema.projects.id, params.id));
  return { ok: true };
});
