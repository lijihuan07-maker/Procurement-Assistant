import "server-only";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getUser, type SessionUser } from "./auth";
import { getDb, schema, type DB } from "@/db";
import { pickLang, translate, LANG_COOKIE, type Lang, type Vars } from "./i18n";

/** Error shown to the user. The message is a Chinese source string with {placeholders}; it is translated per request. */
export class HttpError extends Error { constructor(public status: number, message: string, public vars?: Vars) { super(message); } }

export function langOf(req: Request): Lang {
  const c = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=([^;]+)`))?.[1];
  return pickLang(c, req.headers.get("accept-language"));
}
/** JSON error response in the caller's language. */
export function fail(req: Request, status: number, message: string, vars?: Vars) {
  const lang = langOf(req);
  const v = vars && Object.fromEntries(Object.entries(vars).map(([k, x]) => [k, typeof x === "string" ? translate(lang, x) : x]));
  return json({ error: translate(lang, message, v) }, status);
}

export function json(data: unknown, status = 200) { return NextResponse.json(data, { status }); }

/** Wraps a route handler: requires login, maps errors to JSON. */
export function route<C = unknown>(fn: (ctx: { req: Request; user: SessionUser; db: DB; params: Record<string, string>; lang: Lang }) => Promise<unknown>) {
  return async (req: Request, context: { params: Promise<Record<string, string>> } | C) => {
    try {
      const user = await getUser();
      if (!user) throw new HttpError(401, "请先登录");
      const db = await getDb();
      const params = (context as { params?: Promise<Record<string, string>> })?.params ? await (context as { params: Promise<Record<string, string>> }).params : {};
      const out = await fn({ req, user, db, params, lang: langOf(req) });
      return out instanceof Response ? out : json(out ?? { ok: true });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      const message = e instanceof Error ? e.message : String(e);
      if (status === 500) console.error(e);
      return fail(req, status, message, e instanceof HttpError ? e.vars : undefined);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new HttpError(400, "请求格式不对"); }
}

/* ---- ownership guards: every lookup is scoped to the user's company ---- */
export async function ownProject(db: DB, user: SessionUser, projectId: string) {
  const [p] = await db.select().from(schema.projects).where(and(eq(schema.projects.id, projectId), eq(schema.projects.companyId, user.companyId)));
  if (!p) throw new HttpError(404, "项目不存在");
  return p;
}
export async function ownPackage(db: DB, user: SessionUser, packageId: string) {
  const [row] = await db.select({ pkg: schema.packages, project: schema.projects }).from(schema.packages)
    .innerJoin(schema.projects, eq(schema.packages.projectId, schema.projects.id))
    .where(and(eq(schema.packages.id, packageId), eq(schema.projects.companyId, user.companyId)));
  if (!row) throw new HttpError(404, "询价包不存在");
  return row;
}
export async function ownCompany(db: DB, user: SessionUser) {
  const [c] = await db.select().from(schema.companies).where(eq(schema.companies.id, user.companyId));
  if (!c) throw new HttpError(404, "公司不存在");
  return c;
}
export async function logEdit(db: DB, user: SessionUser, entity: string, entityId: string, field: string, oldValue: unknown, newValue: unknown) {
  await db.insert(schema.editLog).values({ companyId: user.companyId, userId: user.id, entity, entityId, field, oldValue: oldValue == null ? null : String(oldValue), newValue: newValue == null ? null : String(newValue) });
}
