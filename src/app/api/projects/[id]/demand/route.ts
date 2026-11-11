import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownProject, HttpError } from "@/lib/http";
import { loadProject } from "@/lib/data";

export type DemandItem = { row?: string; no: string; nameCn: string; nameEn: string; spec: string; unit: string; qty: number | string; dateRequired: string; techReq: string; specRef: string; category: string; issues: string[]; questions: { question: string; questionEn?: string; options?: string[] }[] };

/** Save the items the AI read from the demand list (parsed part by part in /demand/parse). Replaces earlier items. */
export const POST = route(async ({ req, db, user, params }) => {
  const project = await ownProject(db, user, params.id);
  const b = await body<{ fileName?: string; items?: DemandItem[] }>(req);
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) throw new HttpError(422, "清单里没有识别到物资项");
  const issued = await db.select({ id: schema.packages.id }).from(schema.packages).where(and(eq(schema.packages.projectId, project.id), eq(schema.packages.status, "issued")));
  if (issued.length) throw new HttpError(409, "这个项目已经有发出的询价单，不能整体替换需求清单。请新建一个项目。");

  // Image placeholders from Excel (=DISPIMG(...), [图片]) are not text the supplier should see.
  const clean = (v: unknown) => String(v ?? "").replace(/=?_?x?l?f?n?\.?DISPIMG\([^)]*\)|\[图片\]/g, "").trim();
  await db.delete(schema.packages).where(eq(schema.packages.projectId, project.id));
  await db.delete(schema.demandItems).where(eq(schema.demandItems.projectId, project.id));
  for (const [k, it] of items.entries()) {
    const [row] = await db.insert(schema.demandItems).values({
      projectId: project.id, seq: k + 1, no: String(it.no ?? k + 1), nameCn: clean(it.nameCn), nameEn: clean(it.nameEn),
      spec: clean(it.spec), unit: String(it.unit || ""), qty: Number(String(it.qty ?? 0).replace(/,/g, "")) || 0,
      dateRequired: String(it.dateRequired || ""), techReq: clean(it.techReq), specRef: clean(it.specRef),
      category: String(it.category || "其他"), issues: Array.isArray(it.issues) ? it.issues.map(String) : [],
    }).returning({ id: schema.demandItems.id });
    const qs = Array.isArray(it.questions) ? it.questions : [];
    if (qs.length) await db.insert(schema.clarifications).values(qs.map((q) => ({ itemId: row.id, question: String(q.question || ""), questionEn: String(q.questionEn || ""), options: Array.isArray(q.options) ? q.options.map(String) : [] })));
  }
  await db.update(schema.projects).set({ demandFileName: String(b.fileName || "") }).where(eq(schema.projects.id, project.id));
  return loadProject(db, project.id);
});
