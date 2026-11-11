"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, download, fmt } from "@/lib/client/api";
import { readForAi, pdfPages } from "@/lib/client/files";
import { buildQuestions } from "@/lib/client/excel";
import { splitSections } from "@/lib/specs";
import { useBusy, Busy, Drop, StatusChip, toast } from "@/components/ui";
import type { ProjectData, Item, Question } from "@/lib/client/types";

type Tab = "demand" | "specs" | "packages";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<ProjectData | null>(null);
  const [tab, setTab] = useState<Tab>("demand");
  const { busy, run } = useBusy();
  const router = useRouter();
  useEffect(() => { api<ProjectData>(`/api/projects/${id}`).then((x) => { setD(x); if (x.packages.length) setTab("packages"); }).catch((e) => toast(e.message, true)); }, [id]);
  if (!d) return <Busy text="加载中…" />;
  const open = d.items.reduce((n, i) => n + i.questions.filter((q) => q.status === "open").length, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link href="/projects">项目</Link><span>/</span></div>
          <h1>{d.project.name}</h1>
          <p>{[d.project.location, d.project.owner].filter(Boolean).join(" · ")}{d.project.demandFileName ? ` · 需求清单：${d.project.demandFileName}` : ""}</p>
        </div>
        <div className="actions">
          <Busy text={busy} />
          <button className="danger sm" onClick={async () => { if (!window.confirm?.("删除这个项目和它的全部询价、报价？")) return; await run("删除中…", () => api(`/api/projects/${id}`, { method: "DELETE" })); router.push("/projects"); }}>删除项目</button>
        </div>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" className={tab === "demand" ? "on" : ""} onClick={() => setTab("demand")}>1 · 需求清单与澄清{open > 0 && <span className="chip warn">{open}</span>}</button>
        <button role="tab" className={tab === "specs" ? "on" : ""} onClick={() => setTab("specs")}>2 · 技术规格书{d.specDocs.length > 0 && <span className="chip">{d.specDocs.length}</span>}</button>
        <button role="tab" className={tab === "packages" ? "on" : ""} onClick={() => setTab("packages")}>3 · 询价包{d.packages.length > 0 && <span className="chip">{d.packages.length}</span>}</button>
      </div>
      {tab === "demand" && <Demand d={d} setD={setD} run={run} busy={busy} />}
      {tab === "specs" && <Specs d={d} setD={setD} run={run} busy={busy} />}
      {tab === "packages" && <Packages d={d} setD={setD} run={run} busy={busy} />}
    </>
  );
}

type Ctx = { d: ProjectData; setD: (d: ProjectData) => void; run: ReturnType<typeof useBusy>["run"]; busy: string | null };

/* ================= demand & clarification ================= */
function Demand({ d, setD, run, busy }: Ctx) {
  const [filter, setFilter] = useState<"open" | "all">("open");
  const itemsById = useMemo(() => new Map(d.items.map((i) => [i.id, i])), [d.items]);
  const allQs = d.items.flatMap((i) => i.questions);
  const qs = allQs.filter((q) => filter === "all" || q.status === "open");
  const issues = d.items.filter((i) => i.issues.length);

  async function upload(files: File[]) {
    const f = files[0]; if (!f) return;
    if (d.items.length && !window.confirm?.("重新导入会替换当前的需求项、澄清问题和未发出的询价包，继续吗？")) return;
    const r = await run(`读取 ${f.name}…`, async () => {
      const c = await readForAi(f);
      toast("AI 正在识别需求清单，通常需要 1–2 分钟");
      return api<ProjectData>(`/api/projects/${d.project.id}/demand`, { body: { fileName: f.name, text: c.text, images: c.images } });
    }, "需求清单识别完成");
    if (r) setD(r);
  }
  async function answer(q: Question, answer: string, status = "answered") {
    const r = await run("保存中…", () => api<ProjectData>(`/api/clarifications/${q.id}`, { method: "PATCH", body: { answer, status } }));
    if (r) setD(r);
  }
  async function exportQs() {
    const rows = allQs.filter((q) => q.status !== "ignored").map((q) => { const it = itemsById.get(q.itemId)!; return { no: it.no, name: `${it.nameCn} ${it.nameEn}`.trim(), spec: it.spec, question: q.question, questionEn: q.questionEn, options: q.options, answer: q.answer, status: q.status }; });
    download(await buildQuestions(d.project.name, rows), `待确认问题_${d.project.name}.xlsx`);
  }

  if (!d.items.length) return (
    <section className="panel">
      <h2>上传工程部需求清单</h2>
      <p className="muted" style={{ margin: 0 }}>支持 Excel、PDF（含扫描件）和图片。AI 会提取每一项物资，按材料类别检查哪些参数没写清楚，生成要请工程部确认的问题。</p>
      <Drop id="demand-file" title="需求清单" hint="物资需用计划表，一份" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg" onFiles={upload} disabled={!!busy} />
      <Busy text={busy} />
    </section>
  );

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>待工程部确认的问题</h2>
            <div className="stats" style={{ marginTop: 4 }}><span>需求项 <b>{d.items.length}</b></span><span>问题 <b>{allQs.length}</b></span><span>待确认 <b>{allQs.filter((q) => q.status === "open").length}</b></span><span>已确认 <b>{allQs.filter((q) => q.status === "answered").length}</b></span></div>
          </div>
          <div className="actions">
            <select aria-label="筛选问题" value={filter} onChange={(e) => setFilter(e.target.value as "open" | "all")}><option value="open">只看待确认</option><option value="all">全部问题</option></select>
            <button onClick={exportQs} disabled={!allQs.length}>导出问题清单 Excel</button>
          </div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>确认后的答案会自动并入询价单的规格。可以导出问题清单发给工程部，回复后在这里点选或填写。上传技术规格书后，AI 还能直接从规格书里找答案。</p>
        {qs.length === 0 ? <div className="empty">{allQs.length ? "所有问题都处理完了。" : "AI 没有发现需要确认的问题。"}</div> : (
          <div className="qlist">{qs.map((q) => <QuestionCard key={q.id} q={q} item={itemsById.get(q.itemId)!} onAnswer={answer} disabled={!!busy} />)}</div>
        )}
      </section>

      {issues.length > 0 && (
        <div className="banner"><b>需求数据问题（{issues.length} 项）：</b>{issues.map((i) => `#${i.no} ${i.nameCn || i.nameEn}：${i.issues.join("；")}`).join(" ｜ ")}</div>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>需求项（{d.items.length}）</h2>
          <div className="actions"><Drop id="demand-reupload" title="重新导入清单" hint="会替换当前需求项" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg" onFiles={upload} disabled={!!busy} /></div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>序号</th><th>物资名称</th><th>规格型号</th><th>单位</th><th className="n">数量</th><th>类别</th><th>规范号 / 技术要求</th><th>问题</th></tr></thead>
            <tbody>
              {d.items.map((i) => {
                const o = i.questions.filter((q) => q.status === "open").length, a = i.questions.filter((q) => q.status === "answered");
                return (
                  <tr key={i.id}>
                    <td className="mono">{i.no}</td>
                    <td style={{ minWidth: 180 }}><b style={{ fontWeight: 500 }}>{i.nameCn}</b><span className="sub">{i.nameEn}</span></td>
                    <td style={{ minWidth: 160 }}>{i.spec}{a.length > 0 && <span className="sub" style={{ color: "var(--good)" }}>已确认：{a.map((q) => q.answer).join("；")}</span>}</td>
                    <td>{i.unit}</td>
                    <td className="n">{fmt(i.qty, Number.isInteger(i.qty) ? 0 : 2)}</td>
                    <td><span className="chip">{i.category}</span></td>
                    <td className="small" style={{ minWidth: 160 }}>{i.specRef && <span className="mono">{i.specRef}</span>}<span className="sub">{i.techReq}</span></td>
                    <td>{o > 0 ? <span className="chip warn">待确认 {o}</span> : i.questions.length ? <span className="chip good">已处理</span> : <span className="muted small">—</span>}{i.issues.length > 0 && <span className="dev">{i.issues.join("；")}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function QuestionCard({ q, item, onAnswer, disabled }: { q: Question; item: Item; onAnswer: (q: Question, a: string, s?: string) => void; disabled: boolean }) {
  const [custom, setCustom] = useState("");
  return (
    <div className={"q" + (q.status !== "open" ? " done" : "")}>
      <div className="small muted"><span className="mono">#{item.no}</span> {item.nameCn} {item.nameEn} · <span className="chip">{item.category}</span></div>
      <div><b style={{ fontWeight: 600 }}>{q.question}</b>{q.questionEn && <div className="small muted">{q.questionEn}</div>}</div>
      {q.status === "open" ? (
        <>
          <div className="opts">
            {q.options.map((o) => <button key={o} className="sm" disabled={disabled} onClick={() => onAnswer(q, o)}>{o}</button>)}
          </div>
          <div className="actions">
            <input aria-label="其他答案" placeholder="其他答案…" value={custom} onChange={(e) => setCustom(e.target.value)} style={{ flex: "1 1 200px" }} />
            <button className="sm" disabled={disabled || !custom.trim()} onClick={() => onAnswer(q, custom.trim())}>保存</button>
            <button className="sm link" disabled={disabled} onClick={() => onAnswer(q, "", "ignored")}>忽略</button>
          </div>
        </>
      ) : (
        <div className="actions">
          {q.status === "answered" ? <span className="chip good">已确认：{q.answer}</span> : <span className="chip">已忽略</span>}
          <button className="link" disabled={disabled} onClick={() => onAnswer(q, "", "open")}>撤销</button>
        </div>
      )}
      {q.specQuote && <div className="quote">规格书原文：{q.specQuote}</div>}
    </div>
  );
}

/* ================= specification books ================= */
function Specs({ d, setD, run, busy }: Ctx) {
  async function upload(files: File[]) {
    const f = files[0]; if (!f) return;
    const r = await run(`读取 ${f.name}…`, async () => {
      const { pages, numPages } = await pdfPages(f, 1500);
      const secs = splitSections(pages);
      if (!secs.length) throw new Error("没有识别到 “SECTION 32 14 13” 这样的章节标题。扫描版规格书暂不支持，请上传带文字的 PDF。");
      let docId: string | undefined; let batch: typeof secs = []; let size = 0;
      const send = async (last: boolean) => {
        const res = await api<ProjectData & { docId?: string }>(`/api/projects/${d.project.id}/specs`, { body: { fileName: f.name, pages: numPages, sections: batch, docId, last } });
        docId = docId || res.docId; batch = []; size = 0; return res;
      };
      for (const s of secs) { if (size + s.body.length > 1_500_000 && batch.length) await send(false); batch.push(s); size += s.body.length; }
      return await send(true);
    }, "规格书已建立索引");
    if (r && "project" in r) setD(r as ProjectData);
  }
  const linked = d.items.filter((i) => /\d{2}\s?\d{2}\s?\d{2}/.test(i.specRef || i.techReq)).length;
  const open = d.items.reduce((n, i) => n + i.questions.filter((q) => q.status === "open").length, 0);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>技术规格书</h2>
        <span className="small muted">{linked} 个需求项写了规范章节号</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>上传项目的技术规格书（带文字的 PDF，可以几百页）。系统按 “SECTION 32 14 13” 这样的章节号建立索引，AI 会根据需求项的规范号找到对应章节，用原文回答待确认问题，并把技术要求写进询价单。</p>
      <Drop id="spec-file" title="上传规格书 PDF" hint="可以上传多份" accept=".pdf" onFiles={upload} disabled={!!busy} />
      {d.specDocs.length > 0 && (
        <div className="tbl-wrap"><table>
          <thead><tr><th>文件</th><th className="n">页数</th><th className="n">章节</th><th></th></tr></thead>
          <tbody>{d.specDocs.map((s) => (
            <tr key={s.id}><td>{s.fileName}</td><td className="n">{s.pages}</td><td className="n">{s.sections}</td>
              <td><button className="link" onClick={async () => { const r = await run("删除中…", () => api<ProjectData>(`/api/specs/${s.id}`, { method: "DELETE" })); if (r) setD(r); }}>删除</button></td></tr>
          ))}</tbody>
        </table></div>
      )}
      <div className="actions">
        <button className="primary" disabled={!!busy || !d.specDocs.length || !d.items.length} onClick={async () => {
          const r = await run("AI 正在查阅规格书…", () => api<ProjectData & { matched: number; answered: number }>(`/api/projects/${d.project.id}/clarify`, { body: {} }));
          if (r) { setD(r); toast(`匹配到 ${r.matched} 个需求项，从规格书回答了 ${r.answered} 个问题`); }
        }}>用规格书回答待确认问题（{open}）</button>
        <Busy text={busy} />
      </div>
    </section>
  );
}

/* ================= packages ================= */
function Packages({ d, setD, run, busy }: Ctx) {
  const [sel, setSel] = useState<string[]>([]);
  const byPkg = (id: string | null) => d.items.filter((i) => i.packageId === id);
  const unassigned = byPkg(null);
  const drafts = d.packages.filter((p) => p.status === "draft");

  async function split() {
    if (drafts.length && !window.confirm?.("重新拆分会重建所有草稿询价包（已锁定的不受影响），继续吗？")) return;
    const r = await run("AI 正在拆分询价包…", () => api<ProjectData>(`/api/projects/${d.project.id}/split`, { body: {} }), "拆分完成");
    if (r) setD(r);
  }
  async function move(itemId: string, value: string) {
    if (value === "__new") {
      const r = await run("新建询价包…", () => api<ProjectData>(`/api/projects/${d.project.id}/packages`, { body: { itemIds: [itemId] } }));
      if (r) setD(r); return;
    }
    const r = await run("移动中…", () => api<ProjectData>(`/api/items/${itemId}`, { method: "PATCH", body: { packageId: value || null } }));
    if (r) setD(r);
  }
  async function rename(id: string, k: "titleCn" | "titleEn", v: string) {
    const r = await run("保存中…", () => api<ProjectData>(`/api/packages/${id}`, { method: "PATCH", body: { [k]: v, returnProject: true } }));
    if (r) setD(r);
  }
  const opts = (cur: string | null) => (
    <>
      {cur === null && <option value="">未分配</option>}
      {drafts.map((p) => <option key={p.id} value={p.id}>{p.code} {p.titleCn}</option>)}
      {cur !== null && <option value="">移出（未分配）</option>}
      <option value="__new">+ 新建询价包</option>
    </>
  );
  const table = (items: Item[], editable: boolean) => (
    <div className="tbl-wrap"><table>
      <thead><tr><th>需求序号</th><th>物资名称</th><th>规格型号</th><th>单位</th><th className="n">数量</th><th>类别</th>{editable && <th>询价包</th>}</tr></thead>
      <tbody>{items.map((i) => (
        <tr key={i.id}>
          <td className="mono">{i.no}</td>
          <td style={{ minWidth: 170 }}><b style={{ fontWeight: 500 }}>{i.nameCn}</b><span className="sub">{i.nameEn}</span></td>
          <td className="small" style={{ minWidth: 160 }}>{i.spec}{i.quoteHint && <span className="sub">{i.quoteHint}</span>}</td>
          <td>{i.unit}</td><td className="n">{fmt(i.qty, Number.isInteger(i.qty) ? 0 : 2)}</td><td><span className="chip">{i.category}</span></td>
          {editable && <td><select aria-label={`移动需求 ${i.no}`} value={i.packageId || ""} disabled={!!busy} onChange={(e) => move(i.id, e.target.value)} style={{ maxWidth: 190, fontSize: 12.5, padding: "3px 6px" }}>{opts(i.packageId)}</select></td>}
        </tr>
      ))}</tbody>
    </table></div>
  );

  if (!d.items.length) return <div className="empty">先在“需求清单”里上传工程部的清单。</div>;
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>询价包</h2>
            <p className="small muted" style={{ margin: "4px 0 0" }}>同一类供应商能一起报价的需求放在一个包里。可以移动需求项、勾选合并，确认后进入询价单锁定编号、选供应商、发邮件。</p>
          </div>
          <div className="actions">
            <button className="primary" disabled={!!busy || (!unassigned.length && !drafts.length)} onClick={split}>{d.packages.length ? "重新 AI 拆分草稿" : "AI 拆分询价包"}</button>
            <button disabled={!!busy || sel.length < 2} onClick={async () => { const r = await run("合并中…", () => api<ProjectData>("/api/packages/merge", { body: { ids: sel } }), "已合并"); if (r) { setD(r); setSel([]); } }}>合并所选（{sel.length}）</button>
            <Busy text={busy} />
          </div>
        </div>
      </section>
      {d.packages.map((p) => (
        <section className="panel" key={p.id}>
          <div className="panel-head">
            <div className="actions" style={{ flex: "1 1 420px" }}>
              {p.status === "draft" && <input type="checkbox" aria-label={`勾选 ${p.code}`} checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} />}
              <span className="mono" style={{ fontWeight: 600, color: "var(--accent)" }}>{p.rfqNo || p.code}</span>
              {p.status === "draft" ? <>
                <input aria-label="中文名" defaultValue={p.titleCn} onBlur={(e) => e.target.value !== p.titleCn && rename(p.id, "titleCn", e.target.value)} style={{ fontWeight: 600, flex: "1 1 160px" }} />
                <input aria-label="英文标题" defaultValue={p.titleEn} onBlur={(e) => e.target.value !== p.titleEn && rename(p.id, "titleEn", e.target.value)} style={{ flex: "2 1 240px", fontSize: 12.5 }} />
              </> : <><b>{p.titleCn}</b><span className="small muted">{p.titleEn}</span></>}
            </div>
            <div className="actions">
              <StatusChip status={p.status} />
              {p.supplierType && <span className="chip acc">{p.supplierType}</span>}
              <span className="chip">{byPkg(p.id).length} 项</span>
              {p.quotes > 0 && <span className="chip good">报价 {p.quotes}</span>}
              <Link className="btn primary sm" href={`/packages/${p.id}`}>进入询价单 →</Link>
              {p.status === "draft" && <button className="sm link" disabled={!!busy} onClick={async () => { const r = await run("删除中…", () => api<ProjectData>(`/api/packages/${p.id}`, { method: "DELETE" })); if (r) setD(r); }}>删除</button>}
            </div>
          </div>
          {p.reason && <p className="small muted" style={{ margin: 0 }}>{p.reason}</p>}
          {table(byPkg(p.id), p.status === "draft")}
        </section>
      ))}
      {unassigned.length > 0 && (
        <section className="panel">
          <h2>未分配的需求项（{unassigned.length}）</h2>
          {table(unassigned, true)}
        </section>
      )}
    </>
  );
}
