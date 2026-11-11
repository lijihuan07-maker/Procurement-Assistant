"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Plus, Search, Trash2, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { readForAi, preloadParsers } from "@/lib/client/files";
import { useT } from "@/lib/i18n/client";
import { CATEGORIES } from "@/lib/checklist";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { useBusy, Busy, Drop, toast, PageHeader, Section, TableFrame, Stats, Empty, Loading } from "@/components/app";
import { Discover } from "@/components/Discover";
import type { Supplier } from "@/lib/client/types";

type Row = Supplier & { purchases: number; lastDate: string | null };
type PSup = { name: string; categories: string[]; contact: string; email: string; phone: string; city: string; notes: string };
type PPrice = { supplier: string; material: string; spec: string; unit: string; unitPrice: number; currency: string; date: string; kind: string };
type Preview = { fileName: string; fileKind: string; suppliers: (PSup & { on: boolean })[]; prices: PPrice[] };
const KIND: Record<string, string> = { suppliers: "供应商名录", purchases: "采购记录", comparison: "比价表", other: "其他文件" };
const href = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

export default function Suppliers() {
  const T = useT();
  const [list, setList] = useState<Row[] | null>(null);
  const [records, setRecords] = useState(0);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", email: "", contact: "", phone: "", city: "", category: CATEGORIES[0] });
  const [pv, setPv] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const { busy, run } = useBusy();
  const load = () => api<{ suppliers: Row[]; priceRecords: number }>("/api/suppliers").then((d) => { setList(d.suppliers); setRecords(d.priceRecords); });
  useEffect(() => { preloadParsers(); load().catch((e) => toast(e.message, true)); }, []);

  async function importFile(files: File[]) {
    const file = files[0]; if (!file) return;
    const r = await run(T("AI 识别中，大文件约需 1 分钟…"), async () => {
      const { text, images } = await readForAi(file);
      return api<Omit<Preview, "fileName">>("/api/suppliers/parse", { body: { fileName: file.name, text, images } });
    });
    if (r) {
      const known = new Set((list || []).map((s) => s.name.toLowerCase()));
      setPv({ ...r, fileName: file.name, suppliers: r.suppliers.map((s) => ({ ...s, on: true })) });
      const dup = r.suppliers.filter((s) => known.has(s.name.toLowerCase())).length;
      toast(dup ? T("识别到 {a} 家供应商、{b} 条价格，其中 {c} 家已在库里（导入时只补充空白信息）。请核对后导入", { a: r.suppliers.length, b: r.prices.length, c: dup }) : T("识别到 {a} 家供应商、{b} 条价格。请核对后导入", { a: r.suppliers.length, b: r.prices.length }));
    }
  }
  async function confirmImport() {
    if (!pv) return;
    const on = pv.suppliers.filter((s) => s.on && s.name.trim());
    const onNames = new Set(on.map((s) => s.name));
    const rows = pv.prices.filter((p) => onNames.has(p.supplier)).map((p) => ({ ...p, supplier: p.supplier.trim() }));
    const r = await run(T("导入中…"), () => api<{ newSuppliers: number; updated: number; records: number }>("/api/suppliers/import", { body: { suppliers: on.map(({ on: _, ...s }) => ({ ...s, name: s.name.trim() })), rows } }));
    if (r) { toast(T("新增 {a} 家供应商，更新 {b} 家，导入 {c} 条价格记录", { a: r.newSuppliers, b: r.updated, c: r.records })); setPv(null); load(); }
  }
  async function removeMany(ids: string[]) {
    if (!ids.length || !window.confirm?.(T("删除选中的 {n} 家供应商？它们导入的历史价格也会一起删除。", { n: ids.length }))) return;
    const r = await run(T("删除中…"), () => api<{ deleted: number }>("/api/suppliers", { method: "DELETE", body: { ids } }));
    if (r) { toast(T("已删除 {n} 家", { n: r.deleted })); setPicked([]); load(); }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(T("添加中…"), () => api("/api/suppliers", { body: { ...f, categories: [f.category] } }), T("已添加"));
    if (r) { setF({ ...f, name: "", email: "", contact: "", phone: "", city: "" }); load(); }
  }
  async function patch(id: string, body: Record<string, unknown>) {
    const r = await run(T("保存中…"), () => api(`/api/suppliers/${id}`, { method: "PATCH", body }));
    if (r) load();
  }
  const shown = (list || []).filter((s) => !q || `${s.name} ${s.categories.map((c) => `${c} ${T(c)}`).join(" ")} ${s.city} ${s.email}`.toLowerCase().includes(q.toLowerCase()));
  const allOn = shown.length > 0 && shown.every((s) => picked.includes(s.id));
  const setSup = (i: number, p: Partial<PSup & { on: boolean }>) => setPv(pv && { ...pv, suppliers: pv.suppliers.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const sourceLabel = (s: Row) => s.source === "web" ? T("网上找到") : s.source === "import" ? T("导入") : s.source === "award" ? T("定标") : null;

  return (
    <>
      <PageHeader title={T("供应商库")} actions={<>{!adding && <Button variant="outline" onClick={() => setAdding(true)}><Plus />{T("添加供应商")}</Button>}</>}>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{T("推荐供应商的依据。导入历史采购记录后，询价时会按同类采购次数、报价回复率和评分推荐；定标结果也会自动写回这里。")}</p>
        <Stats className="mt-4" items={[[T("供应商"), list?.length ?? "–"], [T("历史价格记录"), records]]} />
      </PageHeader>

      {adding && (
        <Section title={T("添加供应商")} actions={<Button variant="ghost" size="icon" aria-label={T("关闭")} onClick={() => setAdding(false)}><X /></Button>}>
          <form className="grid gap-4" onSubmit={add}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={T("公司名称")}><Input id="s-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label={T("材料类别")}><Select id="s-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{T(c)}</option>)}</Select></Field>
              <Field label={T("邮箱")}><Input id="s-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <Field label={T("联系人")}><Input id="s-contact" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
              <Field label={T("电话")}><Input id="s-phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
              <Field label={T("城市")}><Input id="s-city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
            </div>
            <div className="flex items-center gap-3"><Button type="submit" id="s-add" disabled={!!busy}>{T("添加")}</Button><Busy text={busy} /></div>
          </form>
        </Section>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Section title={T("导入供应商和历史价格")} description={T("供应商名录、采购台账、以前做过的比价表都可以，格式不限。AI 先识别出供应商公司、联系方式和单价，你核对勾选后再导入。")}>
          <Drop id="import-file" title={T("上传文件")} hint=".xlsx / .xls / .csv / .pdf" accept=".xlsx,.xls,.xlsm,.csv,.pdf" onFiles={importFile} disabled={!!busy} />
          {!adding && <Busy text={busy} className="mt-3" />}
        </Section>
        <Section title={T("从网上找本地供应商")} description={T("选材料类别和地区，AI 联网搜索当地的厂家、经销商和门店，带回电话、网址等信息。核对后勾选加入，会标记为“网上找到、未合作”，询价时作为新供应商推荐。")}>
          <Discover categories={CATEGORIES} onAdded={() => load()} />
        </Section>
      </div>

      {pv && (
        <Section title={T("核对导入内容：{f}", { f: pv.fileName })} description={T("识别为{k}。取消勾选不是供应商的行，名称可以直接改。价格记录会跟着供应商一起导入。", { k: T(KIND[pv.fileKind] || "文件") })}
          actions={<><Button variant="ghost" onClick={() => setPv(null)} disabled={!!busy}>{T("放弃")}</Button><Button disabled={!!busy || !pv.suppliers.some((s) => s.on)} onClick={confirmImport}>{T("导入勾选的 {n} 家", { n: pv.suppliers.filter((s) => s.on).length })}</Button></>} bodyClassName="p-0">
          <TableFrame flush>
            <thead><tr><th className="w-8"><input type="checkbox" aria-label={T("全选")} checked={pv.suppliers.every((s) => s.on)} onChange={(e) => setPv({ ...pv, suppliers: pv.suppliers.map((s) => ({ ...s, on: e.target.checked })) })} /></th><th>{T("供应商名称")}</th><th>{T("类别")}</th><th>{T("联系方式")}</th><th className="n">{T("价格条数")}</th><th>{T("价格示例")}</th></tr></thead>
            <tbody>{pv.suppliers.map((s, i) => {
              const ps = pv.prices.filter((p) => p.supplier === s.name);
              const exists = (list || []).some((x) => x.name.toLowerCase() === s.name.trim().toLowerCase());
              return (
                <tr key={i} className={s.on ? undefined : "opacity-50"}>
                  <td><input type="checkbox" aria-label={T("导入 {s}", { s: s.name })} checked={s.on} onChange={(e) => setSup(i, { on: e.target.checked })} /></td>
                  <td><Input aria-label={T("供应商名称")} value={s.name} onChange={(e) => { const old = s.name, v = e.target.value; setPv({ ...pv, suppliers: pv.suppliers.map((x, j) => (j === i ? { ...x, name: v } : x)), prices: pv.prices.map((p) => (p.supplier === old ? { ...p, supplier: v } : p)) }); }} className="h-7 w-60 text-[13px]" />{exists && <span className="sub">{T("已在库里，只补充空白信息")}</span>}</td>
                  <td className="text-xs">{s.categories.map((c) => T(c)).join(", ") || "—"}</td>
                  <td className="text-xs">{[s.contact, s.email, s.phone, s.city].filter(Boolean).join(", ") || "—"}</td>
                  <td className="n">{ps.length}</td>
                  <td className="text-xs text-muted-foreground">{ps.slice(0, 2).map((p) => `${p.material} ${p.unitPrice} ${p.currency}/${p.unit} (${T(p.kind === "purchase" ? "采购" : "报价")})`).join("; ") || "—"}</td>
                </tr>
              );
            })}</tbody>
          </TableFrame>
        </Section>
      )}

      <Section title={T("全部供应商")} bodyClassName="p-0"
        actions={<>
          {picked.length > 0 && <Button variant="outline" size="sm" className="text-bad" disabled={!!busy} onClick={() => removeMany(picked)}><Trash2 />{T("删除选中的 {n} 家", { n: picked.length })}</Button>}
          <div className="relative"><Search className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={T("搜索供应商")} placeholder={T("搜索名称、类别、城市…")} value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-64 ps-8 text-xs" /></div>
        </>}>
        <datalist id="cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        {list === null ? <Loading /> : !list.length ? <div className="p-5"><Empty>{T("还没有供应商。导入历史采购记录最快。")}</Empty></div> : (
          <TableFrame flush className="max-h-[75vh]">
            <thead><tr><th className="w-8"><input type="checkbox" aria-label={T("全选供应商")} checked={allOn} onChange={() => setPicked(allOn ? picked.filter((id) => !shown.some((s) => s.id === id)) : [...new Set([...picked, ...shown.map((s) => s.id)])])} /></th><th>{T("供应商")}</th><th>{T("类别")}</th><th>{T("联系方式")}</th><th className="n">{T("采购记录")}</th><th>{T("最近采购")}</th><th>{T("评分（0–5）")}</th><th></th></tr></thead>
            <tbody>{shown.map((s) => (
              <tr key={s.id}>
                <td><input type="checkbox" aria-label={T("选择 {s}", { s: s.name })} checked={picked.includes(s.id)} onChange={() => setPicked(picked.includes(s.id) ? picked.filter((x) => x !== s.id) : [...picked, s.id])} /></td>
                <td className="min-w-52">
                  <span className="font-medium">{s.name}</span>
                  <span className="mt-1 flex flex-wrap gap-1">{sourceLabel(s) && <Badge variant="outline">{sourceLabel(s)}</Badge>}{!s.purchases && s.source !== "manual" && <Badge variant="signal">{T("未合作")}</Badge>}</span>
                </td>
                <td><Input aria-label={T("{s} 类别", { s: s.name })} list="cats" defaultValue={s.categories.join("、")} placeholder={T("类别，多个用顿号隔开")} title={T("可选：{l}", { l: CATEGORIES.map((c) => T(c)).join(", ") })} onBlur={(e) => { const v = e.target.value.split(/[、,，;；]/).map((x) => x.trim()).filter(Boolean); if (v.join("、") !== s.categories.join("、")) patch(s.id, { categories: v }); }} className="h-7 w-44 text-xs" /></td>
                <td className="text-xs">
                  <Input aria-label={T("{s} 邮箱", { s: s.name })} defaultValue={s.email} placeholder={T("邮箱")} onBlur={(e) => e.target.value !== s.email && patch(s.id, { email: e.target.value })} className="h-7 w-52 text-xs" />
                  <span className="sub">{[s.contact, s.phone, s.city].filter(Boolean).join(", ")}{s.website && <> <a href={href(s.website)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5">{T("网址")}<ExternalLink className="size-3" /></a></>}</span>
                </td>
                <td className="n">{s.purchases}</td>
                <td className="num text-xs">{s.lastDate || "—"}</td>
                <td><Input aria-label={T("{s} 评分", { s: s.name })} type="number" min="0" max="5" step="0.5" defaultValue={s.rating ?? ""} onBlur={(e) => patch(s.id, { rating: e.target.value === "" ? null : Number(e.target.value) })} className="h-7 w-16 text-xs" /></td>
                <td className="text-end"><Button variant="ghost" size="sm" onClick={async () => { if (!window.confirm?.(T("删除 {s}？", { s: s.name }))) return; const r = await run(T("删除中…"), () => api(`/api/suppliers/${s.id}`, { method: "DELETE" })); if (r) load(); }}>{T("删除")}</Button></td>
              </tr>
            ))}</tbody>
          </TableFrame>
        )}
      </Section>
    </>
  );
}
