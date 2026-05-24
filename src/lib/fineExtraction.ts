/**
 * Orquestração de extração de FINEs.
 *
 * Fluxo por PDF:
 *   1. Extrair texto local (pdfjs) e detetar banco
 *   2. Decidir modo: texto vs vision (corrupção, banco forçado, texto curto)
 *   3. Se vision: renderizar páginas como JPEGs
 *   4. Chamar edge function `analyze-fine` com payload
 *   5. Normalizar resposta para BankComparison
 *
 * Melhoria face ao v1 (auditoria P1):
 *   - Extração local (passo 1-3) PARALELIZADA com Promise.all
 *   - Chamadas API mantidas sequenciais (rate limit) mas com backoff exponencial
 */

import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "@/lib/supabase";
import {
  BANKS_EXTENDED_THINKING,
  BANKS_FORCED_VISION,
  detectBankFromText,
  extractTextFromPdfWithMeta,
  renderPagesAsJpeg,
  selectPagesToRender,
} from "@/lib/pdfTextExtractor";
import {
  normalizeFineExtraction,
  type BankComparison,
  type FineExtractionApi,
} from "@/lib/fineSchema";

const TEXT_DELAY_MS = 8000;
const VISION_DELAY_MS = 18000;
const VISION_THINKING_DELAY_MS = 25000;
const MAX_RETRIES = 3;

export type ExtractionMode = "text" | "vision" | "vision_thinking";

export interface PdfPayload {
  filename: string;
  file: File;
  mode: ExtractionMode;
  detectedBank: string | null;
  text?: string;
  imagePages?: string[];
}

export interface ExtractionResult {
  filename: string;
  success: boolean;
  mode: ExtractionMode;
  detectedBank: string | null;
  banco?: string;
  comparison?: BankComparison;
  rawData?: FineExtractionApi;
  error?: string;
}

export type ProgressCallback = (update: {
  phase: "prepare" | "extract" | "done";
  currentFile: string;
  current: number;
  total: number;
  percent: number;
  message: string;
}) => void;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Prepara o payload de um PDF (extração local).
 * Esta etapa é paralelizável — toda local, sem chamadas API.
 */
export async function preparePdfPayload(file: File): Promise<PdfPayload> {
  let mode: ExtractionMode = "text";
  let detectedBank: string | null = null;
  let text = "";

  try {
    const result = await extractTextFromPdfWithMeta(file);
    text = result.text;
    detectedBank = detectBankFromText(text);

    if (result.isCorrupted) {
      mode = "vision";
    } else if (text.trim().length < 200) {
      mode = "vision";
    } else if (detectedBank && BANKS_FORCED_VISION.has(detectedBank)) {
      mode = "vision";
    }

    if (mode === "vision" && detectedBank && BANKS_EXTENDED_THINKING.has(detectedBank)) {
      mode = "vision_thinking";
    }

    if (mode === "text") {
      return { filename: file.name, file, mode, detectedBank, text };
    }

    // Vision: renderizar páginas selecionadas como JPEGs
    const arrayBuffer = await file.arrayBuffer();
    const pageNumbers = selectPagesToRender(result.numPages);
    const imagePages = await renderPagesAsJpeg(arrayBuffer, pageNumbers);
    return { filename: file.name, file, mode, detectedBank, imagePages };
  } catch (err) {
    console.warn(`[fine-extract] ${file.name}: extração local falhou → vision fallback`, err);
    // Fallback: tentar render mesmo assim
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) })
        .promise;
      const pageNumbers = selectPagesToRender(pdf.numPages);
      const imagePages = await renderPagesAsJpeg(arrayBuffer, pageNumbers);
      return {
        filename: file.name,
        file,
        mode: "vision",
        detectedBank: null,
        imagePages,
      };
    } catch (renderErr) {
      throw new Error(
        `Não foi possível processar o PDF: ${(renderErr as Error).message}`
      );
    }
  }
}

/**
 * Chama a edge function `analyze-fine` para um único PDF.
 * Inclui retry com backoff exponencial em caso de rate limit.
 */
async function callEdgeFunction(
  payload: PdfPayload,
  clientName: string
): Promise<ExtractionResult> {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      if (attempt > 0) {
        const waitMs = 30000 * attempt;
        console.warn(
          `[fine-extract] ${payload.filename} retry ${attempt}/${MAX_RETRIES}, aguardar ${waitMs / 1000}s`
        );
        await delay(waitMs);
      }

      const body: Record<string, unknown> = {
        filename: payload.filename,
        cliente_nome: clientName,
      };
      if (payload.detectedBank) body.detected_bank = payload.detectedBank;
      if (payload.mode === "text") {
        body.text = payload.text;
      } else {
        body.imagePages = payload.imagePages;
      }

      const { data, error } = await supabase.functions.invoke("analyze-fine", {
        body,
      });

      if (error) {
        return {
          filename: payload.filename,
          success: false,
          mode: payload.mode,
          detectedBank: payload.detectedBank,
          error: error.message,
        };
      }

      const raw = data as { success?: boolean; data?: FineExtractionApi; error?: string };
      const isRateLimit =
        raw && !raw.success && typeof raw.error === "string" &&
        (raw.error.includes("rate_limit") || raw.error.includes("429"));

      if (isRateLimit && attempt < MAX_RETRIES - 1) {
        attempt++;
        continue;
      }

      if (raw?.success && raw.data) {
        const comparison = normalizeFineExtraction(raw.data);
        return {
          filename: payload.filename,
          success: true,
          mode: payload.mode,
          detectedBank: payload.detectedBank,
          banco: comparison.banco,
          comparison,
          rawData: raw.data,
        };
      }

      return {
        filename: payload.filename,
        success: false,
        mode: payload.mode,
        detectedBank: payload.detectedBank,
        error: raw?.error ?? "Resposta sem dados",
      };
    } catch (err) {
      const message = (err as Error).message ?? "";
      if (
        (message.includes("429") || message.includes("rate_limit")) &&
        attempt < MAX_RETRIES - 1
      ) {
        attempt++;
        continue;
      }
      return {
        filename: payload.filename,
        success: false,
        mode: payload.mode,
        detectedBank: payload.detectedBank,
        error: message,
      };
    }
  }

  return {
    filename: payload.filename,
    success: false,
    mode: payload.mode,
    detectedBank: payload.detectedBank,
    error: "Excedeu o máximo de retries",
  };
}

/**
 * Orquestra a extração de múltiplos PDFs.
 * Fase 1: paralelizada (preparação local).
 * Fase 2: sequencial (chamadas API com delays para rate limit).
 */
export async function extractAllFines(
  files: File[],
  clientName: string,
  onProgress?: ProgressCallback
): Promise<ExtractionResult[]> {
  const total = files.length;

  // Fase 1: preparar payloads em paralelo
  onProgress?.({
    phase: "prepare",
    currentFile: "",
    current: 0,
    total,
    percent: 0,
    message: `A preparar ${total} PDFs em paralelo…`,
  });

  const payloads = await Promise.all(
    files.map(async (file, idx) => {
      const payload = await preparePdfPayload(file);
      onProgress?.({
        phase: "prepare",
        currentFile: file.name,
        current: idx + 1,
        total,
        percent: Math.round(((idx + 1) / total) * 20),
        message: `Preparado ${file.name} (modo ${payload.mode})`,
      });
      return payload;
    })
  );

  // Fase 2: chamar edge function sequencialmente, com delays apropriados
  const results: ExtractionResult[] = [];
  // Ordenar: texto primeiro (mais rápido), vision depois
  const sorted = [...payloads].sort((a, b) => {
    if (a.mode === "text" && b.mode !== "text") return -1;
    if (a.mode !== "text" && b.mode === "text") return 1;
    return 0;
  });

  for (let i = 0; i < sorted.length; i++) {
    const payload = sorted[i];
    onProgress?.({
      phase: "extract",
      currentFile: payload.filename,
      current: i + 1,
      total,
      percent: 20 + Math.round((i / total) * 75),
      message: `A extrair ${payload.filename} (${payload.mode})…`,
    });

    const result = await callEdgeFunction(payload, clientName);
    results.push(result);

    // Delay antes do próximo (só se não for o último)
    if (i < sorted.length - 1) {
      const next = sorted[i + 1];
      const stagger =
        next.mode === "vision_thinking"
          ? VISION_THINKING_DELAY_MS
          : next.mode === "vision"
            ? VISION_DELAY_MS
            : TEXT_DELAY_MS;
      onProgress?.({
        phase: "extract",
        currentFile: payload.filename,
        current: i + 1,
        total,
        percent: 20 + Math.round(((i + 1) / total) * 75),
        message: `A aguardar ${stagger / 1000}s antes do próximo (rate limit)…`,
      });
      await delay(stagger);
    }
  }

  onProgress?.({
    phase: "done",
    currentFile: "",
    current: total,
    total,
    percent: 100,
    message: `Concluído: ${results.filter((r) => r.success).length}/${total} sucesso`,
  });

  return results;
}
