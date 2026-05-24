import * as pdfjsLib from "pdfjs-dist";

// Worker bundlado pelo Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

export interface PdfExtractionResult {
  text: string;
  isCorrupted: boolean;
  numPages: number;
}

/**
 * Deteta o banco a partir dos primeiros ~4000 chars do texto extraído.
 * Ordem importa: mais específico primeiro.
 */
export function detectBankFromText(text: string): string | null {
  const head = text.slice(0, 4000).toLowerCase();
  if (/\bbankinter\b/.test(head)) return "Bankinter";
  if (/caixa geral de dep[óo]sitos|\bcgd\b/.test(head)) return "CGD";
  if (/\bnovobanco\b|novo banco/.test(head)) return "novobanco";
  if (/\bsantander\b/.test(head)) return "Santander";
  if (/\bbpi\b|banco bpi/.test(head)) return "BPI";
  if (/\babanca\b|abanca\.pt/.test(head)) return "Abanca";
  if (
    /\bccam\b|cr[ée]dito agr[íi]cola|caixa de cr[ée]dito agr[íi]cola/.test(head)
  )
    return "CCAM";
  if (/\buci\b/.test(head)) return "UCI";
  return null;
}

/**
 * Bancos que requerem Sonnet Vision em vez de Haiku texto, devido a layouts
 * densos que provocam alucinações em campos-chave (notavelmente seguro_vida_mensal
 * e extração literal de TAEG para Abanca).
 */
export const BANKS_FORCED_VISION = new Set([
  "Bankinter",
  "CGD",
  "novobanco",
  "BPI",
  "Abanca",
]);

/**
 * Bancos que beneficiam de extended thinking em Sonnet Vision.
 * Usado para desambiguar tabelas visuais densas (ex: BPI Contratado vs Base).
 */
export const BANKS_EXTENDED_THINKING = new Set(["BPI"]);

interface PdfTextItem {
  str: string;
}

function calculateNonPrintableRatio(text: string): number {
  if (text.length === 0) return 1;
  const nonPrintable = (text.match(/[\x00-\x08\x0B-\x1F\x7F-\x9F]/g) ?? [])
    .length;
  return nonPrintable / text.length;
}

function calculateAlphanumericRatio(text: string): number {
  const alphanum = (text.match(/[a-zA-Z0-9]/g) ?? []).length;
  const nonWhitespace = text.replace(/\s/g, "").length || 1;
  return alphanum / nonWhitespace;
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const result = await extractTextFromPdfWithMeta(file);
  return result.text;
}

export async function extractTextFromPdfWithMeta(
  file: File
): Promise<PdfExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = (content.items as PdfTextItem[])
      .map((item) => item.str)
      .join(" ");
    pages.push(pageText);
  }

  const text = pages.join("\n\n");
  const numPages = pdf.numPages;

  // Heurística 1: ratio de chars não-imprimíveis
  if (calculateNonPrintableRatio(text) > 0.3) {
    console.log(
      `[pdf-extract] ${file.name}: ${(calculateNonPrintableRatio(text) * 100).toFixed(1)}% non-printable → vai como imagens`
    );
    return { text, isCorrupted: true, numPages };
  }

  // Heurística 2: detetar fontes Type3 sem ToUnicode CMap
  // (texto vem como sequência de glyph indices em vez de Unicode real).
  // Caso real: 3 FINE novobanco Paulo Madeira → 236k chars de lixo,
  // 0% não-imprimíveis mas <30% alfanuméricos.
  if (calculateAlphanumericRatio(text) < 0.3 && text.length > 1000) {
    console.log(
      `[pdf-extract] ${file.name}: apenas ${(calculateAlphanumericRatio(text) * 100).toFixed(0)}% alfanuméricos → corrupto, vai como imagens`
    );
    return { text, isCorrupted: true, numPages };
  }

  return { text, isCorrupted: false, numPages };
}

/**
 * Renderiza páginas específicas de um PDF como JPEG (base64).
 * Usado para PDFs corruptos/scan em vez de enviar o base64 do PDF cru.
 */
export async function renderPagesAsJpeg(
  arrayBuffer: ArrayBuffer,
  pageNumbers: number[]
): Promise<string[]> {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];

  for (const pageNum of pageNumbers) {
    if (pageNum > pdf.numPages) {
      console.log(
        `[pdf-render] página ${pageNum} não existe (PDF tem ${pdf.numPages} páginas)`
      );
      continue;
    }

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context indisponível");
    }
    // pdfjs-dist v5+: requer `canvas` além de `canvasContext`
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const base64 = dataUrl.split(",")[1];
    images.push(base64);

    console.log(
      `[pdf-render] página ${pageNum} → ${(base64.length / 1024).toFixed(0)} KB`
    );
  }

  console.log(`[pdf-render] total: ${images.length} imagens prontas`);
  return images;
}

/**
 * Seleciona páginas a renderizar como imagens. Replica a heurística do v1:
 *  - PDFs ≤4 páginas: todas
 *  - PDFs 5 páginas: salta a 5 (geralmente é só anexo legal)
 *  - PDFs ≥6 páginas: salta a 5 e cap em 22 (limites de tokens / custo)
 */
export function selectPagesToRender(numPages: number): number[] {
  if (numPages <= 4) {
    return Array.from({ length: numPages }, (_, i) => i + 1);
  }
  if (numPages === 5) {
    return [1, 2, 3, 4];
  }
  const pages: number[] = [];
  for (let p = 1; p <= Math.min(numPages, 22); p++) {
    if (p !== 5) pages.push(p);
  }
  return pages;
}
