"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useBusy, Busy, toast } from "@/components/ui";

type Found = { name: string; categories: string[]; contact: string; email: string; phone: string; city: string; website: string; notes: string; exists: boolean; on: boolean };

const AREA_KEY = "discover-area";
const href = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

/** Find local suppliers on the web (AI web search), preview them, and add the ticked ones to the supplier library. */
export function Discover({ categories, defaultCategory, defaultArea, materials, onAdded, compact }: {
  categories: string[]; defaultCategory?: string; defaultArea?: string; materials?: string[]; onAdded: (ids: string[]) => void; compact?: boolean;
}) {
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
    const r = await run("联网搜索中，通常要 1–2 分钟…", () => api<{ suppliers: Omit<Found, "on">[] }>("/api/suppliers/discover", { body: { ...f, materials } }));
    if (r) { setRes(r.suppliers.map((s) => ({ ...s, on: !s.exists }))); toast(`找到 ${r.suppliers.length} 家，请核对后加入供应商库`); }
  }
  async function add() {
    if (!res) return;
    const on = res.filter((s) => s.on && s.name.trim());
    const r = await run("加入中…", () => api<{ newSuppliers: number; ids: string[] }>("/api/suppliers/import", { body: { source: "web", suppliers: on.map(({ on: _o, exists: _e, ...s }) => s) } }));
    if (r) { toast(`已加入 ${r.newSuppliers} 家新供应商`); setRes(null); onAdded(r.ids); }
  }
  const set = (i: number, p: Partial<Found>) => setRes(res && res.map((s, j) => (j === i ? { ...s, ...p } : s)));

  return (
    <div>
      <form className="actions" onSubmit={search} style={{ alignItems: "flex-end" }}>
        <label className="field">材料类别
          <select id="d-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="field">地区<input id="d-area" required placeholder="例如 Jizan, Saudi Arabia" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} style={{ width: compact ? 180 : 210 }} /></label>
        <label className="field">补充说明（可不填）<input id="d-kw" placeholder="例如 porcelain、要有 SASO 认证" value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} style={{ width: compact ? 200 : 240 }} /></label>
        <button className="primary" disabled={!!busy}>网上搜索</button>
        <Busy text={busy} />
      </form>
      {res && (
        <>
          <p className="small muted" style={{ margin: "10px 0 6px" }}>以下是 AI 联网搜到的公司，可能有过期或不准确的信息，请核对后勾选。已经在库里的默认不勾。</p>
          <div className="tbl-wrap"><table>
            <thead><tr><th><input type="checkbox" aria-label="全选搜索结果" checked={res.every((s) => s.on)} onChange={(e) => setRes(res.map((s) => ({ ...s, on: e.target.checked })))} /></th><th>公司</th><th>城市</th><th>电话 / 邮箱</th><th>网址</th><th>说明</th></tr></thead>
            <tbody>{res.map((s, i) => (
              <tr key={i} style={s.on ? undefined : { opacity: 0.55 }}>
                <td><input type="checkbox" aria-label={`加入 ${s.name}`} checked={s.on} onChange={(e) => set(i, { on: e.target.checked })} /></td>
                <td><input aria-label="公司名称" value={s.name} onChange={(e) => set(i, { name: e.target.value })} style={{ width: 210, fontSize: 13, padding: "3px 6px" }} />{s.exists && <span className="sub">已在供应商库里</span>}</td>
                <td className="small">{s.city || "—"}</td>
                <td className="small">{s.phone || "—"}{s.email && <span className="sub">{s.email}</span>}</td>
                <td className="small">{s.website ? <a href={href(s.website)} target="_blank" rel="noreferrer">打开</a> : "—"}</td>
                <td className="small" style={{ minWidth: 220 }}>{s.notes}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="actions" style={{ marginTop: 10 }}>
            <button className="primary" disabled={!!busy || !res.some((s) => s.on)} onClick={add}>把勾选的 {res.filter((s) => s.on).length} 家加入供应商库</button>
            <button disabled={!!busy} onClick={() => setRes(null)}>放弃</button>
          </div>
        </>
      )}
    </div>
  );
}
