"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Plus, Search, Trash2, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { readDemand, pool, preloadParsers } from "@/lib/client/files";
import { t, useLang, useT } from "@/lib/i18n/client";
import { familyName } from "@/lib/taxonomy";
import { CATEGORIES } from "@/lib/checklist";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { useBusy, Busy, Drop, toast, PageHeader, Section, TableFrame, Stats, Empty, Loading } from "@/components/app";
import { Discover } from "@/components/Discover";
import type { Supplier } from "@/lib/client/types";
import type { ParsedSupplier, ParsedPrice } from "@/app/api/suppliers/parse/route";
import { FamilySelect, MaterialChips, MaterialSearch, type Material } from "./Materials";

type Row = Supplier & { purchases: number; lastDate: string | null; materials: Material[] };
type PSup = ParsedSupplier & { on: boolean };
type Preview = { fileName: string; fileKind: string; suppliers: PSup[]; prices: ParsedPrice[] };
const KIND: Record<string, string> = { suppliers: "供应商名录", purchases: "采购记录", comparison: "比价表", ledger: "供应商台账", other: "其他文件" };

/** Merge the same supplier found in several parts of a long file. */
function mergeParts(parts: { suppliers: ParsedSupplier[] }[]) {
  const by = new Map<string, ParsedSupplier>();
  for (const p of parts) for (const x of p.suppliers) {
    const k = x.name.trim().toLowerCase();
    const a = by.get(k);
    if (!a) { by.set(k, { ...x, materials: [...x.materials], likely: [...x.likely] }); continue; }
    a.materials.push(...x.materials);
    a.likely = [...new Set([...a.likely, ...x.likely])];
    for (const f of ["country", "city", "contact", "email", "phone", "website", "grade", "notes"] as const) if (!a[f] && x[f]) a[f] = x[f];
    if (a.cooperated !== true && x.cooperated != null) a.cooperated = x.cooperated;
  }
  return [...by.values()];
}
const href = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

export default function Suppliers() {
  const T = useT();
  const [list, setList] = useState<Row[] | null>(null);
  const [records, setRecords] = useState(0);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const lang = useLang();
  const [f, setF] = useState({ name: "", email: "", contact: "", phone: "", city: "", country: "", family: "" });
  const [addFam, setAddFam] = useState<Record<string, string>>({});
  const [pv, setPv] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const { busy, run } = useBusy();
  const load = () => api<{ suppliers: Row[]; priceRecords: number }>("/api/suppliers").then((d) => { setList(d.suppliers); setRecords(d.priceRecords); });
  useEffect(() => { preloadParsers(); load().catch((e) => toast(e.message, true)); }, []);

  async function importFile(files: File[]) {
    const file = files[0]; if (!file) return;
    const r = await run(T("读取 {f}…", { f: file.name }), async (step) => {
      const parts = await readDemand(file);
      const n = parts.length;
      let done = 0;
      step(n > 1 ? t("AI 正在整理供应商：{a}/{n} 部分完成", { a: 0, n }) : t("AI 识别中，大文件约需 1 分钟…"));
      const outs = await pool(parts, 6, async (p) => {
        const o = await api<{ fileKind: string; suppliers: ParsedSupplier[]; prices: ParsedPrice[] }>("/api/suppliers/parse", { body: { fileName: file.name, ...p } });
        done++; if (n > 1) step(t("AI 正在整理供应商：{a}/{n} 部分完成", { a: done, n }));
        return o;
      });
      const suppliers = mergeParts(outs);
      if (!suppliers.length) throw new Error(t("这份文件里没有识别到供应商公司"));
      return { fileKind: outs.find((o) => o.fileKind)?.fileKind || "", suppliers, prices: outs.flatMap((o) => o.prices) };
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
    const r = await run(T("导入中…"), () => api<{ newSuppliers: number; updated: number; records: number; materials: number }>("/api/suppliers/import", { body: { suppliers: on.map(({ on: _, ...s }) => ({ ...s, name: s.name.trim() })), rows } }));
    if (r) { toast(T("新增 {a} 家供应商，更新 {b} 家，记录 {m} 条供应材料、{c} 条价格", { a: r.newSuppliers, b: r.updated, m: r.materials, c: r.records })); setPv(null); load(); }
  }
  async function removeMany(ids: string[]) {
    if (!ids.length || !window.confirm?.(T("删除选中的 {n} 家供应商？它们导入的历史价格也会一起删除。", { n: ids.length }))) return;
    const r = await run(T("删除中…"), () => api<{ deleted: number }>("/api/suppliers", { method: "DELETE", body: { ids } }));
    if (r) { toast(T("已删除 {n} 家", { n: r.deleted })); setPicked([]); load(); }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(T("添加中…"), () => api("/api/suppliers", { body: { ...f, families: f.family ? [f.family] : [] } }), T("已添加"));
    if (r) { setF({ ...f, name: "", email: "", contact: "", phone: "", city: "", country: "" }); load(); }
  }
  async function patch(id: string, body: Record<string, unknown>) {
    const r = await run(T("保存中…"), () => api(`/api/suppliers/${id}`, { method: "PATCH", body }));
    if (r) load();
  }
  async function addMaterial(id: string, family: string) {
    if (!family) return;
    const r = await run(T("保存中…"), () => api(`/api/suppliers/${id}/materials`, { body: { family } }));
    if (r) { setAddFam({ ...addFam, [id]: "" }); load(); }
  }
  async function removeMaterial(id: string, m: Material) {
    const r = await run(T("保存中…"), () => api(`/api/suppliers/${id}/materials`, { method: "DELETE", body: { materialId: m.id } }));
    if (r) load();
  }
  const text = (s: Row) => `${s.name} ${s.city} ${s.country} ${s.email} ${s.materials.map((m) => `${m.item} ${familyName(m.family, "zh")} ${familyName(m.family, "en")}`).join(" ")}`.toLowerCase();
  const shown = (list || []).filter((s) => !q || text(s).includes(q.toLowerCase()));
  const allOn = shown.length > 0 && shown.every((s) => picked.includes(s.id));
  const setSup = (i: number, p: Partial<PSup & { on: boolean }>) => setPv(pv && { ...pv, suppliers: pv.suppliers.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const sourceLabel = (s: Row) => s.source === "web" ? T("网上找到") : s.source === "import" ? T("导入") : s.source === "award" ? T("定标") : null;

  return (
    <>
      <PageHeader title={T("供应商库")} actions={<>{!adding && <Button variant="outline" onClick={() => setAdding(true)}><Plus />{T("添加供应商")}</Button>}</>}>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{T("你自己的供应商通讯录：每家供过什么、报过什么价、怎么联系。导入采购台账后，按材料就能找到供过同类材料的供应商；收到的报价和定标结果也会自动记进来。")}</p>
        <Stats className="mt-4" items={[[T("供应商"), list?.length ?? "–"], [T("有材料记录的"), list ? list.filter((s) => s.materials.length).length : "–"], [T("历史价格记录"), records]]} />
      </PageHeader>

      <Section title={T("按材料找供应商")} description={T("先列出供过这种材料的，再列供过同类材料的（比如找控制电缆时，供过光纤电缆的也会列出来），最后是可能能供的。")}>
        <MaterialSearch />
      </Section>

      {adding && (
        <Section title={T("添加供应商")} actions={<Button variant="ghost" size="icon" aria-label={T("关闭")} onClick={() => setAdding(false)}><X /></Button>}>
          <form className="grid gap-4" onSubmit={add}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={T("公司名称")}><Input id="s-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label={T("主要供应的材料类别")}><FamilySelect id="s-cat" value={f.family} onChange={(v) => setF({ ...f, family: v })} placeholder={T("选择类别（可不选）")} /></Field>
              <Field label={T("邮箱")}><Input id="s-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <Field label={T("联系人")}><Input id="s-contact" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
              <Field label={T("电话")}><Input id="s-phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
              <Field label={T("城市")}><Input id="s-city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
              <Field label={T("国家")}><Input id="s-country" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} /></Field>
            </div>
            <div className="flex items-center gap-3"><Button type="submit" id="s-add" disabled={!!busy}>{T("添加")}</Button><Busy text={busy} /></div>
          </form>
        </Section>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Section title={T("导入采购台账或供应商名录")} description={T("采购台账、供应商资源库、以前做过的比价表都可以，格式不限，多个工作表也行。AI 整理出每家供应商供过的具体材料、联系方式和单价，你核对勾选后再导入。只保存在你自己的账户里。")}>
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
            <thead><tr><th className="w-8"><input type="checkbox" aria-label={T("全选")} checked={pv.suppliers.every((s) => s.on)} onChange={(e) => setPv({ ...pv, suppliers: pv.suppliers.map((s) => ({ ...s, on: e.target.checked })) })} /></th><th>{T("供应商名称")}</th><th>{T("供过 / 能供的材料")}</th><th>{T("联系方式")}</th><th className="n">{T("价格条数")}</th></tr></thead>
            <tbody>{pv.suppliers.map((s, i) => {
              const ps = pv.prices.filter((p) => p.supplier === s.name);
              const exists = (list || []).some((x) => x.name.toLowerCase() === s.name.trim().toLowerCase());
              return (
                <tr key={i} className={s.on ? undefined : "opacity-50"}>
                  <td><input type="checkbox" aria-label={T("导入 {s}", { s: s.name })} checked={s.on} onChange={(e) => setSup(i, { on: e.target.checked })} /></td>
                  <td><Input aria-label={T("供应商名称")} value={s.name} onChange={(e) => { const old = s.name, v = e.target.value; setPv({ ...pv, suppliers: pv.suppliers.map((x, j) => (j === i ? { ...x, name: v } : x)), prices: pv.prices.map((p) => (p.supplier === old ? { ...p, supplier: v } : p)) }); }} className="h-7 w-60 text-[13px]" />{exists && <span className="sub">{T("已在库里，只补充空白信息")}</span>}</td>
                  <td className="min-w-72"><MaterialChips materials={s.materials} likely={s.likely} max={6} />
                    <span className="sub">{[s.cooperated === true ? T("合作过") : s.cooperated === false ? T("未合作") : "", s.grade && T("履约评价 {g}", { g: s.grade }), [s.city, s.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span></td>
                  <td className="text-xs">{[s.contact, s.email, s.phone].filter(Boolean).join(", ") || "—"}</td>
                  <td className="n">{ps.length}</td>
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
        {list === null ? <Loading /> : !list.length ? <div className="p-5"><Empty>{T("还没有供应商。导入历史采购记录最快。")}</Empty></div> : (
          <TableFrame flush className="max-h-[75vh]">
            <thead><tr><th className="w-8"><input type="checkbox" aria-label={T("全选供应商")} checked={allOn} onChange={() => setPicked(allOn ? picked.filter((id) => !shown.some((s) => s.id === id)) : [...new Set([...picked, ...shown.map((s) => s.id)])])} /></th><th>{T("供应商")}</th><th>{T("供过 / 能供的材料")}</th><th>{T("联系方式")}</th><th className="n">{T("采购记录")}</th><th>{T("最近采购")}</th><th>{T("评分（0–5）")}</th><th></th></tr></thead>
            <tbody>{shown.map((s) => (
              <tr key={s.id}>
                <td><input type="checkbox" aria-label={T("选择 {s}", { s: s.name })} checked={picked.includes(s.id)} onChange={() => setPicked(picked.includes(s.id) ? picked.filter((x) => x !== s.id) : [...picked, s.id])} /></td>
                <td className="min-w-52">
                  <span className="font-medium">{s.name}</span>
                  <span className="sub">{[s.city, s.country].filter(Boolean).join(", ")}</span>
                  <span className="mt-1 flex flex-wrap gap-1">{sourceLabel(s) && <Badge variant="outline">{sourceLabel(s)}</Badge>}{!s.purchases && !s.materials.some((m) => m.evidence === "record") && s.source !== "manual" && <Badge variant="signal">{T("未合作")}</Badge>}</span>
                </td>
                <td className="min-w-80">
                  <MaterialChips materials={s.materials} likely={s.likely} onRemove={(m) => removeMaterial(s.id, m)} />
                  <FamilySelect value={addFam[s.id] || ""} onChange={(v) => addMaterial(s.id, v)} placeholder={T("+ 添加能供的类别")} className="mt-1.5 h-7 w-48 text-xs" />
                </td>
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
