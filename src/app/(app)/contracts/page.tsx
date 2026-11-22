"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, FilePlus2, Pencil, Search, X } from "lucide-react";
import { api, download, fmt } from "@/lib/client/api";
import { readDemand, pool, preloadParsers } from "@/lib/client/files";
import { t, useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useBusy, Busy, Drop, toast, PageHeader, Section, TableFrame, Stats, Empty, Loading } from "@/components/app";

type Contract = {
  id: string; contractNo: string; title: string; supplierId: string | null; supplierName: string; projectId: string | null; projectName: string; project: string;
  packageId: string | null; signDate: string; amount: number; currency: string; taxIncluded: boolean; paid: number; paymentTerms: string; deliveryDate: string; status: string; notes: string;
};
type Data = { contracts: Contract[]; projects: { id: string; name: string }[]; suppliers: { id: string; name: string }[] };
type Draft = Omit<Contract, "id" | "project" | "packageId"> & { id?: string };
type Parsed = Partial<Draft> & { on: boolean };

const STATUS: Record<string, [string, "warn" | "info" | "good" | "default"]> = {
  pending: ["待签订", "warn"], active: ["执行中", "info"], completed: ["已完成", "good"], terminated: ["已终止", "default"],
};
const today = () => new Date().toISOString().slice(0, 10);
const empty = (): Draft => ({ contractNo: "", title: "", supplierId: null, supplierName: "", projectId: null, projectName: "", signDate: today(), amount: 0, currency: "SAR", taxIncluded: true, paid: 0, paymentTerms: "", deliveryDate: "", status: "active", notes: "" });

export default function Contracts() {
  const T = useT();
  const [d, setD] = useState<Data | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [project, setProject] = useState("");
  const [pv, setPv] = useState<{ fileName: string; rows: Parsed[] } | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => { preloadParsers(); api<Data>("/api/contracts").then(setD).catch((e) => toast(e.message, true)); }, []);

  const shown = useMemo(() => (d?.contracts || []).filter((c) =>
    (!status || c.status === status) && (!project || (project === "-" ? !c.project : c.project === project)) &&
    (!q || `${c.contractNo} ${c.title} ${c.supplierName} ${c.project} ${c.notes}`.toLowerCase().includes(q.toLowerCase()))), [d, q, status, project]);
  if (!d) return <Loading />;

  // Totals per currency, so SAR and CNY are never added together.
  const byCur = new Map<string, { amount: number; paid: number }>();
  for (const c of shown.filter((x) => x.status !== "terminated")) { const v = byCur.get(c.currency || "—") || { amount: 0, paid: 0 }; v.amount += c.amount; v.paid += c.paid; byCur.set(c.currency || "—", v); }
  const main = [...byCur.entries()].sort((a, b) => b[1].amount - a[1].amount)[0];
  const projectNames = [...new Set(d.contracts.map((c) => c.project).filter(Boolean))].sort();
  const overdue = (c: Contract) => c.status === "active" && c.deliveryDate && c.deliveryDate < today();

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!edit) return;
    const { id, ...body } = edit;
    const r = await run(T("保存中…"), () => id ? api<Data>(`/api/contracts/${id}`, { method: "PATCH", body }) : api<Data>("/api/contracts", { body }), T("已保存"));
    if (r) { setD(r); setEdit(null); }
  }
  async function remove(c: Contract) {
    if (!window.confirm?.(T("删除合同 {n}？", { n: c.contractNo || c.title || c.supplierName }))) return;
    const r = await run(T("删除中…"), () => api<Data>(`/api/contracts/${c.id}`, { method: "DELETE" }));
    if (r) setD(r);
  }
  async function importFile(files: File[]) {
    const file = files[0]; if (!file) return;
    const r = await run(T("读取 {f}…", { f: file.name }), async (step) => {
      const parts = await readDemand(file);
      let done = 0;
      const outs = await pool(parts, 6, async (p) => {
        const o = await api<{ contracts: Partial<Draft>[] }>("/api/contracts/parse", { body: { fileName: file.name, ...p } });
        done++; step(t("AI 正在识别合同：{a}/{n} 部分完成", { a: done, n: parts.length }));
        return o.contracts;
      });
      const rows = outs.flat();
      if (!rows.length) throw new Error(t("这份文件里没有识别到合同"));
      return rows;
    });
    if (r) { setPv({ fileName: file.name, rows: r.map((x) => ({ ...x, on: true })) }); toast(T("识别到 {n} 份合同，请核对后导入", { n: r.length })); }
  }
  async function confirmImport() {
    if (!pv) return;
    const rows = pv.rows.filter((x) => x.on).map(({ on: _, ...x }) => x);
    const r = await run(T("导入中…"), () => api<Data & { added: number; updated: number }>("/api/contracts/import", { body: { contracts: rows } }));
    if (r) { setD(r); setPv(null); toast(T("新增 {a} 份合同，更新 {b} 份", { a: r.added, b: r.updated })); }
  }
  async function exportXlsx() {
    const m = await import("exceljs");
    const ExcelJS = ((m as unknown as { default?: typeof m }).default ?? m) as typeof m;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(T("合同台账"));
    const cols: [string, number][] = [[T("合同编号"), 18], [T("合同名称"), 32], [T("供应商"), 30], [T("项目"), 22], [T("签订日期"), 12], [T("合同金额"), 15], [T("币种"), 8], [T("含税"), 7], [T("已付金额"), 15], [T("未付金额"), 15], [T("付款条件"), 30], [T("交货日期"), 12], [T("状态"), 10], [T("备注"), 30]];
    ws.columns = cols.map(([header, width]) => ({ header, width }));
    ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF0F4" } };
    for (const c of shown) ws.addRow([c.contractNo, c.title, c.supplierName, c.project, c.signDate, c.amount, c.currency, c.taxIncluded ? T("是") : T("否"), c.paid, c.amount - c.paid, c.paymentTerms, c.deliveryDate, T(STATUS[c.status]?.[0] || c.status), c.notes]);
    for (const k of [6, 9, 10]) ws.getColumn(k).numFmt = "#,##0.00";
    ws.views = [{ state: "frozen", ySplit: 1 }];
    download(new Blob([await wb.xlsx.writeBuffer()]), `${T("合同台账")}_${today()}.xlsx`);
  }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setEdit(edit && { ...edit, [k]: v });

  return (
    <>
      <PageHeader title={T("合同台账")}
        actions={<>
          <Busy text={busy} />
          <Drop compact id="contract-file" title={T("导入合同台账")} hint="" accept=".xlsx,.xls,.xlsm,.csv,.pdf" onFiles={importFile} disabled={!!busy} />
          <Button variant="outline" onClick={exportXlsx} disabled={!shown.length}><Download />{T("导出 Excel")}</Button>
          <Button onClick={() => setEdit(empty())}><FilePlus2 />{T("新建合同")}</Button>
        </>}>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{T("记录每份采购合同的金额、付款和交货。定标后会自动生成一份“待签订”的合同；已有的台账可以直接导入。")}</p>
        <Stats className="mt-4" items={[
          [T("合同"), shown.length],
          [T("执行中"), shown.filter((c) => c.status === "active").length],
          [T("合同金额"), main ? `${fmt(main[1].amount, 0)} ${main[0]}` : "–"],
          [T("未付"), main ? `${fmt(main[1].amount - main[1].paid, 0)} ${main[0]}` : "–", main && main[1].amount - main[1].paid > 0 ? "warn" : undefined],
          [T("逾期未交货"), shown.filter(overdue).length, shown.some(overdue) ? "warn" : undefined],
        ]} />
        {byCur.size > 1 && <p className="mt-2 text-xs text-muted-foreground">{T("其他币种：")}{[...byCur.entries()].filter(([k]) => k !== main?.[0]).map(([k, v]) => `${fmt(v.amount, 0)} ${k}`).join("; ")}</p>}
      </PageHeader>

      {edit && (
        <Section title={edit.id ? T("编辑合同") : T("新建合同")} actions={<Button variant="ghost" size="icon" aria-label={T("关闭")} onClick={() => setEdit(null)}><X /></Button>}>
          <form className="grid gap-4" onSubmit={save}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={T("合同编号")}><Input id="ct-no" value={edit.contractNo} onChange={(e) => set("contractNo", e.target.value)} /></Field>
              <Field label={T("合同名称")} className="lg:col-span-2"><Input id="ct-title" value={edit.title} onChange={(e) => set("title", e.target.value)} placeholder={T("例如：室外给水 HDPE 管材采购")} /></Field>
              <Field label={T("状态")}><Select id="ct-status" value={edit.status} onChange={(e) => set("status", e.target.value)}>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{T(l)}</option>)}</Select></Field>
              <Field label={T("供应商")} className="lg:col-span-2"><Input id="ct-supplier" list="ct-suppliers" value={edit.supplierName} onChange={(e) => { const v = e.target.value; setEdit({ ...edit, supplierName: v, supplierId: d.suppliers.find((s) => s.name === v)?.id || null }); }} /></Field>
              <Field label={T("项目")} className="lg:col-span-2">
                <Input id="ct-project" list="ct-projects" value={edit.projectId ? d.projects.find((p) => p.id === edit.projectId)?.name || edit.projectName : edit.projectName}
                  onChange={(e) => { const v = e.target.value; const p = d.projects.find((x) => x.name === v); setEdit({ ...edit, projectName: v, projectId: p?.id || null }); }} />
              </Field>
              <Field label={T("签订日期")}><Input id="ct-sign" type="date" value={edit.signDate} onChange={(e) => set("signDate", e.target.value)} /></Field>
              <Field label={T("合同金额")}><Input id="ct-amount" type="number" step="any" min="0" value={edit.amount || ""} onChange={(e) => set("amount", Number(e.target.value))} className="num" /></Field>
              <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                <Field label={T("币种")}><Input id="ct-cur" value={edit.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></Field>
                <label className="flex h-9 items-center gap-1.5 text-[13px]"><input type="checkbox" checked={edit.taxIncluded} onChange={(e) => set("taxIncluded", e.target.checked)} />{T("含税")}</label>
              </div>
              <Field label={T("已付金额")}><Input id="ct-paid" type="number" step="any" min="0" value={edit.paid || ""} onChange={(e) => set("paid", Number(e.target.value))} className="num" /></Field>
              <Field label={T("交货日期")}><Input id="ct-delivery" type="date" value={edit.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} /></Field>
              <Field label={T("付款条件")} className="sm:col-span-2 lg:col-span-3"><Input id="ct-pay" value={edit.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} /></Field>
            </div>
            <Field label={T("备注")}><Textarea id="ct-notes" rows={2} value={edit.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
            <datalist id="ct-suppliers">{d.suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
            <datalist id="ct-projects">{d.projects.map((p) => <option key={p.id} value={p.name} />)}</datalist>
            <div className="flex items-center gap-3"><Button type="submit" id="ct-save" disabled={!!busy}>{T("保存")}</Button><Button variant="ghost" onClick={() => setEdit(null)}>{T("取消")}</Button></div>
          </form>
        </Section>
      )}

      {pv && (
        <Section title={T("核对导入内容：{f}", { f: pv.fileName })} description={T("取消勾选不需要的行。合同编号和供应商都相同的，会更新已有合同，不会重复。")} bodyClassName="p-0"
          actions={<><Button variant="ghost" onClick={() => setPv(null)} disabled={!!busy}>{T("放弃")}</Button><Button disabled={!!busy || !pv.rows.some((x) => x.on)} onClick={confirmImport}>{T("导入勾选的 {n} 份", { n: pv.rows.filter((x) => x.on).length })}</Button></>}>
          <TableFrame flush>
            <thead><tr><th className="w-8"><input type="checkbox" aria-label={T("全选")} checked={pv.rows.every((x) => x.on)} onChange={(e) => setPv({ ...pv, rows: pv.rows.map((x) => ({ ...x, on: e.target.checked })) })} /></th><th>{T("合同编号")}</th><th>{T("合同名称")}</th><th>{T("供应商")}</th><th>{T("项目")}</th><th>{T("签订日期")}</th><th className="n">{T("合同金额")}</th><th className="n">{T("已付")}</th><th>{T("状态")}</th></tr></thead>
            <tbody>{pv.rows.map((x, i) => (
              <tr key={i} className={x.on ? undefined : "opacity-50"}>
                <td><input type="checkbox" aria-label={T("导入 {s}", { s: x.contractNo || x.title || "" })} checked={x.on} onChange={(e) => setPv({ ...pv, rows: pv.rows.map((y, j) => (j === i ? { ...y, on: e.target.checked } : y)) })} /></td>
                <td className="num">{x.contractNo || "—"}</td><td className="min-w-48">{x.title}</td><td>{x.supplierName}</td><td>{x.projectName}</td>
                <td className="num">{x.signDate || "—"}</td><td className="n">{fmt(x.amount || 0)} <span className="text-xs text-muted-foreground">{x.currency}</span></td><td className="n">{fmt(x.paid || 0)}</td>
                <td><Badge variant={STATUS[x.status || "active"]?.[1]}>{T(STATUS[x.status || "active"]?.[0] || "")}</Badge></td>
              </tr>
            ))}</tbody>
          </TableFrame>
        </Section>
      )}

      <Section bodyClassName="p-0" title={T("全部合同")}
        actions={<>
          <Select aria-label={T("按状态筛选")} value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-auto text-xs"><option value="">{T("全部状态")}</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{T(l)}</option>)}</Select>
          <Select aria-label={T("按项目筛选")} value={project} onChange={(e) => setProject(e.target.value)} className="h-8 w-auto max-w-56 text-xs"><option value="">{T("全部项目")}</option>{projectNames.map((p) => <option key={p} value={p}>{p}</option>)}<option value="-">{T("未关联项目")}</option></Select>
          <div className="relative"><Search className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={T("搜索合同")} placeholder={T("搜索编号、名称、供应商…")} value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-56 ps-8 text-xs" /></div>
        </>}>
        {!d.contracts.length ? <div className="p-5"><Empty>{T("还没有合同。可以新建一份，或导入现有的合同台账 Excel；询价单定标后也会自动生成。")}</Empty></div> : !shown.length ? <div className="p-5"><Empty>{T("没有符合筛选条件的合同。")}</Empty></div> : (
          <TableFrame flush className="max-h-[75vh]">
            <thead><tr><th>{T("合同")}</th><th>{T("供应商")}</th><th>{T("签订日期")}</th><th className="n">{T("合同金额")}</th><th>{T("付款进度")}</th><th>{T("交货日期")}</th><th>{T("状态")}</th><th></th></tr></thead>
            <tbody>{shown.map((c) => {
              const pct = c.amount > 0 ? Math.min(1, c.paid / c.amount) : 0;
              return (
                <tr key={c.id}>
                  <td className="min-w-56">
                    <span className="num font-medium">{c.contractNo || T("（无编号）")}</span><span className="sub !text-foreground">{c.title}</span>
                    <span className="sub">{c.project ? c.project : T("未关联项目")}{c.packageId && <> · <Link href={`/packages/${c.packageId}`}>{T("询价单")}</Link></>}</span>
                  </td>
                  <td className="min-w-40">{c.supplierName || "—"}</td>
                  <td className="num text-xs">{c.signDate || "—"}</td>
                  <td className="n"><span className="font-medium">{fmt(c.amount)}</span> <span className="text-xs text-muted-foreground">{c.currency}</span><span className="sub">{c.taxIncluded ? T("含税") : T("不含税")}</span></td>
                  <td className="min-w-36">
                    <div className="num text-xs">{fmt(c.paid)} / {fmt(c.amount)}</div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted"><div className={cn("h-full rounded-full", pct >= 1 ? "bg-good" : "bg-primary/50")} style={{ width: `${pct * 100}%` }} /></div>
                    <span className="sub">{T("未付 {a}", { a: fmt(Math.max(0, c.amount - c.paid)) })}</span>
                  </td>
                  <td className="num text-xs">{c.deliveryDate || "—"}{overdue(c) && <Badge variant="bad" className="ms-1.5">{T("已逾期")}</Badge>}</td>
                  <td><Badge variant={STATUS[c.status]?.[1] || "default"}>{T(STATUS[c.status]?.[0] || c.status)}</Badge></td>
                  <td className="whitespace-nowrap text-end">
                    <Button variant="ghost" size="sm" aria-label={T("编辑 {n}", { n: c.contractNo || c.title })} onClick={() => { const { project: _p, packageId: _k, ...rest } = c; setEdit(rest); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil /></Button>
                    <Button variant="ghost" size="sm" className="text-bad" onClick={() => remove(c)}>{T("删除")}</Button>
                  </td>
                </tr>
              );
            })}</tbody>
          </TableFrame>
        )}
      </Section>
    </>
  );
}
