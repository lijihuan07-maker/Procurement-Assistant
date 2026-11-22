"use client";
import { useState } from "react";
import { Search, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { tm, useLang, useT } from "@/lib/i18n/client";
import { FAMILIES, FAMILY, GROUPS, familyName, groupName } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Busy, Empty, TableFrame, useBusy } from "@/components/app";
import type { Msg } from "@/lib/i18n";

export type Material = { id?: string; family: string; item: string; evidence: string; note?: string; date?: string };

const EV_STYLE: Record<string, string> = {
  record: "border-transparent bg-good-soft text-good",
  quote: "border-transparent bg-info-soft text-info",
  declared: "border-border bg-card text-foreground",
};

/** A supplier's materials: green = has supplied, blue = has quoted, plain = listed in a ledger or typed in, dashed = AI's guess. */
export function MaterialChips({ materials, likely = [], onRemove, max = 8 }: { materials: Material[]; likely?: string[]; onRemove?: (m: Material) => void; max?: number }) {
  const T = useT();
  const lang = useLang();
  const [all, setAll] = useState(false);
  // One chip per family + item; the strongest evidence wins.
  const rank = { record: 0, quote: 1, declared: 2 } as Record<string, number>;
  const seen = new Map<string, Material>();
  for (const m of [...materials].sort((a, b) => (rank[a.evidence] ?? 3) - (rank[b.evidence] ?? 3))) {
    const k = `${m.family}|${(m.item || "").toLowerCase()}`;
    if (!seen.has(k)) seen.set(k, m);
  }
  const list = [...seen.values()];
  const fams = new Set(list.map((m) => m.family));
  const guess = likely.filter((k) => !fams.has(k) && FAMILY[k]);
  if (!list.length && !guess.length) return <span className="text-xs text-muted-foreground">{T("还没有材料记录")}</span>;
  const shown = all ? list : list.slice(0, max);
  const ev = (e: string) => T(e === "record" ? "供过" : e === "quote" ? "报过价" : "台账/手填");
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((m, i) => (
        <span key={m.id || i} title={`${familyName(m.family, lang)} · ${ev(m.evidence)}${m.date ? ` · ${m.date}` : ""}${m.note ? `\n${m.note}` : ""}`}
          className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-px text-xs", EV_STYLE[m.evidence] || EV_STYLE.declared)}>
          {m.item || familyName(m.family, lang)}
          {onRemove && m.id && <button aria-label={T("删除 {s}", { s: m.item || familyName(m.family, lang) })} className="cursor-pointer opacity-60 hover:opacity-100" onClick={() => onRemove(m)}><X className="size-3" /></button>}
        </span>
      ))}
      {list.length > max && <button className="cursor-pointer text-xs text-primary underline" onClick={() => setAll(!all)}>{all ? T("收起") : T("还有 {n} 项", { n: list.length - max })}</button>}
      {guess.map((k) => <span key={k} title={T("AI 判断这类公司通常也供应，未经证实")} className="inline-flex items-center rounded-full border border-dashed border-input px-2 py-px text-xs text-muted-foreground">{T("可能：")}{familyName(k, lang)}</span>)}
    </span>
  );
}

/** Material category picker grouped by material group. */
export function FamilySelect({ value, onChange, className, placeholder, id, materialsOnly }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; id?: string; materialsOnly?: boolean }) {
  const lang = useLang();
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label={placeholder}>
      {placeholder && <option value="">{placeholder}</option>}
      {GROUPS.filter((g) => !materialsOnly || g.material).map((g) => (
        <optgroup key={g.key} label={groupName(g.key, lang)}>
          {FAMILIES.filter((x) => x.group === g.key).map((x) => <option key={x.key} value={x.key}>{familyName(x.key, lang)}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}

type Result = { supplier: { id: string; name: string; email: string; phone: string; contact: string; city: string; country: string; rating: number | null }; tier: 1 | 2 | 3; reasons: Msg[]; last: string; dealt: boolean };

/** "Who can supply X?" — suppliers that supplied it, then the same family, then likely ones. */
export function MaterialSearch() {
  const T = useT();
  const lang = useLang();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ q: string; families: string[]; byAi: boolean; results: Result[] } | null>(null);
  const { busy, run } = useBusy();
  async function search(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim(); if (!text) return;
    const r = await run(T("查找中…"), () => api<{ families: string[]; byAi: boolean; results: Result[] }>(`/api/suppliers/match?q=${encodeURIComponent(text)}`));
    if (r) setRes({ ...r, q: text });
  }
  const tiers: [1 | 2 | 3, string, string][] = [
    [1, "供过这种材料", "有采购、报价或台账记录"],
    [2, "供过同类材料", "同一类别的其他材料，大概率也能供"],
    [3, "可能能供", "相关类别或 AI 判断，询价前先确认"],
  ];
  return (
    <div className="grid gap-4">
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="mat-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={T("输入要买的材料，例如：控制电缆、HDPE 管、20 米升降机租赁")} className="h-10 ps-9 text-[14px]" />
        </div>
        <Button type="submit" size="lg" disabled={!!busy || !q.trim()}>{T("找供应商")}</Button>
      </form>
      <Busy text={busy} />
      {res && (
        <div className="grid gap-4">
          <p className="text-[13px] text-muted-foreground">
            {res.families.length ? <>{T("“{q}” 归为", { q: res.q })} {res.families.map((k) => <Badge key={k} variant="outline" className="mx-0.5">{familyName(k, lang)}</Badge>)}{res.byAi ? T("（AI 判断）") : ""}</> : T("没能判断 “{q}” 属于哪类材料，换个说法试试，比如写出中文或英文的常用名称。", { q: res.q })}
          </p>
          {res.families.length > 0 && !res.results.length && <Empty>{T("你的供应商库里还没有能供这类材料的供应商。可以导入采购台账，或用下面的“从网上找供应商”。")}</Empty>}
          {tiers.map(([tier, title, hint]) => {
            const rows = res.results.filter((r) => r.tier === tier);
            if (!rows.length) return null;
            return (
              <div key={tier} className="grid gap-2">
                <div className="flex items-baseline gap-2"><h3 className="text-[14px] font-semibold">{T(title)}</h3><span className="text-xs text-muted-foreground">{T(hint)} · {rows.length}</span></div>
                <TableFrame className="max-h-none">
                  <thead><tr><th>{T("供应商")}</th><th>{T("依据")}</th><th>{T("联系方式")}</th><th>{T("最近")}</th></tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.supplier.id}>
                      <td className="min-w-48"><span className="font-medium">{r.supplier.name}</span>{r.dealt && <Badge variant="good" className="ms-1.5">{T("合作过")}</Badge>}<span className="sub">{[r.supplier.city, r.supplier.country].filter(Boolean).join(", ")}</span></td>
                      <td className="text-xs">{r.reasons.map(tm).join("; ")}</td>
                      <td className="text-xs">{r.supplier.contact}<span className="sub">{[r.supplier.phone, r.supplier.email].filter(Boolean).join(" / ") || "—"}</span></td>
                      <td className="num text-xs text-muted-foreground">{r.last || "—"}</td>
                    </tr>
                  ))}</tbody>
                </TableFrame>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
