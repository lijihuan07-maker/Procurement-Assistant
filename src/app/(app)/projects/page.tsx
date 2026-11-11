"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { useBusy, Busy, PageHeader, Section, Empty, TableFrame, Loading } from "@/components/app";

type P = { id: string; name: string; location: string; owner: string; createdAt: string; items: number; packages: number; openQuestions: number };

export default function Projects() {
  const T = useT();
  const [list, setList] = useState<P[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", location: "", owner: "" });
  const { busy, run } = useBusy();
  const router = useRouter();
  useEffect(() => { api<{ projects: P[] }>("/api/projects").then((d) => { setList(d.projects); if (!d.projects.length) setAdding(true); }).catch(() => setList([])); }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(T("创建中…"), () => api<{ project: { id: string } }>("/api/projects", { body: f }));
    if (r) router.push(`/projects/${r.project.id}`);
  }
  return (
    <>
      <PageHeader title={T("项目")} actions={!adding && <Button onClick={() => setAdding(true)}><FolderPlus />{T("新建项目")}</Button>}>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{T("每个项目对应一份工程部需求清单。在项目里完成澄清、分包、发询价和比价。")}</p>
      </PageHeader>
      {adding && (
        <Section title={T("新建项目")} actions={list?.length ? <Button variant="ghost" size="icon" aria-label={T("关闭")} onClick={() => setAdding(false)}><X /></Button> : null}>
          <form onSubmit={create} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={T("项目名称")}><Input id="p-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={T("例如：F-7006 别墅小区一期")} /></Field>
              <Field label={T("项目地点")}><Input id="p-loc" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder={T("例如：Jazan")} /></Field>
              <Field label={T("业主")}><Input id="p-owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></Field>
            </div>
            <div className="flex items-center gap-3"><Button type="submit" disabled={!!busy}>{T("新建项目")}</Button><Busy text={busy} /></div>
          </form>
        </Section>
      )}
      {list === null ? <Loading /> : list.length === 0 ? (
        <Empty>{T("还没有项目。先新建一个，再上传工程部的需求清单。")}</Empty>
      ) : (
        <div className="rounded-lg border bg-card">
          <TableFrame flush>
            <thead><tr><th>{T("项目")}</th><th>{T("地点")}</th><th>{T("业主")}</th><th className="n">{T("需求项")}</th><th className="n">{T("询价包")}</th><th>{T("状态")}</th><th>{T("创建日期")}</th></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id} className="cursor-pointer" onClick={() => router.push(`/projects/${p.id}`)}>
                <td className="min-w-48"><a href={`/projects/${p.id}`} onClick={(e) => e.preventDefault()} className="font-medium text-foreground no-underline hover:underline">{p.name}</a></td>
                <td>{p.location || "—"}</td>
                <td>{p.owner || "—"}</td>
                <td className="n">{p.items}</td>
                <td className="n">{p.packages}</td>
                <td>{p.openQuestions > 0 ? <Badge variant="warn">{T("待确认 {n}", { n: p.openQuestions })}</Badge> : p.items ? <Badge variant="good">{T("需求已澄清")}</Badge> : <Badge variant="outline">{T("待上传清单")}</Badge>}</td>
                <td className="num text-muted-foreground">{p.createdAt?.slice(0, 10)}</td>
              </tr>
            ))}</tbody>
          </TableFrame>
        </div>
      )}
    </>
  );
}
