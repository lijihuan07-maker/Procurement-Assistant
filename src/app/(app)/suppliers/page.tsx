"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { sheetRows } from "@/lib/client/files";
import { useBusy, Busy, Drop, toast } from "@/components/ui";
import type { Supplier } from "@/lib/client/types";
import { CATEGORIES } from "@/lib/checklist";

type Row = Supplier & { purchases: number; lastDate: string | null };

/** Header synonyms for purchase-history spreadsheets (Chinese and English). */
const COLS: Record<string, RegExp> = {
  supplier: /供应商|supplier|vendor|厂家|公司/i,
  material: /材料|物资|名称|description|material|item name|品名/i,
  spec: /规格|型号|spec/i,
  unit: /^单位$|unit$|uom/i,
  unitPrice: /单价|unit price|price|rate/i,
  currency: /币种|currency/i,
  date: /日期|date|时间/i,
  category: /类别|category|分类/i,
  email: /邮箱|e-?mail/i,
  contact: /联系人|contact/i,
  phone: /电话|phone|mobile|tel/i,
  city: /城市|city|地区|location/i,
};

function toRows(raw: unknown[][]) {
  const hi = raw.findIndex((r) => r && r.filter((v) => v != null && String(v).trim()).length >= 2 && r.some((v) => COLS.supplier.test(String(v ?? ""))));
  if (hi < 0) throw new Error("没有找到包含“供应商”列的表头");
  const head = raw[hi].map((v) => String(v ?? "").trim());
  const idx: Record<string, number> = {};
  for (const [k, re] of Object.entries(COLS)) { const i = head.findIndex((h, j) => re.test(h) && !Object.values(idx).includes(j)); if (i >= 0) idx[k] = i; }
  const toDate = (v: unknown) => typeof v === "number" ? new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10) : String(v ?? "").trim().replace(/\//g, "-");
  return raw.slice(hi + 1).filter((r) => r && r[idx.supplier] != null && String(r[idx.supplier]).trim()).map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, i] of Object.entries(idx)) o[k] = k === "date" ? toDate(r[i]) : r[i] == null ? "" : r[i];
    return o;
  });
}

export default function Suppliers() {
  const [list, setList] = useState<Row[] | null>(null);
  const [records, setRecords] = useState(0);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ name: "", email: "", contact: "", phone: "", city: "", category: CATEGORIES[0] });
  const { busy, run } = useBusy();
  const load = () => api<{ suppliers: Row[]; priceRecords: number }>("/api/suppliers").then((d) => { setList(d.suppliers); setRecords(d.priceRecords); });
  useEffect(() => { load().catch((e) => toast(e.message, true)); }, []);

  async function importFile(files: File[]) {
    const file = files[0]; if (!file) return;
    const r = await run("导入中…", async () => {
      const rows = toRows(await sheetRows(file));
      return api<{ newSuppliers: number; records: number }>("/api/suppliers/import", { body: { rows } });
    });
    if (r) { toast(`新增 ${r.newSuppliers} 家供应商，导入 ${r.records} 条采购记录`); load(); }
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

  return (
    <>
      <div className="page-head">
        <div><h1>供应商库</h1><p>推荐供应商的依据。导入历史采购记录后，询价时会按同类采购次数、报价回复率和评分推荐；定标结果也会自动写回这里。</p></div>
        <div className="stats"><span>供应商 <b>{list?.length ?? "–"}</b></span><span>历史价格记录 <b>{records}</b></span></div>
      </div>
      <div className="grid2">
        <section className="panel">
          <h2>导入历史采购记录</h2>
          <p className="small muted" style={{ margin: 0 }}>Excel 每行一条采购记录，至少要有“供应商”列。能识别的列：供应商、材料名称、规格、单位、单价、币种、日期、类别、邮箱、联系人、电话、城市。没有类别列时按材料名称自动归类。</p>
          <Drop id="import-file" title="上传采购记录 Excel" hint=".xlsx / .xls / .csv" accept=".xlsx,.xls,.csv" onFiles={importFile} disabled={!!busy} />
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
      <section className="panel">
        <div className="panel-head"><h2>全部供应商</h2><input aria-label="搜索供应商" placeholder="搜索名称、类别、城市…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} /></div>
        {list === null ? <Busy text="加载中…" /> : !list.length ? <div className="empty">还没有供应商。导入历史采购记录最快。</div> : (
          <div className="tbl-wrap"><table>
            <thead><tr><th>供应商</th><th>类别</th><th>联系方式</th><th className="n">采购记录</th><th>最近采购</th><th>评分（0–5）</th><th></th></tr></thead>
            <tbody>{shown.map((s) => (
              <tr key={s.id}>
                <td><b style={{ fontWeight: 500 }}>{s.name}</b>{s.source === "import" && <span className="sub">导入</span>}</td>
                <td className="small">{s.categories.join("、")}</td>
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
