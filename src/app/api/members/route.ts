import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, HttpError } from "@/lib/http";
import { hashPassword } from "@/lib/auth";

/** Admin adds a colleague with an initial password (no email service in phase 1). */
export const POST = route(async ({ req, db, user }) => {
  if (user.role !== "admin") throw new HttpError(403, "只有管理员可以添加成员");
  const b = await body<{ email?: string; name?: string; password?: string; role?: string }>(req);
  const email = String(b.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || String(b.password || "").length < 8) throw new HttpError(400, "请填写正确的邮箱，初始密码至少 8 位");
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (exists) throw new HttpError(409, "这个邮箱已经注册过了");
  const role = ["admin", "manager", "buyer"].includes(String(b.role)) ? String(b.role) : "buyer";
  await db.insert(schema.users).values({ companyId: user.companyId, email, name: String(b.name || ""), passwordHash: await hashPassword(String(b.password)), role });
  return { ok: true };
});
