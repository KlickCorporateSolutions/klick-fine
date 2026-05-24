/**
 * Grupos de rubricas para a tabela de comparação.
 * Define o que aparece na UI, em que ordem, com que label e formato.
 */

export type RubricFormat = "currency" | "percent" | "text" | "months";

export interface RubricKey {
  key: string;
  label: string;
  format?: RubricFormat;
  /** Sentido "melhor": para destacar a melhor coluna na comparação. */
  betterDirection?: "lower" | "higher" | "neutral";
  /** Trata `null` e `0` separadamente. Por default `0` conta como valor válido. */
  treatZeroAsMissing?: boolean;
}

export interface RubricGroup {
  label: string;
  keys: RubricKey[];
}

export const rubricGroups: RubricGroup[] = [
  {
    label: "Dados do Empréstimo",
    keys: [
      { key: "tipoFinanciamento", label: "Tipo de Financiamento", format: "text" },
      { key: "montanteEscritura", label: "Montante Escritura", format: "currency" },
      { key: "montanteFinanciamento", label: "Montante Financiamento", format: "currency" },
      { key: "avaliacao", label: "Avaliação", format: "currency" },
      { key: "ltv", label: "LTV", format: "percent" },
      { key: "capitaisProprios", label: "Capitais Próprios", format: "currency" },
      { key: "prazo", label: "Prazo", format: "months" },
    ],
  },
  {
    label: "Taxas e Prestação",
    keys: [
      { key: "indexante", label: "Indexante", format: "text" },
      { key: "spreadBase", label: "Spread Base", format: "percent", betterDirection: "lower", treatZeroAsMissing: true },
      { key: "spreadContratado", label: "Spread Contratado", format: "percent", betterDirection: "lower", treatZeroAsMissing: true },
      { key: "spreadPeriodoVariavel", label: "Spread Pós-Fixa", format: "percent", betterDirection: "lower" },
      { key: "bonificacao", label: "Bonificação", format: "percent" },
      { key: "tanFixa", label: "TAN (Período Fixo)", format: "percent", betterDirection: "lower" },
      { key: "tanVariavel", label: "TAN (Período Variável)", format: "percent", betterDirection: "lower" },
      { key: "tan", label: "TAN", format: "percent", betterDirection: "lower" },
      { key: "taeg", label: "TAEG", format: "percent", betterDirection: "lower" },
      { key: "prestacaoMensal", label: "Prestação Mensal", format: "currency", betterDirection: "lower" },
      { key: "prestacaoPosTaxaFixa", label: "Prestação Pós-Fixa", format: "currency", betterDirection: "lower" },
      { key: "mtic", label: "MTIC", format: "currency", betterDirection: "lower" },
    ],
  },
  {
    label: "Seguros",
    keys: [
      { key: "seguroVida", label: "Seguro de Vida", format: "currency", betterDirection: "lower" },
      { key: "seguroMultirriscos", label: "Seguro Multirriscos", format: "currency", betterDirection: "lower" },
    ],
  },
  {
    label: "Encargos",
    keys: [
      { key: "totalEncargos", label: "Total Encargos", format: "currency", betterDirection: "lower" },
      { key: "comissaoAvaliacao", label: "Comissão Avaliação", format: "currency" },
      { key: "comissaoAbertura", label: "Comissão Abertura", format: "currency" },
      { key: "outrasComissoes", label: "Outras Comissões", format: "currency" },
      { key: "formalizacao", label: "Formalização", format: "currency" },
      { key: "isUtilizacaoCredito", label: "IS Utilização Crédito", format: "currency" },
      { key: "isCompraVenda", label: "IS Compra e Venda", format: "currency" },
      { key: "imt", label: "IMT", format: "currency" },
      { key: "copiaCertificada", label: "Cópia Certificada", format: "currency" },
      { key: "depositoOnline", label: "Depósito Online", format: "currency" },
      { key: "dpa", label: "DPA", format: "currency" },
      { key: "outorga", label: "Outorga", format: "currency" },
      { key: "registosHipoteca", label: "Registos Hipoteca", format: "currency" },
    ],
  },
  {
    label: "Outros",
    keys: [
      { key: "feeGestao", label: "Fee Gestão", format: "currency" },
      { key: "observacoes", label: "Observações", format: "text" },
      { key: "notas", label: "Notas", format: "text" },
    ],
  },
];
