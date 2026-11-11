import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownProject, HttpError, logEdit } from "@/lib/http";
import { loadProject } from "@/lib/data";

const FIELDS = ["nameCn", "nameEn", "spec", "unit", "techReq", "specRef", "category", "quoteHint"] as const;

export const PATCH = route(async ({ req, db, user, params }) => {
  const [item] = await db.select().from(schema.demandItems).where(eq(schema.demandItems.id, params.id));
  if (!item) throw new HttpError(404, "需求项不存在");
  await ownProject(db, user, item.projectId);
  const b = await body<Record<string, unknown>>(req);
  const patch: Record<string, unknown> = {};
  for (const k of FIELDS) if (typeof b[k] === "string") patch[k] = b[k];
  if (b.qty != null && isFinite(Number(b.qty))) patch.qty = Number(b.qty);
  if ("packageId" in b) {
    if (item.packageId) {
      const [cur] = await db.select().from(schema.packages).where(eq(schema.packages.id, item.packageId));
      if (cur && cur.status !== "draft") throw new HttpError(409, "这个需求项所在的询价单已经发出，不能再移动");
    }
    if (b.packageId) {
      const [target] = await db.select().from(schema.packages).where(eq(schema.packages.id, String(b.packageId)));
      if (!target || target.projectId !== item.projectId) throw new HttpError(400, "询价包不存在");
      if (target.status !== "draft") throw new HttpError(409, "目标询价单已经发出，不能再加入需求项");
    }
    patch.packageId = b.packageId ? String(b.packageId) : null;
  }
  for (const [k, v] of Object.entries(patch)) if (k !== "packageId") await logEdit(db, user, "demand_item", item.id, k, (item as Record<string, unknown>)[k], v);
  if (Object.keys(patch).length) await db.update(schema.demandItems).set(patch).where(eq(schema.demandItems.id, item.id));
  return loadProject(db, item.projectId);
});
