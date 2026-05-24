/**
 * Formatadores PT-PT para a tabela de comparação e relatórios.
 */

export type ValueFormat = "currency" | "percent" | "text" | "months";

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2).replace(".", ",")}%`;
}

export function formatMonths(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "—";
  const years = Math.round((value / 12) * 10) / 10;
  return `${value} meses (${years}a)`;
}

export function formatValue(
  value: unknown,
  format?: ValueFormat
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "currency" && typeof value === "number")
    return formatCurrency(value);
  if (format === "percent" && typeof value === "number")
    return formatPercent(value);
  if (format === "months" && typeof value === "number")
    return formatMonths(value);
  return String(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
