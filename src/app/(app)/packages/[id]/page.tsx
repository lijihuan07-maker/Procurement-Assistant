"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, download, fmt } from "@/lib/client/api";
import { useBusy, Busy, StatusChip, toast, copyText } from "@/components/ui";
import type { PackageData } from "@/lib/client/types";
import { Compare } from "./Compare";
import { type Ctx, rfqBlob, rfqFileName } from "./shared";

type Tab = "rfq" | "suppliers" | "quotes";

export default function PackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<PackageData | null>(null);
  const [tab, setTab] = useState<Tab>("rfq");
  const { busy, run } = useBusy();
  useEffect(() => { api<PackageData>(`/api/packages/${id}`).then((x) => { setD(x); if (x.quotes.length) setTab("quotes"); else if (x.invites.length) setTab("suppliers"); }).catch((e) => toast(e.message, true)); }, [id]);
  if (!d) return <Busy text="加载中…" />;
  const p = d.pkg;
  const locked = p.status !== "draft";
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link href="/projects">项目</Link><span>/</span><Link href={`/projects/${d.project.id}`}>{d.project.name}</Link><span>/</span></div>
          <h1>{p.titleCn || p.titleEn}</h1>
          <p><span className="mono">{p.rfqNo || p.code}</span> · {p.titleEn}{p.deadline ? ` · 报价截止 ${p.deadline}` : ""}</p>
        </div>
        <div className="actions"><StatusChip status={p.status} /><Busy text={busy} /></div>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" className={tab === "rfq" ? "on" : ""} onClick={() => setTab("rfq")}>1 · 询价单</button>
        <button role="tab" className={tab === "suppliers" ? "on" : ""} onClick={() => setTab("suppliers")} disabled={!locked}>2 · 供应商与邮件{d.invites.length > 0 && <span className="chip">{d.invites.length}</span>}</button>
        <button role="tab" className={tab === "quotes" ? "on" : ""} onClick={() => setTab("quotes")} disabled={!locked}>3 · 报价与比价{d.quotes.length > 0 && <span className="chip good">{d.quotes.length}</span>}</button>
      </div>
      {tab === "rfq" && <Rfq d={d} setD={setD} run={run} busy={busy} onNext={() => setTab("suppliers")} />}
      {tab === "suppliers" && locked && <Suppliers d={d} setD={setD} run={run} busy={busy} />}
      {tab === "quotes" && locked && <Compare d={d} setD={setD} run={run} busy={busy} />}
    </>
  );
}

/* ================= RFQ ================= */
function Rfq({ d, setD, run, busy, onNext }: Ctx & { onNext: () => void }) {
  const p = d.pkg;
  const [deadline, setDeadline] = useState(p.deadline || new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
  const nextNo = d.company.rfqPrefix + String(d.company.rfqNextNo).padStart(d.company.rfqPad, "0");
  const [rfqNo, setRfqNo] = useState(nextNo);
  const [title, setTitle] = useState({ cn: p.titleCn, en: p.titleEn });
  const dirty = title.cn !== p.titleCn || title.en !== p.titleEn;
  async function saveTitle(t = title) {
    const r = await run("保存名称…", () => api<PackageData>(`/api/packages/${p.id}`, { method: "PATCH", body: { titleCn: t.cn.trim(), titleEn: t.en.trim() } }), "名称已保存");
    if (r) setD(r);
  }
  async function suggest() {
    const r = await run("AI 起名中…", () => api<{ titleCn: string; titleEn: string }>(`/api/packages/${p.id}/suggest-title`, { method: "POST" }));
    if (r) setTitle({ cn: r.titleCn || title.cn, en: r.titleEn || title.en });
  }
  async function unlock() {
    if (!window.confirm?.("解锁后询价单回到草稿状态，可以改编号、名称和内容；已生成但未发送的询价邮件会被删除。继续？")) return;
    const r = await run("解锁中…", () => api<PackageData>(`/api/packages/${p.id}/unlock`, { method: "POST" }), "已解锁");
    if (r) { setD(r); setTitle({ cn: r.pkg.titleCn, en: r.pkg.titleEn }); setRfqNo(r.company.rfqPrefix + String(r.company.rfqNextNo).padStart(r.company.rfqPad, "0")); }
  }
  const placeholder = /\*{2,}/.test(d.company.paymentTerms);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{p.status === "draft" ? "确认询价单内容" : `询价单 ${p.rfqNo}`}</h2>
        {p.status !== "draft" && (
          <div className="actions">
            <button className="primary" onClick={async () => download(await rfqBlob(d), rfqFileName(d))}>下载询价单 Excel</button>
            <button onClick={onNext}>下一步：选供应商 →</button>
            {p.status === "issued" && <button className="link" disabled={!!busy} onClick={unlock}>解锁修改</button>}
          </div>
        )}
      </div>
      {p.status === "draft" ? (
        <>
          <p className="muted" style={{ margin: 0 }}>锁定后询价内容随之固定，之后收到的报价都和这份内容对比。要调整需求项，请回到项目的“询价包”页。</p>
          {placeholder && <div className="banner">公司设置里的付款条款还有 “***%” 这样的占位符，锁定前请先到“设置与模板”里改好。</div>}
          <div className="fields" style={{ maxWidth: 860 }}>
            <label className="field">询价单名称（中文）<input id="title-cn" value={title.cn} onChange={(e) => setTitle({ ...title, cn: e.target.value })} /></label>
            <label className="field">询价单名称（英文，写进 Excel 标题）<input id="title-en" value={title.en} onChange={(e) => setTitle({ ...title, en: e.target.value })} /></label>
          </div>
          <div className="actions">
            <button className="sm" disabled={!!busy} onClick={suggest}>AI 推荐名称</button>
            <button className="sm primary" disabled={!!busy || !dirty || !title.cn.trim()} onClick={() => saveTitle()}>保存名称</button>
            {dirty && <span className="small muted">名称还没保存</span>}
          </div>
          <div className="fields" style={{ maxWidth: 640 }}>
            <label className="field">询价单编号（可修改，默认按公司编号顺延）<input id="rfq-no" value={rfqNo} onChange={(e) => setRfqNo(e.target.value)} className="mono" /></label>
            <label className="field">报价截止日期<input id="deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
          </div>
          <div className="actions">
            <button className="primary" disabled={!!busy || !d.lines.length} onClick={async () => {
              if (dirty) { const ok = await run("保存名称…", () => api<PackageData>(`/api/packages/${p.id}`, { method: "PATCH", body: { titleCn: title.cn.trim(), titleEn: title.en.trim() } })); if (!ok) return; }
              const r = await run("锁定中…", () => api<PackageData>(`/api/packages/${p.id}/issue`, { body: { deadline, rfqNo: rfqNo.trim() } }), "已锁定，可以下载询价单"); if (r) setD(r);
            }}>锁定询价单</button>
            <span className="small muted">模板：{d.rfqTemplate ? `沿用 ${d.rfqTemplate.fileName}` : "系统默认中英双语格式（可在“设置与模板”上传你们的询价单）"}</span>
          </div>
        </>
      ) : (
        <dl className="kv">
          <dt>询价单名称</dt><dd>{p.snapshot?.title} / {p.snapshot?.titleEn}</dd>
          <dt>报价截止</dt><dd>{p.snapshot?.deadline}</dd>
          <dt>有效期</dt><dd>{p.snapshot?.validity}</dd>
          <dt>付款条款</dt><dd>{p.snapshot?.payment}</dd>
          <dt>模板</dt><dd>{d.rfqTemplate ? d.rfqTemplate.fileName : "系统默认格式"}</dd>
        </dl>
      )}
      <div className="tbl-wrap"><table>
        <thead><tr><th>序号</th><th>物资名称</th><th>规格（含已确认的答案）</th><th>单位</th><th className="n">数量</th><th>技术要求</th></tr></thead>
        <tbody>{d.lines.map((l) => (
          <tr key={l.no}><td className="mono">{l.no}</td><td style={{ minWidth: 170 }}>{l.name}</td><td className="small" style={{ minWidth: 180 }}>{l.spec}</td><td>{l.unit}</td><td className="n">{fmt(l.qty, Number.isInteger(l.qty) ? 0 : 2)}</td><td className="small">{l.techReq}</td></tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

/* ================= suppliers & emails ================= */
function Suppliers({ d, setD, run, busy }: Ctx) {
  const invited = new Set(d.invites.map((i) => i.supplierId));
  const matched = d.recommendations.filter((r) => r.match);
  const others = d.recommendations.filter((r) => !r.match);
  const [sel, setSel] = useState<string[]>(() => matched.filter((r) => !invited.has(r.supplier.id)).slice(0, 4).map((r) => r.supplier.id));
  const [showAll, setShowAll] = useState(false);
  const [add, setAdd] = useState({ name: "", email: "", contact: "" });
  const cats = useMemo(() => [...new Set(d.lines.map((l) => l.category))], [d.lines]);
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const row = (r: PackageData["recommendations"][number], i: number) => (
    <tr key={r.supplier.id}>
      <td><input type="checkbox" aria-label={`选择 ${r.supplier.name}`} disabled={invited.has(r.supplier.id)} checked={invited.has(r.supplier.id) || sel.includes(r.supplier.id)} onChange={() => toggle(r.supplier.id)} /></td>
      <td><b style={{ fontWeight: 500 }}>{r.supplier.name}</b>{r.match && i < 3 && <span className="chip good" style={{ marginLeft: 6 }}>推荐</span>}<span className="sub">{r.supplier.categories.join("、")}</span></td>
      <td className="small">{r.supplier.email || <span className="dev">没有邮箱</span>}<span className="sub">{[r.supplier.contact, r.supplier.city].filter(Boolean).join(" · ")}</span></td>
      <td className="small">{r.reasons.join("；") || "—"}</td>
      <td>{invited.has(r.supplier.id) ? <span className="chip acc">已生成邮件</span> : null}</td>
    </tr>
  );
  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const r = await run("添加中…", () => api<{ supplier: { id: string } }>("/api/suppliers", { body: { ...add, categories: cats } }));
    if (!r) return;
    const nd = await api<PackageData>(`/api/packages/${d.pkg.id}`); setD(nd); setSel([...sel, r.supplier.id]); setAdd({ name: "", email: "", contact: "" });
  }
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>选择询价供应商</h2>
            <p className="small muted" style={{ margin: "4px 0 0" }}>按同类采购次数、报价回复率和评分排序。推荐来自你们自己的供应商库和历史采购记录。</p>
          </div>
          <button className="primary" disabled={!!busy || !sel.length} onClick={async () => { const r = await run("生成邮件中…", () => api<PackageData>(`/api/packages/${d.pkg.id}/invites`, { body: { supplierIds: sel } }), "邮件已生成"); if (r) { setD(r); setSel([]); } }}>为勾选的 {sel.length} 家生成询价邮件</button>
        </div>
        {!d.recommendations.length ? <div className="empty">供应商库还是空的。到“供应商库”导入历史采购记录，或在下面直接添加。</div> : (
          <div className="tbl-wrap"><table>
            <thead><tr><th></th><th>供应商</th><th>联系方式</th><th>推荐理由</th><th></th></tr></thead>
            <tbody>
              {matched.map(row)}
              {matched.length === 0 && <tr><td colSpan={5} className="muted small">没有找到同类供应商。</td></tr>}
              {others.length > 0 && <tr><td colSpan={5}><button className="link" onClick={() => setShowAll(!showAll)}>{showAll ? "收起" : `显示其他 ${others.length} 家供应商`}</button></td></tr>}
              {showAll && others.map((r) => row(r, 99))}
            </tbody>
          </table></div>
        )}
        <form className="actions" onSubmit={quickAdd}>
          <span className="small muted">添加新供应商：</span>
          <input aria-label="供应商名称" placeholder="公司名称" required value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
          <input aria-label="邮箱" placeholder="邮箱" type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} />
          <input aria-label="联系人" placeholder="联系人" value={add.contact} onChange={(e) => setAdd({ ...add, contact: e.target.value })} />
          <button className="sm" disabled={!!busy}>添加</button>
        </form>
      </section>

      {d.invites.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>询价邮件（{d.invites.length}）</h2>
              <p className="small muted" style={{ margin: "4px 0 0" }}>一期从你自己的邮箱发送：复制收件人、主题和正文，附上询价单 Excel 发出后，点“标记已发送”。</p>
            </div>
            <button onClick={async () => download(await rfqBlob(d), rfqFileName(d))}>下载附件：询价单 Excel</button>
          </div>
          {d.invites.map((inv) => (
            <div className="q" key={inv.id}>
              <div className="panel-head">
                <div><b>{inv.supplier.name}</b> <span className="small muted">{inv.supplier.email || "没有邮箱"}</span></div>
                <div className="actions">
                  {inv.status === "sent" ? <span className="chip good">已发送 {inv.sentAt?.slice(0, 10)}</span> : <span className="chip">草稿</span>}
                  <button className="sm" disabled={!inv.supplier.email} onClick={() => copyText(inv.supplier.email)}>复制收件人</button>
                  <button className="sm" onClick={() => copyText(inv.subject)}>复制主题</button>
                  <button className="sm" onClick={() => copyText(inv.body)}>复制正文</button>
                  {inv.status === "sent"
                    ? <button className="sm link" onClick={async () => { const r = await run("保存中…", () => api<PackageData>(`/api/invites/${inv.id}`, { method: "PATCH", body: { status: "draft" } })); if (r) setD(r); }}>撤销已发送</button>
                    : <button className="sm primary" onClick={async () => { const r = await run("保存中…", () => api<PackageData>(`/api/invites/${inv.id}`, { method: "PATCH", body: { status: "sent" } })); if (r) setD(r); }}>标记已发送</button>}
                  <button className="sm link" onClick={async () => { const r = await run("删除中…", () => api<PackageData>(`/api/invites/${inv.id}`, { method: "DELETE" })); if (r) setD(r); }}>删除</button>
                </div>
              </div>
              <input aria-label="邮件主题" defaultValue={inv.subject} onBlur={async (e) => { if (e.target.value !== inv.subject) { const r = await run("保存中…", () => api<PackageData>(`/api/invites/${inv.id}`, { method: "PATCH", body: { subject: e.target.value } })); if (r) setD(r); } }} />
              <textarea aria-label="邮件正文" className="mail" defaultValue={inv.body} onBlur={async (e) => { if (e.target.value !== inv.body) { const r = await run("保存中…", () => api<PackageData>(`/api/invites/${inv.id}`, { method: "PATCH", body: { body: e.target.value } })); if (r) setD(r); } }} />
            </div>
          ))}
        </section>
      )}
    </>
  );
}
