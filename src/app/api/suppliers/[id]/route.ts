import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, HttpError } from "@/lib/http";

export const PATCH = route(async ({ req, db, user, params }) => {
  const b = await body<Record<string, unknown>>(req);
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "contact", "email", "phone", "city", "website", "notes"]) if (typeof b[k] === "string") patch[k] = String(b[k]).trim();
  if (Array.isArray(b.categories)) patch.categories = b.categories.map(String).filter(Boolean);
  if (b.rating === null || (b.rating != null && isFinite(Number(b.rating)))) patch.rating = b.rating === null ? null : Math.max(0, Math.min(5, Number(b.rating)));
  const [s] = await db.update(schema.suppliers).set(patch).where(and(eq(schema.suppliers.id, params.id), eq(schema.suppliers.companyId, user.companyId))).returning();
  if (!s) throw new HttpError(404, "供应商不存在");
  return { supplier: s };
});

export const DELETE = route(async ({ db, user, params }) => {
  await db.delete(schema.suppliers).where(and(eq(schema.suppliers.id, params.id), eq(schema.suppliers.companyId, user.companyId)));
  return { ok: true };
});
