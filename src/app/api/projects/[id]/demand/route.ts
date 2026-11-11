import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownProject, HttpError } from "@/lib/http";
import { askJson, type AiImage } from "@/lib/ai";
import { demandPrompt } from "@/lib/prompts";
import { loadProject } from "@/lib/data";

export const maxDuration = 300;

type Out = { project?: string; department?: string; items: { no: string; nameCn: string; nameEn: string; spec: string; unit: string; qty: number | string; dateRequired: string; techReq: string; specRef: string; category: string; issues: string[]; questions: { question: string; questionEn?: string; options?: string[] }[] }[] };

export const POST = route(async ({ req, db, user, params }) => {
  const project = await ownProject(db, user, params.id);
  const b = await body<{ fileName: string; text: string; images?: AiImage[] }>(req);
  const issued = await db.select({ id: schema.packages.id }).from(schema.packages).where(and(eq(schema.packages.projectId, project.id), eq(schema.packages.status, "issued")));
  if (issued.length) throw new HttpError(409, "这个项目已经有发出的询价单，不能整体替换需求清单。请新建一个项目。");
  const out = await askJson<Out>("demand", demandPrompt(String(b.text || "").slice(0, 150000), !!b.images?.length), { images: b.images, maxTokens: 32000, mockKey: b.fileName });
  if (!Array.isArray(out.items) || !out.items.length) throw new HttpError(422, "清单里没有识别到物资项");

  await db.delete(schema.packages).where(eq(schema.packages.projectId, project.id));
  await db.delete(schema.demandItems).where(eq(schema.demandItems.projectId, project.id));
  for (const [k, it] of out.items.entries()) {
    const [row] = await db.insert(schema.demandItems).values({
      projectId: project.id, seq: k + 1, no: String(it.no ?? k + 1), nameCn: String(it.nameCn || ""), nameEn: String(it.nameEn || ""),
      spec: String(it.spec || ""), unit: String(it.unit || ""), qty: Number(String(it.qty ?? 0).replace(/,/g, "")) || 0,
      dateRequired: String(it.dateRequired || ""), techReq: String(it.techReq || ""), specRef: String(it.specRef || ""),
      category: String(it.category || "其他"), issues: Array.isArray(it.issues) ? it.issues.map(String) : [],
    }).returning({ id: schema.demandItems.id });
    const qs = Array.isArray(it.questions) ? it.questions : [];
    if (qs.length) await db.insert(schema.clarifications).values(qs.map((q) => ({ itemId: row.id, question: String(q.question || ""), questionEn: String(q.questionEn || ""), options: Array.isArray(q.options) ? q.options.map(String) : [] })));
  }
  await db.update(schema.projects).set({ demandFileName: String(b.fileName || "") }).where(eq(schema.projects.id, project.id));
  return loadProject(db, project.id);
});
