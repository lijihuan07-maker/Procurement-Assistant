"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { useBusy, Busy } from "@/components/ui";

type P = { id: string; name: string; location: string; owner: string; createdAt: string; items: number; packages: number; openQuestions: number };

export default function Projects() {
  const [list, setList] = useState<P[] | null>(null);
  const [f, setF] = useState({ name: "", location: "", owner: "" });
  const { busy, run } = useBusy();
  const router = useRouter();
  useEffect(() => { api<{ projects: P[] }>("/api/projects").then((d) => setList(d.projects)).catch(() => setList([])); }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await run("创建中…", () => api<{ project: { id: string } }>("/api/projects", { body: f }));
    if (r) router.push(`/projects/${r.project.id}`);
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>项目</h1>
          <p>每个项目对应一份工程部需求清单。在项目里完成澄清、分包、发询价和比价。</p>
        </div>
        <div className="steps"><b>需求清单</b><i>→</i><b>澄清问题</b><i>→</i><b>询价包</b><i>→</i><b>询价邮件</b><i>→</i><b>报价比价</b><i>→</i><b>定标</b></div>
      </div>
      <section className="panel">
        <h2>新建项目</h2>
        <form className="form" onSubmit={create}>
          <div className="fields">
            <label className="field">项目名称<input id="p-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="例如：F-7006 别墅小区一期" /></label>
            <label className="field">项目地点<input id="p-loc" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="例如：Jazan" /></label>
            <label className="field">业主<input id="p-owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></label>
          </div>
          <div className="actions"><button className="primary" disabled={!!busy}>新建项目</button><Busy text={busy} /></div>
        </form>
      </section>
      {list === null ? <Busy text="加载中…" /> : list.length === 0 ? <div className="empty">还没有项目。先新建一个，再上传工程部的需求清单。</div> : (
        <div className="grid3">
          {list.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card">
              <h3>{p.name}</h3>
              <div className="small muted">{[p.location, p.owner].filter(Boolean).join(" · ") || "—"}</div>
              <div className="stats"><span>需求 <b>{p.items}</b></span><span>询价包 <b>{p.packages}</b></span>{p.openQuestions > 0 && <span className="chip warn">待确认 {p.openQuestions}</span>}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
