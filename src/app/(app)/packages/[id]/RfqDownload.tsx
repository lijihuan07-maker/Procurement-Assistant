"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { api, download } from "@/lib/client/api";
import { useLang, useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import type { PackageData } from "@/lib/client/types";
import { templateTexts } from "@/lib/client/excel";
import { type Ctx, type RfqLang, rfqBlob, rfqFileName } from "./shared";

const KEY = "pa-rfq-lang";

/**
 * Download the RFQ Excel. With a Chinese interface the user picks bilingual (default) or English;
 * every other interface language gets English only. The English text is made once by AI and kept with the RFQ.
 */
export function RfqDownload({ d, setD, run, busy, label, variant = "outline" }: Ctx & { label: string; variant?: "outline" | "default" }) {
  const T = useT();
  const zh = useLang() === "zh";
  const [mode, setMode] = useState<RfqLang>("bi");
  useEffect(() => { try { if (localStorage.getItem(KEY) === "en") setMode("en"); } catch { /* ignore */ } }, []);
  const m: RfqLang = zh ? mode : "en";
  async function go() {
    let x: PackageData | null | undefined = d;
    if (m === "en") {
      const en = d.pkg.snapshot?.en;
      const texts = [...(d.rfqTemplate?.fileB64 ? await templateTexts(d.rfqTemplate.fileB64) : []), d.rfqTemplate?.titleSuffix || ""].filter((t) => /[\u3400-\u9fff]/.test(t));
      if (!en || texts.some((t) => !(t in (en.extra || {})))) {
        x = await run(T("AI 正在生成英文版询价单…"), () => api<PackageData>(`/api/packages/${d.pkg.id}/english`, { body: { texts } }));
        if (!x) return;
        setD(x);
      }
    }
    download(await rfqBlob(x, m), rfqFileName(x, m));
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {zh && (
        <Select aria-label={T("询价单语言")} value={mode} className="h-9 w-auto text-xs"
          onChange={(e) => { const v = e.target.value as RfqLang; setMode(v); try { localStorage.setItem(KEY, v); } catch { /* ignore */ } }}>
          <option value="bi">{T("中英双语")}</option><option value="en">{T("英文")}</option>
        </Select>
      )}
      <Button variant={variant} disabled={!!busy} onClick={go}><Download />{label}</Button>
    </span>
  );
}
