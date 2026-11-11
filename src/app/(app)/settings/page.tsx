"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { sheetRows } from "@/lib/client/files";
import { parseRfqTemplate } from "@/lib/client/excel";
import { useBusy, Busy, Drop, toast } from "@/components/ui";
import type { RfqTemplate, EmailTemplate } from "@/db/schema";

type Company = { id: string; name: string; rfqPrefix: string; rfqNextNo: number; rfqPad: number; currency: string; vatRate: number; paymentTerms: string; validity: string; senderName: string };
type Data = { company: Company; rfqTemplate: { id: string; name: string; data: RfqTemplate } | null; emailTemplate: EmailTemplate; members: { id: string; email: string; name: string; role: string }[]; me: { role: string } };

const ROLES: Record<string, string> = { admin: "管理员", manager: "采购经理", buyer: "采购工程师" };

export default function Settings() {
  const [d, setD] = useState<Data | null>(null);
  const [c, setC] = useState<Company | null>(null);
  const [mail, setMail] = useState<EmailTemplate | null>(null);
  const [m, setM] = useState({ email: "", name: "", password: "", role: "buyer" });
  const { busy, run } = useBusy();
  const apply = (x: Data) => { setD(x); setC(x.company); setMail(x.emailTemplate); };
  useEffect(() => { api<Data>("/api/company").then(apply).catch((e) => toast(e.message, true)); }, []);
  if (!d || !c || !mail) return <Busy text="加载中…" />;
  const admin = d.me.role === "admin";
  const set = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setC({ ...c, [k]: e.target.value } as Company);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await run("保存中…", () => api<Data>("/api/company", { method: "PATCH", body: { ...c, vatRate: Number(c!.vatRate) } }), "已保存");
    if (r) apply(r);
  }
  async function uploadTpl(files: File[]) {
    const file = files[0]; if (!file) return;
    const r = await run("读取模板…", async () => {
      const t = parseRfqTemplate(await sheetRows(file), file.name);
      const { prefix, nextNo, pad, payment, validity, currency, ...data } = t;
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
      toast(/\*{2,}/.test(r.t.payment) ? "模板已读取。付款条款里还有 ***% 占位符，请在下面改好" : `模板已读取：${r.t.headerLines.length} 行项目信息、${r.t.blocks.length} 个条款栏`);
    }
  }

  return (
    <>
      <div className="page-head"><div><h1>设置与模板</h1><p>公司信息、询价单编号规则、默认条款，以及询价单和邮件模板。</p></div><Busy text={busy} /></div>
      <div className="grid2">
        <section className="panel">
          <h2>公司与询价默认值</h2>
          {!admin && <div className="banner">只有管理员可以修改这些设置。</div>}
          <form className="form" onSubmit={save}>
            <div className="fields">
              <label className="field">公司名称<input id="c-name" value={c.name} onChange={set("name")} disabled={!admin} /></label>
              <label className="field">邮件落款人<input id="c-sender" value={c.senderName} onChange={set("senderName")} disabled={!admin} /></label>
              <label className="field">询价单号前缀<input id="c-prefix" className="mono" value={c.rfqPrefix} onChange={set("rfqPrefix")} disabled={!admin} /></label>
              <label className="field">下一个编号<input id="c-next" type="number" min="1" value={c.rfqNextNo} onChange={set("rfqNextNo")} disabled={!admin} /></label>
              <label className="field">编号位数<input id="c-pad" type="number" min="1" max="8" value={c.rfqPad} onChange={set("rfqPad")} disabled={!admin} /></label>
              <label className="field">币种<input id="c-cur" className="mono" value={c.currency} onChange={set("currency")} disabled={!admin} /></label>
              <label className="field">增值税率（小数，如 0.15）<input id="c-vat" type="number" step="0.01" min="0" max="1" value={c.vatRate} onChange={set("vatRate")} disabled={!admin} /></label>
              <label className="field">报价有效期<input id="c-valid" value={c.validity} onChange={set("validity")} disabled={!admin} /></label>
            </div>
            <label className="field">付款条款（写进询价单）<textarea id="c-pay" rows={3} value={c.paymentTerms} onChange={set("paymentTerms")} disabled={!admin} /></label>
            {/\*{2,}/.test(c.paymentTerms) && <div className="banner">付款条款里还有 “***%” 这样的占位符，请改成实际比例。</div>}
            <div className="small muted">示例编号：<span className="mono">{c.rfqPrefix}{String(c.rfqNextNo).padStart(Number(c.rfqPad) || 1, "0")}</span></div>
            {admin && <div className="actions"><button className="primary" disabled={!!busy}>保存</button></div>}
          </form>
        </section>
        <section className="panel">
          <h2>询价单模板</h2>
          <p className="small muted" style={{ margin: 0 }}>上传一份你们以前发出的询价单 Excel。生成询价单时沿用它的项目信息和全部条款，编号规则、付款条款、有效期和币种也会带进上面的设置。合计公式、“Request” 栏会自动修正，并附上报价说明。</p>
          <Drop id="tpl-file" title="上传询价单模板" hint=".xlsx，明细表头以 “Item” 开头" accept=".xlsx,.xls" onFiles={uploadTpl} disabled={!!busy} />
          {d.rfqTemplate ? (
            <div className="form">
              <div className="actions"><span className="chip good">使用中</span><b>{d.rfqTemplate.name}</b><button className="link" onClick={async () => { const r = await run("移除中…", () => api(`/api/templates/${d.rfqTemplate!.id}`, { method: "DELETE" })); if (r) api<Data>("/api/company").then(apply); }}>移除模板</button></div>
              <dl className="kv">
                <dt>标题后缀</dt><dd>{d.rfqTemplate.data.titleSuffix || "—"}</dd>
                <dt>项目信息</dt><dd>{d.rfqTemplate.data.headerLines.join(" / ") || "—"}</dd>
                <dt>条款栏</dt><dd>{d.rfqTemplate.data.blocks.map((b) => b.label.split("\n")[0]).join("、")}</dd>
              </dl>
            </div>
          ) : <div className="small muted">未上传，使用系统默认的中英双语格式和通用条款。</div>}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><h2>询价邮件模板</h2><span className="small muted">可用变量：{"{supplier} {contact} {rfqNo} {title} {project} {deadline} {sender} {company}"}</span></div>
        <label className="field">主题<input id="m-subject" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} /></label>
        <label className="field">正文<textarea id="m-body" className="mail" value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} /></label>
        <div className="actions"><button className="primary" disabled={!!busy} onClick={async () => { const r = await run("保存中…", () => api<Data>("/api/company", { body: { kind: "email", name: "邮件模板", data: mail } }), "邮件模板已保存"); if (r) apply(r); }}>保存邮件模板</button><span className="small muted">已生成的邮件不受影响，之后生成的邮件使用新模板。</span></div>
      </section>

      <section className="panel">
        <h2>团队成员</h2>
        <div className="tbl-wrap"><table>
          <thead><tr><th>姓名</th><th>邮箱</th><th>角色</th></tr></thead>
          <tbody>{d.members.map((u) => <tr key={u.id}><td>{u.name || "—"}</td><td>{u.email}</td><td>{ROLES[u.role] || u.role}</td></tr>)}</tbody>
        </table></div>
        {admin && (
          <form className="actions" onSubmit={async (e) => { e.preventDefault(); const r = await run("添加中…", () => api("/api/members", { body: m }), "已添加，请把邮箱和初始密码告诉同事"); if (r) { setM({ email: "", name: "", password: "", role: "buyer" }); api<Data>("/api/company").then(apply); } }}>
            <input aria-label="姓名" placeholder="姓名" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
            <input aria-label="邮箱" placeholder="邮箱" type="email" required value={m.email} onChange={(e) => setM({ ...m, email: e.target.value })} />
            <input aria-label="初始密码" placeholder="初始密码（至少 8 位）" required minLength={8} value={m.password} onChange={(e) => setM({ ...m, password: e.target.value })} />
            <select aria-label="角色" value={m.role} onChange={(e) => setM({ ...m, role: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <button disabled={!!busy}>添加成员</button>
          </form>
        )}
      </section>
    </>
  );
}
