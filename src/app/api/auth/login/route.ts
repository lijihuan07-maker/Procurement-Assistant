import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { json, fail } from "@/lib/http";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || "").trim().toLowerCase();
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user || !(await verifyPassword(String(b.password || ""), user.passwordHash))) return fail(req, 401, "邮箱或密码不对");
  await createSession(user.id);
  return json({ ok: true });
}
