"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderPlus, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { useBusy, Busy, PageHeader, Section, Empty, TableFrame, Loading } from "@/components/app";
import { sitesChanged } from "../Shell";

type S = { id: string; name: string; location: string; owner: string; createdAt: string; reqs: number; items: number; packages: number; openQuestions: number };

/** Engineering projects (工程项目). Each one holds procurement requirements: materials, subcontracts, rentals, services. */
export default function ProjectsPage() { return <Suspense fallback={<Loading />}><Projects /></Suspense>; }

function Projects() {
  const T = useT();
  const params = useSearchParams();
  const [list, setList] = useState<S[] | null>(null);
  const [adding, setAdding] = useState(params.get("new") === "1");
  const [f, setF] = useState({ name: "", location: "", owner: "" });
  const { busy, run } = useBusy();
  const router = useRouter();
  useEffect(() => { api<{ sites: S[] }>("/api/sites").then((d) => { setList(d.sites); if (!d.sites.length) setAdding(true); }).catch(() => setList([])); }, []);
  useEffect(() => { if (params.get("new") === "1") setAdding(true); }, [params]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(T("创建中…"), () => api<{ site: { id: string } }>("/api/sites", { body: f }));
    if (r) { sitesChanged(); router.push(`/sites/${r.site.id}`); }
  }
  return (
    <>
      <PageHeader title={T("项目")} actions={!adding && <Button onClick={() => setAdding(true)}><FolderPlus />{T("新建工程项目")}</Button>}>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{T("先建工程项目（如一个别墅区、一座海水冷却站），再在里面按采购内容建采购需求：管道材料、硬景观材料、分包、租赁、服务等。")}</p>
      </PageHeader>
      {adding && (
        <Section title={T("新建工程项目")} description={T("填写地点后，AI 会识别当地的材料标准体系，这个工程项目下的所有采购需求都会参考。")}
          actions={list?.length ? <Button variant="ghost" size="icon" aria-label={T("关闭")} onClick={() => setAdding(false)}><X /></Button> : null}>
          <form onSubmit={create} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={T("工程项目名称")}><Input id="s-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={T("例如：海水冷却项目")} /></Field>
              <Field label={T("项目地点")}><Input id="s-loc" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder={T("例如：沙特吉赞")} /></Field>
              <Field label={T("业主")}><Input id="s-owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></Field>
            </div>
            <div className="flex items-center gap-3"><Button type="submit" disabled={!!busy}>{T("新建工程项目")}</Button><Busy text={busy} /></div>
          </form>
        </Section>
      )}
      {list === null ? <Loading /> : list.length === 0 ? (
        <Empty>{T("还没有工程项目。先新建一个，再在里面建采购需求、上传工程部的需求清单。")}</Empty>
      ) : (
        <div className="rounded-lg border bg-card">
          <TableFrame flush>
            <thead><tr><th>{T("工程项目")}</th><th>{T("地点")}</th><th>{T("业主")}</th><th className="n">{T("采购需求")}</th><th className="n">{T("需求项")}</th><th className="n">{T("询价包")}</th><th>{T("状态")}</th><th>{T("创建日期")}</th></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id} className="cursor-pointer" onClick={() => router.push(`/sites/${p.id}`)}>
                <td className="min-w-48"><a href={`/sites/${p.id}`} onClick={(e) => e.preventDefault()} className="font-medium text-foreground no-underline hover:underline">{p.name}</a></td>
                <td>{p.location || "—"}</td>
                <td>{p.owner || "—"}</td>
                <td className="n">{p.reqs}</td>
                <td className="n">{p.items}</td>
                <td className="n">{p.packages}</td>
                <td>{p.openQuestions > 0 ? <Badge variant="warn">{T("待确认 {n}", { n: p.openQuestions })}</Badge> : p.reqs ? <Badge variant="outline">{T("{n} 个采购需求", { n: p.reqs })}</Badge> : <Badge variant="outline">{T("还没有采购需求")}</Badge>}</td>
                <td className="num text-muted-foreground">{p.createdAt?.slice(0, 10)}</td>
              </tr>
            ))}</tbody>
          </TableFrame>
        </div>
      )}
    </>
  );
}
