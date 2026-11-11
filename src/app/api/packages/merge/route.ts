import { eq, inArray } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownPackage, HttpError } from "@/lib/http";
import { loadProject } from "@/lib/data";

export const POST = route(async ({ req, db, user }) => {
  const b = await body<{ ids: string[] }>(req);
  const ids = [...new Set(b.ids || [])];
  if (ids.length < 2) throw new HttpError(400, "至少勾选两个询价包");
  const rows = await Promise.all(ids.map((id) => ownPackage(db, user, id)));
  if (new Set(rows.map((r) => r.pkg.projectId)).size > 1) throw new HttpError(400, "只能合并同一个项目里的询价包");
  if (rows.some((r) => r.pkg.status !== "draft")) throw new HttpError(409, "已经发出的询价单不能合并");
  const [keep, ...rest] = rows.map((r) => r.pkg);
  const restIds = rest.map((p) => p.id);
  await db.update(schema.demandItems).set({ packageId: keep.id }).where(inArray(schema.demandItems.packageId, restIds));
  await db.update(schema.packages).set({
    titleCn: [keep.titleCn, ...rest.map((p) => p.titleCn)].filter(Boolean).join("、"),
    titleEn: [keep.titleEn, ...rest.map((p) => p.titleEn)].filter(Boolean).join(" & "),
    supplierType: keep.supplierType, reason: "由多个询价包合并",
  }).where(eq(schema.packages.id, keep.id));
  await db.delete(schema.packages).where(inArray(schema.packages.id, restIds));
  return loadProject(db, keep.projectId);
});
