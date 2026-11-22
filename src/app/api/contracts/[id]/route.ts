import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, HttpError } from "@/lib/http";
import { contractFields, linkNames, listContracts } from "@/lib/contracts";

async function own(db: Parameters<Parameters<typeof route>[0]>[0]["db"], companyId: string, id: string) {
  const [c] = await db.select().from(schema.contracts).where(and(eq(schema.contracts.id, id), eq(schema.contracts.companyId, companyId)));
  if (!c) throw new HttpError(404, "合同不存在");
  return c;
}

export const PATCH = route(async ({ req, db, user, params }) => {
  await own(db, user.companyId, params.id);
  const b = await body<Record<string, unknown>>(req);
  const row = await linkNames(db, user.companyId, contractFields(b));
  if (Object.keys(row).length) await db.update(schema.contracts).set(row).where(eq(schema.contracts.id, params.id));
  return listContracts(db, user.companyId);
});

export const DELETE = route(async ({ db, user, params }) => {
  await own(db, user.companyId, params.id);
  await db.delete(schema.contracts).where(eq(schema.contracts.id, params.id));
  return listContracts(db, user.companyId);
});
