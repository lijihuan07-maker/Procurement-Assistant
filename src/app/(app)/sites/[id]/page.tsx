"use client";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { useBusy, Busy, PageHeader, Section, Empty, TableFrame, Loading, toast } from "@/components/app";
import { KIND_LABEL, type ReqSettings, type SiteData, type Template } from "@/lib/client/types";
import { ReqSettingsForm } from "../../projects/ReqSettings";
import { announceSite, sitesChanged } from "../../Shell";
import { Standards } from "./Standards";

export default function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const T = useT();
  const router = useRouter();
  const [d, setD] = useState<SiteData | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: "", location: "", owner: "" });
  const { busy, run } = useBusy();
  useEffect(() => {
    announceSite(id);
    api<SiteData>(`/api/sites/${id}`).then((x) => { setD(x); if (!x.reqs.length) setAdding(true); }).catch((e) => toast(e.message, true));
  }, [id]);
  if (!d) return <Loading />;
  const s = d.site;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(T("保存中…"), () => api<SiteData>(`/api/sites/${id}`, { method: "PATCH", body: f }), T("已保存"));
    if (r) { setD(r); setEditing(false); sitesChanged(); }
  }
  async function remove() {
    if (!window.confirm?.(T("删除工程项目“{n}”和它下面的全部采购需求、询价、报价？", { n: s.name }))) return;
    const r = await run(T("删除中…"), () => api(`/api/sites/${id}`, { method: "DELETE" }));
    if (r) { sitesChanged(); router.push("/projects"); }
  }

  return (
    <>
      <PageHeader crumbs={[{ href: "/projects", label: T("项目") }]} title={s.name}
        facts={[[T("地点"), s.location], [T("业主"), s.owner]]}
        actions={<>
          <Busy text={busy} />
          <Button variant="ghost" size="sm" onClick={() => { setF({ name: s.name, location: s.location, owner: s.owner }); setEditing(!editing); }}><Pencil />{T("编辑")}</Button>
          <Button variant="ghost" size="sm" className="text-bad hover:bg-bad-soft" onClick={remove}><Trash2 />{T("删除工程项目")}</Button>
        </>} />
      {editing && (
        <Section title={T("编辑工程项目")} actions={<Button variant="ghost" size="icon" aria-label={T("关闭")} onClick={() => setEditing(false)}><X /></Button>}>
          <form onSubmit={save} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={T("工程项目名称")}><Input id="se-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label={T("项目地点")}><Input id="se-loc" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
              <Field label={T("业主")}><Input id="se-owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></Field>
            </div>
            <div><Button type="submit" disabled={!!busy}>{T("保存")}</Button></div>
          </form>
        </Section>
      )}
      <Standards d={d} setD={setD} />

      {adding && <NewReq d={d} onClose={d.reqs.length ? () => setAdding(false) : undefined} />}

      <Section title={T("采购需求（{n}）", { n: d.reqs.length })} bodyClassName="p-0"
        description={T("每个采购需求对应工程部的一份需求清单，在里面完成澄清、拆分询价包、发询价和比价。")}
        actions={!adding && <Button onClick={() => setAdding(true)}><Plus />{T("新建采购需求")}</Button>}>
        {d.reqs.length === 0 ? <div className="p-5"><Empty>{T("还没有采购需求。在上面新建一个，例如“室外管道工程材料”。")}</Empty></div> : (
          <TableFrame flush>
            <thead><tr><th>{T("采购需求")}</th><th>{T("类型")}</th><th>{T("需求清单")}</th><th className="n">{T("需求项")}</th><th className="n">{T("询价包")}</th><th>{T("状态")}</th><th>{T("创建日期")}</th></tr></thead>
            <tbody>{d.reqs.map((p) => (
              <tr key={p.id} className="cursor-pointer" onClick={() => router.push(`/projects/${p.id}`)}>
                <td className="min-w-48"><a href={`/projects/${p.id}`} onClick={(e) => e.preventDefault()} className="font-medium text-foreground no-underline hover:underline">{p.name}</a></td>
                <td><Badge variant="outline">{T(KIND_LABEL[p.kind] || p.kind)}</Badge></td>
                <td className="max-w-56 truncate text-xs text-muted-foreground">{p.demandFileName || "—"}</td>
                <td className="n">{p.items}</td>
                <td className="n">{p.packages}</td>
                <td>{p.job === "running" ? <Badge variant="info">{T("需求清单识别中")}</Badge> : p.openQuestions > 0 ? <Badge variant="warn">{T("待确认 {n}", { n: p.openQuestions })}</Badge> : p.items ? <Badge variant="good">{T("需求已澄清")}</Badge> : <Badge variant="outline">{T("待上传清单")}</Badge>}</td>
                <td className="num text-muted-foreground">{String(p.createdAt).slice(0, 10)}</td>
              </tr>
            ))}</tbody>
          </TableFrame>
        )}
      </Section>
    </>
  );
}

const KINDS = ["material", "subcontract", "rental", "service"];

/** New procurement requirement. After the first one, RFQ settings can be copied from any earlier requirement. */
function NewReq({ d, onClose }: { d: SiteData; onClose?: () => void }) {
  const T = useT();
  const router = useRouter();
  const { busy, run } = useBusy();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("material");
  const has = d.templates.length > 0;
  const [fromId, setFromId] = useState<string>(() => (d.templates.find((t) => t.siteId === d.site.id) || d.templates[0])?.id || "");
  const [mode, setMode] = useState<"tpl" | "new">(has ? "tpl" : "new");
  const [settings, setSettings] = useState<ReqSettings>(d.defaults);
  // Templates grouped by engineering project, this one first.
  const groups = useMemo(() => {
    const m = new Map<string, { site: string; items: Template[] }>();
    for (const t of d.templates) { if (!m.has(t.siteId)) m.set(t.siteId, { site: t.siteName, items: [] }); m.get(t.siteId)!.items.push(t); }
    return [...m.entries()].sort(([a], [b]) => (a === d.site.id ? -1 : b === d.site.id ? 1 : 0)).map(([, g]) => g);
  }, [d.templates, d.site.id]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const body = { siteId: d.site.id, name, kind, ...(mode === "tpl" && fromId ? { fromId } : { settings }) };
    const r = await run(T("创建中…"), () => api<{ project: { id: string } }>("/api/projects", { body }));
    if (r) router.push(`/projects/${r.project.id}`);
  }

  return (
    <Section title={T("新建采购需求")} actions={onClose && <Button variant="ghost" size="icon" aria-label={T("关闭")} onClick={onClose}><X /></Button>}>
      <form onSubmit={create} className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <Field label={T("采购需求名称")}><Input id="r-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder={T("例如：室外管道工程材料")} /></Field>
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium">{T("类型")}</span>
            <div role="radiogroup" aria-label={T("类型")} className="inline-flex rounded-md border bg-muted p-0.5">
              {KINDS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                  className={cn("cursor-pointer rounded px-3.5 py-1.5 text-[13px]", kind === k ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{T(KIND_LABEL[k])}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-t pt-5">
          <div>
            <h3 className="text-[14px] font-semibold">{T("询价设置与模板")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{has ? T("可以沿用之前建过的采购需求的设置：询价单编号规则、币种税率、付款条款、询价单 Excel 模板和邮件模板。") : T("第一次新建，先设置一次询价单编号规则、条款和模板。以后新建采购需求时可以直接勾选沿用。")}</p>
          </div>
          {has && (
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium"><input type="radio" name="mode" checked={mode === "tpl"} onChange={() => setMode("tpl")} />{T("沿用之前的模板")}</label>
              {mode === "tpl" && (
                <div className="grid gap-3 ps-6">
                  {groups.map((g) => (
                    <div key={g.site} className="grid gap-1">
                      <span className="text-xs text-muted-foreground">{g.site}</span>
                      <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                        {g.items.map((t) => (
                          <label key={t.id} className={cn("flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px]", fromId === t.id ? "border-primary bg-info-soft/40 ring-1 ring-primary/30" : "hover:bg-muted/60")}>
                            <input type="radio" name="tpl" className="mt-0.5" checked={fromId === t.id} onChange={() => setFromId(t.id)} aria-label={`${g.site} · ${t.name}`} />
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 font-medium">{t.name}<Badge variant="outline">{T(KIND_LABEL[t.kind] || t.kind)}</Badge></span>
                              <span className="mt-0.5 block text-xs text-muted-foreground"><span className="num">{t.prefix}</span> · {t.currency} · VAT {Math.round(t.vatRate * 100)}% · {t.file || T("系统默认格式")}{t.email ? ` · ${T("自定义邮件")}` : ""}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium"><input type="radio" name="mode" checked={mode === "new"} onChange={() => setMode("new")} />{T("不用模板，重新设置")}</label>
            </div>
          )}
          {mode === "new" && <div className={cn(has && "ps-6")}><ReqSettingsForm value={settings} onChange={setSettings} disabled={!!busy} /></div>}
        </div>

        <div className="flex items-center gap-3 border-t pt-4"><Button type="submit" id="r-create" disabled={!!busy || !name.trim() || (mode === "tpl" && !fromId)}>{T("创建采购需求")}</Button><Busy text={busy} /></div>
      </form>
    </Section>
  );
}
