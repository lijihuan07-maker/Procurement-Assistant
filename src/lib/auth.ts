import "server-only";
import { cookies } from "next/headers";
import { eq, and, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb, schema } from "@/db";

const COOKIE = "rfq_session";
const DAYS = 30;

export type SessionUser = { id: string; email: string; name: string; role: string; companyId: string; companyName: string };

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }

export async function createSession(userId: string) {
  const db = await getDb();
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + DAYS * 864e5);
  await db.insert(schema.sessions).values({ id: token, userId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) { const db = await getDb(); await db.delete(schema.sessions).where(eq(schema.sessions.id, token)); }
  jar.delete(COOKIE);
}

export async function getUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const rows = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role, companyId: schema.users.companyId, companyName: schema.companies.name })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .innerJoin(schema.companies, eq(schema.users.companyId, schema.companies.id))
    .where(and(eq(schema.sessions.id, token), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}
