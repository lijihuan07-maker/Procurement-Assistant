"use client";
import type { AiImage } from "@/lib/ai-types";

const MAX_IMAGE_BYTES = 3_200_000; // keep each request under hosting body limits

export const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === "application/pdf";
export const isImg = (f: File) => /\.(png|jpe?g|webp)$/i.test(f.name) || /^image\//.test(f.type);
export const isSheet = (f: File) => /\.(xlsx|xls|xlsm|csv)$/i.test(f.name);

async function xlsxLib() { return await import("xlsx"); }
async function pdfLib() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

/** Read a spreadsheet into text (CSV per sheet + formulas), the form the AI reads best. */
async function sheetText(file: File) {
  const XLSX = await xlsxLib();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: true });
  let out = "";
  for (const n of wb.SheetNames) {
    const ws = wb.Sheets[n];
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false }).split("\n").map((l) => l.replace(/,+$/, "")).filter((l) => l.replace(/,/g, "").trim()).join("\n");
    if (!csv.trim()) continue;
    out += `\n### 工作表：${n}\n${csv.replace(/=?_?x?l?f?n?\.?DISPIMG\([^)]*\)/g, "[图片]")}\n`;
    const fs: string[] = [];
    for (const addr in ws) { const c = ws[addr] as { f?: string }; if (addr[0] !== "!" && c?.f && !/DISPIMG/.test(c.f)) fs.push(`${addr}: =${c.f}`); if (fs.length >= 60) break; }
    if (fs.length) out += `（该表的部分公式）\n${fs.join("\n")}\n`;
  }
  return out.slice(0, 150000);
}

/** Rows of the first sheet as arrays (for templates and imports). */
export async function sheetRows(file: File): Promise<unknown[][]> {
  const XLSX = await xlsxLib();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true, blankrows: true }) as unknown[][];
}

function canvasToJpeg(cv: HTMLCanvasElement, quality: number): Promise<string> {
  return new Promise((res) => cv.toBlob((b) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.readAsDataURL(b!); }, "image/jpeg", quality));
}

async function imageFileToJpeg(file: File, maxSide = 1700, quality = 0.8): Promise<AiImage> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
  const cx = cv.getContext("2d")!; cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(bmp, 0, 0, cv.width, cv.height);
  return { mediaType: "image/jpeg", data: await canvasToJpeg(cv, quality) };
}

/** Text per page of a PDF. */
export async function pdfPages(file: File, maxPages = 1500, onProgress?: (p: number, n: number) => void) {
  const pdfjs = await pdfLib();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const n = Math.min(pdf.numPages, maxPages);
  const pages: { page: number; text: string }[] = [];
  for (let p = 1; p <= n; p++) {
    const pg = await pdf.getPage(p);
    const tc = await pg.getTextContent();
    let text = "", line = "", lastY: number | null = null;
    for (const it of tc.items as { str: string; transform: number[] }[]) {
      const y = Math.round(it.transform[5]);
      if (lastY != null && Math.abs(y - lastY) > 3) { text += line.trim() + "\n"; line = ""; }
      line += it.str + " "; lastY = y;
    }
    pages.push({ page: p, text: (text + line).trim() });
    onProgress?.(p, n);
  }
  return { pages, numPages: pdf.numPages, pdf };
}

/** Read any supported file for the AI: text when available, page images for scans and photos. */
export async function readForAi(file: File): Promise<{ text: string; images: AiImage[]; note: string }> {
  if (isSheet(file)) return { text: await sheetText(file), images: [], note: "" };
  if (isImg(file)) return { text: "", images: [await imageFileToJpeg(file)], note: "图片" };
  if (isPdf(file)) {
    const { pages, pdf } = await pdfPages(file, 12);
    const text = pages.map((p) => `${p.text}\n--- 第 ${p.page} 页结束 ---`).join("\n");
    const meaningful = (text.match(/[0-9A-Za-z一-鿿]/g) || []).length;
    if (meaningful >= 150 * pages.length) return { text: text.slice(0, 120000), images: [], note: "" };
    // Scanned PDF: render pages to JPEG, shrinking until the request fits.
    for (const [side, q] of [[1600, 0.75], [1300, 0.65], [1100, 0.55]] as const) {
      const images: AiImage[] = [];
      let bytes = 0;
      for (let p = 1; p <= Math.min(pdf.numPages, 6); p++) {
        const pg = await pdf.getPage(p);
        const vp0 = pg.getViewport({ scale: 1 });
        const vp = pg.getViewport({ scale: Math.min(2.5, side / vp0.width) });
        const cv = document.createElement("canvas"); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
        const cx = cv.getContext("2d")!; cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);
        await pg.render({ canvasContext: cx, viewport: vp }).promise;
        const data = await canvasToJpeg(cv, q);
        bytes += data.length; images.push({ mediaType: "image/jpeg", data });
      }
      if (bytes < MAX_IMAGE_BYTES) return { text: "", images, note: "扫描件，按图片识别" };
    }
    throw new Error("扫描件太大，请拆分成几份再上传");
  }
  throw new Error("不支持的文件类型，请上传 Excel、PDF 或图片");
}
