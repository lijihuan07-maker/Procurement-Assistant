import type { QuoteData, QuoteLine, RfqLine, Overrides, Flag } from "@/db/schema";

export type QuoteRow = { id: string; fileName: string; status: string; error?: string | null; data: QuoteData; supplierId?: string | null };

export function normUnit(u: unknown): string {
  const s = String(u ?? "").trim().toLowerCase().replace(/\s|\.|,/g, "");
  if (!s) return "";
  if (["m2", "m²", "sqm", "sqmt", "平方米", "平米", "㎡"].includes(s)) return "m²";
  if (["m", "lm", "rm", "lmt", "meter", "metre", "米", "延米", "lineal"].includes(s)) return "m";
  if (["m3", "m³", "cbm", "立方米", "方"].includes(s)) return "m³";
  if (["ea", "pc", "pcs", "no", "nos", "each", "unit", "个", "块", "件", "只", "根"].includes(s)) return "Ea";
  if (["t", "ton", "tons", "mt", "tonne", "吨"].includes(s)) return "t";
  return String(u).trim();
}
const mode = <T,>(arr: T[]) => { const c = new Map<T, number>(); let best: T | undefined; for (const a of arr) { c.set(a, (c.get(a) || 0) + 1); if (best === undefined || c.get(a)! > c.get(best)!) best = a; } return best; };
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export type Cell = { line: QuoteLine; pCmp: number; pRfq: number; total: number; edited: boolean } | null;
export type Row = { line: RfqLine; cUnit: string; cFactor: number; rUnit: string; cells: Cell[]; min: number | null; spread: number | null; cmpQty: number };
export type Sup = { q: QuoteRow; total: number; vat: number; gross: number; covered: number; own: number; complete: boolean; rank: number | null; diff: number | null };

export function compute(lines: RfqLine[], quotes: QuoteRow[], ov: Overrides, vatRate: number) {
  const qs = quotes.filter((q) => q.status === "done" && !q.data.isBlank);
  const rows: Row[] = lines.map((ln) => {
    const rUnit = normUnit(ln.unit);
    const qlines = qs.map((q) => (q.data.lines || []).find((l) => String(l.rfqNo) === String(ln.no)) || null);
    const present = qlines.filter((l): l is QuoteLine => !!l && Number(l.unitPrice) > 0);
    const cUnit = present.length ? mode(present.map((l) => normUnit(l.quotedUnit) || rUnit))! : rUnit;
    const k = ov.factor?.[ln.no];
    let cFactor: number;
    if (k && k > 0) cFactor = 1 / k;
    else if (cUnit === rUnit) cFactor = 1;
    else cFactor = median(present.filter((l) => (normUnit(l.quotedUnit) || rUnit) === cUnit).map((l) => Number(l.perRfqUnit)).filter((x) => x > 0)) || 1;
    const cells: Cell[] = qlines.map((l, i) => {
      if (!l || !(Number(l.unitPrice) > 0)) return null;
      const lu = normUnit(l.quotedUnit) || rUnit;
      let per = Number(l.perRfqUnit) > 0 ? Number(l.perRfqUnit) : 1;
      if (lu === cUnit && k && k > 0) per = cFactor;
      let pRfq = Number(l.unitPrice) * per;
      let pCmp = pRfq / cFactor;
      const po = ov.price?.[qs[i].id]?.[ln.no];
      if (po != null && isFinite(po)) { pCmp = po; pRfq = pCmp * cFactor; }
      return { line: l, pCmp, pRfq, total: (Number(ln.qty) || 0) * pRfq, edited: po != null };
    });
    const valid = cells.filter(Boolean).map((c) => c!.pCmp);
    const min = valid.length ? Math.min(...valid) : null;
    const max = valid.length ? Math.max(...valid) : null;
    return { line: ln, cUnit, cFactor, rUnit, cells, min, spread: min && max ? max / min - 1 : null, cmpQty: (Number(ln.qty) || 0) * cFactor };
  });
  const sup: Sup[] = qs.map((q, i) => {
    let total = 0, covered = 0;
    rows.forEach((r) => { const c = r.cells[i]; if (c) { total += c.total; covered++; } });
    const own = (q.data.lines || []).reduce((s, l) => s + (Number(l.quotedQty) || 0) * (Number(l.unitPrice) || 0), 0);
    return { q, total, vat: total * vatRate, gross: total * (1 + vatRate), covered, own, complete: covered === rows.length, rank: null, diff: null };
  });
  const complete = sup.filter((s) => s.complete);
  const minTotal = complete.length ? Math.min(...complete.map((s) => s.total)) : null;
  sup.forEach((s) => { if (s.complete) { s.rank = 1 + complete.filter((x) => x.total < s.total - 0.005).length; s.diff = minTotal ? s.total / minTotal - 1 : null; } });
  const combo = rows.reduce((s, r) => s + (r.min != null ? r.min * r.cmpQty : 0), 0);
  return { rows, sup, qs, combo };
}

type Tr = (s: string, v?: Record<string, string | number>) => string;
const plain: Tr = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s);

/** Checks that need no AI. Text goes through tr so it shows in the user's language; level/category stay as keys. */
export function ruleFlags(c: ReturnType<typeof compute>, quotes: QuoteRow[], vatRate: number, tr: Tr = plain): Flag[] {
  const out: Flag[] = [];
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  quotes.forEach((q) => {
    if (q.status === "error") out.push({ level: "中", category: "识别失败", title: tr("{f} 没能识别", { f: q.fileName }), detail: q.error || "", action: tr("检查文件后重新上传。") });
    else if (q.data.isBlank) out.push({ level: "信息", category: "文件", title: tr("{s} 没有填价格", { s: q.data.supplier || q.fileName }), detail: tr("单价为空或全为 0，未计入比价。"), action: tr("确认是否传错了文件。") });
  });
  c.sup.forEach((s, i) => {
    const n = c.rows.length;
    if (s.covered < n) {
      const miss = c.rows.filter((r) => !r.cells[i]).map((r) => r.line.no);
      out.push({ level: "中", category: "缺项", title: tr("{s} 只报了 {a}/{b} 项", { s: s.q.data.supplier, a: s.covered, b: n }), detail: tr("未报序号：{list}。总价不能直接和报全的供应商比较。", { list: miss.join(", ") }), action: tr("追问缺项价格，或按单项比较。") });
    }
    const d = s.q.data;
    if (s.own > 0) {
      if (Number(d.statedTotalExVat) > 0 && Math.abs(Number(d.statedTotalExVat) / s.own - 1) > 0.01)
        out.push({ level: "中", category: "金额核对", title: tr("{s} 自报合计与明细不符", { s: d.supplier }), detail: tr("报价单写不含税合计 {a}，按明细重算为 {b}。", { a: fmt(Number(d.statedTotalExVat)), b: fmt(s.own) }), action: tr("以重算结果为准，并请供应商确认。") });
      else if (!(Number(d.statedTotalExVat) > 0) && Number(d.statedTotalInclVat) > 0 && Math.abs(Number(d.statedTotalInclVat) / (s.own * (1 + vatRate)) - 1) > 0.01)
        out.push({ level: "中", category: "金额核对", title: tr("{s} 自报合计与明细不符", { s: d.supplier }), detail: tr("报价单写含税合计 {a}，按明细重算含税应为 {b}。", { a: fmt(Number(d.statedTotalInclVat)), b: fmt(s.own * (1 + vatRate)) }), action: tr("以重算结果为准，并检查合计公式。") });
    }
  });
  const wide = c.rows.filter((r) => r.spread != null && r.spread > 0.3);
  if (wide.length) out.push({ level: "低", category: "价差", title: tr("{n} 项最高价比最低价高出 30% 以上", { n: wide.length }), detail: wide.map((r) => `#${r.line.no} ${(r.spread! * 100).toFixed(1)}%`).join(", "), action: tr("核对是否规格理解不同，或重点议价。") });
  return out.map((f) => ({ ...f, source: tr("规则") }));
}

export const LEVEL_ORDER: Record<string, number> = { "高": 0, "中": 1, "低": 2, "信息": 3 };
