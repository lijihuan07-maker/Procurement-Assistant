import "server-only";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { schema, type DB } from "@/db";
import type { RfqLine, RfqSnapshot } from "@/db/schema";

export async function loadProject(db: DB, projectId: string) {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const items = await db.select().from(schema.demandItems).where(eq(schema.demandItems.projectId, projectId)).orderBy(asc(schema.demandItems.seq));
  const ids = items.map((i) => i.id);
  const qs = ids.length ? await db.select().from(schema.clarifications).where(inArray(schema.clarifications.itemId, ids)) : [];
  const packages = await db.select().from(schema.packages).where(eq(schema.packages.projectId, projectId)).orderBy(asc(schema.packages.createdAt), asc(schema.packages.code));
  const specDocs = await db.select({
    id: schema.specDocs.id, fileName: schema.specDocs.fileName, pages: schema.specDocs.pages, createdAt: schema.specDocs.createdAt,
    sections: sql<number>`(select count(*)::int from spec_sections s where s.doc_id = spec_docs.id)`,
  }).from(schema.specDocs).where(eq(schema.specDocs.projectId, projectId)).orderBy(desc(schema.specDocs.createdAt));
  const quoteCounts = packages.length ? await db.select({ packageId: schema.quotes.packageId, n: sql<number>`count(*)::int` }).from(schema.quotes).where(inArray(schema.quotes.packageId, packages.map((p) => p.id))).groupBy(schema.quotes.packageId) : [];
  return {
    project,
    items: items.map((i) => ({ ...i, questions: qs.filter((q) => q.itemId === i.id) })),
    packages: packages.map((p) => ({ id: p.id, code: p.code, titleCn: p.titleCn, titleEn: p.titleEn, supplierType: p.supplierType, reason: p.reason, status: p.status, rfqNo: p.rfqNo, deadline: p.deadline, quotes: quoteCounts.find((c) => c.packageId === p.id)?.n ?? 0 })),
    specDocs,
  };
}

/** Spec text for an RFQ line: the item's own spec plus confirmed clarification answers. */
export function specWithAnswers(spec: string, answers: string[]) {
  return [spec, ...answers].map((s) => s.trim()).filter(Boolean).join("; ");
}

export async function buildLines(db: DB, packageId: string): Promise<RfqLine[]> {
  const items = await db.select().from(schema.demandItems).where(eq(schema.demandItems.packageId, packageId)).orderBy(asc(schema.demandItems.seq));
  const ids = items.map((i) => i.id);
  const qs = ids.length ? await db.select().from(schema.clarifications).where(inArray(schema.clarifications.itemId, ids)) : [];
  return items.map((it, k) => ({
    no: String(k + 1), itemId: it.id,
    name: [it.nameCn, it.nameEn].filter(Boolean).join(" "),
    spec: specWithAnswers(it.spec, qs.filter((q) => q.itemId === it.id && q.status === "answered" && q.answer).map((q) => q.answer)),
    unit: it.unit, qty: it.qty, techReq: it.techReq, hint: [it.quoteHint, `Demand No. ${it.no}`].filter(Boolean).join("\n"), category: it.category,
  }));
}

export function snapshotTerms(s: RfqSnapshot) {
  return { payment: s.payment, delivery: "送至项目现场", validity: s.validity, priceFixed: "供货期内单价固定", deadline: s.deadline };
}

/** Rough material category from free text, used when importing purchase history without a category column. */
const KEYWORDS: [string, RegExp][] = [
  ["瓷砖", /tile|ceramic|porcelain|瓷砖|地砖|墙砖/i],
  ["混凝土铺装砖/联锁块", /interlock|paver|paving block|block brick|联锁|铺装砖|混凝土砖/i],
  ["路缘石", /curb|kerb|路缘/i],
  ["管材", /pipe|ppr|upvc|hdpe|管材|管件|fitting/i],
  ["碎石/骨料", /gravel|aggregate|mulch|crushed|碎石|骨料|砾石/i],
  ["石材", /granite|marble|stone|花岗|大理石|石材/i],
  ["灯具", /light|lamp|luminaire|灯/i],
  ["钢制品/金属件", /steel|bollard|stainless|metal|rack|钢|不锈钢|金属/i],
  ["混凝土预制件", /precast|wheel stop|concrete|预制|挡轮/i],
  ["标识标牌", /sign|signage|标识|标牌/i],
];
export function guessCategory(text: string) {
  for (const [c, re] of KEYWORDS) if (re.test(text)) return c;
  return "其他";
}
