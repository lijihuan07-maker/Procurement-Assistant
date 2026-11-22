"use client";
import { useState } from "react";
import { FileSpreadsheet, Mail } from "lucide-react";
import { sheetRows } from "@/lib/client/files";
import { parseRfqTemplate, slimTemplate } from "@/lib/client/excel";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Drop, Banner, toast } from "@/components/app";
import { DEFAULT_EMAIL } from "@/lib/email-default";
import type { ReqSettings } from "@/lib/client/types";

/** RFQ numbering, commercial terms, RFQ Excel template and email template of one procurement requirement. */
export function ReqSettingsForm({ value: v, onChange, disabled }: { value: ReqSettings; onChange: (v: ReqSettings) => void; disabled?: boolean }) {
  const T = useT();
  const [reading, setReading] = useState(false);
  const [mailOpen, setMailOpen] = useState(!!v.email);
  const set = <K extends keyof ReqSettings>(k: K, x: ReqSettings[K]) => onChange({ ...v, [k]: x });
  const mail = v.email || DEFAULT_EMAIL;

  async function uploadTpl(files: File[]) {
    const file = files[0]; if (!file) return;
    setReading(true);
    try {
      const t = parseRfqTemplate(await sheetRows(file), file.name);
      const { prefix, nextNo, pad, payment, validity, currency, ...rest } = t;
      // Keep a slim copy of the file itself so exported RFQs reuse its exact layout and styles.
      const tpl = { ...rest, fileB64: /\.xlsx$/i.test(file.name) ? await slimTemplate(await file.arrayBuffer()) : undefined };
      onChange({
        ...v, rfqTemplate: tpl,
        ...(prefix && nextNo ? { rfqPrefix: prefix, rfqStart: nextNo, rfqPad: pad } : {}),
        ...(payment ? { paymentTerms: payment } : {}), ...(validity ? { validity } : {}), ...(currency ? { currency } : {}),
      });
      toast(/\*{2,}/.test(payment) ? T("模板已读取。付款条款里还有 ***% 占位符，请在下面改好") : T("模板已读取：{a} 行项目信息、{b} 个条款栏", { a: t.headerLines.length, b: t.blocks.length }));
    } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
    setReading(false);
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <h3 className="text-[13px] font-semibold">{T("询价单 Excel 模板")}</h3>
        {v.rfqTemplate ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2.5 text-[13px]">
            <FileSpreadsheet className="size-4 text-good" /><span className="font-medium">{v.rfqTemplate.fileName}</span><Badge variant="good">{T("使用中")}</Badge>
            {!v.rfqTemplate.fileB64 && <Badge variant="warn">{T("旧版模板，请重新上传以保留原格式")}</Badge>}
            <span className="text-xs text-muted-foreground">{T("{a} 行项目信息、{b} 个条款栏", { a: v.rfqTemplate.headerLines.length, b: v.rfqTemplate.blocks.length })}</span>
            <span className="ms-auto flex gap-1">
              <Drop compact id="tpl-replace" title={T("换一个")} hint="" accept=".xlsx,.xls" onFiles={uploadTpl} disabled={disabled || reading} />
              <Button variant="ghost" size="sm" disabled={disabled} onClick={() => set("rfqTemplate", null)}>{T("移除模板")}</Button>
            </span>
          </div>
        ) : (
          <Drop id="tpl-file" title={T("上传询价单模板（可选）")} hint={T("你们以前发出的询价单 .xlsx，明细表头以 “Item” 开头。导出时沿用它的版式和条款；不上传就用系统默认格式")} accept=".xlsx,.xls" onFiles={uploadTpl} disabled={disabled || reading} />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={T("询价单号前缀")}><Input id="st-prefix" className="num" value={v.rfqPrefix} onChange={(e) => set("rfqPrefix", e.target.value)} disabled={disabled} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={T("起始编号")}><Input id="st-start" type="number" min="1" value={v.rfqStart} onChange={(e) => set("rfqStart", Number(e.target.value) || 1)} disabled={disabled} /></Field>
          <Field label={T("编号位数")}><Input id="st-pad" type="number" min="1" max="8" value={v.rfqPad} onChange={(e) => set("rfqPad", Number(e.target.value) || 1)} disabled={disabled} /></Field>
        </div>
        <Field label={T("币种")}><Input id="st-cur" value={v.currency} onChange={(e) => set("currency", e.target.value)} disabled={disabled} /></Field>
        <Field label={T("增值税率（小数，如 0.15）")}><Input id="st-vat" type="number" step="0.01" min="0" max="0.99" value={v.vatRate} onChange={(e) => set("vatRate", Number(e.target.value))} disabled={disabled} /></Field>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{T("示例编号：")}<span className="num font-medium text-foreground">{v.rfqPrefix}{String(v.rfqStart).padStart(Number(v.rfqPad) || 1, "0")}</span> · {T("同一前缀的编号在整个公司里顺延，已用过的号不会重复")}</p>
      <Field label={T("报价有效期")}><Input id="st-valid" value={v.validity} onChange={(e) => set("validity", e.target.value)} disabled={disabled} /></Field>
      <Field label={T("付款条款（写进询价单）")}><Textarea id="st-pay" rows={3} value={v.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} disabled={disabled} /></Field>
      {/\*{2,}/.test(v.paymentTerms) && <Banner>{T("付款条款里还有 “***%” 这样的占位符，请改成实际比例。")}</Banner>}

      <div className="grid gap-3 border-t pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Mail className="size-4 text-muted-foreground" /><h3 className="text-[13px] font-semibold">{T("询价邮件模板")}</h3>
          <span className="text-xs text-muted-foreground">{v.email ? T("自定义") : T("系统默认")}</span>
          <Button variant="link" size="sm" className="ms-auto" onClick={() => setMailOpen(!mailOpen)}>{mailOpen ? T("收起") : T("修改邮件模板")}</Button>
        </div>
        {mailOpen && (
          <div className="grid gap-3">
            <p className="text-xs text-muted-foreground">{T("可用变量：")}<code className="text-[11px]">{"{supplier} {contact} {rfqNo} {title} {project} {deadline} {sender} {company}"}</code></p>
            <Field label={T("主题")}><Input id="st-subject" value={mail.subject} onChange={(e) => set("email", { ...mail, subject: e.target.value })} disabled={disabled} /></Field>
            <Field label={T("正文")}><Textarea id="st-body" className="mail" value={mail.body} onChange={(e) => set("email", { ...mail, body: e.target.value })} disabled={disabled} /></Field>
            {v.email && <div><Button variant="ghost" size="sm" disabled={disabled} onClick={() => set("email", null)}>{T("恢复系统默认")}</Button></div>}
          </div>
        )}
      </div>
    </div>
  );
}
