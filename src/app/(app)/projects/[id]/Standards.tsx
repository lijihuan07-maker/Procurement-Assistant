"use client";
import { useEffect, useRef, useState } from "react";
import { BookCheck, MapPin, RefreshCw } from "lucide-react";
import { api } from "@/lib/client/api";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Busy, useBusy } from "@/components/app";
import type { ProjectData } from "@/lib/client/types";

/** The material standards that apply at the project location, identified by AI and refreshed when the location changes. */
export function Standards({ d, setD }: { d: ProjectData; setD: (d: ProjectData) => void }) {
  const T = useT();
  const p = d.project;
  const s = p.standards;
  const { busy, run } = useBusy();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loc, setLoc] = useState(p.location);
  const tried = useRef("");
  const stale = !!p.location && (!s || s.location !== p.location);

  async function detect() {
    tried.current = p.location;
    const r = await run(T("正在识别 {l} 的材料标准体系…", { l: p.location }), () => api<ProjectData>(`/api/projects/${p.id}/standards`, { body: {} }));
    if (r) setD(r);
  }
  // First visit after the location is set (or changed): identify automatically, once.
  useEffect(() => { if (stale && tried.current !== p.location) void detect(); }, [stale, p.location]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveLocation(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(T("保存中…"), () => api<ProjectData>(`/api/projects/${p.id}`, { method: "PATCH", body: { location: loc } }));
    if (r) { setD(r); setEditing(false); }
  }

  const locationForm = (
    <form onSubmit={saveLocation} className="flex flex-wrap items-center gap-2">
      <Input id="p-location" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder={T("例如：沙特吉赞")} className="h-8 w-64" />
      <Button type="submit" size="sm" disabled={!!busy || !loc.trim()}>{T("保存并识别")}</Button>
      {p.location && <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setLoc(p.location); }}>{T("取消")}</Button>}
    </form>
  );

  return (
    <section className="mb-5 rounded-lg border bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border bg-muted text-primary"><BookCheck className="size-4" /></span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">{T("当地材料标准")}</h2>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" />{p.location || T("未填写项目地点")}{s && !stale && <> · {T("AI 联网识别于 {d}，仅供参考，以合同和技术规格书为准", { d: s.checkedAt })}</>}</p>
          </div>
        </div>
        {!editing && p.location && (
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><MapPin />{T("修改地点")}</Button>
            <Button variant="ghost" size="sm" disabled={!!busy} onClick={detect}><RefreshCw />{T("重新识别")}</Button>
          </div>
        )}
      </div>
      <div className="mt-3 grid gap-3 ps-11">
        {(!p.location || editing) && <>{!p.location && <p className="text-[13px] text-muted-foreground">{T("填写项目地点后，AI 会识别当地适用的材料标准和认证，并在澄清需求、写询价单时参考。")}</p>}{locationForm}</>}
        <Busy text={busy} />
        {s && !stale && !busy && (
          <>
            {s.summary && <p className="max-w-4xl text-[13px]">{s.summary}</p>}
            <div className="flex flex-wrap gap-1.5">{s.systems.map((x) => <Badge key={x.name} variant="outline" className="text-foreground" title={[x.scope, x.note].filter(Boolean).join("\n")}>{x.name}</Badge>)}</div>
            <div><Button variant="link" size="sm" onClick={() => setOpen(!open)}>{open ? T("收起") : T("查看每项标准的适用范围")}</Button></div>
            {open && (
              <dl className="grid max-w-5xl gap-x-6 gap-y-2.5 text-[13px] md:grid-cols-[minmax(0,14rem)_1fr]">
                {s.systems.map((x) => [
                  <dt key={x.name + "t"} className="font-medium">{x.name}</dt>,
                  <dd key={x.name + "d"} className="text-muted-foreground">{x.scope}{x.note && <span className="block text-foreground/80">{T("采购时：")}{x.note}</span>}</dd>,
                ])}
              </dl>
            )}
          </>
        )}
      </div>
    </section>
  );
}
