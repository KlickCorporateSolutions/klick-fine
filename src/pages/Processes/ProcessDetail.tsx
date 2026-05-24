import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Upload as UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FineUpload } from "@/components/comparison/FineUpload";
import { ExtractionProgress } from "@/components/comparison/ExtractionProgress";
import { ComparisonTable } from "@/components/comparison/ComparisonTable";
import { useProcess } from "@/hooks/useProcesses";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import {
  createProposal,
  uploadProposalPdf,
} from "@/lib/api/processes";
import {
  extractAllFines,
  type ExtractionResult,
} from "@/lib/fineExtraction";
import {
  normalizeFineExtraction,
  type BankComparison,
  type FineExtractionApi,
} from "@/lib/fineSchema";
import { formatDate } from "@/lib/formatters";

export default function ProcessDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const { data: process, isLoading, error } = useProcess(id);

  // Estado do fluxo de upload + extração
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResults, setExtractionResults] = useState<ExtractionResult[]>(
    []
  );
  const [progress, setProgress] = useState({ percent: 0, message: "" });

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">A carregar processo…</p>
    );
  }
  if (error || !process) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-destructive">
            {error
              ? (error as Error).message
              : "Processo não encontrado"}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Comparações: das propostas já guardadas no DB
  const persistedComparisons: BankComparison[] = process.proposals.map((p) =>
    normalizeFineExtraction(p.extracted_data as FineExtractionApi)
  );

  const handleExtract = async () => {
    if (pendingFiles.length === 0 || !user || !currentOrganization) return;
    if (!process.credit_client) return;

    setIsExtracting(true);
    setExtractionResults([]);

    try {
      const results = await extractAllFines(
        pendingFiles,
        process.credit_client.name,
        (update) => {
          setProgress({ percent: update.percent, message: update.message });
        }
      );
      setExtractionResults(results);

      // Guardar propostas com sucesso
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const file = pendingFiles.find((f) => f.name === r.filename);
        if (!r.success || !r.rawData || !r.comparison || !file) continue;

        try {
          const storagePath = await uploadProposalPdf(
            currentOrganization.id,
            process.id,
            file
          );
          await createProposal({
            processId: process.id,
            userId: user.id,
            pdfFilename: r.filename,
            pdfStoragePath: storagePath,
            banco: r.banco ?? null,
            extractionMode: r.mode,
            extractedData: r.rawData,
            extractionWarnings: r.comparison.warnings,
          });
        } catch (saveErr) {
          console.error(`Falha a guardar proposta ${r.filename}`, saveErr);
          toast.error(`Falha a guardar ${r.filename}`, {
            description: (saveErr as Error).message,
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      toast.success("Extração concluída", {
        description: `${successCount}/${results.length} FINEs processadas com sucesso.`,
      });

      // Refresh do processo (para mostrar novas propostas)
      await queryClient.invalidateQueries({ queryKey: ["process", id] });
      setPendingFiles([]);
    } catch (err) {
      toast.error("Erro na extração", {
        description: (err as Error).message,
      });
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link to="/processes">
            <ArrowLeft className="h-4 w-4" />
            Voltar a processos
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {process.credit_client?.name ?? "Processo"}
            </h1>
            <p className="text-muted-foreground">
              {process.reference ?? "—"} ·{" "}
              {process.finalidade ?? "Finalidade não especificada"} · Criado{" "}
              {formatDate(process.created_at)}
            </p>
          </div>
          <Badge variant="outline">{process.status}</Badge>
        </div>
      </div>

      {/* Upload zone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadIcon className="h-5 w-5" />
            Carregar FINEs
          </CardTitle>
          <CardDescription>
            Adiciona os PDFs das simulações que os bancos enviaram para este
            cliente. Pelo menos 2 para comparares.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FineUpload
            files={pendingFiles}
            onChange={setPendingFiles}
            disabled={isExtracting}
          />
          {pendingFiles.length > 0 && (
            <Button
              onClick={() => void handleExtract()}
              disabled={isExtracting || pendingFiles.length === 0}
              className="w-full sm:w-auto"
            >
              {isExtracting
                ? "A processar…"
                : `Analisar ${pendingFiles.length} FINE${pendingFiles.length > 1 ? "s" : ""}`}
            </Button>
          )}
          {(isExtracting || extractionResults.length > 0) && (
            <ExtractionProgress
              percent={progress.percent}
              message={progress.message || "Concluído"}
              results={extractionResults}
              isRunning={isExtracting}
            />
          )}
        </CardContent>
      </Card>

      {/* Tabela de comparação das propostas persistidas */}
      {persistedComparisons.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            Comparativo ({persistedComparisons.length} proposta
            {persistedComparisons.length > 1 ? "s" : ""})
          </h2>
          <ComparisonTable banks={persistedComparisons} />
        </section>
      )}

      {persistedComparisons.length === 0 && !isExtracting && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Ainda não há propostas neste processo. Carrega as FINEs em cima.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
