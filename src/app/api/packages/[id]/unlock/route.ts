import { and, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import { route, ownPackage, ownCompany, HttpError } from "@/lib/http";
import { loadPackage } from "@/lib/package";

/** Undo "lock": allowed only while nothing has gone out to suppliers. */
export const POST = route(async ({ db, user, params }) => {
  const { pkg } = await ownPackage(db, user, params.id);
  if (pkg.status !== "issued") throw new HttpError(409, pkg.status === "draft" ? "这份询价单还没有锁定" : "已经定标的询价单不能解锁");
  const [q] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.quotes).where(eq(schema.quotes.packageId, pkg.id));
  if (q.n) throw new HttpError(409, "已经上传了报价，不能解锁。要改内容请删除报价后再试。");
  const [s] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.invites).where(and(eq(schema.invites.packageId, pkg.id), eq(schema.invites.status, "sent")));
  if (s.n) throw new HttpError(409, "已经有询价邮件标记为“已发送”，不能解锁。如果其实没发，先在第 2 步撤销“已发送”。");
  await db.delete(schema.invites).where(eq(schema.invites.packageId, pkg.id));
  // Give the number back if it was the last one issued.
  const company = await ownCompany(db, user);
  if (pkg.rfqNo === company.rfqPrefix + String(company.rfqNextNo - 1).padStart(company.rfqPad, "0")) {
    await db.update(schema.companies).set({ rfqNextNo: company.rfqNextNo - 1 }).where(eq(schema.companies.id, company.id));
  }
  await db.update(schema.packages).set({ status: "draft", rfqNo: null, snapshot: null }).where(eq(schema.packages.id, pkg.id));
  return loadPackage(db, pkg.id);
});
