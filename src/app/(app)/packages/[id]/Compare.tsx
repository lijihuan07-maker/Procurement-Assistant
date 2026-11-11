"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileWarning, Loader2, ShieldCheck, Trophy } from "lucide-react";
import { api, download, fmt, pct } from "@/lib/client/api";
import { readForAi, pool } from "@/lib/client/files";
import { buildCompare } from "@/lib/client/excel";
import { compute, ruleFlags, LEVEL_ORDER, type QuoteRow } from "@/lib/compare";
import { t, useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Busy, Drop, Level, toast, Section, TableFrame, Stats, Banner, Empty } from "@/components/app";
import type { PackageData } from "@/lib/client/types";
import type { Ctx } from "./shared";

type Up = { name: string; status: "wait" | "read" | "ai" | "done" | "error"; note?: string };

export function Compare({ d, setD, run, busy }: Ctx) {
  const T = useT();
  const s = d.pkg.snapshot!;
  const [ups, setUps] = useState<Up[]>([]);
  const [itemAward, setItemAward] = useState<Record<string, string> | null>(null);
  const c = useMemo(() => compute(s.lines, d.quotes as QuoteRow[], d.pkg.overrides, s.vatRate), [s, d.quotes, d.pkg.overrides]);
  const flags = useMemo(() => [...(d.pkg.review?.flags || []).map((f) => ({ ...f, source: f.source || "AI" })), ...ruleFlags(c, d.quotes as QuoteRow[], s.vatRate, t)].sort((a, b) => (LEVEL_ORDER[a.level] ?? 4) - (LEVEL_ORDER[b.level] ?? 4)), [d.pkg.review, c, d.quotes, s.vatRate]);
  const award = d.pkg.award;
  const cur = s.currency;
  const sent = d.invites.filter((i) => i.status === "sent");
  const received = d.quotes.filter((q) => q.status === "done" && !q.data.isBlank);

  async function upload(files: File[]) {
    if (!files.length) return;
    const list: Up[] = files.map((f) => ({ name: f.name, status: "wait" }));
    setUps(list);
    const upd = (i: number, u: Partial<Up>) => { list[i] = { ...list[i], ...u }; setUps([...list]); };
    let ok = 0;
    await run(T("AI 正在识别 {n} 份报价，每份约 30–90 秒…", { n: files.length }), () => pool(files, 3, async (f, i) => {
      try {
        upd(i, { status: "read" });
        const r = await readForAi(f);
        upd(i, { status: "ai", note: r.note ? t(r.note) : undefined });
        setD(await api<PackageData>(`/api/packages/${d.pkg.id}/quotes`, { body: { fileName: f.name, text: r.text, images: r.images } }));
        upd(i, { status: "done" }); ok++;
      } catch (e) { upd(i, { status: "error", note: e instanceof Error ? e.message : String(e) }); }
    }));
    if (ok) toast(T("报价识别完成，请核对单价"));
  }
  async function setOverride(type: "price" | "factor", no: string, value: number | null, quoteId?: string, previous?: number | null) {
    const r = await run(T("保存中…"), () => api<PackageData>(`/api/packages/${d.pkg.id}/overrides`, { body: { type, no, value, quoteId, previous } }));
    if (r) setD(r);
  }
  async function exportXlsx() {
    const blob = await buildCompare({ c, rfqNo: s.rfqNo, title: s.title, project: s.project, currency: cur, vatRate: s.vatRate, flags, quotes: d.quotes, terms: { payment: s.payment, delivery: t("送至项目现场"), validity: s.validity, priceFixed: t("供货期内单价固定"), deadline: s.deadline }, history: d.history });
    download(blob, `${T("比价表")}_${s.rfqNo}.xlsx`);
  }
  const sorted = [...c.sup].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.total - b.total);
  const complete = c.sup.filter((x) => x.complete);
  const minTotal = complete.length ? Math.min(...complete.map((x) => x.total)) : NaN;
  const maxTotal = Math.max(...c.sup.map((x) => x.total), 1);
  const awardedQuote = (no: string) => award?.items?.[no];
  const upLabel: Record<Up["status"], string> = { wait: "排队中", read: "读取中", ai: "AI 识别中", done: "完成", error: "失败" };

  return (
    <>
      <Section title={T("收集报价")} description={T("把供应商发来的报价文件拖进来，Excel、PDF、扫描件、图片都可以。AI 会对齐到询价单的每一行，统一成不含税价和比价单位。")}>
        <div className="grid gap-4">
          <Stats items={[[T("已发询价"), sent.length], [T("收到报价"), received.length, received.length ? "good" : undefined]]} />
          {!award && <Drop id="quote-files" title={T("上传供应商报价")} hint={T("可以一次选多份文件，最多 3 份同时识别")} accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp" multiple onFiles={upload} disabled={!!busy} />}
          {ups.length > 0 && (
            <ul className="grid gap-1 rounded-md border bg-muted/40 p-3 text-[13px]">
              {ups.map((u, i) => (
                <li key={i} className="flex items-center gap-2">
                  {u.status === "done" ? <CheckCircle2 className="size-4 text-good" /> : u.status === "error" ? <FileWarning className="size-4 text-bad" /> : u.status === "wait" ? <span className="size-4 rounded-full border border-input" /> : <Loader2 className="size-4 animate-spin text-primary" />}
                  <span className="font-medium">{u.name}</span><span className="text-muted-foreground">{T(upLabel[u.status])}{u.note ? ` · ${u.note}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {(d.invites.length > 0 || d.quotes.length > 0) && (
            <TableFrame>
              <thead><tr><th>{T("供应商")}</th><th>{T("询价邮件")}</th><th>{T("报价文件")}</th><th>{T("识别结果")}</th><th></th></tr></thead>
              <tbody>
                {d.invites.map((inv) => {
                  const qs = d.quotes.filter((q) => q.supplierId === inv.supplierId);
                  return (
                    <tr key={inv.id}>
                      <td className="font-medium">{inv.supplier.name}</td>
                      <td>{inv.status === "sent" ? <Badge variant="info">{T("已发送 {d}", { d: inv.sentAt?.slice(0, 10) })}</Badge> : <Badge>{T("未发送")}</Badge>}</td>
                      <td className="text-xs">{qs.map((q) => q.fileName).join(", ") || <Badge variant="warn">{T("未回复")}</Badge>}</td>
                      <td className="text-xs">{qs.map((q) => q.status === "error" ? T("识别失败") : T("{n} 行", { n: q.data.lines.length })).join(", ")}</td>
                      <td className="text-end">{qs.map((q) => <QuoteDelete key={q.id} q={q} setD={setD} run={run} disabled={!!busy || !!award} />)}</td>
                    </tr>
                  );
                })}
                {d.quotes.filter((q) => !d.invites.some((i) => i.supplierId === q.supplierId)).map((q) => (
                  <tr key={q.id}>
                    <td>
                      <span className="font-medium">{q.data.supplier}</span>
                      {d.invites.length > 0 ? (
                        <Select aria-label={T("对应询价名单里的供应商")} value="" disabled={!!busy || !!award} className="mt-1.5 h-7 w-56 text-xs"
                          onChange={async (e) => { if (!e.target.value) return; const r = await run(T("保存中…"), () => api<PackageData>(`/api/quotes/${q.id}`, { method: "PATCH", body: { supplierId: e.target.value } })); if (r) setD(r); }}>
                          <option value="">{T("对应到询价名单里的供应商…")}</option>
                          {d.invites.map((i) => <option key={i.supplierId} value={i.supplierId}>{i.supplier.name}</option>)}
                        </Select>
                      ) : <span className="sub">{T("不在本次询价名单中")}</span>}
                    </td>
                    <td>—</td>
                    <td className="text-xs">{q.fileName}</td>
                    <td className="text-xs">{q.status === "error" ? <span className="text-bad">{q.error}</span> : T("{n} 行", { n: q.data.lines.length })}</td>
                    <td className="text-end"><QuoteDelete q={q} setD={setD} run={run} disabled={!!busy || !!award} /></td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          )}
          <Busy text={busy} />
        </div>
      </Section>

      {c.sup.length > 0 && (
        <>
          <Section title={T("比价概览")} description={T("全部为不含税价，币种 {c}，按询价数量统一计算。", { c: cur })}
            actions={<>
              <Button variant="outline" disabled={!!busy} onClick={async () => { const r = await run(T("AI 正在交叉审查全部报价…"), () => api<PackageData>(`/api/packages/${d.pkg.id}/review`, { body: {} }), T("审查完成")); if (r) setD(r); }}><ShieldCheck />{d.pkg.review ? T("重新 AI 审查") : T("AI 审查风险")}</Button>
              <Button onClick={exportXlsx}><Download />{T("导出比价表 Excel")}</Button>
            </>}>
            <div className="grid gap-4">
              {d.pkg.review?.summary && <Banner tone="info">{d.pkg.review.summary}</Banner>}
              {award && <Banner tone="good"><b className="font-medium">{T("已定标")}</b>: {award.mode === "whole" ? T("整单授予 {s}", { s: c.qs.find((q) => q.id === award.quoteId)?.data.supplier }) : T("分项授予 {n} 项", { n: Object.keys(award.items || {}).length })}{T("，定标价已写入历史价格。")}
                <Button variant="link" size="sm" className="ms-2" onClick={async () => { const r = await run(T("撤销中…"), () => api<PackageData>(`/api/packages/${d.pkg.id}/award`, { body: { mode: "cancel" } })); if (r) setD(r); }}>{T("撤销定标")}</Button></Banner>}
              <div className="overflow-x-auto rounded-md border">
                <table className="data-table">
                  <thead><tr><th className="w-14">{T("排名")}</th><th>{T("供应商")}</th><th className="w-[38%]">{T("合计（不含税）")}</th><th className="n">{T("比最低价")}</th><th>{T("报价项")}</th><th className="n">{T("含税合计")}</th><th></th></tr></thead>
                  <tbody>{sorted.map((x) => {
                    const best = x.rank === 1;
                    return (
                      <tr key={x.q.id} className={cn(best && "[&>td]:bg-signal-soft/50")}>
                        <td className="num font-semibold">{x.rank ? <span className="inline-flex items-center gap-1">{best && <Trophy className="size-3.5 text-signal" />}{x.rank}</span> : <span className="text-xs font-normal text-muted-foreground">—</span>}</td>
                        <td className="min-w-44"><span className="font-medium">{x.q.data.supplier}</span><span className="sub">{[x.q.fileName, x.q.data.quoteNo, x.q.data.date].filter(Boolean).join(", ")}</span>
                          {x.q.data.issues.length > 0 && <span className="dev">{x.q.data.issues.join("; ")}</span>}</td>
                        <td>
                          <div className="num text-[15px] font-semibold">{fmt(x.total, 0)} <span className="text-xs font-normal text-muted-foreground">{cur}</span></div>
                          <div className="mt-1 h-1.5 rounded-full bg-muted"><div className={cn("h-full rounded-full", best ? "bg-signal" : x.complete ? "bg-primary/35" : "bg-bad/40")} style={{ width: `${Math.max(4, (x.total / maxTotal) * 100)}%` }} /></div>
                        </td>
                        <td className="n">{x.diff == null ? <span className="text-xs text-muted-foreground">{T("未报全，不参与排名")}</span> : x.diff < 0.0005 ? <Badge variant="good">{T("最低")}</Badge> : <span className="text-warn">+{pct(x.diff)}</span>}</td>
                        <td><Badge variant={x.complete ? "info" : "bad"}>{T("报 {a}/{b} 项", { a: x.covered, b: c.rows.length })}</Badge></td>
                        <td className="n text-muted-foreground">{fmt(x.gross, 0)}</td>
                        <td className="text-end">{!award && x.complete && <Button size="sm" variant={best ? "default" : "outline"} disabled={!!busy} onClick={async () => { const r = await run(T("定标中…"), () => api<PackageData>(`/api/packages/${d.pkg.id}/award`, { body: { mode: "whole", quoteId: x.q.id } }), T("已整单定标")); if (r) setD(r); }}>{T("整单授予这家")}</Button>}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              {c.sup.length > 1 && isFinite(minTotal) && <p className="text-[13px] text-muted-foreground">{T("每项都取最低价的组合合计：{a} {c}，比总价最低的再低 {b}。", { a: fmt(c.combo), c: cur, b: fmt(minTotal - c.combo) })}</p>}
            </div>
          </Section>

          <Section title={T("逐项比价")} bodyClassName="p-0"
            description={T("绿色 = 该项最低。单价可以直接改，改过的会标出并留下修改记录；单位不同时可以改折算系数。")}
            actions={!award && (itemAward
              ? <><Button variant="ghost" size="sm" onClick={() => setItemAward(null)}>{T("取消")}</Button><Button size="sm" disabled={!!busy} onClick={async () => { const r = await run(T("定标中…"), () => api<PackageData>(`/api/packages/${d.pkg.id}/award`, { body: { mode: "items", items: itemAward } }), T("已分项定标")); if (r) { setD(r); setItemAward(null); } }}>{T("确认分项定标")}</Button></>
              : <Button variant="outline" size="sm" onClick={() => setItemAward(Object.fromEntries(c.rows.map((r) => { const i = r.cells.findIndex((x) => x && r.min != null && Math.abs(x.pCmp - r.min) < 1e-9); return [r.line.no, i >= 0 ? c.qs[i].id : ""]; })))}>{T("分项定标…")}</Button>)}>
            <TableFrame flush className="max-h-[78vh]">
              <thead>
                <tr><th colSpan={4}></th>{c.qs.map((q) => <th key={q.id} colSpan={2} className="sl !text-center !text-[13px] !font-semibold !text-foreground">{q.data.supplier}</th>)}<th colSpan={itemAward ? 4 : 3} className="sl"></th></tr>
                <tr><th>{T("序号")}</th><th>{T("材料 / 询价规格")}</th><th className="n">{T("询价数量")}</th><th>{T("比价单位 / 折算")}</th>{c.qs.map((q) => [<th key={q.id + "p"} className="n sl">{T("单价")}</th>, <th key={q.id + "t"} className="n">{T("合价")}</th>])}<th className="n sl">{T("最低单价")}</th><th className="n">{T("价差")}</th><th>{T("上次成交价")}</th>{itemAward && <th>{T("中标")}</th>}</tr>
              </thead>
              <tbody>
                {c.rows.map((r) => {
                  const h = d.history[r.line.no];
                  return (
                    <tr key={r.line.no}>
                      <td className="num text-muted-foreground">{r.line.no}</td>
                      <td className="min-w-52"><span className="font-medium">{r.line.name}</span><span className="sub">{r.line.spec}</span></td>
                      <td className="n">{fmt(r.line.qty, 1)} <span className="text-xs text-muted-foreground">{r.line.unit}</span></td>
                      <td className="whitespace-nowrap">
                        <span className="font-medium">{r.cUnit}</span> <span className="num text-xs text-muted-foreground">{fmt(r.cmpQty, 1)}</span>
                        {r.cUnit !== r.rUnit && <div className="mt-1 text-xs">1 {r.cUnit} = <input className="k" type="number" step="any" min="0" aria-label={T("序号{n}折算系数", { n: r.line.no })} defaultValue={+(1 / r.cFactor).toFixed(4)} key={r.cFactor} disabled={!!award}
                          onBlur={(e) => { const v = parseFloat(e.target.value); if (Math.abs(v - 1 / r.cFactor) > 1e-9) setOverride("factor", r.line.no, isFinite(v) && v > 0 ? v : null, undefined, 1 / r.cFactor); }} /> {r.line.unit}</div>}
                      </td>
                      {r.cells.map((cell, i) => {
                        const q = c.qs[i];
                        if (!cell) return [<td key={q.id + "p"} className="sl text-xs text-muted-foreground">{T("未报")}</td>, <td key={q.id + "t"}></td>];
                        const low = r.min != null && Math.abs(cell.pCmp - r.min) < 1e-9 && r.cells.filter(Boolean).length > 1;
                        const won = awardedQuote(r.line.no) === q.id;
                        return [
                          <td key={q.id + "p"} className={cn("n sl min-w-48", low && "low", won && "shadow-[inset_3px_0_0_var(--good)] rtl:shadow-[inset_-3px_0_0_var(--good)]")}>
                            <input className={cn("cell pin", cell.edited && "edited")} type="number" step="any" aria-label={T("{s} 序号{n} 单价", { s: q.data.supplier, n: r.line.no })} defaultValue={+cell.pCmp.toFixed(4)} key={cell.pCmp} disabled={!!award}
                              onBlur={(e) => { const v = parseFloat(e.target.value); if (Math.abs(v - cell.pCmp) > 1e-9) setOverride("price", r.line.no, isFinite(v) && v > 0 ? v : null, q.id, cell.pCmp); }} />
                            <span className="sub text-start whitespace-normal">{cell.line.quotedDesc}{cell.line.quotedQty ? ` · ${T("报 {q} {u}", { q: fmt(cell.line.quotedQty, 1), u: cell.line.quotedUnit })}` : ""}</span>
                            {cell.line.deviation && <span className="dev flex items-start gap-1 text-start whitespace-normal"><AlertTriangle className="mt-0.5 size-3 shrink-0" />{cell.line.deviation}</span>}
                            {won && <span className="sub !text-good text-start">{T("中标")}</span>}
                          </td>,
                          <td key={q.id + "t"} className={cn("n", low && "low")}>{fmt(cell.total)}</td>,
                        ];
                      })}
                      <td className="n sl font-medium">{fmt(r.min)}</td>
                      <td className="n">{pct(r.spread)}</td>
                      <td className="text-xs">{h ? <>{fmt(h.unitPrice)} / {h.unit}<span className="sub">{h.supplierName}, {h.date}</span>{r.min != null && h.unit === r.cUnit && <span className={r.min > h.unitPrice ? "dev" : "sub"}>{r.min > h.unitPrice ? T("本次最低价比上次贵 {p}", { p: pct(Math.abs(r.min / h.unitPrice - 1)) }) : T("本次最低价比上次低 {p}", { p: pct(Math.abs(r.min / h.unitPrice - 1)) })}</span>}</> : <span className="text-muted-foreground">—</span>}</td>
                      {itemAward && <td><Select aria-label={T("序号{n}中标供应商", { n: r.line.no })} value={itemAward[r.line.no] || ""} onChange={(e) => setItemAward({ ...itemAward, [r.line.no]: e.target.value })} className="h-7 w-40 text-xs"><option value="">{T("不授予")}</option>{c.qs.map((q, i) => r.cells[i] && <option key={q.id} value={q.id}>{q.data.supplier}</option>)}</Select></td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {(["total", "vat", "gross"] as const).map((k, j) => (
                  <tr key={k}><td colSpan={4} className="text-end">{[T("合计（不含税）"), `VAT ${Math.round(s.vatRate * 100)}%`, T("含税合计")][j]}</td>
                    {c.sup.map((x) => [<td key={x.q.id + "a"} className="sl"></td>, <td key={x.q.id + "b"} className={cn("n", k === "total" && x.rank === 1 && "low")}>{fmt(x[k])}</td>])}
                    <td className="sl"></td><td></td><td></td>{itemAward && <td></td>}</tr>
                ))}
              </tfoot>
            </TableFrame>
          </Section>

          <div className="grid gap-5 xl:grid-cols-2">
            <Section title={T("商务条款")} bodyClassName="p-0" className="mb-0 xl:mb-5">
              <TableFrame flush>
                <thead><tr><th>{T("条款")}</th><th>{T("询价要求")}</th>{received.map((q) => <th key={q.id}>{q.data.supplier}</th>)}</tr></thead>
                <tbody>
                  {([["付款", "payment", s.payment], ["交货", "delivery", t("送至项目现场")], ["交货期", "leadTime", ""], ["有效期", "validity", s.validity], ["价格调整", "priceAdjustment", t("供货期内单价固定")], ["其他", "other", ""]] as const).map(([lab, k, req]) => (
                    <tr key={k}><td className="font-medium whitespace-nowrap">{T(lab)}</td><td className="min-w-44 text-xs text-muted-foreground">{req || "—"}</td>{received.map((q) => <td key={q.id} className="min-w-32 text-xs">{q.data.terms?.[k] || "—"}</td>)}</tr>
                  ))}
                </tbody>
              </TableFrame>
            </Section>
            <Section title={T("风险提示")} actions={<span className="text-xs text-muted-foreground">{d.pkg.review ? T("{n} 条，规则核对 + AI 审查", { n: flags.length }) : T("{n} 条，规则核对", { n: flags.length })}</span>}>
              {flags.length === 0 ? <Empty>{T("没有发现需要特别注意的问题。")}</Empty> : (
                <ul className="grid gap-2">
                  {flags.map((f, i) => (
                    <li key={i} className={cn("rounded-md border border-s-[3px] p-3", f.level === "高" ? "border-s-bad" : f.level === "中" ? "border-s-warn" : f.level === "低" ? "border-s-info" : "border-s-border")}>
                      <div className="flex flex-wrap items-center gap-2"><Level level={f.level} /><Badge variant="outline">{T(f.category)}</Badge><span className="font-medium">{f.title}</span><span className="text-xs text-muted-foreground">{f.source}</span></div>
                      {f.detail && <p className="mt-1 text-[13px] text-muted-foreground">{f.detail}</p>}
                      {f.action && <p className="mt-1 text-[13px]"><span className="font-medium">{T("建议：")}</span>{f.action}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </>
      )}
    </>
  );
}

function QuoteDelete({ q, setD, run, disabled }: { q: PackageData["quotes"][number]; setD: Ctx["setD"]; run: Ctx["run"]; disabled: boolean }) {
  const T = useT();
  return <Button variant="ghost" size="sm" disabled={disabled} onClick={async () => { const r = await run(T("删除中…"), () => api<PackageData>(`/api/quotes/${q.id}`, { method: "DELETE" })); if (r) setD(r); }} aria-label={T("删除 {f}", { f: q.fileName })}>{T("删除")}</Button>;
}
