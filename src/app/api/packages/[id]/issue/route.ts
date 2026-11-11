import { eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownPackage, ownCompany, HttpError } from "@/lib/http";
import { buildLines } from "@/lib/data";
import { loadPackage } from "@/lib/package";

/** Lock the package: assign the next RFQ number and freeze its lines, so quotes are compared against what was sent. */
export const POST = route(async ({ req, db, user, params }) => {
  const { pkg, project } = await ownPackage(db, user, params.id);
  if (pkg.status !== "draft") throw new HttpError(409, "这份询价单已经锁定");
  const b = await body<{ deadline?: string }>(req);
  const deadline = String(b.deadline || pkg.deadline || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new HttpError(400, "请先填写报价截止日期");
  const lines = await buildLines(db, pkg.id);
  if (!lines.length) throw new HttpError(400, "这个询价包里没有需求项");
  const company = await ownCompany(db, user);
  const [upd] = await db.update(schema.companies).set({ rfqNextNo: sql`${schema.companies.rfqNextNo} + 1` }).where(eq(schema.companies.id, company.id)).returning({ next: schema.companies.rfqNextNo });
  const no = upd.next - 1;
  const rfqNo = company.rfqPrefix + String(no).padStart(company.rfqPad, "0");
  await db.update(schema.packages).set({
    status: "issued", rfqNo, deadline,
    snapshot: { rfqNo, title: pkg.titleCn, titleEn: pkg.titleEn, project: project.name, currency: company.currency, vatRate: company.vatRate, deadline, validity: company.validity, payment: company.paymentTerms, lines },
  }).where(eq(schema.packages.id, pkg.id));
  return loadPackage(db, pkg.id);
});
