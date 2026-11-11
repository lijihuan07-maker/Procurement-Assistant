import type { Flag, QuoteData, RfqLine, RfqSnapshot, Overrides, Award, RfqTemplate, EmailTemplate } from "@/db/schema";

export type Question = { id: string; itemId: string; question: string; questionEn: string; options: string[]; answer: string; status: string; specQuote: string };
export type Item = { id: string; seq: number; no: string; nameCn: string; nameEn: string; spec: string; unit: string; qty: number; dateRequired: string; techReq: string; specRef: string; category: string; quoteHint: string; issues: string[]; packageId: string | null; questions: Question[] };
export type PkgSummary = { id: string; code: string; titleCn: string; titleEn: string; supplierType: string; reason: string; status: string; rfqNo: string | null; deadline: string | null; quotes: number };
export type ProjectData = {
  project: { id: string; name: string; location: string; owner: string; demandFileName: string | null };
  items: Item[]; packages: PkgSummary[];
  specDocs: { id: string; fileName: string; pages: number; sections: number; createdAt: string }[];
};

export type Supplier = { id: string; name: string; categories: string[]; contact: string; email: string; phone: string; city: string; website: string; rating: number | null; notes: string; source: string };
export type QuoteRec = { id: string; packageId: string; supplierId: string | null; fileName: string; status: string; error: string | null; data: QuoteData; createdAt: string };
export type Invite = { id: string; supplierId: string; subject: string; body: string; status: string; sentAt: string | null; recommended: string; supplier: Supplier };
export type PackageData = {
  pkg: { id: string; projectId: string; code: string; titleCn: string; titleEn: string; supplierType: string; reason: string; status: string; rfqNo: string | null; deadline: string | null; snapshot: RfqSnapshot | null; overrides: Overrides; review: { flags: Flag[]; summary: string } | null; award: Award | null };
  project: { id: string; name: string; location: string; owner: string };
  company: { name: string; currency: string; vatRate: number; paymentTerms: string; validity: string; senderName: string; rfqPrefix: string; rfqNextNo: number; rfqPad: number };
  lines: RfqLine[]; quotes: QuoteRec[]; invites: Invite[];
  rfqTemplate: RfqTemplate | null; emailTemplate: EmailTemplate;
  history: Record<string, { supplierName: string; unitPrice: number; unit: string; currency: string; date: string; source: string } | null>;
  recommendations: { supplier: Supplier; reasons: string[]; score: number; match: boolean; isNew: boolean }[];
};
