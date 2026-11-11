"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Download, FileText, Layers, Merge, Sparkles, Trash2 } from "lucide-react";
import { api, download, fmt } from "@/lib/client/api";
import { readDemand, pdfPages, pool, preloadParsers } from "@/lib/client/files";
import { buildQuestions } from "@/lib/client/excel";
import { splitSections } from "@/lib/specs";
import { t, useLang, useT } from "@/lib/i18n/client";
import { names, questionText } from "@/lib/client/display";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { useBusy, Busy, Drop, StatusChip, toast, PageHeader, Section, TableFrame, Stats, Empty, Banner, Stages, Loading, type Run } from "@/components/app";
import type { ProjectData, Item, Question } from "@/lib/client/types";
import type { DemandItem } from "@/app/api/projects/[id]/demand/route";
import type { Lang } from "@/lib/i18n";

type Tab = "demand" | "specs" | "packages";
type Ctx = { d: ProjectData; setD: (d: ProjectData) => void; run: Run; busy: string | null };
const DEMAND_ACCEPT = ".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const T = useT();
  const [d, setD] = useState<ProjectData | null>(null);
  const [tab, setTab] = useState<Tab>("demand");
  const { busy, run } = useBusy();
  const router = useRouter();
  useEffect(() => { preloadParsers(); api<ProjectData>(`/api/projects/${id}`).then((x) => { setD(x); if (x.packages.length) setTab("packages"); }).catch((e) => toast(e.message, true)); }, [id]);
  if (!d) return <Loading />;
  const open = d.items.reduce((n, i) => n + i.questions.filter((q) => q.status === "open").length, 0);

  return (
    <>
      <PageHeader crumbs={[{ href: "/projects", label: T("项目") }]} title={d.project.name}
        facts={[[T("地点"), d.project.location], [T("业主"), d.project.owner], [T("需求清单"), d.project.demandFileName]]}
        actions={<>
          <Busy text={busy} />
          <Button variant="ghost" size="sm" className="text-bad hover:bg-bad-soft" onClick={async () => { if (!window.confirm?.(T("删除这个项目和它的全部询价、报价？"))) return; await run(T("删除中…"), () => api(`/api/projects/${id}`, { method: "DELETE" })); router.push("/projects"); }}><Trash2 />{T("删除项目")}</Button>
        </>} />
      <Stages current={tab} onSelect={(k) => setTab(k as Tab)} stages={[
        { key: "demand", label: T("需求清单与澄清"), count: open || undefined, tone: "warn", done: d.items.length > 0 && open === 0 },
        { key: "specs", label: T("技术规格书"), count: d.specDocs.length || undefined, done: d.specDocs.length > 0 },
        { key: "packages", label: T("询价包"), count: d.packages.length || undefined, done: d.packages.some((p) => p.status !== "draft") },
      ]} />
      {tab === "demand" && <Demand d={d} setD={setD} run={run} busy={busy} />}
      {tab === "specs" && <Specs d={d} setD={setD} run={run} busy={busy} />}
      {tab === "packages" && <Packages d={d} setD={setD} run={run} busy={busy} />}
    </>
  );
}

/** Read the list in parts, let the AI read the parts in parallel, then save the merged items. */
async function importDemand(projectId: string, f: File, step: (s: string) => void) {
  step(t("读取 {f}…", { f: f.name }));
  const parts = await readDemand(f);
  const n = parts.length;
  let done = 0;
  step(n > 1 ? t("AI 正在识别需求清单：{a}/{n} 部分完成", { a: 0, n }) : t("AI 正在识别需求清单，通常需要 1–2 分钟"));
  const results = await pool(parts, 4, async (p) => {
    const r = await api<{ items: DemandItem[] }>(`/api/projects/${projectId}/demand/parse`, { body: { fileName: f.name, ...p } });
    done++;
    if (n > 1) step(t("AI 正在识别需求清单：{a}/{n} 部分完成", { a: done, n }));
    return r.items;
  });
  const seen = new Set<string>();
  const items = results.flat().filter((it) => {
    const k = [it.no, it.nameEn || it.nameCn, it.spec, it.qty].map((x) => String(x ?? "").trim().toLowerCase()).join("|");
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  step(t("保存中…"));
  return api<ProjectData>(`/api/projects/${projectId}/demand`, { body: { fileName: f.name, items } });
}

/* ================= demand & clarification ================= */
function Demand({ d, setD, run, busy }: Ctx) {
  const T = useT();
  const lang = useLang();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const itemsById = useMemo(() => new Map(d.items.map((i) => [i.id, i])), [d.items]);
  const allQs = d.items.flatMap((i) => i.questions);
  const qs = allQs.filter((q) => filter === "all" || q.status === "open");
  const issues = d.items.filter((i) => i.issues.length);
  const openN = allQs.filter((q) => q.status === "open").length;

  async function upload(files: File[]) {
    const f = files[0]; if (!f) return;
    if (d.items.length && !window.confirm?.(T("重新导入会替换当前的需求项、澄清问题和未发出的询价包，继续吗？"))) return;
    const r = await run(T("读取 {f}…", { f: f.name }), (step) => importDemand(d.project.id, f, step), T("需求清单识别完成"));
    if (r) setD(r);
  }
  async function answer(q: Question, answer: string, status = "answered") {
    const r = await run(T("保存中…"), () => api<ProjectData>(`/api/clarifications/${q.id}`, { method: "PATCH", body: { answer, status } }));
    if (r) setD(r);
  }
  async function exportQs() {
    const rows = allQs.filter((q) => q.status !== "ignored").map((q) => { const it = itemsById.get(q.itemId)!; return { no: it.no, name: `${it.nameCn} ${it.nameEn}`.trim(), spec: it.spec, question: q.question, questionEn: q.questionEn, options: q.options, answer: q.answer, status: q.status }; });
    download(await buildQuestions(d.project.name, rows), `${T("待确认问题")}_${d.project.name}.xlsx`);
  }

  if (!d.items.length) return (
    <Section title={T("上传工程部需求清单")} description={T("支持 Excel、PDF（含扫描件）和图片。AI 会提取每一项物资，按材料类别检查哪些参数没写清楚，生成要请工程部确认的问题。")}>
      <Drop id="demand-file" title={T("需求清单")} hint={T("物资需用计划表，一份。长清单会分成几部分同时识别。")} accept={DEMAND_ACCEPT} onFiles={upload} disabled={!!busy} />
      <Busy text={busy} className="mt-4" />
    </Section>
  );

  return (
    <>
      <Section title={T("待工程部确认的问题")}
        description={T("确认后的答案会自动并入询价单的规格。可以导出问题清单发给工程部，回复后在这里点选或填写。上传技术规格书后，AI 还能直接从规格书里找答案。")}
        actions={<>
          <Select aria-label={T("筛选问题")} value={filter} onChange={(e) => setFilter(e.target.value as "open" | "all")} className="h-8 w-auto text-xs"><option value="open">{T("只看待确认")}</option><option value="all">{T("全部问题")}</option></Select>
          <Button variant="outline" size="sm" onClick={exportQs} disabled={!allQs.length}><Download />{T("导出问题清单 Excel")}</Button>
        </>}>
        <Stats className="mb-5" items={[[T("需求项"), d.items.length], [T("问题"), allQs.length], [T("待确认"), openN, openN ? "warn" : undefined], [T("已确认"), allQs.filter((q) => q.status === "answered").length, "good"]]} />
        {qs.length === 0 ? <Empty>{allQs.length ? T("所有问题都处理完了。") : T("AI 没有发现需要确认的问题。")}</Empty> : (
          <div className="grid gap-3 lg:grid-cols-2">{qs.map((q) => <QuestionCard key={q.id} q={q} item={itemsById.get(q.itemId)!} onAnswer={answer} disabled={!!busy} lang={lang} />)}</div>
        )}
      </Section>

      {issues.length > 0 && (
        <Banner className="mb-5"><b className="font-medium">{T("需求数据问题（{n} 项）", { n: issues.length })}</b>
          <ul className="mt-1 grid gap-0.5">{issues.map((i) => <li key={i.id}>#{i.no} {names(lang, i.nameCn, i.nameEn)[0]}: {i.issues.join("; ")}</li>)}</ul>
        </Banner>
      )}

      <Section title={T("需求项（{n}）", { n: d.items.length })} bodyClassName="p-0"
        actions={<><Busy text={busy} /><Drop compact id="demand-reupload" title={T("重新导入清单")} hint="" accept={DEMAND_ACCEPT} onFiles={upload} disabled={!!busy} /></>}>
        <TableFrame flush>
          <thead><tr><th>{T("序号")}</th><th>{T("物资名称")}</th><th>{T("规格型号")}</th><th>{T("单位")}</th><th className="n">{T("数量")}</th><th>{T("类别")}</th><th>{T("规范号 / 技术要求")}</th><th>{T("问题")}</th></tr></thead>
          <tbody>
            {d.items.map((i) => {
              const o = i.questions.filter((q) => q.status === "open").length, a = i.questions.filter((q) => q.status === "answered");
              const [main, sub] = names(lang, i.nameCn, i.nameEn);
              return (
                <tr key={i.id}>
                  <td className="num text-muted-foreground">{i.no}</td>
                  <td className="min-w-44"><span className="font-medium">{main}</span><span className="sub">{sub}</span></td>
                  <td className="min-w-40">{i.spec}{a.length > 0 && <span className="sub !text-good">{T("已确认：")}{a.map((q) => q.answer).join("; ")}</span>}</td>
                  <td>{i.unit}</td>
                  <td className="n">{fmt(i.qty, Number.isInteger(i.qty) ? 0 : 2)}</td>
                  <td><Badge variant="outline">{T(i.category)}</Badge></td>
                  <td className="min-w-40 text-xs">{i.specRef && <span className="num">{i.specRef}</span>}<span className="sub">{i.techReq}</span></td>
                  <td>{o > 0 ? <Badge variant="warn">{T("待确认 {n}", { n: o })}</Badge> : i.questions.length ? <Badge variant="good">{T("已处理")}</Badge> : <span className="text-muted-foreground">—</span>}{i.issues.length > 0 && <span className="dev">{i.issues.join("; ")}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </TableFrame>
      </Section>
    </>
  );
}

function QuestionCard({ q, item, onAnswer, disabled, lang }: { q: Question; item: Item; onAnswer: (q: Question, a: string, s?: string) => void; disabled: boolean; lang: string }) {
  const T = useT();
  const [custom, setCustom] = useState("");
  const [main, sub] = questionText(lang as Lang, q.question, q.questionEn);
  const done = q.status !== "open";
  return (
    <div className={"grid content-start gap-3 rounded-md border p-4 " + (done ? "bg-muted/50" : "bg-card")}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="num">#{item.no}</span><span className="text-foreground">{names(lang as Lang, item.nameCn, item.nameEn)[0]}</span><Badge variant="outline">{T(item.category)}</Badge>
      </div>
      <div><p className="text-[14px] leading-snug font-medium">{main}</p>{sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}</div>
      {!done ? (
        <>
          {q.options.length > 0 && <div className="flex flex-wrap gap-1.5">{q.options.map((o) => <Button key={o} data-opt variant="outline" size="sm" disabled={disabled} onClick={() => onAnswer(q, o)}>{o}</Button>)}</div>}
          <div className="flex gap-2">
            <Input aria-label={T("其他答案")} placeholder={T("其他答案…")} value={custom} onChange={(e) => setCustom(e.target.value)} className="h-8 text-xs" />
            <Button size="sm" variant="secondary" disabled={disabled || !custom.trim()} onClick={() => onAnswer(q, custom.trim())}>{T("保存")}</Button>
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onAnswer(q, "", "ignored")}>{T("忽略")}</Button>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          {q.status === "answered" ? <Badge variant="good">{T("已确认：")}{q.answer}</Badge> : <Badge>{T("已忽略")}</Badge>}
          <Button variant="link" size="sm" disabled={disabled} onClick={() => onAnswer(q, "", "open")}>{T("撤销")}</Button>
        </div>
      )}
      {q.specQuote && <blockquote className="border-s-2 border-signal ps-3 text-xs text-muted-foreground">{T("规格书原文：")}{q.specQuote}</blockquote>}
    </div>
  );
}

/* ================= specification books ================= */
function Specs({ d, setD, run, busy }: Ctx) {
  const T = useT();
  async function upload(files: File[]) {
    const f = files[0]; if (!f) return;
    const r = await run(T("读取 {f}…", { f: f.name }), async (step) => {
      const { pages, numPages } = await pdfPages(f, 1500, (p, n) => { if (p % 25 === 0 || p === n) step(t("读取规格书：{p}/{n} 页", { p, n })); });
      const secs = splitSections(pages);
      if (!secs.length) throw new Error(t("没有识别到 “SECTION 32 14 13” 这样的章节标题。扫描版规格书暂不支持，请上传带文字的 PDF。"));
      step(t("建立章节索引…"));
      let docId: string | undefined; let batch: typeof secs = []; let size = 0;
      const send = async (last: boolean) => {
        const res = await api<ProjectData & { docId?: string }>(`/api/projects/${d.project.id}/specs`, { body: { fileName: f.name, pages: numPages, sections: batch, docId, last } });
        docId = docId || res.docId; batch = []; size = 0; return res;
      };
      for (const s of secs) { if (size + s.body.length > 1_500_000 && batch.length) await send(false); batch.push(s); size += s.body.length; }
      return await send(true);
    }, T("规格书已建立索引"));
    if (r && "project" in r) setD(r as ProjectData);
  }
  const linked = d.items.filter((i) => /\d{2}\s?\d{2}\s?\d{2}/.test(i.specRef || i.techReq)).length;
  const open = d.items.reduce((n, i) => n + i.questions.filter((q) => q.status === "open").length, 0);
  return (
    <Section title={T("技术规格书")} description={T("上传项目的技术规格书（带文字的 PDF，可以几百页）。系统按 “SECTION 32 14 13” 这样的章节号建立索引，AI 会根据需求项的规范号找到对应章节，用原文回答待确认问题，并把技术要求写进询价单。")}
      actions={<span className="text-xs text-muted-foreground">{T("{n} 个需求项写了规范章节号", { n: linked })}</span>}>
      <div className="grid gap-4">
        <Drop id="spec-file" title={T("上传规格书 PDF")} hint={T("可以上传多份")} accept=".pdf" onFiles={upload} disabled={!!busy} />
        {d.specDocs.length > 0 && (
          <TableFrame>
            <thead><tr><th>{T("文件")}</th><th className="n">{T("页数")}</th><th className="n">{T("章节")}</th><th></th></tr></thead>
            <tbody>{d.specDocs.map((s) => (
              <tr key={s.id}><td><span className="inline-flex items-center gap-2"><FileText className="size-4 text-muted-foreground" />{s.fileName}</span></td><td className="n">{s.pages}</td><td className="n">{s.sections}</td>
                <td className="text-end"><Button variant="ghost" size="sm" onClick={async () => { const r = await run(T("删除中…"), () => api<ProjectData>(`/api/specs/${s.id}`, { method: "DELETE" })); if (r) setD(r); }}>{T("删除")}</Button></td></tr>
            ))}</tbody>
          </TableFrame>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!!busy || !d.specDocs.length || !d.items.length} onClick={async () => {
            const r = await run(T("AI 正在查阅规格书…"), () => api<ProjectData & { matched: number; answered: number }>(`/api/projects/${d.project.id}/clarify`, { body: {} }));
            if (r) { setD(r); toast(T("匹配到 {a} 个需求项，从规格书回答了 {b} 个问题", { a: r.matched, b: r.answered })); }
          }}><Sparkles />{T("用规格书回答待确认问题（{n}）", { n: open })}</Button>
          <Busy text={busy} />
        </div>
      </div>
    </Section>
  );
}

/* ================= packages ================= */
function Packages({ d, setD, run, busy }: Ctx) {
  const T = useT();
  const lang = useLang();
  const [sel, setSel] = useState<string[]>([]);
  const byPkg = (id: string | null) => d.items.filter((i) => i.packageId === id);
  const unassigned = byPkg(null);
  const drafts = d.packages.filter((p) => p.status === "draft");

  async function split() {
    if (drafts.length && !window.confirm?.(T("重新拆分会重建所有草稿询价包（已锁定的不受影响），继续吗？"))) return;
    const r = await run(T("AI 正在拆分询价包…"), () => api<ProjectData>(`/api/projects/${d.project.id}/split`, { body: {} }), T("拆分完成"));
    if (r) setD(r);
  }
  async function move(itemId: string, value: string) {
    if (value === "__new") {
      const r = await run(T("新建询价包…"), () => api<ProjectData>(`/api/projects/${d.project.id}/packages`, { body: { itemIds: [itemId] } }));
      if (r) setD(r); return;
    }
    const r = await run(T("移动中…"), () => api<ProjectData>(`/api/items/${itemId}`, { method: "PATCH", body: { packageId: value || null } }));
    if (r) setD(r);
  }
  async function rename(id: string, k: "titleCn" | "titleEn", v: string) {
    const r = await run(T("保存中…"), () => api<ProjectData>(`/api/packages/${id}`, { method: "PATCH", body: { [k]: v, returnProject: true } }));
    if (r) setD(r);
  }
  const opts = (cur: string | null) => (
    <>
      {cur === null && <option value="">{T("未分配")}</option>}
      {drafts.map((p) => <option key={p.id} value={p.id}>{p.code} {names(lang, p.titleCn, p.titleEn)[0]}</option>)}
      {cur !== null && <option value="">{T("移出（未分配）")}</option>}
      <option value="__new">{T("+ 新建询价包")}</option>
    </>
  );
  const table = (items: Item[], editable: boolean) => (
    <TableFrame flush>
      <thead><tr><th>{T("需求序号")}</th><th>{T("物资名称")}</th><th>{T("规格型号")}</th><th>{T("单位")}</th><th className="n">{T("数量")}</th><th>{T("类别")}</th>{editable && <th>{T("询价包")}</th>}</tr></thead>
      <tbody>{items.map((i) => {
        const [main, sub] = names(lang, i.nameCn, i.nameEn);
        return (
          <tr key={i.id}>
            <td className="num text-muted-foreground">{i.no}</td>
            <td className="min-w-44"><span className="font-medium">{main}</span><span className="sub">{sub}</span></td>
            <td className="min-w-40 text-xs">{i.spec}{i.quoteHint && <span className="sub">{i.quoteHint}</span>}</td>
            <td>{i.unit}</td><td className="n">{fmt(i.qty, Number.isInteger(i.qty) ? 0 : 2)}</td><td><Badge variant="outline">{T(i.category)}</Badge></td>
            {editable && <td><Select aria-label={T("移动需求 {n}", { n: i.no })} value={i.packageId || ""} disabled={!!busy} onChange={(e) => move(i.id, e.target.value)} className="h-7 w-48 text-xs">{opts(i.packageId)}</Select></td>}
          </tr>
        );
      })}</tbody>
    </TableFrame>
  );

  if (!d.items.length) return <Empty>{T("先在“需求清单”里上传工程部的清单。")}</Empty>;
  return (
    <>
      <Section title={T("询价包")} description={T("同一类供应商能一起报价的需求放在一个包里。可以移动需求项、勾选合并，确认后进入询价单锁定编号、选供应商、发邮件。")}
        actions={<>
          <Busy text={busy} />
          <Button variant="outline" disabled={!!busy || sel.length < 2} onClick={async () => { const r = await run(T("合并中…"), () => api<ProjectData>("/api/packages/merge", { body: { ids: sel } }), T("已合并")); if (r) { setD(r); setSel([]); } }}><Merge />{T("合并所选（{n}）", { n: sel.length })}</Button>
          <Button disabled={!!busy || (!unassigned.length && !drafts.length)} onClick={split}><Layers />{d.packages.length ? T("重新 AI 拆分草稿") : T("AI 拆分询价包")}</Button>
        </>} />
      {d.packages.map((p) => {
        const [main, sub] = names(lang, p.titleCn, p.titleEn);
        return (
          <section className="mb-5 rounded-lg border bg-card" key={p.id}>
            <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
              {p.status === "draft" && <input type="checkbox" aria-label={T("勾选 {c}", { c: p.code })} checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} />}
              <span className="num rounded bg-primary px-1.5 py-0.5 text-xs font-semibold text-white">{p.rfqNo || p.code}</span>
              {p.status === "draft" ? (
                <div className="flex min-w-0 flex-[1_1_420px] flex-wrap gap-2">
                  <Input aria-label={T("中文名")} defaultValue={p.titleCn} onBlur={(e) => e.target.value !== p.titleCn && rename(p.id, "titleCn", e.target.value)} className="h-8 flex-[1_1_160px] font-medium" />
                  <Input aria-label={T("英文标题")} defaultValue={p.titleEn} onBlur={(e) => e.target.value !== p.titleEn && rename(p.id, "titleEn", e.target.value)} className="h-8 flex-[2_1_220px] text-xs" />
                </div>
              ) : <div className="min-w-0 flex-1"><span className="font-semibold">{main}</span> <span className="text-xs text-muted-foreground">{sub}</span></div>}
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip status={p.status} />
                {p.supplierType && <Badge variant="info">{p.supplierType}</Badge>}
                <Badge variant="outline">{T("{n} 项", { n: byPkg(p.id).length })}</Badge>
                {p.quotes > 0 && <Badge variant="good">{T("报价 {n}", { n: p.quotes })}</Badge>}
                {p.status === "draft" && <Button variant="ghost" size="sm" disabled={!!busy} onClick={async () => { const r = await run(T("删除中…"), () => api<ProjectData>(`/api/packages/${p.id}`, { method: "DELETE" })); if (r) setD(r); }}>{T("删除")}</Button>}
                <Link className={buttonVariants({ size: "sm" })} href={`/packages/${p.id}`}>{T("进入询价单")}<ArrowRight className="rtl:rotate-180" /></Link>
              </div>
            </div>
            {p.reason && <p className="border-b px-5 py-2 text-xs text-muted-foreground">{p.reason}</p>}
            {table(byPkg(p.id), p.status === "draft")}
          </section>
        );
      })}
      {unassigned.length > 0 && (
        <Section title={T("未分配的需求项（{n}）", { n: unassigned.length })} bodyClassName="p-0">{table(unassigned, true)}</Section>
      )}
    </>
  );
}
