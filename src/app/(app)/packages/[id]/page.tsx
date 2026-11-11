"use client";
import { use, useEffect, useMemo, useState } from "react";
import { ArrowRight, Copy, Download, Globe, Lock, LockOpen, Mail, Plus, Sparkles } from "lucide-react";
import { api, download, fmt } from "@/lib/client/api";
import { preloadParsers } from "@/lib/client/files";
import { tm, useLang, useT } from "@/lib/i18n/client";
import { names } from "@/lib/client/display";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useBusy, Busy, StatusChip, toast, copyText, PageHeader, Section, TableFrame, Banner, Empty, Stages, Loading } from "@/components/app";
import { Discover } from "@/components/Discover";
import type { PackageData } from "@/lib/client/types";
import { Compare } from "./Compare";
import { type Ctx, rfqBlob, rfqFileName } from "./shared";

type Tab = "rfq" | "suppliers" | "quotes";

export default function PackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const T = useT();
  const lang = useLang();
  const [d, setD] = useState<PackageData | null>(null);
  const [tab, setTab] = useState<Tab>("rfq");
  const { busy, run } = useBusy();
  useEffect(() => { preloadParsers(); api<PackageData>(`/api/packages/${id}`).then((x) => { setD(x); if (x.quotes.length) setTab("quotes"); else if (x.invites.length) setTab("suppliers"); }).catch((e) => toast(e.message, true)); }, [id]);
  if (!d) return <Loading />;
  const p = d.pkg;
  const locked = p.status !== "draft";
  const [title, sub] = names(lang, p.titleCn, p.titleEn);
  const sent = d.invites.filter((i) => i.status === "sent").length;
  return (
    <>
      <PageHeader crumbs={[{ href: "/projects", label: T("项目") }, { href: `/projects/${d.project.id}`, label: d.project.name }]}
        title={<span className="flex flex-wrap items-center gap-3">{title}<StatusChip status={p.status} /></span>}
        facts={[[T("询价单编号"), p.rfqNo ? <span className="num">{p.rfqNo}</span> : null], [T("英文标题"), lang === "zh" ? sub : null], [T("报价截止"), p.deadline && locked ? <span className="num">{p.deadline}</span> : null]]}
        actions={<Busy text={busy} />} />
      <Stages current={tab} onSelect={(k) => setTab(k as Tab)} stages={[
        { key: "rfq", label: T("询价单"), done: locked },
        { key: "suppliers", label: T("供应商与邮件"), count: d.invites.length || undefined, disabled: !locked, done: sent > 0 },
        { key: "quotes", label: T("报价与比价"), count: d.quotes.length || undefined, disabled: !locked, done: p.status === "awarded" },
      ]} />
      {tab === "rfq" && <Rfq d={d} setD={setD} run={run} busy={busy} onNext={() => setTab("suppliers")} />}
      {tab === "suppliers" && locked && <Suppliers d={d} setD={setD} run={run} busy={busy} />}
      {tab === "quotes" && locked && <Compare d={d} setD={setD} run={run} busy={busy} />}
    </>
  );
}

/* ================= RFQ ================= */
function Rfq({ d, setD, run, busy, onNext }: Ctx & { onNext: () => void }) {
  const T = useT();
  const p = d.pkg;
  const [deadline, setDeadline] = useState(p.deadline || new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
  const nextNo = d.company.rfqPrefix + String(d.company.rfqNextNo).padStart(d.company.rfqPad, "0");
  const [rfqNo, setRfqNo] = useState(nextNo);
  const [title, setTitle] = useState({ cn: p.titleCn, en: p.titleEn });
  const dirty = title.cn !== p.titleCn || title.en !== p.titleEn;
  const placeholder = /\*{2,}/.test(d.company.paymentTerms);
  const saveTitle = () => api<PackageData>(`/api/packages/${p.id}`, { method: "PATCH", body: { titleCn: title.cn.trim(), titleEn: title.en.trim() } });
  async function suggest() {
    const r = await run(T("AI 起名中…"), () => api<{ titleCn: string; titleEn: string }>(`/api/packages/${p.id}/suggest-title`, { method: "POST" }));
    if (r) setTitle({ cn: r.titleCn || title.cn, en: r.titleEn || title.en });
  }
  async function unlock() {
    if (!window.confirm?.(T("解锁后询价单回到草稿状态，可以改编号、名称和内容；已生成但未发送的询价邮件会被删除。继续？"))) return;
    const r = await run(T("解锁中…"), () => api<PackageData>(`/api/packages/${p.id}/unlock`, { method: "POST" }), T("已解锁"));
    if (r) { setD(r); setTitle({ cn: r.pkg.titleCn, en: r.pkg.titleEn }); setRfqNo(r.company.rfqPrefix + String(r.company.rfqNextNo).padStart(r.company.rfqPad, "0")); }
  }
  async function lock() {
    const r = await run(T("锁定中…"), async () => {
      if (dirty) await saveTitle();
      return api<PackageData>(`/api/packages/${p.id}/issue`, { body: { deadline, rfqNo: rfqNo.trim() } });
    }, T("已锁定，可以下载询价单"));
    if (r) setD(r);
  }
  const lines = (
    <Section title={T("询价明细（{n} 项）", { n: d.lines.length })} bodyClassName="p-0">
      <TableFrame flush>
        <thead><tr><th>{T("序号")}</th><th>{T("物资名称")}</th><th>{T("规格（含已确认的答案）")}</th><th>{T("单位")}</th><th className="n">{T("数量")}</th><th>{T("技术要求")}</th></tr></thead>
        <tbody>{d.lines.map((l) => (
          <tr key={l.no}><td className="num text-muted-foreground">{l.no}</td><td className="min-w-44 font-medium">{l.name}</td><td className="min-w-48 text-xs">{l.spec}</td><td>{l.unit}</td><td className="n">{fmt(l.qty, Number.isInteger(l.qty) ? 0 : 2)}</td><td className="text-xs text-muted-foreground">{l.techReq}</td></tr>
        ))}</tbody>
      </TableFrame>
    </Section>
  );

  if (p.status !== "draft") return (
    <>
      <Section title={T("询价单 {no}", { no: p.rfqNo })}
        actions={<>
          {p.status === "issued" && <Button variant="ghost" size="sm" disabled={!!busy} onClick={unlock}><LockOpen />{T("解锁修改")}</Button>}
          <Button variant="outline" onClick={async () => download(await rfqBlob(d), rfqFileName(d))}><Download />{T("下载询价单 Excel")}</Button>
          <Button onClick={onNext}>{T("下一步：选供应商")}<ArrowRight className="rtl:rotate-180" /></Button>
        </>}>
        <dl className="grid gap-x-8 gap-y-3 text-[13px] sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">{T("询价单名称")}</dt><dd>{p.snapshot?.title} / {p.snapshot?.titleEn}</dd>
          <dt className="text-muted-foreground">{T("报价截止")}</dt><dd className="num">{p.snapshot?.deadline}</dd>
          <dt className="text-muted-foreground">{T("有效期")}</dt><dd>{p.snapshot?.validity}</dd>
          <dt className="text-muted-foreground">{T("付款条款")}</dt><dd className="max-w-3xl">{p.snapshot?.payment}</dd>
          <dt className="text-muted-foreground">{T("模板")}</dt><dd>{d.rfqTemplate ? d.rfqTemplate.fileName : T("系统默认格式")}</dd>
        </dl>
      </Section>
      {lines}
    </>
  );

  return (
    <>
      <Section title={T("确认询价单内容")} description={T("锁定后询价内容随之固定，之后收到的报价都和这份内容对比。要调整需求项，请回到项目的“询价包”页。")}>
        <div className="grid gap-5">
          {placeholder && <Banner>{T("公司设置里的付款条款还有 “***%” 这样的占位符，锁定前请先到“设置与模板”里改好。")}</Banner>}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={T("询价单名称（中文）")}><Input id="title-cn" value={title.cn} onChange={(e) => setTitle({ ...title, cn: e.target.value })} /></Field>
            <Field label={T("询价单名称（英文，写进 Excel 标题）")}><Input id="title-en" value={title.en} onChange={(e) => setTitle({ ...title, en: e.target.value })} /></Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={!!busy} onClick={suggest}><Sparkles />{T("AI 推荐名称")}</Button>
            <Button variant="secondary" size="sm" disabled={!!busy || !dirty || !title.cn.trim()} onClick={async () => { const r = await run(T("保存名称…"), saveTitle, T("名称已保存")); if (r) setD(r); }}>{T("保存名称")}</Button>
            {dirty && <span className="text-xs text-warn">{T("名称还没保存")}</span>}
          </div>
          <div className="grid gap-4 border-t pt-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-end">
            <Field label={T("询价单编号（可修改，默认按公司编号顺延）")}><Input id="rfq-no" value={rfqNo} onChange={(e) => setRfqNo(e.target.value)} className="num" /></Field>
            <Field label={T("报价截止日期")}><Input id="deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
            <Button size="lg" disabled={!!busy || !d.lines.length} onClick={lock}><Lock />{T("锁定询价单")}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{T("模板：")}{d.rfqTemplate ? T("沿用 {f}", { f: d.rfqTemplate.fileName }) : T("系统默认格式（可在“设置与模板”上传你们的询价单）")}</p>
        </div>
      </Section>
      {lines}
    </>
  );
}

/* ================= suppliers & emails ================= */
function Suppliers({ d, setD, run, busy }: Ctx) {
  const T = useT();
  const invited = new Set(d.invites.map((i) => i.supplierId));
  const matched = d.recommendations.filter((r) => r.match);
  const others = d.recommendations.filter((r) => !r.match);
  // Default pick: up to 3 suppliers we've bought from, plus 1 we never have (a new local option).
  const [sel, setSel] = useState<string[]>(() => {
    const open = matched.filter((r) => !invited.has(r.supplier.id));
    const known = open.filter((r) => !r.isNew).slice(0, 3), fresh = open.filter((r) => r.isNew).slice(0, 1);
    return [...known, ...fresh, ...open.filter((r) => !known.includes(r) && !fresh.includes(r))].slice(0, Math.max(4, known.length + fresh.length)).map((r) => r.supplier.id);
  });
  const [finding, setFinding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [add, setAdd] = useState({ name: "", email: "", contact: "" });
  const cats = useMemo(() => [...new Set(d.lines.map((l) => l.category))], [d.lines]);
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const row = (r: PackageData["recommendations"][number], i: number) => (
    <tr key={r.supplier.id}>
      <td><input type="checkbox" aria-label={T("选择 {s}", { s: r.supplier.name })} disabled={invited.has(r.supplier.id)} checked={invited.has(r.supplier.id) || sel.includes(r.supplier.id)} onChange={() => toggle(r.supplier.id)} /></td>
      <td className="min-w-52">
        <span className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{r.supplier.name}</span>
          {r.match && i < 3 && !r.isNew && <Badge variant="good">{T("推荐")}</Badge>}
          {r.match && r.isNew && <Badge variant="signal">{T("新供应商")}</Badge>}
        </span>
        <span className="sub">{r.supplier.categories.map((c) => T(c)).join(", ")}</span>
      </td>
      <td className="text-xs">{r.supplier.email || <span className="text-warn">{T("没有邮箱")}</span>}<span className="sub">{[r.supplier.contact, r.supplier.phone, r.supplier.city].filter(Boolean).join(", ")}</span></td>
      <td className="text-xs text-muted-foreground">{r.reasons.map(tm).join("; ") || "—"}</td>
      <td>{invited.has(r.supplier.id) ? <Badge variant="info">{T("已生成邮件")}</Badge> : null}</td>
    </tr>
  );
  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(T("添加中…"), () => api<{ supplier: { id: string } }>("/api/suppliers", { body: { ...add, categories: cats } }));
    if (!r) return;
    const nd = await api<PackageData>(`/api/packages/${d.pkg.id}`); setD(nd); setSel([...sel, r.supplier.id]); setAdd({ name: "", email: "", contact: "" });
  }
  const patchInvite = async (id: string, body: Record<string, unknown>) => { const r = await run(T("保存中…"), () => api<PackageData>(`/api/invites/${id}`, { method: "PATCH", body })); if (r) setD(r); };
  return (
    <>
      <Section title={T("选择询价供应商")} description={T("按同类采购次数、报价回复率和评分排序。推荐来自你们自己的供应商库和历史采购记录。")}
        actions={<Button disabled={!!busy || !sel.length} onClick={async () => { const r = await run(T("生成邮件中…"), () => api<PackageData>(`/api/packages/${d.pkg.id}/invites`, { body: { supplierIds: sel } }), T("邮件已生成")); if (r) { setD(r); setSel([]); } }}><Mail />{T("为勾选的 {n} 家生成询价邮件", { n: sel.length })}</Button>}>
        <div className="grid gap-4">
          {!d.recommendations.length ? <Empty>{T("供应商库还是空的。到“供应商库”导入历史采购记录，或在下面直接添加。")}</Empty> : (
            <TableFrame>
              <thead><tr><th className="w-8"></th><th>{T("供应商")}</th><th>{T("联系方式")}</th><th>{T("推荐理由")}</th><th></th></tr></thead>
              <tbody>
                {matched.map(row)}
                {matched.length === 0 && <tr><td colSpan={5} className="text-muted-foreground">{T("没有找到同类供应商。")}</td></tr>}
                {others.length > 0 && <tr><td colSpan={5}><Button variant="link" size="sm" onClick={() => setShowAll(!showAll)}>{showAll ? T("收起") : T("显示其他 {n} 家供应商", { n: others.length })}</Button></td></tr>}
                {showAll && others.map((r) => row(r, 99))}
              </tbody>
            </TableFrame>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setFinding(!finding)}><Globe />{finding ? T("收起网上搜索") : T("网上找本地新供应商")}</Button>
            {!matched.some((r) => r.isNew) && <span className="text-xs text-muted-foreground">{T("建议每次至少加一家没合作过的本地供应商，方便比价。")}</span>}
          </div>
          {finding && (
            <div className="rounded-md border bg-muted/40 p-4">
              <Discover compact categories={cats.length ? cats : ["其他"]} defaultArea={d.project.location} materials={d.lines.map((l) => `${l.name} ${l.spec}`)}
                onAdded={async (ids) => { const nd = await api<PackageData>(`/api/packages/${d.pkg.id}`); setD(nd); setSel([...new Set([...sel, ...ids])]); setFinding(false); }} />
            </div>
          )}
          <form className="flex flex-wrap items-end gap-2 border-t pt-4" onSubmit={quickAdd}>
            <span className="w-full text-xs font-medium text-muted-foreground">{T("添加新供应商")}</span>
            <Input aria-label={T("供应商名称")} placeholder={T("公司名称")} required value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} className="h-8 w-56" />
            <Input aria-label={T("邮箱")} placeholder={T("邮箱")} type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} className="h-8 w-56" />
            <Input aria-label={T("联系人")} placeholder={T("联系人")} value={add.contact} onChange={(e) => setAdd({ ...add, contact: e.target.value })} className="h-8 w-40" />
            <Button type="submit" size="sm" variant="secondary" disabled={!!busy}><Plus />{T("添加")}</Button>
          </form>
        </div>
      </Section>

      {d.invites.length > 0 && (
        <Section title={T("询价邮件（{n}）", { n: d.invites.length })} description={T("一期从你自己的邮箱发送：复制收件人、主题和正文，附上询价单 Excel 发出后，点“标记已发送”。")}
          actions={<Button variant="outline" onClick={async () => download(await rfqBlob(d), rfqFileName(d))}><Download />{T("下载附件：询价单 Excel")}</Button>}>
          <div className="grid gap-4">
            {d.invites.map((inv) => (
              <article key={inv.id} className="rounded-md border">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{inv.supplier.name}</span><span className="text-xs text-muted-foreground">{inv.supplier.email || T("没有邮箱")}</span>
                    {inv.status === "sent" ? <Badge variant="good">{T("已发送 {d}", { d: inv.sentAt?.slice(0, 10) })}</Badge> : <Badge>{T("草稿")}</Badge>}</div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button variant="ghost" size="sm" disabled={!inv.supplier.email} onClick={() => copyText(inv.supplier.email)}><Copy />{T("复制收件人")}</Button>
                    <Button variant="ghost" size="sm" onClick={() => copyText(inv.subject)}><Copy />{T("复制主题")}</Button>
                    <Button variant="ghost" size="sm" onClick={() => copyText(inv.body)}><Copy />{T("复制正文")}</Button>
                    {inv.status === "sent"
                      ? <Button variant="ghost" size="sm" onClick={() => patchInvite(inv.id, { status: "draft" })}>{T("撤销已发送")}</Button>
                      : <Button size="sm" onClick={() => patchInvite(inv.id, { status: "sent" })}>{T("标记已发送")}</Button>}
                    <Button variant="ghost" size="sm" className="text-bad" onClick={async () => { const r = await run(T("删除中…"), () => api<PackageData>(`/api/invites/${inv.id}`, { method: "DELETE" })); if (r) setD(r); }}>{T("删除")}</Button>
                  </div>
                </header>
                <div className="grid gap-2 p-4">
                  <Input aria-label={T("邮件主题")} defaultValue={inv.subject} className="font-medium" onBlur={(e) => { if (e.target.value !== inv.subject) patchInvite(inv.id, { subject: e.target.value }); }} />
                  <Textarea aria-label={T("邮件正文")} className="mail" defaultValue={inv.body} onBlur={(e) => { if (e.target.value !== inv.body) patchInvite(inv.id, { body: e.target.value }); }} />
                </div>
              </article>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
