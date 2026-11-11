"use client";
import { useEffect, useRef, useState } from "react";

/* ---------- toast ---------- */
type T = { msg: string; err?: boolean; id: number };
let push: ((t: T) => void) | null = null;
export function toast(msg: string, err = false) { push?.({ msg, err, id: Date.now() }); }
export function ToastHost() {
  const [t, setT] = useState<T | null>(null);
  useEffect(() => { push = (x) => setT(x); return () => { push = null; }; }, []);
  useEffect(() => { if (!t) return; const h = setTimeout(() => setT(null), t.err ? 6000 : 2800); return () => clearTimeout(h); }, [t]);
  return t ? <div className={"toast" + (t.err ? " err" : "")} role="status">{t.msg}</div> : null;
}

/* ---------- busy runner: one async action at a time with progress text ---------- */
export function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  async function run<R>(label: string, fn: () => Promise<R>, done?: string): Promise<R | undefined> {
    setBusy(label);
    try { const r = await fn(); if (done) toast(done); return r; }
    catch (e) { toast(e instanceof Error ? e.message : String(e), true); return undefined; }
    finally { setBusy(null); }
  }
  return { busy, run };
}
export function Busy({ text }: { text: string | null }) {
  return text ? <span className="progress"><span className="spin" />{text}</span> : null;
}

/* ---------- file drop zone ---------- */
export function Drop({ title, hint, accept, multiple, onFiles, disabled, id }: { title: string; hint: string; accept: string; multiple?: boolean; onFiles: (f: File[]) => void; disabled?: boolean; id: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className={"drop" + (over ? " over" : "")} tabIndex={0} role="button" aria-label={title} aria-disabled={disabled}
      onClick={() => !disabled && ref.current?.click()}
      onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); ref.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) onFiles([...e.dataTransfer.files]); }}>
      <input ref={ref} id={id} type="file" accept={accept} multiple={multiple} onChange={(e) => { onFiles([...(e.target.files || [])]); e.target.value = ""; }} />
      <h3>{title}</h3>
      <span className="hint">{hint}</span>
    </div>
  );
}

export function Level({ level }: { level: string }) {
  const cls = level === "高" ? "bad" : level === "中" ? "warn" : level === "低" ? "acc" : "";
  return <span className={"chip " + cls}>{level}</span>;
}

export function StatusChip({ status }: { status: string }) {
  const m: Record<string, [string, string]> = { draft: ["", "草稿"], issued: ["acc", "已锁定"], awarded: ["good", "已定标"] };
  const [c, l] = m[status] || ["", status];
  return <span className={"chip " + c}>{l}</span>;
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toast("已复制"); }
  catch { toast("复制没有成功，请手动选中复制", true); }
}
