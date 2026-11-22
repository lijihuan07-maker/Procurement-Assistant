"use client";
import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun, UserPlus } from "lucide-react";
import { api } from "@/lib/client/api";
import { LANGS } from "@/lib/i18n";
import { switchLang, useLang, useT } from "@/lib/i18n/client";
import { ACCENTS, SIZES, THEMES, loadPrefs, savePrefs, DEFAULT_PREFS, type Prefs } from "@/lib/client/prefs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { useBusy, Busy, PageHeader, Section, TableFrame, Banner, Loading, toast } from "@/components/app";

type Data = { company: { id: string; name: string; senderName: string; nameEn: string; senderEn: string }; members: { id: string; email: string; name: string; role: string }[]; me: { role: string } };
const ROLES: Record<string, string> = { admin: "管理员", manager: "采购经理", buyer: "采购工程师" };

/** One row of the settings list: label and hint on the left, the control on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 border-b py-4 last:border-b-0 md:grid-cols-[minmax(0,15rem)_1fr] md:items-center md:gap-8">
      <div><div className="text-[13.5px] font-medium">{label}</div>{hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}</div>
      <div className="md:justify-self-end">{children}</div>
    </div>
  );
}

export default function Settings() {
  const T = useT();
  const lang = useLang();
  const [p, setP] = useState<Prefs>(DEFAULT_PREFS);
  const [d, setD] = useState<Data | null>(null);
  const [c, setC] = useState({ name: "", senderName: "", nameEn: "", senderEn: "" });
  const [m, setM] = useState({ email: "", name: "", password: "", role: "buyer" });
  const { busy, run } = useBusy();
  useEffect(() => { setP(loadPrefs()); }, []);
  useEffect(() => { api<Data>("/api/company").then((x) => { setD(x); setC({ name: x.company.name, senderName: x.company.senderName, nameEn: x.company.nameEn, senderEn: x.company.senderEn }); }).catch((e) => toast(e.message, true)); }, []);
  const set = (patch: Partial<Prefs>) => { const n = { ...p, ...patch }; setP(n); savePrefs(n); };
  const admin = d?.me.role === "admin";

  const modes: [Prefs["mode"], string, typeof Sun][] = [["light", "浅色", Sun], ["dark", "深色", Moon], ["system", "跟随系统", Monitor]];
  return (
    <>
      <PageHeader title={T("系统设置")}>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{T("外观、语言、公司和团队成员。询价单编号、条款和模板在每个采购需求的“询价设置与模板”里设置。")}</p>
      </PageHeader>

      <Section title={T("外观")} description={T("只对这台设备上的这个浏览器生效。")} bodyClassName="py-1">
        <Row label={T("模式")} hint={T("浅色、深色，或跟随电脑/手机的系统设置")}>
          <div role="radiogroup" aria-label={T("模式")} className="flex flex-wrap gap-2">
            {modes.map(([k, label, Icon]) => (
              <button key={k} type="button" role="radio" aria-checked={p.mode === k} onClick={() => set({ mode: k })}
                className={cn("grid w-28 cursor-pointer gap-2 rounded-lg border p-2 text-start text-[13px]", p.mode === k ? "border-primary ring-2 ring-primary/25" : "hover:bg-muted")}>
                <span className={cn("flex h-12 overflow-hidden rounded-md border", k === "dark" ? "bg-[#0e131b]" : k === "light" ? "bg-[#f5f6f8]" : "bg-[linear-gradient(90deg,#f5f6f8_50%,#0e131b_50%)]")}>
                  <span className="w-5" style={{ background: THEMES[p.theme]?.color }} />
                  <span className="m-1.5 grid flex-1 content-start gap-1"><span className={cn("h-1.5 w-3/4 rounded", k === "dark" ? "bg-white/30" : "bg-black/15")} /><span className="h-1.5 w-1/2 rounded" style={{ background: ACCENTS[p.accent]?.color }} /></span>
                </span>
                <span className="flex items-center gap-1.5"><Icon className="size-3.5" />{T(label)}</span>
              </button>
            ))}
          </div>
        </Row>
        <Row label={T("主题色")} hint={T("侧边栏和主要按钮的颜色")}>
          <div role="radiogroup" aria-label={T("主题色")} className="flex flex-wrap gap-2">
            {Object.entries(THEMES).map(([k, x]) => (
              <button key={k} type="button" role="radio" aria-checked={p.theme === k} title={T(x.label)} aria-label={T(x.label)} onClick={() => set({ theme: k })}
                className={cn("grid size-9 cursor-pointer place-items-center rounded-full border-2", p.theme === k ? "border-foreground/70" : "border-transparent")}>
                <span className="grid size-7 place-items-center rounded-full text-white ring-1 ring-black/10 ring-inset dark:ring-white/30" style={{ background: x.color }}>{p.theme === k && <Check className="size-3.5" />}</span>
              </button>
            ))}
          </div>
        </Row>
        <Row label={T("强调色")} hint={T("当前步骤、进度条和最低价等高亮的颜色")}>
          <div role="radiogroup" aria-label={T("强调色")} className="flex flex-wrap gap-2">
            {Object.entries(ACCENTS).map(([k, x]) => (
              <button key={k} type="button" role="radio" aria-checked={p.accent === k} title={T(x.label)} aria-label={T(x.label)} onClick={() => set({ accent: k })}
                className={cn("grid size-9 cursor-pointer place-items-center rounded-full border-2", p.accent === k ? "border-foreground/70" : "border-transparent")}>
                <span className="grid size-7 place-items-center rounded-full text-white" style={{ background: x.color }}>{p.accent === k && <Check className="size-3.5" />}</span>
              </button>
            ))}
          </div>
        </Row>
        <Row label={T("字体大小")} hint={T("整个界面一起放大或缩小")}>
          <div role="radiogroup" aria-label={T("字体大小")} className="inline-flex rounded-md border bg-muted p-0.5">
            {Object.entries(SIZES).map(([k, x]) => (
              <button key={k} type="button" role="radio" aria-checked={p.size === k} onClick={() => set({ size: k })}
                className={cn("cursor-pointer rounded px-3.5 py-1.5", p.size === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")} style={{ fontSize: 13 * x.zoom }}>{T(x.label)}</button>
            ))}
          </div>
        </Row>
        <Row label={T("语言")} hint={T("界面语言；AI 生成的问题和说明也用这个语言")}>
          <Select aria-label={T("语言")} value={lang} onChange={(e) => switchLang(e.target.value as typeof lang)} className="h-9 w-48">{LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</Select>
        </Row>
        <div className="flex justify-end py-3"><Button variant="ghost" size="sm" onClick={() => set(DEFAULT_PREFS)}>{T("恢复默认外观")}</Button></div>
      </Section>

      {!d ? <Loading /> : (
        <>
          <Section title={T("公司")}>
            <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); const r = await run(T("保存中…"), () => api<Data>("/api/company", { method: "PATCH", body: c }), T("已保存")); if (r) setD(r); }}>
              {!admin && <Banner tone="info">{T("只有管理员可以修改这些设置。")}</Banner>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={T("公司名称")}><Input id="c-name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} disabled={!admin} /></Field>
                <Field label={T("邮件落款人")}><Input id="c-sender" value={c.senderName} onChange={(e) => setC({ ...c, senderName: e.target.value })} disabled={!admin} /></Field>
                <Field label={T("公司英文名（写进英文询价单和邮件）")}><Input id="c-name-en" value={c.nameEn} placeholder={T("留空则首次发邮件时由 AI 翻译")} onChange={(e) => setC({ ...c, nameEn: e.target.value })} disabled={!admin} /></Field>
                <Field label={T("落款人英文名")}><Input id="c-sender-en" value={c.senderEn} placeholder={T("例如：Li Jihuan")} onChange={(e) => setC({ ...c, senderEn: e.target.value })} disabled={!admin} /></Field>
              </div>
              <p className="text-xs text-muted-foreground">{T("发给供应商的邮件一律用英文。")}</p>
              {admin && <div className="flex items-center gap-3"><Button type="submit" id="c-save" disabled={!!busy}>{T("保存")}</Button><Busy text={busy} /></div>}
            </form>
          </Section>

          <Section title={T("团队成员")} bodyClassName="grid gap-4">
            <TableFrame>
              <thead><tr><th>{T("姓名")}</th><th>{T("邮箱")}</th><th>{T("角色")}</th></tr></thead>
              <tbody>{d.members.map((u) => <tr key={u.id}><td>{u.name || "—"}</td><td>{u.email}</td><td><Badge variant={u.role === "admin" ? "ink" : "default"}>{T(ROLES[u.role] || u.role)}</Badge></td></tr>)}</tbody>
            </TableFrame>
            {admin && (
              <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await run(T("添加中…"), () => api("/api/members", { body: m }), T("已添加，请把邮箱和初始密码告诉同事")); if (r) { setM({ email: "", name: "", password: "", role: "buyer" }); api<Data>("/api/company").then(setD); } }}>
                <Input aria-label={T("姓名")} placeholder={T("姓名")} value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} className="h-8 w-40" />
                <Input aria-label={T("邮箱")} placeholder={T("邮箱")} type="email" required value={m.email} onChange={(e) => setM({ ...m, email: e.target.value })} className="h-8 w-56" />
                <Input aria-label={T("初始密码")} placeholder={T("初始密码（至少 8 位）")} required minLength={8} value={m.password} onChange={(e) => setM({ ...m, password: e.target.value })} className="h-8 w-48" />
                <Select aria-label={T("角色")} value={m.role} onChange={(e) => setM({ ...m, role: e.target.value })} className="h-8 w-36 text-xs">{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{T(v)}</option>)}</Select>
                <Button type="submit" size="sm" variant="secondary" disabled={!!busy}><UserPlus />{T("添加成员")}</Button>
              </form>
            )}
          </Section>
        </>
      )}
    </>
  );
}
