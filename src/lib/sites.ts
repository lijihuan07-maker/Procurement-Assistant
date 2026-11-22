import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { schema, type DB } from "@/db";
import { defaultSettings, settingsOf, templateSummary } from "./settings";

const counts = {
  items: sql<number>`(select count(*)::int from demand_items d where d.project_id = projects.id)`,
  packages: sql<number>`(select count(*)::int from packages k where k.project_id = projects.id)`,
  openQuestions: sql<number>`(select count(*)::int from clarifications c join demand_items d on c.item_id = d.id where d.project_id = projects.id and c.status = 'open')`,
  job: sql<string | null>`(select j.status from jobs j where j.project_id = projects.id order by j.created_at desc limit 1)`,
};

export async function listSites(db: DB, companyId: string) {
  const sites = await db.select().from(schema.sites).where(eq(schema.sites.companyId, companyId)).orderBy(desc(schema.sites.createdAt));
  const reqs = await db.select({ id: schema.projects.id, siteId: schema.projects.siteId, ...counts }).from(schema.projects).where(eq(schema.projects.companyId, companyId));
  return sites.map((s) => {
    const mine = reqs.filter((r) => r.siteId === s.id);
    return { id: s.id, name: s.name, location: s.location, owner: s.owner, createdAt: s.createdAt, reqs: mine.length, items: mine.reduce((n, r) => n + r.items, 0), packages: mine.reduce((n, r) => n + r.packages, 0), openQuestions: mine.reduce((n, r) => n + r.openQuestions, 0) };
  });
}

/** Earlier requirements whose RFQ settings can be copied into a new one, newest first. */
export async function listTemplates(db: DB, companyId: string) {
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId));
  const rows = await db.select({ p: schema.projects, siteName: schema.sites.name }).from(schema.projects).innerJoin(schema.sites, eq(schema.projects.siteId, schema.sites.id))
    .where(eq(schema.projects.companyId, companyId)).orderBy(desc(schema.projects.createdAt));
  return {
    defaults: defaultSettings(company),
    templates: rows.filter((r) => r.p.settings).map((r) => ({ id: r.p.id, name: r.p.name, kind: r.p.kind, siteId: r.p.siteId, siteName: r.siteName, createdAt: r.p.createdAt, ...templateSummary(settingsOf(r.p, company)) })),
  };
}

export async function loadSite(db: DB, companyId: string, siteId: string) {
  const [site] = await db.select().from(schema.sites).where(eq(schema.sites.id, siteId));
  const reqs = await db.select({ id: schema.projects.id, name: schema.projects.name, kind: schema.projects.kind, demandFileName: schema.projects.demandFileName, createdAt: schema.projects.createdAt, ...counts })
    .from(schema.projects).where(eq(schema.projects.siteId, siteId)).orderBy(desc(schema.projects.createdAt));
  return { site, reqs, ...(await listTemplates(db, companyId)) };
}
