export type AiImage = { mediaType: "image/png" | "image/jpeg" | "image/webp"; data: string };

/** One item the AI read from a demand list. */
export type DemandItem = { row?: string; no: string; nameCn: string; nameEn: string; spec: string; unit: string; qty: number | string; dateRequired: string; techReq: string; specRef: string; category: string; issues: string[]; questions: { question: string; questionEn?: string; options?: string[] }[] };
/** A slice of a demand list sent to the AI: row text (with row ids) plus header rows for context, or page images. */
export type DemandPart = { part: number; parts: number; context: string; rows: string; images: AiImage[] };
