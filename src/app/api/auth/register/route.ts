import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { createSession, hashPassword } from "@/lib/auth";
import { json } from "@/lib/http";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const companyName = String(b.companyName || "").trim();
  const name = String(b.name || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  if (!companyName || !email || password.length < 8) return json({ error: "请填写公司名称、邮箱，密码至少 8 位" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "邮箱格式不对" }, 400);
  const db = await getDb();
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (exists) return json({ error: "这个邮箱已经注册过了，请直接登录" }, 409);
  const [company] = await db.insert(schema.companies).values({ name: companyName, senderName: name }).returning();
  const [user] = await db.insert(schema.users).values({ companyId: company.id, email, name, passwordHash: await hashPassword(password), role: "admin" }).returning();
  await createSession(user.id);
  return json({ ok: true });
}
