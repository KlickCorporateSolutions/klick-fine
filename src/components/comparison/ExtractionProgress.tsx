import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { ExtractionResult } from "@/lib/fineExtraction";

interface ExtractionProgressProps {
  percent: number;
  message: string;
  results: ExtractionResult[];
  isRunning: boolean;
}

export function ExtractionProgress({
  percent,
  message,
  results,
  isRunning,
}: ExtractionProgressProps) {
  return (
    <div className="space-y-3 rounded-md border bg-card p-4">
      <div className="flex items-center gap-2">
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        )}
        <p className="text-sm font-medium">{message}</p>
      </div>
      <Progress value={percent} />

      {results.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {results.map((r) => (
            <li
              key={r.filename}
              className="flex items-center gap-2"
            >
              {r.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-destructive" />
              )}
              <span className="flex-1 truncate" title={r.filename}>
                {r.filename}
              </span>
              {r.success && r.banco && (
                <Badge variant="secondary" className="text-xs">
                  {r.banco}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {r.mode === "vision_thinking"
                  ? "vision + thinking"
                  : r.mode === "vision"
                    ? "vision"
                    : "texto"}
              </Badge>
              {!r.success && (
                <span
                  className="text-xs text-destructive max-w-[280px] truncate"
                  title={r.error}
                >
                  {r.error}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
