import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, ownProject, HttpError } from "@/lib/http";
import { askJson } from "@/lib/ai";
import { standardsPrompt } from "@/lib/prompts";
import { loadProject } from "@/lib/data";
import type { ProjectStandards } from "@/db/schema";

export const maxDuration = 120;

/** Identify the material standards that apply at the project's location (AI with web search). */
export const POST = route(async ({ db, user, params, lang }) => {
  const p = await ownProject(db, user, params.id);
  if (!p.location.trim()) throw new HttpError(400, "请先填写项目地点");
  const out = await askJson<Partial<ProjectStandards>>("standards", standardsPrompt(p.location), { webSearch: true, maxTokens: 3000, mockKey: p.location, lang });
  const s = (v: unknown, n = 300) => String(v ?? "").trim().slice(0, n);
  const standards: ProjectStandards = {
    location: p.location, country: s(out.country, 80), summary: s(out.summary, 500), checkedAt: new Date().toISOString().slice(0, 10),
    systems: (Array.isArray(out.systems) ? out.systems : []).map((x) => ({ name: s(x?.name, 160), scope: s(x?.scope), note: s(x?.note) })).filter((x) => x.name).slice(0, 8),
  };
  if (!standards.systems.length) throw new HttpError(422, "没能识别出这个地点的标准体系，可以把地点写得更具体，例如城市和国家");
  await db.update(schema.projects).set({ standards }).where(eq(schema.projects.id, p.id));
  return loadProject(db, p.id);
});
