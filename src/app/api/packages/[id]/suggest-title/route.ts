import { route, ownPackage, HttpError } from "@/lib/http";
import { askJson } from "@/lib/ai";
import { titlePrompt } from "@/lib/prompts";
import { buildLines } from "@/lib/data";

export const maxDuration = 60;

/** Suggest a package title from its items. Nothing is saved; the user edits and saves it. */
export const POST = route(async ({ db, user, params }) => {
  const { pkg } = await ownPackage(db, user, params.id);
  const lines = pkg.snapshot?.lines || (await buildLines(db, pkg.id));
  if (!lines.length) throw new HttpError(400, "这个询价包里没有需求项");
  const out = await askJson<{ titleCn?: string; titleEn?: string }>("title", titlePrompt(lines), { maxTokens: 400, mockKey: pkg.code });
  return { titleCn: String(out.titleCn || "").trim().slice(0, 40), titleEn: String(out.titleEn || "").trim().toUpperCase().slice(0, 80) };
});
