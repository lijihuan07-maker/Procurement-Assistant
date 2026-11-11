"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Banner } from "@/components/app";
import { BrandMark } from "@/components/Brand";
import { LangSwitch } from "@/components/LangSwitch";

const FLOW = [
  ["需求清单", "上传工程部的清单，AI 提取每一项物资"],
  ["澄清问题", "按材料类别找出没写清楚的参数"],
  ["询价包", "按供应商类型拆分，可以合并"],
  ["询价邮件", "推荐合作过的和本地新供应商"],
  ["报价比价", "任何格式的报价，统一单位后逐项比价"],
  ["定标", "定标价写回历史价格，下次询价参考"],
];

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const T = useT();
  const [f, setF] = useState({ companyName: "", name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await api(`/api/auth/${mode}`, { body: f }); window.location.href = "/projects"; }
    catch (x) { setErr(x instanceof Error ? x.message : String(x)); setBusy(false); }
  }
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col bg-sidebar px-12 py-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2.5 text-[15px] font-semibold text-white"><BrandMark className="size-7" />{T("询价比价助手")}</div>
        <div className="my-auto max-w-md">
          <h2 className="text-[28px] leading-snug font-semibold text-white">{T("从工程部需求清单到比价表")}</h2>
          <p className="mt-3 text-[14px] leading-relaxed">{T("为海外工程项目的采购团队设计。AI 处理询价里重复的部分，判断留给你。")}</p>
          <ol className="mt-10 grid gap-0">
            {FLOW.map(([k, v], i) => (
              <li key={k} className="relative grid grid-cols-[28px_1fr] gap-3 pb-5 last:pb-0">
                {i < FLOW.length - 1 && <span className="absolute top-7 bottom-0 start-[13.5px] w-px bg-white/15" />}
                <span className={"grid size-7 place-items-center rounded-full text-xs font-semibold num " + (i === FLOW.length - 1 ? "bg-signal text-primary" : "border border-white/25 text-white")}>{i + 1}</span>
                <span><span className="block text-[14px] font-medium text-white">{T(k)}</span><span className="block text-[13px]">{T(v)}</span></span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
      <main className="relative flex items-center justify-center px-5 py-16">
        <LangSwitch className="absolute top-5 end-5 text-muted-foreground hover:bg-accent" align="end" />
        <form onSubmit={submit} className="grid w-full max-w-sm gap-4">
          <div className="mb-2">
            <BrandMark className="mb-5 size-9 lg:hidden" />
            <h1 className="text-[22px] font-semibold">{mode === "login" ? T("登录") : T("注册公司账号")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{mode === "login" ? T("用你的工作邮箱登录。") : T("注册后你是公司管理员，可以再添加同事。")}</p>
          </div>
          {mode === "register" && <>
            <Field label={T("公司名称")}><Input id="companyName" required value={f.companyName} onChange={set("companyName")} autoComplete="organization" /></Field>
            <Field label={T("你的姓名")}><Input id="name" value={f.name} onChange={set("name")} autoComplete="name" /></Field>
          </>}
          <Field label={T("邮箱")}><Input id="email" type="email" required value={f.email} onChange={set("email")} autoComplete="email" /></Field>
          <Field label={T("密码")} hint={mode === "register" ? T("（至少 8 位）") : undefined}><Input id="password" type="password" required minLength={mode === "register" ? 8 : 1} value={f.password} onChange={set("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} /></Field>
          {err && <Banner tone="bad">{err}</Banner>}
          <Button type="submit" size="lg" disabled={busy} className="mt-1 w-full">{busy ? T("请稍候…") : mode === "login" ? T("登录") : T("注册并进入")}</Button>
          <p className="text-center text-[13px] text-muted-foreground">
            {mode === "login" ? <>{T("还没有账号？")}<Link href="/register" className="font-medium">{T("注册公司账号")}</Link></> : <>{T("已有账号？")}<Link href="/login" className="font-medium">{T("登录")}</Link></>}
          </p>
        </form>
      </main>
    </div>
  );
}
