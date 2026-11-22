import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, HttpError } from "@/lib/http";
import { addMaterials } from "@/lib/materials";
import { FAMILY } from "@/lib/taxonomy";

async function own(db: Parameters<Parameters<typeof route>[0]>[0]["db"], companyId: string, id: string) {
  const [s] = await db.select().from(schema.suppliers).where(and(eq(schema.suppliers.id, id), eq(schema.suppliers.companyId, companyId)));
  if (!s) throw new HttpError(404, "供应商不存在");
  return s;
}

/** Add a material the user knows this supplier sells. */
export const POST = route(async ({ req, db, user, params }) => {
  const s = await own(db, user.companyId, params.id);
  const b = await body<{ family?: string; item?: string }>(req);
  if (!FAMILY[String(b.family)]) throw new HttpError(400, "请选择材料类别");
  await addMaterials(db, user.companyId, s.id, [{ family: String(b.family), item: String(b.item || ""), evidence: "declared" }]);
  return { ok: true };
});

/** Remove one material line (e.g. a wrong AI guess). */
export const DELETE = route(async ({ req, db, user, params }) => {
  const s = await own(db, user.companyId, params.id);
  const b = await body<{ materialId?: string }>(req);
  await db.delete(schema.supplierMaterials).where(and(eq(schema.supplierMaterials.id, String(b.materialId || "")), eq(schema.supplierMaterials.supplierId, s.id)));
  return { ok: true };
});
