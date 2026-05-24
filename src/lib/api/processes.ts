import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert } from "@/types/database";

export type Process = Tables<"processes">;
export type CreditClient = Tables<"credit_clients">;
export type Proposal = Tables<"proposals">;

export type ProcessWithClient = Process & {
  credit_client: CreditClient;
};

export type ProcessWithProposals = ProcessWithClient & {
  proposals: Proposal[];
};

// ---------- Processes ----------

export async function listProcesses(
  organizationId: string
): Promise<ProcessWithClient[]> {
  const { data, error } = await supabase
    .from("processes")
    .select("*, credit_client:credit_clients(*)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ProcessWithClient[];
}

export async function getProcess(id: string): Promise<ProcessWithProposals> {
  const { data, error } = await supabase
    .from("processes")
    .select("*, credit_client:credit_clients(*), proposals(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as ProcessWithProposals;
}

export interface CreateProcessInput {
  organizationId: string;
  userId: string;
  clientName: string;
  clientNif?: string;
  clientEmail?: string;
  reference?: string;
  finalidade?: string;
  montantePretendido?: number;
}

/**
 * Cria um cliente + processo numa única transação lógica.
 * (Supabase ainda não suporta transações via JS SDK — fazemos em sequência;
 *  se a 2ª falhar, apagamos o cliente para não deixar órfão.)
 */
export async function createProcessWithClient(
  input: CreateProcessInput
): Promise<ProcessWithClient> {
  const clientPayload: TablesInsert<"credit_clients"> = {
    organization_id: input.organizationId,
    name: input.clientName,
    nif: input.clientNif || null,
    email: input.clientEmail || null,
    created_by: input.userId,
  };

  const { data: client, error: clientError } = await supabase
    .from("credit_clients")
    .insert(clientPayload)
    .select()
    .single();
  if (clientError) throw clientError;

  const processPayload: TablesInsert<"processes"> = {
    organization_id: input.organizationId,
    credit_client_id: client.id,
    reference: input.reference || null,
    finalidade: input.finalidade || null,
    montante_pretendido: input.montantePretendido ?? null,
    created_by: input.userId,
  };

  const { data: process, error: processError } = await supabase
    .from("processes")
    .insert(processPayload)
    .select()
    .single();

  if (processError) {
    // Rollback manual: apagar cliente órfão
    await supabase.from("credit_clients").delete().eq("id", client.id);
    throw processError;
  }

  return { ...process, credit_client: client } as ProcessWithClient;
}

// ---------- Proposals ----------

export interface CreateProposalInput {
  processId: string;
  userId: string;
  pdfFilename: string;
  pdfStoragePath: string | null;
  banco: string | null;
  extractionMode: "text" | "vision" | "vision_thinking";
  extractedData: unknown;
  extractionWarnings: string[];
}

export async function createProposal(
  input: CreateProposalInput
): Promise<Proposal> {
  const payload: TablesInsert<"proposals"> = {
    process_id: input.processId,
    pdf_filename: input.pdfFilename,
    pdf_storage_path: input.pdfStoragePath,
    banco: input.banco,
    extraction_mode: input.extractionMode,
    extracted_data: input.extractedData as never, // Json type
    extraction_warnings: input.extractionWarnings,
    created_by: input.userId,
  };

  const { data, error } = await supabase
    .from("proposals")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Storage ----------

export async function uploadProposalPdf(
  organizationId: string,
  processId: string,
  file: File
): Promise<string> {
  // path: <org_id>/<process_id>/<timestamp>-<filename>
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${organizationId}/${processId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from("proposal-pdfs")
    .upload(path, file, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (error) throw error;
  return path;
}

export async function getProposalPdfUrl(
  storagePath: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("proposal-pdfs")
    .createSignedUrl(storagePath, 3600); // 1h
  if (error) {
    console.error("Erro a gerar signed URL:", error);
    return null;
  }
  return data.signedUrl;
}
