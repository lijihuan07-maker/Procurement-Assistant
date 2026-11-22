"use client";
import { buildRfq } from "@/lib/client/excel";
import type { Run } from "@/components/app";
import type { PackageData } from "@/lib/client/types";
import { lang } from "@/lib/i18n/client";

export type Ctx = { d: PackageData; setD: (d: PackageData) => void; run: Run; busy: string | null };
/** "bi": Chinese + English (Chinese interface only); "en": English only, from the AI-made English text. */
export type RfqLang = "bi" | "en";

export async function rfqBlob(d: PackageData, mode: RfqLang = "bi") {
  const s = d.pkg.snapshot!;
  const en = mode === "en" ? s.en : undefined;
  if (en) {
    return buildRfq({
      english: true, extra: en.extra, rfqNo: s.rfqNo, titleCn: "", titleEn: en.title, project: en.project, currency: s.currency, vatRate: s.vatRate, deadline: s.deadline,
      validity: en.validity, payment: en.payment, standards: en.standards, template: d.rfqTemplate,
      lines: s.lines.map((l) => ({ ...l, ...(en.lines[l.no] || {}) })),
    });
  }
  return buildRfq({ rfqNo: s.rfqNo, titleCn: s.title, titleEn: s.titleEn, project: s.project, currency: s.currency, vatRate: s.vatRate, deadline: s.deadline, validity: s.validity, payment: s.payment, lines: s.lines, standards: s.standards, template: d.rfqTemplate });
}
export const rfqFileName = (d: PackageData, mode: RfqLang = "bi") =>
  `${d.pkg.rfqNo} ${(mode === "bi" && lang() === "zh" ? d.pkg.titleCn || d.pkg.titleEn : d.pkg.snapshot?.en?.title || d.pkg.titleEn || d.pkg.titleCn)}.xlsx`.replace(/[\\/:*?"<>|]/g, " ");
