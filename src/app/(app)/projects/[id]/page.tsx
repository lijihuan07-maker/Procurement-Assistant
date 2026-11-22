"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookCheck, Download, FileText, Layers, Loader2, Merge, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { api, download, fmt } from "@/lib/client/api";
import { readDemand, listSheets, pdfPages, pool, preloadParsers, type SheetInfo } from "@/lib/client/files";
import { buildQuestions } from "@/lib/client/excel";
import { splitSpec } from "@/lib/specs";
import { t, useLang, useT } from "@/lib/i18n/client";
import { names, questionText } from "@/lib/client/display";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { useBusy, Busy, Drop, StatusChip, toast, PageHeader, Section, TableFrame, Stats, Empty, Banner, Stages, Loading, type Run } from "@/components/app";
import { KIND_LABEL, type ProjectData, type Item, type Question, type Job, type ReqSettings } from "@/lib/client/types";
import type { Lang } from "@/lib/i18n";
import { announceSite, sitesChanged } from "../../Shell";
import { ReqSettingsForm } from "../ReqSettings";

type Tab = "demand" | "specs" | "packages";
type Ctx = { d: ProjectData; setD: (d: ProjectData) => void; run: Run; busy: string | null };
const DEMAND_ACCEPT = ".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const T = useT();
  const [d, setD] = useState<ProjectData | null>(null);
  const [tab, setTab] = useState<Tab>("demand");
  const [panel, setPanel] = useState(false);
  const { busy, run } = useBusy();
  const router = useRouter();
  useEffect(() => { preloadParsers(); api<ProjectData>(`/api/projects/${id}`).then((x) => { setD(x); announceSite(x.project.siteId); if (x.packages.length) setTab("packages"); }).catch((e) => toast(e.message, true)); }, [id]);
  // While the demand list is read on the server, follow its progress; the work continues if this page is closed.
  const jobId = d?.job?.status === "running" ? d.job.id : null;
  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      try {
        const { job } = await api<{ job: Job }>(`/api/jobs/${jobId}`);
        if (stop) return;
        if (job.status === "running") { setD((x) => (x ? { ...x, job } : x)); timer = setTimeout(tick, 3000); return; }
        const fresh = await api<ProjectData>(`/api/projects/${id}`);
        if (stop) return;
        setD(fresh);
        if (job.status === "done") toast(job.error ? t("需求清单识别完成，但有部分没识别出来") : t("需求清单识别完成"), !!job.error);
        else if (job.status === "failed") toast(job.error || t("需求清单没有识别成功"), true);
      } catch { timer = setTimeout(tick, 6000); }
    };
    timer = setTimeout(tick, 2500);
    return () => { stop = true; clearTimeout(timer); };
  }, [jobId, id]);
  if (!d) return <Loading />;
  const open = d.items.reduce((n, i) => n + i.questions.filter((q) => q.status === "open").length, 0);
  const st = d.project.standards;

  return (
    <>
      <PageHeader crumbs={[{ href: "/projects", label: T("项目") }, { href: `/sites/${d.project.siteId}`, label: d.project.siteName }]}
        title={<span className="flex flex-wrap items-center gap-3">{d.project.name}<Badge variant="outline" className="text-[12px]">{T(KIND_LABEL[d.project.kind] || d.project.kind)}</Badge></span>}
        facts={[[T("地点"), d.project.location], [T("需求清单"), d.project.demandFileName]]}
        actions={<>
          <Busy text={busy} />
          <Button variant={panel ? "secondary" : "ghost"} size="sm" id="req-settings" onClick={() => setPanel(!panel)}><Settings2 />{T("询价设置与模板")}</Button>
          <Button variant="ghost" size="sm" className="text-bad hover:bg-bad-soft" onClick={async () => { if (!window.confirm?.(T("删除这个采购需求和它的全部询价、报价？"))) return; const r = await run(T("删除中…"), () => api(`/api/projects/${id}`, { method: "DELETE" })); if (r) { sitesChanged(); router.push(`/sites/${d.project.siteId}`); } }}><Trash2 />{T("删除")}</Button>
        </>} />
      {panel && <ReqPanel d={d} setD={setD} onClose={() => setPanel(false)} />}
      {st && st.systems.length > 0 && (
        <p className="-mt-2 mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <BookCheck className="size-3.5" />{T("当地材料标准：")}<span className="text-foreground">{st.systems.map((x) => x.name.split(/[（(]/)[0].trim()).join("、")}</span>
          <Link href={`/sites/${d.project.siteId}`}>{T("查看详情")}</Link>
        </p>
      )}
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

/** Rename, change type, move to another engineering project, and edit RFQ settings and templates. */
function ReqPanel({ d, setD, onClose }: { d: ProjectData; setD: (d: ProjectData) => void; onClose: () => void }) {
  const T = useT();
  const { busy, run } = useBusy();
  const [name, setName] = useState(d.project.name);
  const [kind, setKind] = useState(d.project.kind);
  const [siteId, setSiteId] = useState(d.project.siteId);
  const [settings, setSettings] = useState<ReqSettings>(d.settings);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([{ id: d.project.siteId, name: d.project.siteName }]);
  useEffect(() => { api<{ sites: { id: string; name: string }[] }>("/api/sites").then((x) => setSites(x.sites)).catch(() => {}); }, []);
  async function save() {
    const r = await run(T("保存中…"), () => api<ProjectData>(`/api/projects/${d.project.id}`, { method: "PATCH", body: { name, kind, siteId, settings } }), T("已保存"));
    if (r) { setD(r); if (siteId !== d.project.siteId || name !== d.project.name) { sitesChanged(); announceSite(r.project.siteId); } onClose(); }
  }
  return (
    <Section title={T("询价设置与模板")} description={T("只影响这个采购需求之后锁定的询价单；已经锁定的询价单内容不变。")}
      actions={<Button variant="ghost" size="icon" aria-label={T("关闭")} onClick={onClose}><X /></Button>}>
      <div className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={T("采购需求名称")}><Input id="rp-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={T("类型")}><Select id="rp-kind" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{T(v)}</option>)}</Select></Field>
          <Field label={T("所属工程项目")}><Select id="rp-site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>{sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        </div>
        <div className="border-t pt-5"><ReqSettingsForm value={settings} onChange={setSettings} disabled={!!busy} /></div>
        <div className="flex items-center gap-3 border-t pt-4"><Button id="rp-save" disabled={!!busy || !name.trim()} onClick={save}>{T("保存")}</Button><Busy text={busy} /></div>
      </div>
    </Section>
  );
}

/** Read the list into parts in the browser, hand them to the server, and let the server read them with AI in the background. */
async function startDemand(projectId: string, f: File, sheets: string[] | undefined, step: (s: string) => void) {
  step(t("读取 {f}…", { f: f.name }));
  const parts = await readDemand(f, sheets);
  const n = parts.length;
  const { jobId } = await api<{ jobId: string }>(`/api/projects/${projectId}/demand`, { body: { fileName: f.name, total: n } });
  let sent = 0;
  step(t("上传中：{a}/{n} 部分", { a: 0, n }));
  await pool(parts, 3, async (p, idx) => {
    await api(`/api/jobs/${jobId}/parts`, { body: { idx, part: p } });
    step(t("上传中：{a}/{n} 部分", { a: ++sent, n }));
  });
  return api<ProjectData>(`/api/projects/${projectId}`);
}

function JobProgress({ job }: { job: Job }) {
  const T = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const secs = Math.max(0, Math.round((now - new Date(job.createdAt).getTime()) / 1000));
  const pct = Math.round((job.done / Math.max(1, job.total)) * 100);
  return (
    <div className="grid gap-3 rounded-lg border bg-card p-5" role="status" id="job-progress">
      <div className="flex flex-wrap items-center gap-3">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="text-[14px] font-medium">{job.total > 1 ? T("AI 正在识别需求清单：{a}/{n} 部分完成", { a: job.done, n: job.total }) : T("AI 正在识别需求清单，通常需要 1–2 分钟")}</span>
        <span className="num text-xs text-muted-foreground">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-signal transition-[width] duration-500" style={{ width: `${Math.max(4, pct)}%` }} /></div>
      <p className="text-xs text-muted-foreground">{T("{f} 正在服务器上识别。可以离开这个页面去做别的事，识别会继续，完成后回到这里查看；工作台也会显示进度。", { f: job.fileName })}</p>
    </div>
  );
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

  const [pick, setPick] = useState<{ file: File; sheets: SheetInfo[]; sel: string[] } | null>(null);
  const running = d.job?.status === "running";
  async function upload(files: File[]) {
    const f = files[0]; if (!f) return;
    if (d.items.length && !window.confirm?.(T("重新导入会替换当前的需求项、澄清问题和未发出的询价包，继续吗？"))) return;
    // A workbook with several worksheets: let the user choose which ones are the demand list.
    // Sheets with no filled-in items (empty forms of the company template) are left out of the choice.
    const all = await listSheets(f).catch(() => [] as SheetInfo[]);
    const sheets = all.some((x) => x.items > 0) ? all.filter((x) => x.items > 0) : all;
    if (sheets.length > 1) {
      // Pre-tick the sheet that matches the requirement type (subcontract/service/rental forms), else the one with the most items.
      const visible = sheets.filter((x) => !x.hidden && x.items > 0);
      const byKind = d.project.kind !== "material" ? visible.filter((x) => /分包|服务|租赁|subcontract|service|rental/i.test(x.name)) : [];
      const top = [...visible].sort((a, b) => b.items - a.items)[0];
      setPick({ file: f, sheets, sel: (byKind.length ? byKind : top ? [top] : []).map((x) => x.name) });
      return;
    }
    await start(f, sheets.length === 1 ? [sheets[0].name] : undefined);
  }
  async function start(f: File, sheets: string[] | undefined) {
    setPick(null);
    const r = await run(T("读取 {f}…", { f: f.name }), (step) => startDemand(d.project.id, f, sheets, step));
    if (r) setD(r);
  }
  const picker = pick && (
    <div className="grid gap-3 rounded-lg border border-info/40 bg-info-soft/40 p-4" id="sheet-picker">
      <div>
        <p className="text-[14px] font-medium">{T("这个文件有 {n} 个工作表，哪些是需求清单？", { n: pick.sheets.length })}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{T("只勾选这次要采购的清单。公司模板里的其他表（零星物资、分包/服务/租赁、进场计划等）常留着以前的示例行，勾上会混进需求项。")}</p>
      </div>
      <div className="grid gap-1.5">
        {pick.sheets.map((x) => (
          <label key={x.name} className="flex cursor-pointer items-start gap-2.5 rounded-md border bg-card px-3 py-2 text-[13px]">
            <input type="checkbox" className="mt-0.5" checked={pick.sel.includes(x.name)} onChange={(e) => setPick({ ...pick, sel: e.target.checked ? [...pick.sel, x.name] : pick.sel.filter((n) => n !== x.name) })} aria-label={x.name} />
            <span className="min-w-0"><span className="font-medium">{x.name}</span> <span className="text-xs text-muted-foreground">{x.items ? T("{n} 项", { n: x.items }) : T("没有填写物资")}</span>{x.hidden && <Badge variant="outline" className="ms-2">{T("隐藏的工作表")}</Badge>}
              {x.preview && <span className="block truncate text-xs text-muted-foreground">{x.preview}</span>}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2"><Button size="sm" id="sheet-go" disabled={!pick.sel.length || !!busy} onClick={() => start(pick.file, pick.sel)}>{T("识别所选工作表（{n}）", { n: pick.sel.length })}</Button><Button size="sm" variant="ghost" onClick={() => setPick(null)}>{T("取消")}</Button></div>
    </div>
  );
  const jobNote = d.job && d.job.status !== "running" && d.job.error && (
    <Banner tone={d.job.status === "failed" ? "bad" : "warn"} className="mb-5">{d.job.status === "failed" ? T("需求清单 {f} 没有识别成功：", { f: d.job.fileName }) : ""}{T(d.job.error)}</Banner>
  );

  async function answer(q: Question, answer: string, status = "answered") {
    const r = await run(T("保存中…"), () => api<ProjectData>(`/api/clarifications/${q.id}`, { method: "PATCH", body: { answer, status } }));
    if (r) setD(r);
  }
  async function exportQs() {
    const rows = allQs.filter((q) => q.status !== "ignored").map((q) => { const it = itemsById.get(q.itemId)!; return { no: it.no, name: `${it.nameCn} ${it.nameEn}`.trim(), spec: it.spec, question: q.question, questionEn: q.questionEn, options: q.options, answer: q.answer, status: q.status }; });
    download(await buildQuestions(d.project.name, rows), `${T("待确认问题")}_${d.project.name}.xlsx`);
  }

  if (!d.items.length) return (
    <>
      {jobNote}
      <Section title={T("上传工程部需求清单")} description={T("支持 Excel、PDF（含扫描件）和图片。AI 会提取每一项物资，按材料类别检查哪些参数没写清楚，生成要请工程部确认的问题。")}>
        <div className="grid gap-4">
          {running ? <JobProgress job={d.job!} /> : !pick && <Drop id="demand-file" title={T("需求清单")} hint={T("物资需用计划表，一份。识别在服务器上进行，上传后可以离开页面。")} accept={DEMAND_ACCEPT} onFiles={upload} disabled={!!busy} />}
          {picker}
          <Busy text={busy} />
        </div>
      </Section>
    </>
  );

  return (
    <>
      {jobNote}
      {(running || picker) && <div className="mb-5 grid gap-3">{running && <JobProgress job={d.job!} />}{picker}</div>}
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
        actions={<><Busy text={busy} /><Drop compact id="demand-reupload" title={T("重新导入清单")} hint="" accept={DEMAND_ACCEPT} onFiles={upload} disabled={!!busy || running} /></>}>
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
    if (!files.length) return;
    const r = await run(T("读取 {f}…", { f: files[0].name }), async (step) => {
      let last: ProjectData | null = null;
      const skipped: string[] = [];
      for (const [k, f] of files.entries()) {
        const tag = files.length > 1 ? `(${k + 1}/${files.length}) ` : "";
        const { pages, numPages } = await pdfPages(f, 1500, (p, n) => { if (p % 25 === 0 || p === n) step(tag + t("读取 {f}：{p}/{n} 页", { f: f.name, p, n })); });
        const { sections: secs, mode } = splitSpec(pages);
        if (mode === "scanned") { skipped.push(f.name); continue; }
        step(tag + t("建立索引…"));
        let docId: string | undefined; let batch: typeof secs = []; let size = 0;
        const send = async (end: boolean) => {
          const res = await api<ProjectData & { docId?: string }>(`/api/projects/${d.project.id}/specs`, { body: { fileName: f.name, pages: numPages, sections: batch, docId, last: end } });
          docId = docId || res.docId; batch = []; size = 0; return res;
        };
        for (const s of secs) { if (size + s.body.length > 1_500_000 && batch.length) await send(false); batch.push(s); size += s.body.length; }
        last = (await send(true)) as ProjectData;
      }
      if (skipped.length && !last) throw new Error(t("{f} 是扫描件（PDF 里没有文字，只有图片），暂时读不了。请向设计院或工程部要可以复制文字的电子版 PDF。", { f: skipped.join("、") }));
      if (skipped.length) toast(t("{f} 是扫描件，没有文字，已跳过", { f: skipped.join("、") }), true);
      return last;
    }, T("规格书已建立索引"));
    if (r && "project" in r) setD(r as ProjectData);
  }
  const linked = d.items.filter((i) => /\d{2}\s?\d{2}\s?\d{2}/.test(i.specRef || i.techReq)).length;
  const open = d.items.reduce((n, i) => n + i.questions.filter((q) => q.status === "open").length, 0);
  return (
    <Section title={T("技术规格书")} description={T("上传项目的技术规格书 PDF，可以一次选多份，每份可以几百页。按 “SECTION 32 14 13” 这样的章节号编排的规格书按章节建立索引，其他格式按页建立索引。AI 会找到每个需求项对应的内容，用原文回答待确认问题，并把技术要求写进询价单。")}
      actions={<span className="text-xs text-muted-foreground">{T("{n} 个需求项写了规范章节号", { n: linked })}</span>}>
      <div className="grid gap-4">
        <Drop id="spec-file" multiple title={T("上传规格书 PDF")} hint={T("可以一次选多份，也可以分几次上传；扫描版 PDF 读不了")} accept=".pdf" onFiles={upload} disabled={!!busy} />
        {d.specDocs.length > 0 && (
          <TableFrame>
            <thead><tr><th>{T("文件")}</th><th className="n">{T("页数")}</th><th>{T("索引")}</th><th></th></tr></thead>
            <tbody>{d.specDocs.map((s) => (
              <tr key={s.id}><td><span className="inline-flex items-center gap-2"><FileText className="size-4 text-muted-foreground" />{s.fileName}</span></td><td className="n">{s.pages}</td><td className="text-xs">{s.byPage ? T("按页（{n} 段）", { n: s.sections }) : T("按章节（{n} 节）", { n: s.sections })}</td>
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
              <span className="num rounded bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">{p.rfqNo || p.code}</span>
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
