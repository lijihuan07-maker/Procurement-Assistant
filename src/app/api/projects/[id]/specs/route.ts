import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownProject, HttpError } from "@/lib/http";
import { loadProject } from "@/lib/data";

export const maxDuration = 60;

type Sec = { sectionNo: string; title: string; pageFrom: number; pageTo: number; body: string };

/** Sections are split in the browser and sent in batches (large books exceed request size limits). */
export const POST = route(async ({ req, db, user, params }) => {
  await ownProject(db, user, params.id);
  const b = await body<{ fileName: string; pages: number; sections: Sec[]; docId?: string; last?: boolean }>(req);
  if (!Array.isArray(b.sections)) throw new HttpError(400, "缺少章节");
  let docId = b.docId;
  if (docId) {
    const [d] = await db.select().from(schema.specDocs).where(and(eq(schema.specDocs.id, docId), eq(schema.specDocs.projectId, params.id)));
    if (!d) throw new HttpError(404, "规格书不存在");
  } else {
    const [d] = await db.insert(schema.specDocs).values({ projectId: params.id, fileName: String(b.fileName || "规格书.pdf"), pages: Number(b.pages) || 0 }).returning();
    docId = d.id;
  }
  const rows = b.sections.filter((s) => /^\d{6,8}$/.test(String(s.sectionNo))).map((s) => ({
    docId: docId!, sectionNo: String(s.sectionNo), title: String(s.title || "").slice(0, 200), pageFrom: Number(s.pageFrom) || 0, pageTo: Number(s.pageTo) || 0, body: String(s.body || "").slice(0, 80000),
  }));
  for (let i = 0; i < rows.length; i += 50) await db.insert(schema.specSections).values(rows.slice(i, i + 50));
  return b.last ? loadProject(db, params.id) : { docId };
});
