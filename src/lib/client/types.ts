import type { Msg } from "@/lib/i18n";
import type { ProjectStandards } from "@/db/schema";
import type { Flag, QuoteData, RfqLine, RfqSnapshot, Overrides, Award, RfqTemplate, EmailTemplate, ReqSettings } from "@/db/schema";
export type { ReqSettings };

export type Question = { id: string; itemId: string; question: string; questionEn: string; options: string[]; answer: string; status: string; specQuote: string };
export type Item = { id: string; seq: number; no: string; nameCn: string; nameEn: string; spec: string; unit: string; qty: number; dateRequired: string; techReq: string; specRef: string; category: string; quoteHint: string; issues: string[]; packageId: string | null; questions: Question[] };
export type PkgSummary = { id: string; code: string; titleCn: string; titleEn: string; supplierType: string; reason: string; status: string; rfqNo: string | null; deadline: string | null; quotes: number };
export type Site = { id: string; name: string; location: string; owner: string; standards: ProjectStandards | null; createdAt: string };
export type Job = { id: string; status: "running" | "done" | "failed" | "cancelled"; fileName: string; total: number; done: number; failed: number; error: string | null; createdAt: string; updatedAt: string };
export type ProjectData = {
  project: { id: string; siteId: string; siteName: string; name: string; kind: string; location: string; owner: string; demandFileName: string | null; standards: ProjectStandards | null };
  site: Site; settings: ReqSettings; job: Job | null;
  items: Item[]; packages: PkgSummary[];
  specDocs: { id: string; fileName: string; pages: number; sections: number; byPage: boolean; createdAt: string }[];
};
export type Template = { id: string; name: string; kind: string; siteId: string; siteName: string; createdAt: string; prefix: string; currency: string; vatRate: number; file: string; email: boolean };
export type ReqSummary = { id: string; name: string; kind: string; demandFileName: string | null; createdAt: string; items: number; packages: number; openQuestions: number; job: string | null };
export type SiteData = { site: Site; reqs: ReqSummary[]; templates: Template[]; defaults: ReqSettings };
export const KIND_LABEL: Record<string, string> = { material: "材料", subcontract: "分包", rental: "租赁", service: "服务" };

export type Supplier = { id: string; name: string; categories: string[]; contact: string; email: string; phone: string; city: string; country: string; website: string; rating: number | null; notes: string; source: string; likely: string[] };
export type QuoteRec = { id: string; packageId: string; supplierId: string | null; fileName: string; status: string; error: string | null; data: QuoteData; createdAt: string };
export type Invite = { id: string; supplierId: string; subject: string; body: string; status: string; sentAt: string | null; recommended: string; supplier: Supplier };
export type PackageData = {
  pkg: { id: string; projectId: string; code: string; titleCn: string; titleEn: string; supplierType: string; reason: string; status: string; rfqNo: string | null; deadline: string | null; snapshot: RfqSnapshot | null; overrides: Overrides; review: { flags: Flag[]; summary: string } | null; award: Award | null };
  project: { id: string; name: string; siteId: string; siteName: string; location: string; owner: string };
  settings: ReqSettings; nextRfqNo: string;
  lines: RfqLine[]; quotes: QuoteRec[]; invites: Invite[];
  rfqTemplate: RfqTemplate | null; emailTemplate: EmailTemplate;
  history: Record<string, { supplierName: string; unitPrice: number; unit: string; currency: string; date: string; source: string } | null>;
  recommendations: { supplier: Supplier; reasons: Msg[]; score: number; match: boolean; isNew: boolean; tier: number }[];
};
