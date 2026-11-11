import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownPackage, ownCompany, HttpError } from "@/lib/http";
import { loadPackage, fillEmail } from "@/lib/package";

export const POST = route(async ({ req, db, user, params }) => {
  const { pkg, project } = await ownPackage(db, user, params.id);
  if (pkg.status === "draft") throw new HttpError(409, "请先锁定询价单（生成编号），再给供应商写邮件");
  const b = await body<{ supplierIds: string[] }>(req);
  const ids = [...new Set(b.supplierIds || [])];
  if (!ids.length) throw new HttpError(400, "请先勾选供应商");
  const sups = await db.select().from(schema.suppliers).where(and(eq(schema.suppliers.companyId, user.companyId), inArray(schema.suppliers.id, ids)));
  const existing = await db.select({ supplierId: schema.invites.supplierId }).from(schema.invites).where(eq(schema.invites.packageId, pkg.id));
  const company = await ownCompany(db, user);
  const data = await loadPackage(db, pkg.id);
  for (const s of sups) {
    if (existing.some((e) => e.supplierId === s.id)) continue;
    const mail = fillEmail(data.emailTemplate, {
      supplier: s.name, contact: s.contact || "Sir/Madam", rfqNo: pkg.rfqNo || "", title: pkg.titleEn || pkg.titleCn,
      project: project.name, deadline: pkg.deadline || "", sender: company.senderName || user.name, company: company.name,
    });
    const reco = data.recommendations.find((r) => r.supplier.id === s.id);
    await db.insert(schema.invites).values({ packageId: pkg.id, supplierId: s.id, subject: mail.subject, body: mail.body, recommended: reco?.reasons.join("；") || "" });
  }
  return loadPackage(db, pkg.id);
});
