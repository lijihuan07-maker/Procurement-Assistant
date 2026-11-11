"use client";
import type { RfqLine, RfqTemplate, Flag, QuoteData } from "@/db/schema";
import type { compute } from "@/lib/compare";

type ExcelJSNS = typeof import("exceljs");
async function lib(): Promise<ExcelJSNS> { const m = await import("exceljs"); return ((m as unknown as { default?: ExcelJSNS }).default ?? m) as ExcelJSNS; }

const XF = { name: "Arial", size: 10 };
const XB = { ...XF, bold: true };
const XBLUE = { ...XF, color: { argb: "FF0000FF" } };
const thin = { style: "thin" as const, color: { argb: "FFA6A6A6" } };
const BOX = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
const colL = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const estLines = (t: unknown, w: number) => String(t ?? "").split("\n").reduce((s, l) => s + Math.max(1, Math.ceil(l.length / w)), 0);

/* ---------------- RFQ template parsing ---------------- */
export function parseRfqTemplate(rows: unknown[][], fileName: string): RfqTemplate & { prefix: string; nextNo: number | null; pad: number; payment: string; validity: string; currency: string } {
  const cellStr = (r: unknown[] | undefined) => String((r || []).find((v) => v != null && String(v).trim() !== "") ?? "").trim();
  const hdr = rows.findIndex((r) => r && /^item/i.test(String(r[0] ?? "").trim()));
  if (hdr < 0) throw new Error("没有找到以 “Item” 开头的明细表头行，请上传按你们格式填写的询价单");
  const t = { fileName, headerLines: [] as string[], blocks: [] as { label: string; values: string[] }[], titleSuffix: "", prefix: "", nextNo: null as number | null, pad: 3, payment: "", validity: "", currency: "" };
  const m = cellStr(rows[0]).match(/-\s+(.+)$/); if (m) t.titleSuffix = m[1].trim();
  for (let i = 1; i < hdr; i++) {
    const s = cellStr(rows[i]); if (!s) continue;
    if (/^request\s*no/i.test(s)) { const mm = s.match(/:\s*(.*?)(\d+)\s*$/); if (mm) { t.prefix = mm[1]; t.nextNo = +mm[2] + 1; t.pad = mm[2].length; } continue; }
    if (/^request\s*:/i.test(s) || /^boq/i.test(s)) continue;
    t.headerLines.push(s);
  }
  const tot = rows.findIndex((r, i) => i > hdr && /in\s*total/i.test(String(r?.[0] ?? "")));
  let cur: { label: string; values: string[] } | null = null;
  for (let i = (tot < 0 ? hdr + 1 : tot + 1); i < rows.length; i++) {
    const r = rows[i] || []; const lab = String(r[0] ?? "").trim();
    const vals = r.slice(2).filter((v) => v != null && String(v).trim() !== "").map((v) => String(v).trim());
    if (tot < 0 && /^\d+$/.test(lab)) continue;
    if (lab) { cur = { label: lab, values: vals }; t.blocks.push(cur); } else if (cur && vals.length) cur.values.push(...vals);
  }
  t.payment = t.blocks.find((b) => /payment|支付/i.test(b.label))?.values.join(" ") || "";
  t.validity = t.blocks.find((b) => /valid|有效/i.test(b.label))?.values.join(" ") || "";
  t.currency = rows.flat().filter((v): v is string => typeof v === "string").join(" ").match(/Unit Price\s*\/\s*([A-Z]{3})/)?.[1] || "";
  return t;
}

const DEFAULT_TERMS = [
  "1. The unit price is fixed during the supply period and will not be adjusted.",
  "2. The price includes all costs of production, packaging, transportation to site, profit and risks. VAT is shown separately.",
  "3. The Supplier shall assist with unloading on site with its own manpower and equipment.",
  "4. Quantities are provisional. The Buyer may adjust them; settlement is based on the quantity actually delivered and accepted. Additional quantities up to 15% per item shall be supplied at the same unit price.",
  "5. Materials shall comply with the specifications and drawings. The material submittal (MTA) shall be approved by the Buyer and the Employer before supply.",
  "6. The Supplier shall provide delivery notes, factory certificates, test reports and other required documents with each delivery.",
  "7. Rejected materials shall be replaced at the Supplier's cost within 3 days.",
  "8. Risk of loss and damage remains with the Supplier until the materials are delivered and accepted on site.",
];
const DEFAULT_BLOCKS = [
  { label: "INCOTERMS\n（贸易术语）", values: ["DDP – delivered to project site"] },
  { label: "Delivery location\n（交货地点）", values: ["Project site; the exact location will be given in the Buyer's written notice."] },
  { label: "Delivery period\n（交货期）", values: ["As per the Buyer's written notice."] },
  { label: "Quotation Deadline\n（报价截止日期）", values: [] },
  { label: "Valid Period\n（报价有效期）", values: [] },
  { label: "Terms of supply\n（供应条款）", values: DEFAULT_TERMS },
  { label: "Terms of payment\n（支付条款）", values: [] },
];
const QUOTE_NOTES = [
  "1. Quote every item in the unit stated in this RFQ. If you price in another unit (e.g. per m² instead of per piece), state the unit price, the unit and the conversion factor in the Remark column.",
  "2. State any deviation from the specification (size, thickness, brand, material) in the Remark column. Deviations that are not stated will not be accepted.",
  "3. State minimum order quantities, if any. Fill in the company name, quotation date, signature and stamp.",
];

export type RfqDoc = { rfqNo: string; titleCn: string; titleEn: string; project: string; currency: string; vatRate: number; deadline: string; validity: string; payment: string; lines: RfqLine[]; template: RfqTemplate | null };

export async function buildRfq(d: RfqDoc): Promise<Blob> {
  const ExcelJS = await lib();
  const vatPct = Math.round(d.vatRate * 10000) / 100;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("RFQ", { pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  [7, 24, 30, 8, 12, 14, 11, 15, 14, 16, 30, 32].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  let r = 1;
  const line = (text: string, font: object = XF, h?: number) => { const c = ws.getCell(r, 1); c.value = text; c.font = font; c.alignment = { wrapText: true, vertical: "middle" }; ws.mergeCells(r, 1, r, 12); if (h) ws.getRow(r).height = h; r++; };
  const tpl = d.template;
  const suffix = tpl?.titleSuffix || d.project || "";
  line(`RFQ for ${d.titleEn || d.titleCn}${suffix ? " - " + suffix : ""}`, { ...XB, size: 13 }, 34);
  (tpl?.headerLines?.length ? tpl.headerLines : [d.project ? `Project Name: ${d.project}` : ""]).filter(Boolean).forEach((s) => line(s));
  line(`Request: ${d.titleEn || ""}${d.titleCn ? "（" + d.titleCn + "）" : ""}`, XB);
  line(`Request No.: ${d.rfqNo}`, XB);
  line("BOQ:");
  const hdr = ["Item\n(序号)", "Description\n（内容）", null, "Unit\n（单位）", "Qty\n（数量）", `Unit Price/${d.currency}\n（不含税单价）`, `VAT (${vatPct}%)\n（税率）`, `U.Price with VAT/${d.currency}\n（含税单价）`, `VAT Amount/${d.currency}\n（税额）`, `Total Amount/${d.currency}\n（含税合价）`, "Technical Requirement\n(技术质量要求)", "Remark\n（备注）"];
  hdr.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.font = XB; c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" }; c.fill = fill("FFDCEBEE"); c.border = BOX; });
  ws.mergeCells(r, 2, r, 3); ws.getRow(r).height = 44; r++;
  const first = r;
  d.lines.forEach((ln) => {
    const nameParts = ln.name.split(/\s+(?=[A-Z0-9])/);
    const vals: unknown[] = [Number(ln.no), nameParts.length > 1 ? `${nameParts[0]}\n${nameParts.slice(1).join(" ")}` : ln.name, ln.spec, ln.unit, ln.qty, null,
      { formula: `ROUND(F${r}*${d.vatRate},2)` }, { formula: `F${r}+G${r}` }, { formula: `E${r}*G${r}` }, { formula: `E${r}*H${r}` }, ln.techReq, ln.hint];
    vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v as never; c.font = XF; c.border = BOX; c.alignment = { wrapText: true, vertical: "middle", horizontal: i === 0 || i === 3 ? "center" : i >= 4 && i <= 9 ? "right" : "left" }; });
    ws.getCell(r, 5).numFmt = "#,##0.###"; [6, 7, 8, 9, 10].forEach((i) => (ws.getCell(r, i).numFmt = "#,##0.00"));
    ws.getCell(r, 6).fill = fill("FFFFF6CC");
    const lines = Math.max(estLines(vals[1], 22), estLines(vals[2], 28), estLines(vals[10], 28), estLines(vals[11], 30));
    ws.getRow(r).height = Math.min(150, Math.max(30, lines * 13 + 8));
    r++;
  });
  const last = r - 1;
  for (let i = 1; i <= 12; i++) ws.getCell(r, i).border = BOX;
  ws.getCell(r, 1).value = "In Total（含税合计）"; ws.getCell(r, 1).font = XB; ws.getCell(r, 1).alignment = { horizontal: "right", vertical: "middle" }; ws.mergeCells(r, 1, r, 9);
  const tc = ws.getCell(r, 10); tc.value = { formula: `SUM(J${first}:J${last})` } as never; tc.font = XB; tc.numFmt = "#,##0.00";
  ws.getRow(r).height = 24; r++;
  const block = (label: string, values: string[]) => {
    const vs = values.filter((v) => v != null && String(v).trim() !== ""); if (!vs.length) vs.push("");
    vs.forEach((v, j) => {
      for (let i = 1; i <= 12; i++) ws.getCell(r, i).border = BOX;
      const a = ws.getCell(r, 1); if (j === 0) { a.value = label; a.font = XB; } a.alignment = { wrapText: true, vertical: "middle" };
      const c = ws.getCell(r, 3); c.value = String(v); c.font = XF; c.alignment = { wrapText: true, vertical: "middle" };
      ws.mergeCells(r, 1, r, 2); ws.mergeCells(r, 3, r, 12);
      ws.getRow(r).height = Math.min(160, Math.max(j === 0 && /\n/.test(label) ? 30 : 20, estLines(v, 165) * 13 + 8, j === 0 ? estLines(label, 26) * 13 + 6 : 0)); r++;
    });
  };
  const fmtDate = (s: string) => (s ? s.replace(/^(\d{4})-0?(\d+)-0?(\d+)$/, "$1.$2.$3") : "");
  const seen = { deadline: false, valid: false, pay: false };
  (tpl?.blocks?.length ? tpl.blocks : DEFAULT_BLOCKS).forEach((b) => {
    const L = b.label;
    if (/deadline|截止/i.test(L)) { block(L, [fmtDate(d.deadline)]); seen.deadline = true; }
    else if (/valid|有效/i.test(L)) { block(L, [d.validity]); seen.valid = true; }
    else if (/payment|支付|付款/i.test(L)) { block(L, [d.payment]); seen.pay = true; }
    else if (/incoterm/i.test(L)) block(L, [b.values.join(" / ")]);
    else if (/supplier|signature|stamp|date of quotation|供应商|签字|报价日期/i.test(L)) return;
    else block(L, b.values);
  });
  if (!seen.deadline) block("Quotation Deadline\n（报价截止日期）", [fmtDate(d.deadline)]);
  if (!seen.valid) block("Valid Period\n（报价有效期）", [d.validity]);
  if (!seen.pay) block("Terms of payment\n（支付条款）", [d.payment]);
  block("Quotation Instructions\n（报价说明）", QUOTE_NOTES);
  ["Supplier\n（供应商公司名称）", "Signature & Stamp\n（签字盖章）", "Date of Quotation\n（报价日期）"].forEach((l) => { block(l, [""]); ws.getRow(r - 1).height = 30; });
  return new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/* ---------------- comparison export ---------------- */
type C = ReturnType<typeof compute>;
export async function buildCompare(o: { c: C; rfqNo: string; title: string; project: string; currency: string; vatRate: number; flags: Flag[]; quotes: { status: string; fileName: string; data: QuoteData }[]; terms: Record<string, string>; history: Record<string, { supplierName: string; unitPrice: number; unit: string; date: string } | null> }): Promise<Blob> {
  const ExcelJS = await lib();
  const { c } = o;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("比价汇总", { views: [{ state: "frozen", xSplit: 3, ySplit: 5 }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const nS = c.qs.length, FIX = 7, tail = FIX + nS * 3 + 1, lastCol = tail + 3;
  [5, 24, 18, 7, 12, 7, 12].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  c.qs.forEach((_, s) => { ws.getColumn(FIX + 1 + s * 3).width = 26; ws.getColumn(FIX + 2 + s * 3).width = 11; ws.getColumn(FIX + 3 + s * 3).width = 15; });
  ws.getColumn(tail).width = 11; ws.getColumn(tail + 1).width = 16; ws.getColumn(tail + 2).width = 10; ws.getColumn(tail + 3).width = 22;
  ws.mergeCells(1, 1, 1, lastCol); ws.getCell(1, 1).value = `比价表  ${o.rfqNo}  ${o.title}`; ws.getCell(1, 1).font = { ...XB, size: 14 }; ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, lastCol); ws.getCell(2, 1).value = `项目：${o.project} ｜ 币种：${o.currency} ｜ 单价均为不含税，合价 = 比价数量 × 单价（按询价数量折算） ｜ 导出日期：${new Date().toISOString().slice(0, 10)}`; ws.getCell(2, 1).font = { ...XF, size: 9, color: { argb: "FF595959" } };
  ws.getCell(3, 1).value = "VAT 税率"; ws.getCell(3, 1).font = XB; ws.getCell(3, 3).value = o.vatRate; ws.getCell(3, 3).numFmt = "0%"; ws.getCell(3, 3).font = XBLUE; ws.getCell(3, 3).fill = fill("FFFFFF00");
  const H1 = 4, H2 = 5, supFills = ["FFFCE4D6", "FFE2EFDA", "FFFFF2CC", "FFDDEBF7", "FFEDE7F6", "FFEDEDED"];
  for (let cc = 1; cc <= lastCol; cc++) {
    const a = ws.getCell(H1, cc), b = ws.getCell(H2, cc);
    a.font = { ...XB, color: { argb: "FFFFFFFF" } }; a.fill = fill("FF1F3864"); b.font = XB; b.fill = fill("FFD9E1F2");
    [a, b].forEach((x) => { x.alignment = { wrapText: true, vertical: "middle", horizontal: "center" }; x.border = BOX; });
  }
  ["序号", "材料名称", "询价规格", "询价单位", "询价数量", "比价单位", "比价数量"].forEach((h, i) => { ws.getCell(H1, i + 1).value = h; ws.mergeCells(H1, i + 1, H2, i + 1); });
  c.qs.forEach((q, s) => {
    const c0 = FIX + 1 + s * 3; ws.getCell(H1, c0).value = q.data.supplier; ws.mergeCells(H1, c0, H1, c0 + 2);
    ["报价规格 / 偏离", "不含税单价", "合价"].forEach((h, j) => { const x = ws.getCell(H2, c0 + j); x.value = h; x.fill = fill(supFills[s % supFills.length]); });
  });
  ["最低单价", "最低价供应商", "最高/最低价差", "上次成交价"].forEach((h, j) => { ws.getCell(H1, tail + j).value = h; ws.mergeCells(H1, tail + j, H2, tail + j); });
  ws.getRow(H2).height = 30;
  const R0 = H2 + 1;
  c.rows.forEach((row, k) => {
    const r = R0 + k, ln = row.line;
    const set = (col: number, v: unknown, op: { font?: object; h?: "left" | "right" | "center"; fmt?: string; fill?: ReturnType<typeof fill> } = {}) => { const x = ws.getCell(r, col); x.value = v as never; x.font = op.font || XF; x.border = BOX; x.alignment = { wrapText: true, vertical: "middle", horizontal: op.h || "left" }; if (op.fmt) x.numFmt = op.fmt; if (op.fill) x.fill = op.fill; };
    set(1, Number(ln.no), { h: "center" }); set(2, ln.name); set(3, ln.spec); set(4, ln.unit, { h: "center" });
    set(5, ln.qty, { h: "right", fmt: "#,##0.0##" }); set(6, row.cUnit, { h: "center" });
    set(7, { formula: row.cFactor === 1 ? `E${r}` : `E${r}*${+row.cFactor.toPrecision(10)}`, result: row.cmpQty }, { h: "right", fmt: "#,##0.0##" });
    const refs: string[] = [];
    row.cells.forEach((cell, s) => {
      const c0 = FIX + 1 + s * 3;
      if (!cell) { set(c0, "未报", { font: { ...XF, color: { argb: "FFB3261E" } } }); set(c0 + 1, null); set(c0 + 2, null); return; }
      const low = row.min != null && Math.abs(cell.pCmp - row.min) < 1e-9 && row.cells.filter(Boolean).length > 1;
      const lf = low ? fill("FFC6EFCE") : undefined, l = cell.line;
      set(c0, [l.quotedDesc, l.quotedQty ? `报 ${l.quotedQty} ${l.quotedUnit || ""}` : "", l.deviation ? `偏离：${l.deviation}` : "", cell.edited ? "单价已人工修改" : ""].filter(Boolean).join("\n"), { font: l.deviation ? { ...XF, color: { argb: "FF8F5600" } } : XF });
      set(c0 + 1, +cell.pCmp.toFixed(4), { font: XBLUE, h: "right", fmt: "#,##0.00", fill: lf });
      set(c0 + 2, { formula: `G${r}*${colL(c0 + 1)}${r}`, result: cell.total }, { h: "right", fmt: "#,##0.00", fill: lf });
      refs.push(`${colL(c0 + 1)}${r}`);
    });
    const who = row.cells.map((cl, s) => (cl && row.min != null && Math.abs(cl.pCmp - row.min) < 1e-9 ? c.qs[s].data.supplier : null)).filter(Boolean).join(" / ");
    set(tail, refs.length ? { formula: `MIN(${refs.join(",")})`, result: row.min } : null, { h: "right", fmt: "#,##0.00" });
    set(tail + 1, who);
    set(tail + 2, refs.length > 1 ? { formula: `MAX(${refs.join(",")})/MIN(${refs.join(",")})-1`, result: row.spread } : null, { h: "right", fmt: "0.0%" });
    const h = o.history[ln.no];
    set(tail + 3, h ? `${h.unitPrice} / ${h.unit}（${h.supplierName}，${h.date}）` : "");
    ws.getRow(r).height = 36;
  });
  const RL = R0 + c.rows.length - 1, TR = RL + 1;
  const totCol = (i: number) => colL(FIX + 3 + i * 3);
  const complete = c.sup.map((s, i) => (s.complete ? `${totCol(i)}${TR}` : null)).filter(Boolean) as string[];
  const minT = complete.length ? Math.min(...c.sup.filter((s) => s.complete).map((s) => s.total)) : 0;
  ["合计（不含税）", "VAT", "含税合计", "与最低合计差额（不含税）", "总价排名"].forEach((lab, j) => {
    const r = TR + j;
    for (let cc = 1; cc <= lastCol; cc++) { const x = ws.getCell(r, cc); x.border = BOX; if (j === 0 || j === 2) x.fill = fill("FFD9E1F2"); }
    ws.getCell(r, 1).value = lab; ws.mergeCells(r, 1, r, FIX); ws.getCell(r, 1).font = XB; ws.getCell(r, 1).alignment = { horizontal: "right", vertical: "middle" };
    c.sup.forEach((s, i) => {
      const col = totCol(i), x = ws.getCell(r, FIX + 3 + i * 3); let v: unknown;
      if (j === 0) v = { formula: `SUM(${col}${R0}:${col}${RL})`, result: s.total };
      else if (j === 1) v = { formula: `ROUND(${col}${TR}*$C$3,2)`, result: Math.round(s.vat * 100) / 100 };
      else if (j === 2) v = { formula: `${col}${TR}+${col}${TR + 1}`, result: s.gross };
      else if (j === 3) v = s.complete && complete.length ? { formula: `${col}${TR}-MIN(${complete.join(",")})`, result: s.total - minT } : "未报全";
      else v = s.rank ?? "未报全";
      x.value = v as never; x.font = j === 0 || j === 2 || j === 4 ? XB : XF; x.numFmt = j === 4 ? "0" : "#,##0.00"; x.alignment = { horizontal: "right", vertical: "middle" };
      if (j === 0 && s.rank === 1) x.fill = fill("FFC6EFCE");
    });
  });
  ["说明：", "1. 绿色 = 该项最低单价 / 最低总价；蓝色数字为报价录入值，黑色为公式。", "2. 合价统一按询价数量折算后计算，不使用供应商自行取整的数量。", "3. AI 识别结果需人工核对后再用于审批。"].forEach((t, i) => {
    const x = ws.getCell(TR + 6 + i, 1); x.value = t; x.font = { ...XF, size: 9, bold: i === 0, color: { argb: "FF404040" } };
  });

  const table = (name: string, header: string[], rows: string[][], widths: number[]) => {
    const t = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    widths.forEach((w, i) => (t.getColumn(i + 1).width = w));
    header.forEach((h, i) => { const x = t.getCell(1, i + 1); x.value = h; x.font = { ...XB, color: { argb: "FFFFFFFF" } }; x.fill = fill("FF1F3864"); x.alignment = { wrapText: true, vertical: "middle", horizontal: "center" }; x.border = BOX; });
    rows.forEach((row, k) => { let mx = 1; row.forEach((v, i) => { const x = t.getCell(k + 2, i + 1); x.value = v ?? ""; x.font = i === 0 ? XB : XF; x.alignment = { wrapText: true, vertical: "top" }; x.border = BOX; mx = Math.max(mx, estLines(v, widths[i] || 12)); }); t.getRow(k + 2).height = Math.min(160, Math.max(20, mx * 14)); });
    return t;
  };
  const done = o.quotes.filter((q) => q.status === "done");
  const keys: [string, keyof QuoteData["terms"], string][] = [["付款", "payment", o.terms.payment], ["交货", "delivery", o.terms.delivery], ["交货期", "leadTime", ""], ["有效期", "validity", o.terms.validity], ["价格调整", "priceAdjustment", o.terms.priceFixed], ["其他", "other", ""]];
  table("商务条款", ["条款", "询价要求", ...done.map((q) => q.data.supplier)], [
    ["报价单号 / 日期", o.terms.deadline ? "截止 " + o.terms.deadline : "", ...done.map((q) => [q.data.quoteNo, q.data.date].filter(Boolean).join(" / ") || "未填")],
    ...keys.map(([lab, k, req]) => [lab, req || "", ...done.map((q) => q.data.terms?.[k] || "")]),
    ["报价自身问题", "", ...done.map((q) => (q.data.issues || []).join("\n"))],
  ], [16, 30, ...done.map(() => 32)]);
  const ft = table("风险提示", ["级别", "类别", "发现", "依据", "建议动作", "来源"], o.flags.map((f) => [f.level, f.category, f.title, f.detail, f.action, f.source || ""]), [6, 12, 34, 54, 40, 6]);
  const lvl: Record<string, string> = { "高": "FFF8CBAD", "中": "FFFFE699", "低": "FFDDEBF7", "信息": "FFEDEDED" };
  o.flags.forEach((f, k) => { const x = ft.getCell(k + 2, 1); x.fill = fill(lvl[f.level] || "FFEDEDED"); x.alignment = { horizontal: "center", vertical: "top" }; });
  return new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/* ---------------- clarification questions export ---------------- */
export async function buildQuestions(project: string, rows: { no: string; name: string; spec: string; question: string; questionEn: string; options: string[]; answer: string; status: string }[]): Promise<Blob> {
  const ExcelJS = await lib();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("待确认问题");
  const widths = [8, 26, 28, 36, 36, 30, 24];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.mergeCells(1, 1, 1, 7); ws.getCell(1, 1).value = `待工程部确认问题清单 · ${project}`; ws.getCell(1, 1).font = { ...XB, size: 13 };
  ws.mergeCells(2, 1, 2, 7); ws.getCell(2, 1).value = "请在“答复”列填写，或勾选可选项之一。To be confirmed by the Engineering Department."; ws.getCell(2, 1).font = { ...XF, color: { argb: "FF595959" } };
  ["需求序号\nItem", "物资名称\nMaterial", "当前规格\nCurrent spec", "问题", "Question", "可选项\nOptions", "答复\nAnswer"].forEach((h, i) => { const x = ws.getCell(4, i + 1); x.value = h; x.font = { ...XB, color: { argb: "FFFFFFFF" } }; x.fill = fill("FF1F3864"); x.alignment = { wrapText: true, vertical: "middle", horizontal: "center" }; x.border = BOX; });
  ws.getRow(4).height = 32;
  rows.forEach((q, k) => {
    const r = 5 + k;
    [q.no, q.name, q.spec, q.question, q.questionEn, q.options.join(" / "), q.answer].forEach((v, i) => { const x = ws.getCell(r, i + 1); x.value = v; x.font = XF; x.alignment = { wrapText: true, vertical: "top" }; x.border = BOX; if (i === 6) x.fill = fill("FFFFF6CC"); });
    ws.getRow(r).height = Math.min(120, Math.max(24, Math.max(...[q.name, q.spec, q.question, q.questionEn].map((t, i) => estLines(t, [26, 28, 36, 36][i]))) * 14));
  });
  return new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
