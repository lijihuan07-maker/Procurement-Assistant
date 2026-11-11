import { and, eq, ne } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownPackage, ownCompany, HttpError } from "@/lib/http";
import { buildLines } from "@/lib/data";
import { loadPackage } from "@/lib/package";

/** Lock the package: assign the next RFQ number and freeze its lines, so quotes are compared against what was sent. */
export const POST = route(async ({ req, db, user, params }) => {
  const { pkg, project } = await ownPackage(db, user, params.id);
  if (pkg.status !== "draft") throw new HttpError(409, "这份询价单已经锁定");
  const b = await body<{ deadline?: string; rfqNo?: string }>(req);
  const deadline = String(b.deadline || pkg.deadline || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new HttpError(400, "请先填写报价截止日期");
  const lines = await buildLines(db, pkg.id);
  if (!lines.length) throw new HttpError(400, "这个询价包里没有需求项");
  const company = await ownCompany(db, user);
  const auto = company.rfqPrefix + String(company.rfqNextNo).padStart(company.rfqPad, "0");
  const rfqNo = String(b.rfqNo || "").trim() || auto;
  // RFQ numbers must be unique within the company.
  const dup = await db.select({ id: schema.packages.id }).from(schema.packages).innerJoin(schema.projects, eq(schema.packages.projectId, schema.projects.id))
    .where(and(eq(schema.projects.companyId, company.id), eq(schema.packages.rfqNo, rfqNo), ne(schema.packages.id, pkg.id)));
  if (dup.length) throw new HttpError(409, `询价单编号 ${rfqNo} 已经用过了`);
  // Keep the counter ahead of any number issued with the company prefix.
  if (rfqNo.startsWith(company.rfqPrefix)) {
    const n = Number(rfqNo.slice(company.rfqPrefix.length));
    if (Number.isInteger(n) && n >= company.rfqNextNo) await db.update(schema.companies).set({ rfqNextNo: n + 1 }).where(eq(schema.companies.id, company.id));
  }
  await db.update(schema.packages).set({
    status: "issued", rfqNo, deadline,
    snapshot: { rfqNo, title: pkg.titleCn, titleEn: pkg.titleEn, project: project.name, currency: company.currency, vatRate: company.vatRate, deadline, validity: company.validity, payment: company.paymentTerms, lines },
  }).where(eq(schema.packages.id, pkg.id));
  return loadPackage(db, pkg.id);
});
