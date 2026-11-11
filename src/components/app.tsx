"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, CircleAlert, CircleCheck, Info, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { t, useT } from "@/lib/i18n/client";

/* ---------- toast ---------- */
type T = { msg: string; err?: boolean; id: number };
let push: ((t: T) => void) | null = null;
export function toast(msg: string, err = false) { push?.({ msg, err, id: Date.now() }); }
export function ToastHost() {
  const [m, setM] = useState<T | null>(null);
  useEffect(() => { push = (x) => setM(x); return () => { push = null; }; }, []);
  useEffect(() => { if (!m) return; const h = setTimeout(() => setM(null), m.err ? 7000 : 3000); return () => clearTimeout(h); }, [m]);
  if (!m) return null;
  return (
    <div role="status" key={m.id} className={cn("fixed bottom-6 left-1/2 z-[60] flex max-w-[min(560px,calc(100vw-32px))] -translate-x-1/2 items-start gap-2 rounded-lg px-4 py-2.5 text-[13px] text-white shadow-xl shadow-black/20 [animation:toast-in_.18s_ease-out]", m.err ? "bg-bad" : "bg-primary")}>
      {m.err ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-signal" />}
      <span>{m.msg}</span>
    </div>
  );
}

/* ---------- busy runner: one async action at a time, with a live label and elapsed time ---------- */
export type Run = <R>(label: string, fn: (step: (label: string) => void) => Promise<R>, done?: string) => Promise<R | undefined>;
export function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const run: Run = async (label, fn, done) => {
    setBusy(label);
    try { const r = await fn((l) => setBusy(l)); if (done) toast(done); return r; }
    catch (e) { toast(e instanceof Error ? e.message : String(e), true); return undefined; }
    finally { setBusy(null); }
  };
  return { busy, run };
}
export function Busy({ text, className }: { text: string | null; className?: string }) {
  const [start, setStart] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!text) { setStart(0); return; }
    setStart((s) => s || Date.now()); setNow(Date.now());
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [text]);
  if (!text) return null;
  const sec = start ? Math.max(0, Math.round((now - start) / 1000)) : 0;
  return (
    <span className={cn("inline-flex items-center gap-2 text-[13px] text-muted-foreground", className)} aria-live="polite">
      <Loader2 className="size-4 animate-spin text-primary" />
      <span>{text}</span>
      {sec >= 3 && <span className="num text-xs text-muted-foreground/80">{sec}s</span>}
    </span>
  );
}

/* ---------- layout pieces ---------- */
export function PageHeader({ crumbs, title, facts, actions, children }: { crumbs?: { href: string; label: string }[]; title: React.ReactNode; facts?: [string, React.ReactNode][]; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground" aria-label="breadcrumb">
            {crumbs.map((c) => <Fragment key={c.href}><Link href={c.href} className="text-muted-foreground no-underline hover:text-foreground">{c.label}</Link><ChevronRight className="size-3 rtl:rotate-180" /></Fragment>)}
          </nav>
        )}
        <h1 className="text-[22px] leading-tight font-semibold">{title}</h1>
        {facts && facts.filter(([, v]) => v).length > 0 && (
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
            {facts.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex gap-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          </dl>
        )}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, description, actions, children, className, bodyClassName, id }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return (
    <section id={id} className={cn("mb-5 rounded-lg border bg-card", className)}>
      {(title || actions) && (
        <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 py-3.5", children != null && "border-b")}>
          <div className="min-w-0 max-w-3xl">
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children != null && <div className={cn("p-5", bodyClassName)}>{children}</div>}
    </section>
  );
}

/** A table that scrolls sideways inside its own frame on small screens. */
export function TableFrame({ children, className, flush }: { children: React.ReactNode; className?: string; flush?: boolean }) {
  return <div className={cn("max-h-[70vh] overflow-auto", !flush && "rounded-md border", className)}><table className="data-table">{children}</table></div>;
}

export function Stats({ items, className }: { items: [string, React.ReactNode, ("warn" | "good")?][]; className?: string }) {
  return (
    <dl className={cn("flex flex-wrap gap-x-6 gap-y-2", className)}>
      {items.map(([k, v, tone]) => (
        <div key={k}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className={cn("num text-lg leading-tight font-semibold", tone === "warn" && "text-warn", tone === "good" && "text-good")}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({ children, icon, action }: { children: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed px-6 py-10 text-center text-[13px] text-muted-foreground">
      {icon}<div className="max-w-md">{children}</div>{action}
    </div>
  );
}

export function Banner({ tone = "warn", children, className }: { tone?: "warn" | "info" | "bad" | "good"; children: React.ReactNode; className?: string }) {
  const Icon = tone === "info" ? Info : tone === "good" ? CircleCheck : CircleAlert;
  const c = { warn: "bg-warn-soft text-warn border-warn/20", info: "bg-info-soft text-info border-info/20", bad: "bg-bad-soft text-bad border-bad/20", good: "bg-good-soft text-good border-good/20" }[tone];
  return <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]", c, className)}><Icon className="mt-0.5 size-4 shrink-0" /><div className="min-w-0 text-foreground/90">{children}</div></div>;
}

/* ---------- the stage rail: where this work is in the procurement cycle ---------- */
export type Stage = { key: string; label: string; count?: number | string; tone?: "warn"; done?: boolean; disabled?: boolean };
export function Stages({ stages, current, onSelect }: { stages: Stage[]; current: string; onSelect: (k: string) => void }) {
  return (
    <div role="tablist" className="mb-5 flex overflow-x-auto rounded-lg border bg-card">
      {stages.map((s, i) => {
        const on = s.key === current;
        return (
          <button key={s.key} role="tab" aria-selected={on} disabled={s.disabled} onClick={() => onSelect(s.key)}
            className={cn("relative flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-4 py-3 text-start text-[13px] whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45", i > 0 && "border-s", on ? "bg-card" : "bg-muted/60 hover:bg-muted")}>
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold num", on ? "bg-primary text-white ring-[3px] ring-signal" : s.done ? "bg-primary text-white" : "border border-input bg-card text-muted-foreground")}>
              {s.done && !on ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("font-medium", on ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
            {s.count != null && s.count !== 0 && <Badge variant={s.tone === "warn" ? "warn" : "default"} className="num">{s.count}</Badge>}
            {on && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-signal" />}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- file drop zone ---------- */
export function Drop({ title, hint, accept, multiple, onFiles, disabled, id, compact }: { title: string; hint: string; accept: string; multiple?: boolean; onFiles: (f: File[]) => void; disabled?: boolean; id: string; compact?: boolean }) {
  const T = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const input = <input ref={ref} id={id} type="file" accept={accept} multiple={multiple} onChange={(e) => { onFiles([...(e.target.files || [])]); e.target.value = ""; }} />;
  if (compact) return <Button variant="outline" size="sm" disabled={disabled} onClick={() => ref.current?.click()} aria-label={title}><Upload />{title}{input}</Button>;
  return (
    <div tabIndex={0} role="button" aria-label={title} aria-disabled={disabled}
      className={cn("group flex cursor-pointer items-center gap-4 rounded-lg border border-dashed border-input bg-muted/40 px-5 py-5 transition-colors hover:border-primary/50 hover:bg-muted", over && "border-primary bg-info-soft", disabled && "pointer-events-none opacity-60")}
      onClick={() => !disabled && ref.current?.click()}
      onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); ref.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) onFiles([...e.dataTransfer.files]); }}>
      {input}
      <span className="grid size-10 shrink-0 place-items-center rounded-full border bg-card text-primary"><Upload className="size-[18px]" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}{hint ? " · " : ""}{T("拖到这里，或点击选择")}</span>
      </span>
    </div>
  );
}

/* ---------- small status helpers ---------- */
export function Level({ level }: { level: string }) {
  const T = useT();
  const v = level === "高" ? "bad" : level === "中" ? "warn" : level === "低" ? "info" : "default";
  return <Badge variant={v}>{T(level)}</Badge>;
}

export function StatusChip({ status }: { status: string }) {
  const T = useT();
  const m: Record<string, ["default" | "info" | "good", string]> = { draft: ["default", "草稿"], issued: ["info", "已锁定"], awarded: ["good", "已定标"] };
  const [v, l] = m[status] || ["default", status];
  return <Badge variant={v}>{T(l)}</Badge>;
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toast(t("已复制")); }
  catch { toast(t("复制没有成功，请手动选中复制"), true); }
}

export function Loading() {
  const T = useT();
  return <div className="py-16 text-center"><Busy text={T("加载中…")} /></div>;
}
