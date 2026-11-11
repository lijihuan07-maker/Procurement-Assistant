import type { DB } from "@/db";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownPackage, HttpError } from "@/lib/http";
import { loadPackage } from "@/lib/package";

async function load(db: DB, id: string) {
  const [inv] = await db.select().from(schema.invites).where(eq(schema.invites.id, id));
  if (!inv) throw new HttpError(404, "邮件不存在");
  return inv;
}

export const PATCH = route(async ({ req, db, user, params }) => {
  const inv = await load(db, params.id);
  await ownPackage(db, user, inv.packageId);
  const b = await body<{ subject?: string; body?: string; status?: string }>(req);
  const patch: Record<string, unknown> = {};
  if (typeof b.subject === "string") patch.subject = b.subject;
  if (typeof b.body === "string") patch.body = b.body;
  if (b.status === "sent") { patch.status = "sent"; patch.sentAt = new Date(); }
  if (b.status === "draft") { patch.status = "draft"; patch.sentAt = null; }
  if (Object.keys(patch).length) await db.update(schema.invites).set(patch).where(eq(schema.invites.id, inv.id));
  return loadPackage(db, inv.packageId);
});

export const DELETE = route(async ({ db, user, params }) => {
  const inv = await load(db, params.id);
  await ownPackage(db, user, inv.packageId);
  await db.delete(schema.invites).where(eq(schema.invites.id, inv.id));
  return loadPackage(db, inv.packageId);
});
