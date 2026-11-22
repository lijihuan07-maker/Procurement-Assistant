import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { route, body, ownPackage, HttpError } from "@/lib/http";
import { loadPackage } from "@/lib/package";
import { hasCjk, toEnglish } from "@/lib/english";
import type { RfqEnglish } from "@/db/schema";

export const maxDuration = 120;

/** English-only text of a locked RFQ, made once by AI (only the parts that contain Chinese) and kept with the RFQ. */
export const POST = route(async ({ req, db, user, params }) => {
  const { pkg, project } = await ownPackage(db, user, params.id);
  const s = pkg.snapshot;
  if (!s) throw new HttpError(409, "询价单还没有锁定");
  // Chinese text from the user's RFQ template file (labels, project lines), translated once and kept too.
  const b = await body<{ texts?: string[] }>(req).catch(() => ({ texts: [] as string[] }));
  const texts = (Array.isArray(b.texts) ? b.texts : []).map(String).filter(hasCjk).slice(0, 300);
  if (s.en) {
    const missing = texts.filter((t) => !(t in (s.en!.extra || {})));
    if (!missing.length) return loadPackage(db, pkg.id);
    const out = await toEnglish(missing);
    const extra = { ...(s.en.extra || {}), ...Object.fromEntries(missing.map((t, i) => [t, out[i]])) };
    await db.update(schema.packages).set({ snapshot: { ...s, en: { ...s.en, extra } } }).where(eq(schema.packages.id, pkg.id));
    return loadPackage(db, pkg.id);
  }
  const [site] = await db.select().from(schema.sites).where(eq(schema.sites.id, project.siteId));
  const projectName = site.nameEn || s.projectEn || s.project;
  const std = s.standards || [];
  const all = [s.titleEn || s.title, projectName, s.validity, s.payment, ...std, ...s.lines.flatMap((l) => [l.name, l.spec, l.techReq]), ...texts];
  const out = await toEnglish(all);
  let k = 0;
  const next = () => out[k++] || "";
  const en: RfqEnglish = { title: next(), project: next(), validity: next(), payment: next(), standards: std.map(() => next()), lines: {} };
  for (const l of s.lines) en.lines[l.no] = { name: next(), spec: next(), techReq: next() };
  en.extra = Object.fromEntries(texts.map((t) => [t, next()]));
  await db.update(schema.packages).set({ snapshot: { ...s, en } }).where(eq(schema.packages.id, pkg.id));
  // Remember the project's English name for later RFQs and emails.
  if (!site.nameEn && hasCjk(site.name) && en.project) await db.update(schema.sites).set({ nameEn: en.project }).where(eq(schema.sites.id, site.id));
  return loadPackage(db, pkg.id);
});
