import { and, eq, ne } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownPackage, ownCompany, HttpError } from "@/lib/http";
import { buildLines } from "@/lib/data";
import { loadPackage } from "@/lib/package";
import { nextRfqNo, settingsOf } from "@/lib/settings";

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
  const st = settingsOf(project, company);
  const auto = await nextRfqNo(db, company.id, st, pkg.id);
  const rfqNo = String(b.rfqNo || "").trim() || auto;
  // RFQ numbers must be unique within the company.
  const dup = await db.select({ id: schema.packages.id }).from(schema.packages).innerJoin(schema.projects, eq(schema.packages.projectId, schema.projects.id))
    .where(and(eq(schema.projects.companyId, company.id), eq(schema.packages.rfqNo, rfqNo), ne(schema.packages.id, pkg.id)));
  if (dup.length) throw new HttpError(409, "询价单编号 {no} 已经用过了", { no: rfqNo });
  await db.update(schema.packages).set({
    status: "issued", rfqNo, deadline,
    snapshot: { rfqNo, title: pkg.titleCn, titleEn: pkg.titleEn, project: project.siteName, currency: st.currency, vatRate: st.vatRate, deadline, validity: st.validity, payment: st.paymentTerms, lines, standards: project.standards?.systems.map((x) => x.name) || [] },
  }).where(eq(schema.packages.id, pkg.id));
  return loadPackage(db, pkg.id);
});
