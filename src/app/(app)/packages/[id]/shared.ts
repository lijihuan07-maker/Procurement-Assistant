"use client";
import { buildRfq } from "@/lib/client/excel";
import type { Run } from "@/components/app";
import type { PackageData } from "@/lib/client/types";
import { lang } from "@/lib/i18n/client";

export type Ctx = { d: PackageData; setD: (d: PackageData) => void; run: Run; busy: string | null };

export async function rfqBlob(d: PackageData) {
  const s = d.pkg.snapshot!;
  return buildRfq({ rfqNo: s.rfqNo, titleCn: s.title, titleEn: s.titleEn, project: s.project, currency: s.currency, vatRate: s.vatRate, deadline: s.deadline, validity: s.validity, payment: s.payment, lines: s.lines, template: d.rfqTemplate });
}
export const rfqFileName = (d: PackageData) => `${d.pkg.rfqNo} ${(lang() === "zh" ? d.pkg.titleCn || d.pkg.titleEn : d.pkg.titleEn || d.pkg.titleCn)}.xlsx`;
