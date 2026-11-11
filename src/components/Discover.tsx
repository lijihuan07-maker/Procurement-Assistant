"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { api } from "@/lib/client/api";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { useBusy, Busy, toast, TableFrame } from "@/components/app";

type Found = { name: string; categories: string[]; contact: string; email: string; phone: string; city: string; website: string; notes: string; exists: boolean; on: boolean };

const AREA_KEY = "discover-area";
const href = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

/** Find local suppliers on the web (AI web search), preview them, and add the ticked ones to the supplier library. */
export function Discover({ categories, defaultCategory, defaultArea, materials, onAdded, compact }: {
  categories: string[]; defaultCategory?: string; defaultArea?: string; materials?: string[]; onAdded: (ids: string[]) => void; compact?: boolean;
}) {
  const T = useT();
  const [f, setF] = useState({ category: defaultCategory || categories[0] || "", area: defaultArea || "", keywords: "" });
  const [res, setRes] = useState<Found[] | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => {
    if (defaultArea) return;
    try { const a = localStorage.getItem(AREA_KEY); if (a) setF((x) => ({ ...x, area: x.area || a })); } catch { /* storage unavailable */ }
  }, [defaultArea]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    try { localStorage.setItem(AREA_KEY, f.area); } catch { /* storage unavailable */ }
    const r = await run(T("联网搜索中，通常要 1–2 分钟…"), () => api<{ suppliers: Omit<Found, "on">[] }>("/api/suppliers/discover", { body: { ...f, materials } }));
    if (r) { setRes(r.suppliers.map((s) => ({ ...s, on: !s.exists }))); toast(T("找到 {n} 家，请核对后加入供应商库", { n: r.suppliers.length })); }
  }
  async function add() {
    if (!res) return;
    const on = res.filter((s) => s.on && s.name.trim());
    const r = await run(T("加入中…"), () => api<{ newSuppliers: number; ids: string[] }>("/api/suppliers/import", { body: { source: "web", suppliers: on.map(({ on: _o, exists: _e, ...s }) => s) } }));
    if (r) { toast(T("已加入 {n} 家新供应商", { n: r.newSuppliers })); setRes(null); onAdded(r.ids); }
  }
  const set = (i: number, p: Partial<Found>) => setRes(res && res.map((s, j) => (j === i ? { ...s, ...p } : s)));

  return (
    <div className="grid gap-4">
      <form className={cn("grid items-end gap-3", compact ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto]" : "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto]")} onSubmit={search}>
        <Field label={T("材料类别")}><Select id="d-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{categories.map((c) => <option key={c} value={c}>{T(c)}</option>)}</Select></Field>
        <Field label={T("地区")}><Input id="d-area" required placeholder={T("例如 Jizan, Saudi Arabia")} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} /></Field>
        <Field label={T("补充说明（可不填）")}><Input id="d-kw" placeholder={T("例如 porcelain、要有 SASO 认证")} value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} /></Field>
        <Button type="submit" disabled={!!busy}><Search />{T("网上搜索")}</Button>
      </form>
      <Busy text={busy} />
      {res && (
        <>
          <p className="text-xs text-muted-foreground">{T("以下是 AI 联网搜到的公司，可能有过期或不准确的信息，请核对后勾选。已经在库里的默认不勾。")}</p>
          <TableFrame className="bg-card">
            <thead><tr><th className="w-8"><input type="checkbox" aria-label={T("全选搜索结果")} checked={res.every((s) => s.on)} onChange={(e) => setRes(res.map((s) => ({ ...s, on: e.target.checked })))} /></th><th>{T("公司")}</th><th>{T("城市")}</th><th>{T("电话 / 邮箱")}</th><th>{T("网址")}</th><th>{T("说明")}</th></tr></thead>
            <tbody>{res.map((s, i) => (
              <tr key={i} className={s.on ? undefined : "opacity-55"}>
                <td><input type="checkbox" aria-label={T("加入 {s}", { s: s.name })} checked={s.on} onChange={(e) => set(i, { on: e.target.checked })} /></td>
                <td><Input aria-label={T("公司名称")} value={s.name} onChange={(e) => set(i, { name: e.target.value })} className="h-7 w-56 text-[13px]" />{s.exists && <span className="sub">{T("已在供应商库里")}</span>}</td>
                <td>{s.city || "—"}</td>
                <td className="text-xs">{s.phone || "—"}{s.email && <span className="sub">{s.email}</span>}</td>
                <td className="text-xs">{s.website ? <a href={href(s.website)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">{T("打开")}<ExternalLink className="size-3" /></a> : "—"}</td>
                <td className="min-w-56 text-xs text-muted-foreground">{s.notes}</td>
              </tr>
            ))}</tbody>
          </TableFrame>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!!busy || !res.some((s) => s.on)} onClick={add}>{T("把勾选的 {n} 家加入供应商库", { n: res.filter((s) => s.on).length })}</Button>
            <Button variant="ghost" disabled={!!busy} onClick={() => setRes(null)}>{T("放弃")}</Button>
          </div>
        </>
      )}
    </div>
  );
}
