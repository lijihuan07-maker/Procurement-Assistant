"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader, Clock, FilePen, FileSignature, FolderPlus, HelpCircle, MailQuestion, Trophy, Upload } from "lucide-react";
import { api, fmt } from "@/lib/client/api";
import { tm, useLang, useT } from "@/lib/i18n/client";
import { names } from "@/lib/client/display";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Section, TableFrame, Stats, Empty, StatusChip, Loading, toast } from "@/components/app";
import { MaterialSearch } from "../suppliers/Materials";
import type { Msg } from "@/lib/i18n";

type Todo = { kind: "deadline" | "noreply" | "award" | "questions" | "draft" | "contract" | "job"; level: "high" | "mid" | "low"; text: Msg; href: string; date?: string };
type Data = {
  name: string;
  todos: Todo[];
  rfqs: { id: string; rfqNo: string; titleCn: string; titleEn: string; project: string; projectId: string; status: string; deadline: string; sent: number; quotes: number }[];
  prices: { material: string; spec: string; supplier: string; unitPrice: number; unit: string; currency: string; date: string; source: string }[];
  stats: { activeRfqs: number; waiting: number; openQuestions: number; suppliers: number; projects: number };
};

const ICON = { deadline: Clock, noreply: MailQuestion, award: Trophy, questions: HelpCircle, draft: FilePen, contract: FileSignature, job: Loader };
const DOT = { high: "bg-bad", mid: "bg-signal", low: "bg-muted-foreground/40" };

export default function Workbench() {
  const T = useT();
  const lang = useLang();
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { api<Data>("/api/dashboard").then(setD).catch((e) => toast(e.message, true)); }, []);
  if (!d) return <Loading />;
  const hour = new Date().getHours();
  const hello = hour < 12 ? T("早上好") : hour < 18 ? T("下午好") : T("晚上好");

  return (
    <>
      <PageHeader title={d.name ? `${hello}${lang === "zh" ? "，" : ", "}${d.name}` : T("工作台")}
        actions={<>
          <Link href="/suppliers" className={buttonVariants({ variant: "outline" })}><Upload />{T("导入采购台账")}</Link>
          <Link href="/projects?new=1" className={buttonVariants()}><FolderPlus />{T("新建工程项目")}</Link>
        </>}>
        <Stats className="mt-4" items={[
          [T("进行中的询价单"), d.stats.activeRfqs],
          [T("待回复的供应商"), d.stats.waiting, d.stats.waiting ? "warn" : undefined],
          [T("待确认问题"), d.stats.openQuestions, d.stats.openQuestions ? "warn" : undefined],
          [T("供应商"), d.stats.suppliers],
        ]} />
      </PageHeader>

      <Section title={T("要买什么？")} description={T("输入材料名称，先看你的供应商里谁供过、谁供过同类。")}>
        <MaterialSearch />
      </Section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title={T("要跟进的事")} bodyClassName="p-0" className="xl:mb-0">
          {d.todos.length === 0 ? <div className="p-5"><Empty>{T("现在没有要跟进的事。发出询价单后，快截止的询价、没回复的供应商、待确认的问题会显示在这里。")}</Empty></div> : (
            <ul className="divide-y">
              {d.todos.map((t, i) => {
                const Icon = ICON[t.kind];
                return (
                  <li key={i}>
                    <Link href={t.href} className="group flex items-start gap-3 px-5 py-3 text-foreground no-underline hover:bg-muted/60">
                      <span className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground">
                        <Icon className="size-4" /><span className={cn("absolute -top-0.5 -end-0.5 size-2 rounded-full", DOT[t.level])} />
                      </span>
                      <span className="min-w-0 flex-1 text-[13.5px] leading-snug">{tm(t.text)}{t.date && <span className="num mt-0.5 block text-xs text-muted-foreground">{t.kind === "contract" ? T("交货日期") : T("截止")} {t.date}</span>}</span>
                      <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title={T("最近的成交价")} description={T("来自你导入的记录和定标结果")} bodyClassName="p-0" className="xl:mb-0">
          {d.prices.length === 0 ? <div className="p-5"><Empty>{T("还没有价格记录。导入采购台账或完成一次定标后，这里会显示最近的成交价。")}</Empty></div> : (
            <ul className="divide-y">
              {d.prices.map((p, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-5 py-2.5 text-[13px]">
                  <span className="min-w-0"><span className="font-medium">{p.material}</span><span className="block truncate text-xs text-muted-foreground">{[p.spec, p.supplier].filter(Boolean).join(" · ")}</span></span>
                  <span className="shrink-0 text-end"><span className="num font-semibold">{fmt(p.unitPrice)}</span> <span className="text-xs text-muted-foreground">{p.currency}/{p.unit}</span><span className="num block text-xs text-muted-foreground">{p.date}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title={T("最近的询价单")} className="mt-5" bodyClassName="p-0" actions={<Link href="/projects" className="text-[13px]">{T("全部项目")}</Link>}>
        {d.rfqs.length === 0 ? <div className="p-5"><Empty>{T("还没有发出的询价单。新建项目、上传需求清单后，就能拆分询价包并锁定发出。")}</Empty></div> : (
          <TableFrame flush>
            <thead><tr><th>{T("询价单编号")}</th><th>{T("询价单名称")}</th><th>{T("项目")}</th><th>{T("状态")}</th><th className="n">{T("报价")}</th><th>{T("报价截止")}</th></tr></thead>
            <tbody>{d.rfqs.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/packages/${r.id}`} className="num font-medium">{r.rfqNo}</Link></td>
                <td>{names(lang, r.titleCn, r.titleEn)[0]}</td>
                <td className="text-muted-foreground">{r.project}</td>
                <td><StatusChip status={r.status} /></td>
                <td className="n">{r.quotes}/{r.sent || "–"}</td>
                <td className="num text-xs">{r.deadline || "—"}{r.status === "issued" && r.deadline && r.deadline < new Date().toISOString().slice(0, 10) && <Badge variant="warn" className="ms-1.5">{T("已截止")}</Badge>}</td>
              </tr>
            ))}</tbody>
          </TableFrame>
        )}
      </Section>
    </>
  );
}
