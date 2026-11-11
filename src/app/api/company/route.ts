import type { DB } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownCompany, HttpError } from "@/lib/http";
import { DEFAULT_EMAIL } from "@/lib/package";

async function load(db: DB, companyId: string) {
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId));
  const tpls = await db.select().from(schema.templates).where(eq(schema.templates.companyId, companyId)).orderBy(desc(schema.templates.createdAt));
  const members = await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role }).from(schema.users).where(eq(schema.users.companyId, companyId));
  return { company, rfqTemplate: tpls.find((t) => t.kind === "rfq") || null, emailTemplate: tpls.find((t) => t.kind === "email")?.data || DEFAULT_EMAIL, members };
}

export const GET = route(async ({ db, user }) => ({ ...(await load(db, user.companyId)), me: user }));

export const PATCH = route(async ({ req, db, user }) => {
  if (user.role !== "admin") throw new HttpError(403, "只有管理员可以修改公司设置");
  await ownCompany(db, user);
  const b = await body<Record<string, unknown>>(req);
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "rfqPrefix", "currency", "paymentTerms", "validity", "senderName"]) if (typeof b[k] === "string") patch[k] = String(b[k]);
  for (const k of ["rfqNextNo", "rfqPad"]) if (b[k] != null && Number.isInteger(Number(b[k])) && Number(b[k]) > 0) patch[k] = Number(b[k]);
  if (b.vatRate != null && isFinite(Number(b.vatRate))) patch.vatRate = Number(b.vatRate);
  if (Object.keys(patch).length) await db.update(schema.companies).set(patch).where(eq(schema.companies.id, user.companyId));
  return { ...(await load(db, user.companyId)), me: user };
});

export const POST = route(async ({ req, db, user }) => {
  // Save a template: { kind: "rfq" | "email", name, data }
  const b = await body<{ kind: string; name?: string; data: unknown }>(req);
  if (!["rfq", "email"].includes(b.kind) || !b.data) throw new HttpError(400, "模板格式不对");
  await db.delete(schema.templates).where(and(eq(schema.templates.companyId, user.companyId), eq(schema.templates.kind, b.kind)));
  await db.insert(schema.templates).values({ companyId: user.companyId, kind: b.kind, name: String(b.name || b.kind), data: b.data as never });
  return { ...(await load(db, user.companyId)), me: user };
});
