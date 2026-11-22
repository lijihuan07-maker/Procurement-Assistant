import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@/db";
import { route } from "@/lib/http";
import { msg, type Msg } from "@/lib/i18n";

type Todo = { kind: "deadline" | "noreply" | "award" | "questions" | "draft"; level: "high" | "mid" | "low"; text: Msg; href: string; date?: string };

const day = 864e5;
const daysBetween = (a: string, b: Date) => Math.round((new Date(a + "T00:00:00").getTime() - new Date(b.toISOString().slice(0, 10) + "T00:00:00").getTime()) / day);

/** Everything the workbench shows, computed from the company's own data. */
export const GET = route(async ({ db, user }) => {
  const now = new Date();
  const projects = await db.select().from(schema.projects).where(eq(schema.projects.companyId, user.companyId));
  const pids = projects.map((p) => p.id);
  const pname = new Map(projects.map((p) => [p.id, p.name]));
  const pkgs = pids.length ? await db.select().from(schema.packages).where(inArray(schema.packages.projectId, pids)).orderBy(desc(schema.packages.createdAt)) : [];
  const kids = pkgs.map((p) => p.id);
  const invites = kids.length ? await db.select({ inv: schema.invites, name: schema.suppliers.name, phone: schema.suppliers.phone, email: schema.suppliers.email }).from(schema.invites).innerJoin(schema.suppliers, eq(schema.invites.supplierId, schema.suppliers.id)).where(inArray(schema.invites.packageId, kids)) : [];
  const quotes = kids.length ? await db.select({ packageId: schema.quotes.packageId, supplierId: schema.quotes.supplierId, status: schema.quotes.status }).from(schema.quotes).where(inArray(schema.quotes.packageId, kids)) : [];
  const openQs = pids.length ? await db.select({ projectId: schema.demandItems.projectId, n: sql<number>`count(*)::int` }).from(schema.clarifications)
    .innerJoin(schema.demandItems, eq(schema.clarifications.itemId, schema.demandItems.id))
    .where(and(inArray(schema.demandItems.projectId, pids), eq(schema.clarifications.status, "open"))).groupBy(schema.demandItems.projectId) : [];

  const todos: Todo[] = [];
  const rfqs = pkgs.filter((p) => p.status !== "draft").map((p) => {
    const sent = invites.filter((i) => i.inv.packageId === p.id && i.inv.status === "sent");
    const got = quotes.filter((q) => q.packageId === p.id && q.status === "done");
    return { id: p.id, rfqNo: p.rfqNo || "", titleCn: p.titleCn, titleEn: p.titleEn, project: pname.get(p.projectId) || "", projectId: p.projectId, status: p.status, deadline: p.deadline || "", sent: sent.length, quotes: got.length, createdAt: p.createdAt };
  });

  for (const r of rfqs) {
    if (r.status !== "issued") continue;
    const href = `/packages/${r.id}`;
    if (r.deadline) {
      const d = daysBetween(r.deadline, now);
      if (d < 0 && r.quotes > 0) todos.push({ kind: "award", level: "high", text: msg("{rfq} 已过截止日期，收到 {q} 份报价，可以比价定标", { rfq: r.rfqNo, q: r.quotes }), href, date: r.deadline });
      else if (d < 0) todos.push({ kind: "deadline", level: "high", text: msg("{rfq} 已过截止日期，还没有收到报价", { rfq: r.rfqNo }), href, date: r.deadline });
      else if (d <= 2) todos.push({ kind: "deadline", level: "mid", text: d === 0 ? msg("{rfq} 今天截止，已收 {q}/{s} 份报价", { rfq: r.rfqNo, q: r.quotes, s: r.sent }) : msg("{rfq} {d} 天后截止，已收 {q}/{s} 份报价", { rfq: r.rfqNo, d, q: r.quotes, s: r.sent }), href, date: r.deadline });
    }
    if (r.sent > 0 && r.quotes >= r.sent && !(r.deadline && daysBetween(r.deadline, now) < 0)) todos.push({ kind: "award", level: "mid", text: msg("{rfq} 报价已收齐（{q} 份），可以比价定标", { rfq: r.rfqNo, q: r.quotes }), href });
    // Suppliers who were sent the RFQ 3+ days ago and haven't quoted.
    for (const i of invites.filter((x) => x.inv.packageId === r.id && x.inv.status === "sent" && x.inv.sentAt)) {
      const age = Math.floor((now.getTime() - new Date(i.inv.sentAt!).getTime()) / day);
      if (age >= 3 && !quotes.some((q) => q.packageId === r.id && q.supplierId === i.inv.supplierId)) {
        todos.push({ kind: "noreply", level: "low", text: msg("{s} 已 {d} 天没回复 {rfq}，可以追问一下", { s: i.name, d: age, rfq: r.rfqNo }), href });
      }
    }
  }
  for (const q of openQs) if (q.n > 0) todos.push({ kind: "questions", level: "mid", text: msg("项目 {p} 有 {n} 个问题等工程部确认", { p: pname.get(q.projectId) || "", n: q.n }), href: `/projects/${q.projectId}` });
  const drafts = new Map<string, number>();
  for (const p of pkgs) if (p.status === "draft") drafts.set(p.projectId, (drafts.get(p.projectId) || 0) + 1);
  for (const [pid, n] of drafts) todos.push({ kind: "draft", level: "low", text: msg("项目 {p} 有 {n} 个询价包还没锁定发出", { p: pname.get(pid) || "", n }), href: `/projects/${pid}` });
  const order = { high: 0, mid: 1, low: 2 };
  todos.sort((a, b) => order[a.level] - order[b.level] || (a.date || "9").localeCompare(b.date || "9"));

  const prices = await db.select().from(schema.priceRecords).where(eq(schema.priceRecords.companyId, user.companyId)).orderBy(desc(schema.priceRecords.date)).limit(10);
  const [sup] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.suppliers).where(eq(schema.suppliers.companyId, user.companyId));
  return {
    name: user.name || "",
    todos: todos.slice(0, 12),
    rfqs: rfqs.slice(0, 8),
    prices: prices.map((p) => ({ material: p.material, spec: p.spec, supplier: p.supplierName, unitPrice: p.unitPrice, unit: p.unit, currency: p.currency, date: p.date, source: p.source })),
    stats: { activeRfqs: rfqs.filter((r) => r.status === "issued").length, waiting: todos.filter((t) => t.kind === "noreply").length, openQuestions: openQs.reduce((n, q) => n + q.n, 0), suppliers: sup?.n ?? 0, projects: projects.length },
  };
});
