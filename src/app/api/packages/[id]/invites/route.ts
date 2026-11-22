import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownPackage, ownCompany, HttpError } from "@/lib/http";
import { loadPackage, fillEmail } from "@/lib/package";
import { EMAIL_PRESETS } from "@/lib/email-default";
import { hasCjk, toEnglish } from "@/lib/english";
import { settingsOf } from "@/lib/settings";

export const maxDuration = 120;

/**
 * Write RFQ emails for the chosen suppliers (or rewrite the unsent ones with another template).
 * Emails always go out in English: Chinese names of the company, sender, project and suppliers are translated, and
 * the English company/sender/project names are kept for next time.
 */
export const POST = route(async ({ req, db, user, params }) => {
  const { pkg, project } = await ownPackage(db, user, params.id);
  if (pkg.status === "draft") throw new HttpError(409, "请先锁定询价单（生成编号），再给供应商写邮件");
  const b = await body<{ supplierIds?: string[]; template?: string; regenerate?: boolean }>(req);
  const existing = await db.select().from(schema.invites).where(eq(schema.invites.packageId, pkg.id));
  let ids = [...new Set(b.supplierIds || [])];
  if (b.regenerate) ids = existing.filter((i) => i.status !== "sent").map((i) => i.supplierId);
  else ids = ids.filter((id) => !existing.some((e) => e.supplierId === id));
  if (!ids.length) { if (b.regenerate) throw new HttpError(400, "没有未发送的邮件可以重新生成"); if (!b.supplierIds?.length) throw new HttpError(400, "请先勾选供应商"); return loadPackage(db, pkg.id); }
  const sups = await db.select().from(schema.suppliers).where(and(eq(schema.suppliers.companyId, user.companyId), inArray(schema.suppliers.id, ids)));
  const company = await ownCompany(db, user);
  const [site] = await db.select().from(schema.sites).where(eq(schema.sites.id, project.siteId));
  const custom = settingsOf(project, company).email;
  const tpl = b.template === "custom" && custom ? custom : (EMAIL_PRESETS[b.template || ""] || (custom ? { tpl: custom } : EMAIL_PRESETS.standard)).tpl;

  // Everything that may be Chinese, translated in one go.
  const sender = company.senderEn || company.senderName || user.name;
  const vals = {
    company: company.nameEn || company.name, sender, project: site.nameEn || site.name, title: pkg.titleEn || pkg.titleCn,
    subject: tpl.subject, body: tpl.body,
  };
  const keys = Object.keys(vals) as (keyof typeof vals)[];
  const supTexts = sups.flatMap((s) => [s.name, s.contact]);
  const out = await toEnglish([...keys.map((k) => vals[k]), ...supTexts]);
  const en = Object.fromEntries(keys.map((k, i) => [k, out[i]])) as typeof vals;
  if (!company.nameEn && hasCjk(company.name)) await db.update(schema.companies).set({ nameEn: en.company }).where(eq(schema.companies.id, company.id));
  if (!company.senderEn && hasCjk(sender)) await db.update(schema.companies).set({ senderEn: en.sender }).where(eq(schema.companies.id, company.id));
  if (!site.nameEn && hasCjk(site.name)) await db.update(schema.sites).set({ nameEn: en.project }).where(eq(schema.sites.id, site.id));

  const data = await loadPackage(db, pkg.id);
  for (const [i, s] of sups.entries()) {
    const mail = fillEmail({ subject: en.subject, body: en.body }, {
      supplier: out[keys.length + i * 2] || s.name, contact: out[keys.length + i * 2 + 1] || "Sir/Madam", rfqNo: pkg.rfqNo || "", title: en.title,
      project: en.project, deadline: pkg.deadline || "", sender: en.sender, company: en.company,
    });
    const prev = existing.find((e) => e.supplierId === s.id);
    if (prev) { await db.update(schema.invites).set({ subject: mail.subject, body: mail.body }).where(eq(schema.invites.id, prev.id)); continue; }
    const reco = data.recommendations.find((r) => r.supplier.id === s.id);
    await db.insert(schema.invites).values({ packageId: pkg.id, supplierId: s.id, subject: mail.subject, body: mail.body, recommended: reco?.reasons.join("；") || "" });
  }
  return loadPackage(db, pkg.id);
});
