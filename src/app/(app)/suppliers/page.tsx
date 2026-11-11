"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { readForAi } from "@/lib/client/files";
import { useBusy, Busy, Drop, toast } from "@/components/ui";
import type { Supplier } from "@/lib/client/types";
import { CATEGORIES } from "@/lib/checklist";

type Row = Supplier & { purchases: number; lastDate: string | null };

type PSup = { name: string; categories: string[]; contact: string; email: string; phone: string; city: string; notes: string };
type PPrice = { supplier: string; material: string; spec: string; unit: string; unitPrice: number; currency: string; date: string; kind: string };
type Preview = { fileName: string; fileKind: string; suppliers: (PSup & { on: boolean })[]; prices: PPrice[] };
const KIND: Record<string, string> = { suppliers: "供应商名录", purchases: "采购记录", comparison: "比价表", other: "其他文件" };

export default function Suppliers() {
  const [list, setList] = useState<Row[] | null>(null);
  const [records, setRecords] = useState(0);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ name: "", email: "", contact: "", phone: "", city: "", category: CATEGORIES[0] });
  const [pv, setPv] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const { busy, run } = useBusy();
  const load = () => api<{ suppliers: Row[]; priceRecords: number }>("/api/suppliers").then((d) => { setList(d.suppliers); setRecords(d.priceRecords); });
  useEffect(() => { load().catch((e) => toast(e.message, true)); }, []);

  async function importFile(files: File[]) {
    const file = files[0]; if (!file) return;
    const r = await run("AI 识别中，大文件约需 1 分钟…", async () => {
      const { text, images } = await readForAi(file);
      return api<Omit<Preview, "fileName">>("/api/suppliers/parse", { body: { fileName: file.name, text, images } });
    });
    if (r) {
      const known = new Set((list || []).map((s) => s.name.toLowerCase()));
      setPv({ ...r, fileName: file.name, suppliers: r.suppliers.map((s) => ({ ...s, on: true })) });
      const dup = r.suppliers.filter((s) => known.has(s.name.toLowerCase())).length;
      toast(`识别到 ${r.suppliers.length} 家供应商、${r.prices.length} 条价格${dup ? `，其中 ${dup} 家已在库里（导入时只补充空白信息）` : ""}。请核对后导入`);
    }
  }
  async function confirmImport() {
    if (!pv) return;
    const on = pv.suppliers.filter((s) => s.on && s.name.trim());
    const names = new Map(pv.suppliers.map((s, i) => [i, s.name.trim()]));
    // Prices follow their supplier, including any rename made in the preview.
    const orig = new Map(pv.suppliers.map((s, i) => [s.name, i]));
    const rows = pv.prices.flatMap((p) => { const i = orig.get(p.supplier); return i != null && pv.suppliers[i].on ? [{ ...p, supplier: names.get(i) }] : []; });
    const r = await run("导入中…", () => api<{ newSuppliers: number; updated: number; records: number }>("/api/suppliers/import", { body: { suppliers: on.map(({ on: _, ...s }) => s), rows } }));
    if (r) { toast(`新增 ${r.newSuppliers} 家供应商，更新 ${r.updated} 家，导入 ${r.records} 条价格记录`); setPv(null); load(); }
  }
  async function removeMany(ids: string[]) {
    if (!ids.length || !window.confirm?.(`删除选中的 ${ids.length} 家供应商？它们导入的历史价格也会一起删除。`)) return;
    const r = await run("删除中…", () => api<{ deleted: number }>("/api/suppliers", { method: "DELETE", body: { ids } }));
    if (r) { toast(`已删除 ${r.deleted} 家`); setPicked([]); load(); }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = await run("添加中…", () => api("/api/suppliers", { body: { ...f, categories: [f.category] } }), "已添加");
    if (r) { setF({ ...f, name: "", email: "", contact: "", phone: "", city: "" }); load(); }
  }
  async function patch(id: string, body: Record<string, unknown>) {
    const r = await run("保存中…", () => api(`/api/suppliers/${id}`, { method: "PATCH", body }));
    if (r) load();
  }
  const shown = (list || []).filter((s) => !q || `${s.name} ${s.categories.join(" ")} ${s.city} ${s.email}`.toLowerCase().includes(q.toLowerCase()));
  const allOn = shown.length > 0 && shown.every((s) => picked.includes(s.id));
  const setSup = (i: number, patch: Partial<PSup & { on: boolean }>) => setPv(pv && { ...pv, suppliers: pv.suppliers.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <>
      <div className="page-head">
        <div><h1>供应商库</h1><p>推荐供应商的依据。导入历史采购记录后，询价时会按同类采购次数、报价回复率和评分推荐；定标结果也会自动写回这里。</p></div>
        <div className="stats"><span>供应商 <b>{list?.length ?? "–"}</b></span><span>历史价格记录 <b>{records}</b></span></div>
      </div>
      <div className="grid2">
        <section className="panel">
          <h2>导入供应商和历史价格</h2>
          <p className="small muted" style={{ margin: 0 }}>供应商名录、采购台账、以前做过的比价表都可以，格式不限。AI 先识别出供应商公司、联系方式和单价，你核对勾选后再导入。</p>
          <Drop id="import-file" title="上传文件" hint=".xlsx / .xls / .csv / .pdf" accept=".xlsx,.xls,.xlsm,.csv,.pdf" onFiles={importFile} disabled={!!busy} />
        </section>
        <section className="panel">
          <h2>添加供应商</h2>
          <form className="form" onSubmit={add}>
            <div className="fields">
              <label className="field">公司名称<input id="s-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <label className="field">材料类别<select id="s-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="field">邮箱<input id="s-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
              <label className="field">联系人<input id="s-contact" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></label>
              <label className="field">电话<input id="s-phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
              <label className="field">城市<input id="s-city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></label>
            </div>
            <div className="actions"><button className="primary" disabled={!!busy}>添加</button><Busy text={busy} /></div>
          </form>
        </section>
      </div>
      {pv && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>核对导入内容：{pv.fileName}</h2>
              <p className="small muted" style={{ margin: "4px 0 0" }}>识别为{KIND[pv.fileKind] || "文件"}。取消勾选不是供应商的行，名称可以直接改。价格记录会跟着供应商一起导入。</p>
            </div>
            <div className="actions">
              <button onClick={() => setPv(null)} disabled={!!busy}>放弃</button>
              <button className="primary" disabled={!!busy || !pv.suppliers.some((s) => s.on)} onClick={confirmImport}>导入勾选的 {pv.suppliers.filter((s) => s.on).length} 家</button>
            </div>
          </div>
          <div className="tbl-wrap"><table>
            <thead><tr><th><input type="checkbox" aria-label="全选" checked={pv.suppliers.every((s) => s.on)} onChange={(e) => setPv({ ...pv, suppliers: pv.suppliers.map((s) => ({ ...s, on: e.target.checked })) })} /></th><th>供应商名称</th><th>类别</th><th>联系方式</th><th className="n">价格条数</th><th>价格示例</th></tr></thead>
            <tbody>{pv.suppliers.map((s, i) => {
              const ps = pv.prices.filter((p) => p.supplier === pv.suppliers[i].name || p.supplier === s.name);
              const exists = (list || []).some((x) => x.name.toLowerCase() === s.name.trim().toLowerCase());
              return (
                <tr key={i} style={s.on ? undefined : { opacity: 0.5 }}>
                  <td><input type="checkbox" aria-label={`导入 ${s.name}`} checked={s.on} onChange={(e) => setSup(i, { on: e.target.checked })} /></td>
                  <td><input aria-label="供应商名称" value={s.name} onChange={(e) => { const old = s.name; const v = e.target.value; setPv({ ...pv, suppliers: pv.suppliers.map((x, j) => (j === i ? { ...x, name: v } : x)), prices: pv.prices.map((p) => (p.supplier === old ? { ...p, supplier: v } : p)) }); }} style={{ width: 240, fontSize: 13, padding: "3px 6px" }} />{exists && <span className="sub">已在库里，只补充空白信息</span>}</td>
                  <td className="small">{s.categories.join("、") || "—"}</td>
                  <td className="small">{[s.contact, s.email, s.phone, s.city].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="n">{ps.length}</td>
                  <td className="small">{ps.slice(0, 2).map((p) => `${p.material} ${p.unitPrice} ${p.currency}/${p.unit}${p.kind === "purchase" ? "（采购）" : "（报价）"}`).join("；") || "—"}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </section>
      )}
      <datalist id="cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      <section className="panel">
        <div className="panel-head"><h2>全部供应商</h2>
          <div className="actions">
            {picked.length > 0 && <button className="sm" disabled={!!busy} onClick={() => removeMany(picked)}>删除选中的 {picked.length} 家</button>}<input aria-label="搜索供应商" placeholder="搜索名称、类别、城市…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
          </div>
        </div>
        {list === null ? <Busy text="加载中…" /> : !list.length ? <div className="empty">还没有供应商。导入历史采购记录最快。</div> : (
          <div className="tbl-wrap"><table>
            <thead><tr><th><input type="checkbox" aria-label="全选供应商" checked={allOn} onChange={() => setPicked(allOn ? picked.filter((id) => !shown.some((s) => s.id === id)) : [...new Set([...picked, ...shown.map((s) => s.id)])])} /></th><th>供应商</th><th>类别</th><th>联系方式</th><th className="n">采购记录</th><th>最近采购</th><th>评分（0–5）</th><th></th></tr></thead>
            <tbody>{shown.map((s) => (
              <tr key={s.id}>
                <td><input type="checkbox" aria-label={`选择 ${s.name}`} checked={picked.includes(s.id)} onChange={() => setPicked(picked.includes(s.id) ? picked.filter((x) => x !== s.id) : [...picked, s.id])} /></td>
                <td><b style={{ fontWeight: 500 }}>{s.name}</b>{s.source === "import" && <span className="sub">导入</span>}</td>
                <td className="small"><input aria-label={`${s.name} 类别`} list="cats" defaultValue={s.categories.join("、")} placeholder="类别，多个用顿号隔开" title={`可选：${CATEGORIES.join("、")}`} onBlur={(e) => { const v = e.target.value.split(/[、,，;；]/).map((x) => x.trim()).filter(Boolean); if (v.join("、") !== s.categories.join("、")) patch(s.id, { categories: v }); }} style={{ width: 170, fontSize: 12.5, padding: "3px 6px" }} /></td>
                <td className="small"><input aria-label={`${s.name} 邮箱`} defaultValue={s.email} placeholder="邮箱" onBlur={(e) => e.target.value !== s.email && patch(s.id, { email: e.target.value })} style={{ width: 200, fontSize: 12.5, padding: "3px 6px" }} /><span className="sub">{[s.contact, s.phone, s.city].filter(Boolean).join(" · ")}</span></td>
                <td className="n">{s.purchases}</td>
                <td className="small">{s.lastDate || "—"}</td>
                <td><input aria-label={`${s.name} 评分`} type="number" min="0" max="5" step="0.5" defaultValue={s.rating ?? ""} onBlur={(e) => patch(s.id, { rating: e.target.value === "" ? null : Number(e.target.value) })} style={{ width: 70, fontSize: 12.5, padding: "3px 6px" }} /></td>
                <td><button className="link" onClick={async () => { if (!window.confirm?.(`删除 ${s.name}？`)) return; const r = await run("删除中…", () => api(`/api/suppliers/${s.id}`, { method: "DELETE" })); if (r) load(); }}>删除</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
