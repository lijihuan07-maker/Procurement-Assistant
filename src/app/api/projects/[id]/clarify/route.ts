import { asc, eq, inArray } from "drizzle-orm";
import { schema } from "@/db";
import { route, ownProject, HttpError } from "@/lib/http";
import { askJson } from "@/lib/ai";
import { clarifyPrompt } from "@/lib/prompts";
import { parseSpecRef, excerpt } from "@/lib/specs";
import { loadProject } from "@/lib/data";

export const maxDuration = 300;

type Out = { answers?: { questionId: string; answer: string; specQuote: string }[]; specUpdates?: { itemId: string; techReq: string }[] };

export const POST = route(async ({ db, user, params, lang }) => {
  await ownProject(db, user, params.id);
  const docs = await db.select({ id: schema.specDocs.id }).from(schema.specDocs).where(eq(schema.specDocs.projectId, params.id));
  if (!docs.length) throw new HttpError(400, "请先上传技术规格书");
  const sections = await db.select().from(schema.specSections).where(inArray(schema.specSections.docId, docs.map((d) => d.id)));
  const items = await db.select().from(schema.demandItems).where(eq(schema.demandItems.projectId, params.id)).orderBy(asc(schema.demandItems.seq));
  const qs = items.length ? await db.select().from(schema.clarifications).where(inArray(schema.clarifications.itemId, items.map((i) => i.id))) : [];

  const work = items.map((it) => {
    const ref = parseSpecRef(it.specRef || it.techReq || it.spec);
    if (!ref) return null;
    const cands = sections.filter((s) => s.sectionNo.startsWith(ref.base));
    const sec = cands.find((s) => ref.sub && s.sectionNo === ref.base + ref.sub) || cands[0];
    if (!sec) return null;
    return {
      id: it.id, name: `${it.nameCn} ${it.nameEn}`.trim(), spec: it.spec, techReq: it.techReq,
      questions: qs.filter((q) => q.itemId === it.id && q.status === "open").map((q) => ({ id: q.id, question: q.question, options: q.options })),
      excerpts: [{ sectionNo: sec.sectionNo, title: sec.title, pages: `${sec.pageFrom}-${sec.pageTo}`, text: excerpt(sec.body, ref.article, [it.nameEn, it.nameCn]) }],
    };
  }).filter((x): x is NonNullable<typeof x> => !!x);
  if (!work.length) throw new HttpError(422, "需求项的规范章节号在规格书里都没有找到对应章节");

  let answered = 0;
  for (let i = 0; i < work.length; i += 6) {
    const batch = work.slice(i, i + 6);
    const out = await askJson<Out>("clarify", clarifyPrompt(batch), { maxTokens: 8000, mockKey: String(i), lang });
    for (const a of out.answers || []) {
      const q = qs.find((x) => x.id === a.questionId);
      if (!q || !a.answer) continue;
      await db.update(schema.clarifications).set({ answer: String(a.answer), status: "answered", specQuote: String(a.specQuote || "") }).where(eq(schema.clarifications.id, q.id));
      answered++;
    }
    for (const u of out.specUpdates || []) {
      if (!batch.some((b) => b.id === u.itemId) || !u.techReq) continue;
      await db.update(schema.demandItems).set({ techReq: String(u.techReq) }).where(eq(schema.demandItems.id, u.itemId));
    }
  }
  return { ...(await loadProject(db, params.id)), matched: work.length, answered };
});
