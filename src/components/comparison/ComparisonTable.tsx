import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatValue } from "@/lib/formatters";
import {
  rubricGroups,
  type BankComparison,
  type RubricKey,
} from "@/lib/fineSchema";

interface ComparisonTableProps {
  banks: BankComparison[];
}

type DadosKey = keyof BankComparison["dados"];

/**
 * Para uma linha (rubric), devolve o índice do banco com o melhor valor.
 * `null` se todos iguais, ou se não há valores numéricos comparáveis.
 *
 * Política (fix C2 do v1):
 *   - `null` NUNCA conta como "melhor"
 *   - `0` só conta se `treatZeroAsMissing === false`
 *   - Tie → não destaca nenhum
 */
function getBestIndex(
  banks: BankComparison[],
  rubric: RubricKey
): number | null {
  if (!rubric.betterDirection || rubric.betterDirection === "neutral")
    return null;
  if (rubric.format === "text") return null;

  const values = banks.map((b) => {
    const raw = b.dados[rubric.key as DadosKey];
    if (typeof raw !== "number") return null;
    if (rubric.treatZeroAsMissing && raw === 0) return null;
    return raw;
  });

  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;

  const best =
    rubric.betterDirection === "higher" ? Math.max(...valid) : Math.min(...valid);
  if (valid.every((v) => v === best)) return null;

  return values.indexOf(best);
}

/**
 * Esconde rubricas que não fazem sentido para o conjunto de bancos.
 * Ex: spread período variável se todas as propostas são fixas.
 */
function shouldHideRow(
  rubric: RubricKey,
  banks: BankComparison[]
): boolean {
  const allEmpty = banks.every((b) => {
    const v = b.dados[rubric.key as DadosKey];
    return v === null || v === undefined || v === "";
  });
  if (allEmpty) return true;

  // Caso específico: TAN período fixo/variável só aplicáveis em mistas
  if (rubric.key === "tanFixa" || rubric.key === "tanVariavel" || rubric.key === "spreadPeriodoVariavel") {
    return banks.every((b) => !/mista/i.test(b.dados.tipoTaxa));
  }

  return false;
}

export function ComparisonTable({ banks }: ComparisonTableProps) {
  const visibleGroups = useMemo(
    () =>
      rubricGroups
        .map((group) => ({
          ...group,
          keys: group.keys.filter((r) => !shouldHideRow(r, banks)),
        }))
        .filter((g) => g.keys.length > 0),
    [banks]
  );

  if (banks.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Sem propostas para comparar.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="sticky left-0 z-10 min-w-[220px] bg-muted/50 px-4 py-3 text-left font-semibold">
              Rubrica
            </th>
            {banks.map((b) => (
              <th
                key={b.banco}
                className="min-w-[180px] px-4 py-3 text-center font-semibold"
              >
                <div className="text-foreground">{b.banco}</div>
                {b.dados.headerCurto && (
                  <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                    {b.dados.headerCurto}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleGroups.map((group) => (
            <FragmentGroup
              key={group.label}
              label={group.label}
              keys={group.keys}
              banks={banks}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FragmentGroup({
  label,
  keys,
  banks,
}: {
  label: string;
  keys: RubricKey[];
  banks: BankComparison[];
}) {
  return (
    <>
      <tr>
        <td
          colSpan={banks.length + 1}
          className="bg-secondary px-4 py-2 text-xs font-bold uppercase tracking-wider text-secondary-foreground"
        >
          {label}
        </td>
      </tr>
      {keys.map((rubric, rowIdx) => {
        const bestIdx = getBestIndex(banks, rubric);
        return (
          <tr
            key={rubric.key}
            className={cn(
              "border-t border-border/50 transition-colors",
              rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20"
            )}
          >
            <td
              className={cn(
                "sticky left-0 z-10 px-4 py-2.5 font-medium text-muted-foreground",
                rowIdx % 2 === 0 ? "bg-background" : "bg-muted/20"
              )}
            >
              {rubric.label}
            </td>
            {banks.map((b, i) => {
              const value = b.dados[rubric.key as DadosKey];
              const isBest = bestIdx === i;
              return (
                <td
                  key={b.banco}
                  className={cn(
                    "px-4 py-2.5 text-center tabular-nums",
                    isBest
                      ? "bg-emerald-50 font-semibold text-emerald-900"
                      : "text-foreground"
                  )}
                  title={isBest ? "Melhor valor desta rubrica" : undefined}
                >
                  {formatValue(value, rubric.format)}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
