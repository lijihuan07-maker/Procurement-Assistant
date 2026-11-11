"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
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
    <div className="auth">
      <form className="box" onSubmit={submit}>
        <div>
          <h1>询价比价助手</h1>
          <p className="muted small" style={{ margin: "4px 0 0" }}>从工程部需求清单到比价表，AI 帮你完成询价的重复工作。</p>
        </div>
        {mode === "register" && <>
          <label className="field">公司名称<input id="companyName" required value={f.companyName} onChange={set("companyName")} autoComplete="organization" /></label>
          <label className="field">你的姓名<input id="name" value={f.name} onChange={set("name")} autoComplete="name" /></label>
        </>}
        <label className="field">邮箱<input id="email" type="email" required value={f.email} onChange={set("email")} autoComplete="email" /></label>
        <label className="field">密码{mode === "register" && <span>（至少 8 位）</span>}<input id="password" type="password" required minLength={mode === "register" ? 8 : 1} value={f.password} onChange={set("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        {err && <div className="banner err">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? "请稍候…" : mode === "login" ? "登录" : "注册并进入"}</button>
        <p className="small muted" style={{ margin: 0 }}>
          {mode === "login" ? <>还没有账号？<Link href="/register">注册公司账号</Link></> : <>已有账号？<Link href="/login">登录</Link></>}
        </p>
      </form>
    </div>
  );
}
