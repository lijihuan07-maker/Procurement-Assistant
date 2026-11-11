"use client";
import { useMemo, useState } from "react";
import { api, download, fmt, pct } from "@/lib/client/api";
import { readForAi } from "@/lib/client/files";
import { buildCompare } from "@/lib/client/excel";
import { compute, ruleFlags, LEVEL_ORDER, type QuoteRow } from "@/lib/compare";
import { Busy, Drop, Level, toast } from "@/components/ui";
import type { PackageData } from "@/lib/client/types";
import type { Ctx } from "./shared";

type Up = { name: string; status: "wait" | "read" | "ai" | "done" | "error"; note?: string };

export function Compare({ d, setD, run, busy }: Ctx) {
  const s = d.pkg.snapshot!;
  const [ups, setUps] = useState<Up[]>([]);
  const [itemAward, setItemAward] = useState<Record<string, string> | null>(null);
  const c = useMemo(() => compute(s.lines, d.quotes as QuoteRow[], d.pkg.overrides, s.vatRate), [s, d.quotes, d.pkg.overrides]);
  const flags = useMemo(() => [...(d.pkg.review?.flags || []).map((f) => ({ ...f, source: f.source || "AI" })), ...ruleFlags(c, d.quotes as QuoteRow[], s.vatRate)].sort((a, b) => (LEVEL_ORDER[a.level] ?? 4) - (LEVEL_ORDER[b.level] ?? 4)), [d.pkg.review, c, d.quotes, s.vatRate]);
  const award = d.pkg.award;
  const cur = s.currency;
  const sent = d.invites.filter((i) => i.status === "sent");

  async function upload(files: File[]) {
    if (!files.length) return;
    const list: Up[] = files.map((f) => ({ name: f.name, status: "wait" }));
    setUps(list);
    const upd = (i: number, u: Partial<Up>) => { list[i] = { ...list[i], ...u }; setUps([...list]); };
    let latest: PackageData | null = null, idx = 0;
    const worker = async () => {
      while (idx < files.length) {
        const i = idx++; const f = files[i];
        try {
          upd(i, { status: "read" });
          const r = await readForAi(f);
          upd(i, { status: "ai", note: r.note });
          latest = await api<PackageData>(`/api/packages/${d.pkg.id}/quotes`, { body: { fileName: f.name, text: r.text, images: r.images } });
          setD(latest);
          upd(i, { status: "done" });
        } catch (e) { upd(i, { status: "error", note: e instanceof Error ? e.message : String(e) }); }
      }
    };
    await run(`AI 正在识别 ${files.length} 份报价，每份约 30–90 秒…`, () => Promise.all([worker(), worker()]));
    if (latest) toast("报价识别完成，请核对单价");
  }
  async function setOverride(type: "price" | "factor", no: string, value: number | null, quoteId?: string, previous?: number | null) {
    const r = await run("保存中…", () => api<PackageData>(`/api/packages/${d.pkg.id}/overrides`, { body: { type, no, value, quoteId, previous } }));
    if (r) setD(r);
  }
  async function exportXlsx() {
    const blob = await buildCompare({ c, rfqNo: s.rfqNo, title: s.title, project: s.project, currency: cur, vatRate: s.vatRate, flags, quotes: d.quotes, terms: { payment: s.payment, delivery: "送至项目现场", validity: s.validity, priceFixed: "供货期内单价固定", deadline: s.deadline }, history: d.history });
    download(blob, `比价表_${s.rfqNo}.xlsx`);
  }
  const sorted = [...c.sup].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.total - b.total);
  const minTotal = Math.min(...c.sup.filter((x) => x.complete).map((x) => x.total));
  const awardedQuote = (no: string) => award?.items?.[no];

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>收集报价</h2>
            <p className="small muted" style={{ margin: "4px 0 0" }}>把供应商发来的报价文件拖进来，Excel、PDF、扫描件、图片都可以。AI 会对齐到询价单的每一行，统一成不含税价和比价单位。</p>
          </div>
          <div className="stats"><span>已发询价 <b>{sent.length}</b></span><span>收到报价 <b>{d.quotes.filter((q) => q.status === "done" && !q.data.isBlank).length}</b></span></div>
        </div>
        {!award && <Drop id="quote-files" title="上传供应商报价" hint="可以一次选多份文件" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp" multiple onFiles={upload} disabled={!!busy} />}
        {ups.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 2 }} className="small">
            {ups.map((u, i) => <li key={i}>{u.name} · {u.status === "wait" ? "排队中" : u.status === "read" ? "读取中" : u.status === "ai" ? "AI 识别中" : u.status === "done" ? "完成" : "失败"}{u.note ? ` · ${u.note}` : ""}</li>)}
          </ul>
        )}
        {(d.invites.length > 0 || d.quotes.length > 0) && (
          <div className="tbl-wrap"><table>
            <thead><tr><th>供应商</th><th>询价邮件</th><th>报价文件</th><th>识别结果</th><th></th></tr></thead>
            <tbody>
              {d.invites.map((inv) => {
                const qs = d.quotes.filter((q) => q.supplierId === inv.supplierId);
                return (
                  <tr key={inv.id}>
                    <td>{inv.supplier.name}</td>
                    <td>{inv.status === "sent" ? <span className="chip acc">已发送 {inv.sentAt?.slice(0, 10)}</span> : <span className="chip">未发送</span>}</td>
                    <td className="small">{qs.map((q) => q.fileName).join("、") || <span className="chip warn">未回复</span>}</td>
                    <td className="small">{qs.map((q) => q.status === "error" ? "识别失败" : `${q.data.lines.length} 行`).join("、")}</td>
                    <td>{qs.map((q) => <QuoteDelete key={q.id} q={q} d={d} setD={setD} run={run} disabled={!!busy || !!award} />)}</td>
                  </tr>
                );
              })}
              {d.quotes.filter((q) => !d.invites.some((i) => i.supplierId === q.supplierId)).map((q) => (
                <tr key={q.id}>
                  <td>
                    {q.data.supplier}
                    {d.invites.length > 0 ? (
                      <select aria-label="对应询价名单里的供应商" value="" disabled={!!busy || !!award} style={{ display: "block", marginTop: 4, fontSize: 12, padding: "2px 6px" }}
                        onChange={async (e) => { if (!e.target.value) return; const r = await run("保存中…", () => api<PackageData>(`/api/quotes/${q.id}`, { method: "PATCH", body: { supplierId: e.target.value } })); if (r) setD(r); }}>
                        <option value="">对应到询价名单里的供应商…</option>
                        {d.invites.map((i) => <option key={i.supplierId} value={i.supplierId}>{i.supplier.name}</option>)}
                      </select>
                    ) : <span className="sub">不在本次询价名单中</span>}
                  </td>
                  <td>—</td>
                  <td className="small">{q.fileName}</td>
                  <td className="small">{q.status === "error" ? <span className="dev">{q.error}</span> : `${q.data.lines.length} 行`}</td>
                  <td><QuoteDelete q={q} d={d} setD={setD} run={run} disabled={!!busy || !!award} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      {c.sup.length > 0 && (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>比价概览</h2>
              <div className="actions">
                <button disabled={!!busy} onClick={async () => { const r = await run("AI 正在交叉审查全部报价…", () => api<PackageData>(`/api/packages/${d.pkg.id}/review`, { body: {} }), "审查完成"); if (r) setD(r); }}>{d.pkg.review ? "重新 AI 审查" : "AI 审查风险"}</button>
                <button className="primary" onClick={exportXlsx}>导出比价表 Excel</button>
              </div>
            </div>
            <div className="small muted">全部为不含税价，币种 {cur}，按询价数量统一计算。</div>
            {d.pkg.review?.summary && <div className="banner info">{d.pkg.review.summary}</div>}
            {award && <div className="banner info"><b>已定标</b>：{award.mode === "whole" ? `整单授予 ${c.qs.find((q) => q.id === award.quoteId)?.data.supplier}` : `分项授予 ${Object.keys(award.items || {}).length} 项`}，定标价已写入历史价格。<button className="link" style={{ marginLeft: 8 }} onClick={async () => { const r = await run("撤销中…", () => api<PackageData>(`/api/packages/${d.pkg.id}/award`, { body: { mode: "cancel" } })); if (r) setD(r); }}>撤销定标</button></div>}
            <div className="grid3">
              {sorted.map((x) => (
                <div key={x.q.id} className={"card" + (x.rank === 1 ? " best" : "")}>
                  <div className="small muted mono">{x.rank ? `总价第 ${x.rank} 名` : "未报全，不参与排名"}</div>
                  <h3>{x.q.data.supplier}</h3>
                  <div className="big">{fmt(x.total, 0)}<span className="small muted" style={{ fontFamily: "var(--sans)", marginLeft: 6 }}>{cur} 不含税</span></div>
                  <div className="row">
                    {x.diff != null && (x.diff < 0.0005 ? <span className="chip good">最低</span> : <span className="chip warn">+{pct(x.diff)}</span>)}
                    <span className={"chip " + (x.complete ? "acc" : "bad")}>报 {x.covered}/{c.rows.length} 项</span>
                    <span className="chip">含税 {fmt(x.gross, 0)}</span>
                  </div>
                  <div className="small muted">{x.q.fileName}{x.q.data.quoteNo ? ` · ${x.q.data.quoteNo}` : ""}{x.q.data.date ? ` · ${x.q.data.date}` : ""}</div>
                  {x.q.data.issues.length > 0 && <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{x.q.data.issues.map((t, i) => <li key={i}>{t}</li>)}</ul>}
                  {!award && x.complete && <button className="sm" disabled={!!busy} onClick={async () => { const r = await run("定标中…", () => api<PackageData>(`/api/packages/${d.pkg.id}/award`, { body: { mode: "whole", quoteId: x.q.id } }), "已整单定标"); if (r) setD(r); }}>整单授予这家</button>}
                </div>
              ))}
            </div>
            {c.sup.length > 1 && isFinite(minTotal) && <div className="small muted">每项都取最低价的组合合计：<span className="mono">{fmt(c.combo)}</span> {cur}，比总价最低的再低 <span className="mono">{fmt(minTotal - c.combo)}</span>。</div>}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>逐项比价</h2>
              <div className="actions">
                <span className="small muted">绿色 = 该项最低 · 单价可以直接改，改过的带下划线并记录 · 折算系数可改</span>
                {!award && (itemAward
                  ? <><button className="primary sm" disabled={!!busy} onClick={async () => { const r = await run("定标中…", () => api<PackageData>(`/api/packages/${d.pkg.id}/award`, { body: { mode: "items", items: itemAward } }), "已分项定标"); if (r) { setD(r); setItemAward(null); } }}>确认分项定标</button><button className="sm link" onClick={() => setItemAward(null)}>取消</button></>
                  : <button className="sm" onClick={() => setItemAward(Object.fromEntries(c.rows.map((r) => { const i = r.cells.findIndex((x) => x && r.min != null && Math.abs(x.pCmp - r.min) < 1e-9); return [r.line.no, i >= 0 ? c.qs[i].id : ""]; })))}>分项定标…</button>)}
              </div>
            </div>
            <div className="tbl-wrap"><table>
              <thead>
                <tr><th colSpan={4}></th>{c.qs.map((q) => <th key={q.id} colSpan={2} className="sl" style={{ textAlign: "center", color: "var(--ink)", fontWeight: 700, fontSize: 13 }}>{q.data.supplier}</th>)}<th colSpan={itemAward ? 4 : 3} className="sl"></th></tr>
                <tr><th>序号</th><th>材料 / 询价规格</th><th className="n">询价数量</th><th>比价单位 / 折算</th>{c.qs.map((q) => [<th key={q.id + "p"} className="n sl">单价</th>, <th key={q.id + "t"} className="n">合价</th>])}<th className="n sl">最低单价</th><th className="n">价差</th><th>上次成交价</th>{itemAward && <th>中标</th>}</tr>
              </thead>
              <tbody>
                {c.rows.map((r) => {
                  const h = d.history[r.line.no];
                  return (
                    <tr key={r.line.no}>
                      <td className="mono">{r.line.no}</td>
                      <td style={{ minWidth: 200 }}><b style={{ fontWeight: 500 }}>{r.line.name}</b><span className="sub">{r.line.spec}</span></td>
                      <td className="n">{fmt(r.line.qty, 1)} <span className="small muted">{r.line.unit}</span></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <b className="mono">{r.cUnit}</b> <span className="mono small muted">{fmt(r.cmpQty, 1)}</span>
                        {r.cUnit !== r.rUnit && <div className="small">1 {r.cUnit} = <input className="k" type="number" step="any" min="0" aria-label={`序号${r.line.no}折算系数`} defaultValue={+(1 / r.cFactor).toFixed(4)} key={r.cFactor} disabled={!!award}
                          onBlur={(e) => { const v = parseFloat(e.target.value); if (Math.abs(v - 1 / r.cFactor) > 1e-9) setOverride("factor", r.line.no, isFinite(v) && v > 0 ? v : null, undefined, 1 / r.cFactor); }} /> {r.line.unit}</div>}
                      </td>
                      {r.cells.map((cell, i) => {
                        const q = c.qs[i];
                        if (!cell) return [<td key={q.id + "p"} className="sl small muted">未报</td>, <td key={q.id + "t"}></td>];
                        const low = r.min != null && Math.abs(cell.pCmp - r.min) < 1e-9 && r.cells.filter(Boolean).length > 1;
                        const won = awardedQuote(r.line.no) === q.id;
                        return [
                          <td key={q.id + "p"} className={"n sl" + (low ? " low" : "")} style={{ minWidth: 190, ...(won ? { boxShadow: "inset 3px 0 0 var(--good)" } : {}) }}>
                            <input className={"pin" + (cell.edited ? " edited" : "")} type="number" step="any" aria-label={`${q.data.supplier} 序号${r.line.no} 单价`} defaultValue={+cell.pCmp.toFixed(4)} key={cell.pCmp} disabled={!!award}
                              onBlur={(e) => { const v = parseFloat(e.target.value); if (Math.abs(v - cell.pCmp) > 1e-9) setOverride("price", r.line.no, isFinite(v) && v > 0 ? v : null, q.id, cell.pCmp); }} />
                            <span className="sub" style={{ textAlign: "left" }}>{cell.line.quotedDesc}{cell.line.quotedQty ? ` · 报 ${fmt(cell.line.quotedQty, 1)} ${cell.line.quotedUnit}` : ""}</span>
                            {cell.line.deviation && <span className="dev" style={{ textAlign: "left" }}>⚠ {cell.line.deviation}</span>}
                            {won && <span className="sub" style={{ color: "var(--good)", textAlign: "left" }}>中标</span>}
                          </td>,
                          <td key={q.id + "t"} className={"n" + (low ? " low" : "")}>{fmt(cell.total)}</td>,
                        ];
                      })}
                      <td className="n sl">{fmt(r.min)}</td>
                      <td className="n">{pct(r.spread)}</td>
                      <td className="small">{h ? <>{fmt(h.unitPrice)} / {h.unit}<span className="sub">{h.supplierName} · {h.date}</span>{r.min != null && h.unit === r.cUnit && <span className={r.min > h.unitPrice ? "dev" : "sub"}>{r.min > h.unitPrice ? "本次最低价比上次贵 " : "本次最低价比上次低 "}{pct(Math.abs(r.min / h.unitPrice - 1))}</span>}</> : <span className="muted">—</span>}</td>
                      {itemAward && <td><select aria-label={`序号${r.line.no}中标供应商`} value={itemAward[r.line.no] || ""} onChange={(e) => setItemAward({ ...itemAward, [r.line.no]: e.target.value })}><option value="">不授予</option>{c.qs.map((q, i) => r.cells[i] && <option key={q.id} value={q.id}>{q.data.supplier}</option>)}</select></td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {(["total", "vat", "gross"] as const).map((k, j) => (
                  <tr key={k}><td colSpan={4} style={{ textAlign: "right" }}>{["合计（不含税）", `VAT ${Math.round(s.vatRate * 100)}%`, "含税合计"][j]}</td>
                    {c.sup.map((x) => [<td key={x.q.id + "a"} className="sl"></td>, <td key={x.q.id + "b"} className={"n" + (k === "total" && x.rank === 1 ? " low" : "")}>{fmt(x[k])}</td>])}
                    <td className="sl"></td><td></td><td></td>{itemAward && <td></td>}</tr>
                ))}
              </tfoot>
            </table></div>
          </section>

          <div className="grid2">
            <section className="panel">
              <h2>商务条款</h2>
              <div className="tbl-wrap"><table>
                <thead><tr><th>条款</th><th>询价要求</th>{d.quotes.filter((q) => q.status === "done" && !q.data.isBlank).map((q) => <th key={q.id}>{q.data.supplier}</th>)}</tr></thead>
                <tbody>
                  {([["付款", "payment", s.payment], ["交货", "delivery", "送至项目现场"], ["交货期", "leadTime", ""], ["有效期", "validity", s.validity], ["价格调整", "priceAdjustment", "供货期内单价固定"], ["其他", "other", ""]] as const).map(([lab, k, req]) => (
                    <tr key={k}><td><b>{lab}</b></td><td className="small muted" style={{ minWidth: 180 }}>{req || "—"}</td>{d.quotes.filter((q) => q.status === "done" && !q.data.isBlank).map((q) => <td key={q.id} className="small" style={{ minWidth: 120 }}>{q.data.terms?.[k] || "—"}</td>)}</tr>
                  ))}
                </tbody>
              </table></div>
            </section>
            <section className="panel">
              <div className="panel-head"><h2>风险提示</h2><span className="small muted">{flags.length} 条 · 规则核对{d.pkg.review ? " + AI 审查" : ""}</span></div>
              {flags.length === 0 ? <div className="empty">没有发现需要特别注意的问题。</div> : (
                <ul className="flags">
                  {flags.map((f, i) => (
                    <li key={i} className={"flag l-" + f.level}><div className="stripe" /><div>
                      <div className="t"><Level level={f.level} /><span className="chip">{f.category}</span><b>{f.title}</b><span className="small muted">{f.source}</span></div>
                      {f.detail && <p className="muted">{f.detail}</p>}
                      {f.action && <p className="act">→ {f.action}</p>}
                    </div></li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
      <Busy text={busy} />
    </>
  );
}

function QuoteDelete({ q, d, setD, run, disabled }: { q: PackageData["quotes"][number]; d: PackageData; setD: Ctx["setD"]; run: Ctx["run"]; disabled: boolean }) {
  return <button className="link" disabled={disabled} onClick={async () => { const r = await run("删除中…", () => api<PackageData>(`/api/quotes/${q.id}`, { method: "DELETE" })); if (r) setD(r); }} aria-label={`删除 ${q.fileName}`}>删除{d.quotes.length > 1 ? "" : ""}</button>;
}
