import { schema } from "@/db";
import { route, body, HttpError } from "@/lib/http";
import { contractFields, linkNames, listContracts } from "@/lib/contracts";

export const GET = route(async ({ db, user }) => listContracts(db, user.companyId));

export const POST = route(async ({ req, db, user }) => {
  const b = await body<Record<string, unknown>>(req);
  const row = await linkNames(db, user.companyId, contractFields(b));
  if (!row.supplierName && !row.contractNo && !row.title) throw new HttpError(400, "请至少填写合同编号、合同名称或供应商");
  if (row.supplierId && !row.supplierName) {
    const sup = (await listContracts(db, user.companyId)).suppliers.find((s) => s.id === row.supplierId);
    row.supplierName = sup?.name || "";
  }
  await db.insert(schema.contracts).values({ companyId: user.companyId, ...row });
  return listContracts(db, user.companyId);
});
