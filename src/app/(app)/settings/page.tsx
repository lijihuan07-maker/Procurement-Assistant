"use client";
import { useEffect, useState } from "react";
import { FileSpreadsheet, UserPlus } from "lucide-react";
import { api } from "@/lib/client/api";
import { sheetRows } from "@/lib/client/files";
import { parseRfqTemplate, slimTemplate } from "@/lib/client/excel";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useBusy, Busy, Drop, toast, PageHeader, Section, TableFrame, Banner, Loading } from "@/components/app";
import type { RfqTemplate, EmailTemplate } from "@/db/schema";

type Company = { id: string; name: string; rfqPrefix: string; rfqNextNo: number; rfqPad: number; currency: string; vatRate: number; paymentTerms: string; validity: string; senderName: string };
type Data = { company: Company; rfqTemplate: { id: string; name: string; data: RfqTemplate } | null; emailTemplate: EmailTemplate; members: { id: string; email: string; name: string; role: string }[]; me: { role: string } };

const ROLES: Record<string, string> = { admin: "管理员", manager: "采购经理", buyer: "采购工程师" };

export default function Settings() {
  const T = useT();
  const [d, setD] = useState<Data | null>(null);
  const [c, setC] = useState<Company | null>(null);
  const [mail, setMail] = useState<EmailTemplate | null>(null);
  const [m, setM] = useState({ email: "", name: "", password: "", role: "buyer" });
  const { busy, run } = useBusy();
  const apply = (x: Data) => { setD(x); setC(x.company); setMail(x.emailTemplate); };
  useEffect(() => { api<Data>("/api/company").then(apply).catch((e) => toast(e.message, true)); }, []);
  if (!d || !c || !mail) return <Loading />;
  const admin = d.me.role === "admin";
  const set = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setC({ ...c, [k]: e.target.value } as Company);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(T("保存中…"), () => api<Data>("/api/company", { method: "PATCH", body: { ...c, vatRate: Number(c!.vatRate) } }), T("已保存"));
    if (r) apply(r);
  }
  async function uploadTpl(files: File[]) {
    const file = files[0]; if (!file) return;
    const r = await run(T("读取模板…"), async () => {
      const t = parseRfqTemplate(await sheetRows(file), file.name);
      const { prefix, nextNo, pad, payment, validity, currency, ...rest } = t;
      // Keep a slim copy of the file itself so exported RFQs reuse its exact layout and styles.
      const data = { ...rest, fileB64: /\.xlsx$/i.test(file.name) ? await slimTemplate(await file.arrayBuffer()) : undefined };
      let res = await api<Data>("/api/company", { body: { kind: "rfq", name: file.name, data } });
      const patch: Record<string, unknown> = {};
      if (prefix && nextNo) Object.assign(patch, { rfqPrefix: prefix, rfqNextNo: nextNo, rfqPad: pad });
      if (payment) patch.paymentTerms = payment;
      if (validity) patch.validity = validity;
      if (currency) patch.currency = currency;
      if (admin && Object.keys(patch).length) res = await api<Data>("/api/company", { method: "PATCH", body: patch });
      return { res, t };
    });
    if (r) {
      apply(r.res);
      toast(/\*{2,}/.test(r.t.payment) ? T("模板已读取。付款条款里还有 ***% 占位符，请在下面改好") : T("模板已读取：{a} 行项目信息、{b} 个条款栏", { a: r.t.headerLines.length, b: r.t.blocks.length }));
    }
  }

  return (
    <>
      <PageHeader title={T("设置与模板")} actions={<Busy text={busy} />}>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{T("公司信息、询价单编号规则、默认条款，以及询价单和邮件模板。")}</p>
      </PageHeader>
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title={T("公司与询价默认值")} className="xl:mb-0">
          <form className="grid gap-4" onSubmit={save}>
            {!admin && <Banner tone="info">{T("只有管理员可以修改这些设置。")}</Banner>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={T("公司名称")}><Input id="c-name" value={c.name} onChange={set("name")} disabled={!admin} /></Field>
              <Field label={T("邮件落款人")}><Input id="c-sender" value={c.senderName} onChange={set("senderName")} disabled={!admin} /></Field>
              <Field label={T("询价单号前缀")}><Input id="c-prefix" className="num" value={c.rfqPrefix} onChange={set("rfqPrefix")} disabled={!admin} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={T("下一个编号")}><Input id="c-next" type="number" min="1" value={c.rfqNextNo} onChange={set("rfqNextNo")} disabled={!admin} /></Field>
                <Field label={T("编号位数")}><Input id="c-pad" type="number" min="1" max="8" value={c.rfqPad} onChange={set("rfqPad")} disabled={!admin} /></Field>
              </div>
              <Field label={T("币种")}><Input id="c-cur" value={c.currency} onChange={set("currency")} disabled={!admin} /></Field>
              <Field label={T("增值税率（小数，如 0.15）")}><Input id="c-vat" type="number" step="0.01" min="0" max="1" value={c.vatRate} onChange={set("vatRate")} disabled={!admin} /></Field>
              <Field label={T("报价有效期")} className="sm:col-span-2"><Input id="c-valid" value={c.validity} onChange={set("validity")} disabled={!admin} /></Field>
            </div>
            <Field label={T("付款条款（写进询价单）")}><Textarea id="c-pay" rows={3} value={c.paymentTerms} onChange={set("paymentTerms")} disabled={!admin} /></Field>
            {/\*{2,}/.test(c.paymentTerms) && <Banner>{T("付款条款里还有 “***%” 这样的占位符，请改成实际比例。")}</Banner>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <span className="text-xs text-muted-foreground">{T("示例编号：")}<span className="num font-medium text-foreground">{c.rfqPrefix}{String(c.rfqNextNo).padStart(Number(c.rfqPad) || 1, "0")}</span></span>
              {admin && <Button type="submit" id="c-save" disabled={!!busy}>{T("保存")}</Button>}
            </div>
          </form>
        </Section>
        <Section title={T("询价单模板")} description={T("上传一份你们以前发出的询价单 Excel。导出询价单时沿用它的版式、字体、合并单元格、公式和全部条款，只替换项目信息、编号、截止日期和明细。")} className="xl:mb-0">
          <div className="grid gap-4">
            <Drop id="tpl-file" title={T("上传询价单模板")} hint={T(".xlsx，明细表头以 “Item” 开头")} accept=".xlsx,.xls" onFiles={uploadTpl} disabled={!!busy} />
            {d.rfqTemplate ? (
              <div className="grid gap-3 rounded-md border p-4">
                <div className="flex flex-wrap items-center gap-2"><FileSpreadsheet className="size-4 text-good" /><span className="font-medium">{d.rfqTemplate.name}</span><Badge variant="good">{T("使用中")}</Badge>
                  {!d.rfqTemplate.data.fileB64 && <Badge variant="warn">{T("旧版模板，请重新上传以保留原格式")}</Badge>}
                  <Button variant="ghost" size="sm" className="ms-auto" onClick={async () => { const r = await run(T("移除中…"), () => api(`/api/templates/${d.rfqTemplate!.id}`, { method: "DELETE" })); if (r) api<Data>("/api/company").then(apply); }}>{T("移除模板")}</Button></div>
                <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[max-content_1fr]">
                  <dt className="text-muted-foreground">{T("标题后缀")}</dt><dd>{d.rfqTemplate.data.titleSuffix || "—"}</dd>
                  <dt className="text-muted-foreground">{T("项目信息")}</dt><dd>{d.rfqTemplate.data.headerLines.join(" / ") || "—"}</dd>
                  <dt className="text-muted-foreground">{T("条款栏")}</dt><dd>{d.rfqTemplate.data.blocks.map((b) => b.label.split("\n")[0]).join(", ")}</dd>
                </dl>
              </div>
            ) : <p className="text-[13px] text-muted-foreground">{T("未上传，使用系统默认格式和通用条款。")}</p>}
          </div>
        </Section>
      </div>

      <Section title={T("询价邮件模板")} className="mt-5" actions={<span className="text-xs text-muted-foreground">{T("可用变量：")}<code className="text-[11px]">{"{supplier} {contact} {rfqNo} {title} {project} {deadline} {sender} {company}"}</code></span>}>
        <div className="grid gap-4">
          <Field label={T("主题")}><Input id="m-subject" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} /></Field>
          <Field label={T("正文")}><Textarea id="m-body" className="mail" value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} /></Field>
          <div className="flex flex-wrap items-center gap-3"><Button disabled={!!busy} onClick={async () => { const r = await run(T("保存中…"), () => api<Data>("/api/company", { body: { kind: "email", name: T("邮件模板"), data: mail } }), T("邮件模板已保存")); if (r) apply(r); }}>{T("保存邮件模板")}</Button><span className="text-xs text-muted-foreground">{T("已生成的邮件不受影响，之后生成的邮件使用新模板。")}</span></div>
        </div>
      </Section>

      <Section title={T("团队成员")} bodyClassName="grid gap-4">
        <TableFrame>
          <thead><tr><th>{T("姓名")}</th><th>{T("邮箱")}</th><th>{T("角色")}</th></tr></thead>
          <tbody>{d.members.map((u) => <tr key={u.id}><td>{u.name || "—"}</td><td>{u.email}</td><td><Badge variant={u.role === "admin" ? "ink" : "default"}>{T(ROLES[u.role] || u.role)}</Badge></td></tr>)}</tbody>
        </TableFrame>
        {admin && (
          <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await run(T("添加中…"), () => api("/api/members", { body: m }), T("已添加，请把邮箱和初始密码告诉同事")); if (r) { setM({ email: "", name: "", password: "", role: "buyer" }); api<Data>("/api/company").then(apply); } }}>
            <Input aria-label={T("姓名")} placeholder={T("姓名")} value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} className="h-8 w-40" />
            <Input aria-label={T("邮箱")} placeholder={T("邮箱")} type="email" required value={m.email} onChange={(e) => setM({ ...m, email: e.target.value })} className="h-8 w-56" />
            <Input aria-label={T("初始密码")} placeholder={T("初始密码（至少 8 位）")} required minLength={8} value={m.password} onChange={(e) => setM({ ...m, password: e.target.value })} className="h-8 w-48" />
            <Select aria-label={T("角色")} value={m.role} onChange={(e) => setM({ ...m, role: e.target.value })} className="h-8 w-36 text-xs">{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{T(v)}</option>)}</Select>
            <Button type="submit" size="sm" variant="secondary" disabled={!!busy}><UserPlus />{T("添加成员")}</Button>
          </form>
        )}
      </Section>
    </>
  );
}
