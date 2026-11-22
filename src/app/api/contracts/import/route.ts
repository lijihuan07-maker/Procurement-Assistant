import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, HttpError } from "@/lib/http";
import { contractFields, linkNames, listContracts } from "@/lib/contracts";

/** Save the contracts the user ticked in the import preview. Same contract number + supplier is updated, not duplicated. */
export const POST = route(async ({ req, db, user }) => {
  const b = await body<{ contracts?: Record<string, unknown>[] }>(req);
  const list = b.contracts || [];
  if (!list.length) throw new HttpError(400, "没有勾选要导入的合同");
  let added = 0, updated = 0;
  for (const raw of list) {
    const row = await linkNames(db, user.companyId, contractFields(raw));
    const same = row.contractNo ? (await db.select().from(schema.contracts).where(and(eq(schema.contracts.companyId, user.companyId), eq(schema.contracts.contractNo, row.contractNo))))
      .find((c) => !row.supplierName || c.supplierName.toLowerCase() === row.supplierName.toLowerCase()) : undefined;
    if (same) { await db.update(schema.contracts).set(row).where(eq(schema.contracts.id, same.id)); updated++; }
    else { await db.insert(schema.contracts).values({ companyId: user.companyId, ...row }); added++; }
  }
  return { ...(await listContracts(db, user.companyId)), added, updated };
});
