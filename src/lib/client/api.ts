"use client";

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && typeof window !== "undefined") { window.location.href = "/login"; }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error || (res.status === 413 ? "文件太大，请拆分后再上传" : res.status === 504 ? "处理超时，请稍后重试或拆小文件" : `请求失败（${res.status}）`);
    throw new Error(msg);
  }
  return data as T;
}

export const fmt = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "–" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = (n: number | null | undefined) => (n == null || !isFinite(n) ? "–" : (n * 100).toFixed(1) + "%");

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, "-");
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
