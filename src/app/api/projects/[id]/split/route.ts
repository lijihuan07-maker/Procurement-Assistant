import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { schema } from "@/db";
import { route, ownProject, HttpError } from "@/lib/http";
import { askJson } from "@/lib/ai";
import { splitPrompt } from "@/lib/prompts";
import { loadProject } from "@/lib/data";

export const maxDuration = 300;

type Out = { packages: { code: string; titleEn: string; titleCn: string; supplierType: string; reason: string; items: string[] }[]; hints?: { no: string; quoteHint: string }[] };

export const POST = route(async ({ db, user, params, lang }) => {
  const project = await ownProject(db, user, params.id);
  // Draft packages are rebuilt; items already in issued packages stay where they are.
  await db.delete(schema.packages).where(and(eq(schema.packages.projectId, project.id), eq(schema.packages.status, "draft")));
  const items = await db.select().from(schema.demandItems).where(and(eq(schema.demandItems.projectId, project.id), isNull(schema.demandItems.packageId))).orderBy(asc(schema.demandItems.seq));
  if (!items.length) throw new HttpError(400, "没有待分包的需求项");
  const out = await askJson<Out>("split", splitPrompt(items.map((i) => ({ no: i.no, nameCn: i.nameCn, nameEn: i.nameEn, spec: i.spec, unit: i.unit, qty: i.qty, category: i.category }))), { maxTokens: 12000, lang });
  const existing = await db.select({ code: schema.packages.code }).from(schema.packages).where(and(eq(schema.packages.projectId, project.id), ne(schema.packages.status, "draft")));
  let n = existing.reduce((m, p) => Math.max(m, Number(p.code.replace(/\D/g, "")) || 0), 0);
  for (const p of out.packages || []) {
    const its = items.filter((i) => (p.items || []).map(String).includes(i.no));
    if (!its.length) continue;
    n++;
    const [pkg] = await db.insert(schema.packages).values({ projectId: project.id, code: `P${n}`, titleCn: String(p.titleCn || ""), titleEn: String(p.titleEn || ""), supplierType: String(p.supplierType || ""), reason: String(p.reason || "") }).returning();
    for (const it of its) await db.update(schema.demandItems).set({ packageId: pkg.id }).where(eq(schema.demandItems.id, it.id));
  }
  for (const h of out.hints || []) {
    const it = items.find((i) => i.no === String(h.no));
    if (it && h.quoteHint) await db.update(schema.demandItems).set({ quoteHint: String(h.quoteHint) }).where(eq(schema.demandItems.id, it.id));
  }
  return loadProject(db, project.id);
});
