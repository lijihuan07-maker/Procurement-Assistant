import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { createSession, hashPassword } from "@/lib/auth";
import { json, fail } from "@/lib/http";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const companyName = String(b.companyName || "").trim();
  const name = String(b.name || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  if (!companyName || !email || password.length < 8) return fail(req, 400, "请填写公司名称、邮箱，密码至少 8 位");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(req, 400, "邮箱格式不对");
  const db = await getDb();
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (exists) return fail(req, 409, "这个邮箱已经注册过了，请直接登录");
  const [company] = await db.insert(schema.companies).values({ name: companyName, senderName: name }).returning();
  const [user] = await db.insert(schema.users).values({ companyId: company.id, email, name, passwordHash: await hashPassword(password), role: "admin" }).returning();
  await createSession(user.id);
  return json({ ok: true });
}
