import type { DB } from "@/db";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownCompany, HttpError } from "@/lib/http";

async function load(db: DB, companyId: string) {
  const [company] = await db.select({ id: schema.companies.id, name: schema.companies.name, senderName: schema.companies.senderName, nameEn: schema.companies.nameEn, senderEn: schema.companies.senderEn }).from(schema.companies).where(eq(schema.companies.id, companyId));
  const members = await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role }).from(schema.users).where(eq(schema.users.companyId, companyId));
  return { company, members };
}

export const GET = route(async ({ db, user }) => ({ ...(await load(db, user.companyId)), me: user }));

/** Company name and the name used to sign RFQ emails. RFQ numbering and terms live in each procurement requirement. */
export const PATCH = route(async ({ req, db, user }) => {
  if (user.role !== "admin") throw new HttpError(403, "只有管理员可以修改公司设置");
  await ownCompany(db, user);
  const b = await body<Record<string, unknown>>(req);
  const patch: Record<string, string> = {};
  for (const k of ["name", "senderName", "nameEn", "senderEn"]) if (typeof b[k] === "string") patch[k] = String(b[k]).trim().slice(0, 200);
  if (patch.name === "") throw new HttpError(400, "请填写公司名称");
  if (Object.keys(patch).length) await db.update(schema.companies).set(patch).where(eq(schema.companies.id, user.companyId));
  return { ...(await load(db, user.companyId)), me: user };
});
