import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownPackage, HttpError } from "@/lib/http";
import { loadPackage } from "@/lib/package";
import { loadProject } from "@/lib/data";

export const GET = route(async ({ db, user, params }) => {
  await ownPackage(db, user, params.id);
  return loadPackage(db, params.id);
});

export const PATCH = route(async ({ req, db, user, params }) => {
  const { pkg } = await ownPackage(db, user, params.id);
  const b = await body<Record<string, unknown>>(req);
  const patch: Record<string, string> = {};
  for (const k of ["titleCn", "titleEn", "supplierType", "deadline"] as const) if (typeof b[k] === "string") patch[k] = String(b[k]);
  if (pkg.status !== "draft" && (patch.titleCn || patch.titleEn)) throw new HttpError(409, "询价单已经发出，不能再改标题");
  if (Object.keys(patch).length) await db.update(schema.packages).set(patch).where(eq(schema.packages.id, pkg.id));
  return b.returnProject ? loadProject(db, pkg.projectId) : loadPackage(db, pkg.id);
});

export const DELETE = route(async ({ db, user, params }) => {
  const { pkg } = await ownPackage(db, user, params.id);
  if (pkg.status !== "draft") throw new HttpError(409, "已经发出的询价单不能删除");
  await db.update(schema.demandItems).set({ packageId: null }).where(eq(schema.demandItems.packageId, pkg.id));
  await db.delete(schema.packages).where(eq(schema.packages.id, pkg.id));
  return loadProject(db, pkg.projectId);
});
