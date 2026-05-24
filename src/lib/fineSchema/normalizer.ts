/**
 * Normalizador: API (raw extraction do Claude) → BankComparison (UI).
 *
 * Implementa os fixes da auditoria do v1:
 *   - C1: split TAN fixa/variável (preservar separados em mistas)
 *   - C2: preservar `null` em vez de mascarar como `0`
 *   - C3: total_encargos usa fonte única (modelo se disponível,
 *         senão soma client-side), com aviso se divergirem >€10
 */

import type {
  BankComparison,
  BankComparisonDados,
  Bonification,
  FineExtractionApi,
} from "./types";

// ============================================================
// Helpers
// ============================================================

/**
 * Converte um valor para número, preservando `null` se ausente/inválido.
 * Crucial: substitui o padrão tóxico `Number(x) || 0` do v1, que mascarava
 * valores em falta como zeros (e marcava-os como "melhor" na comparação).
 */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrEmpty(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizarIndexante(indexante: string): string {
  if (!indexante) return "—";
  // "3%" → "3,00%" mas "2,25%" fica igual
  return indexante.replace(/(?<![\d,.])\b(\d+)%/g, "$1,00%");
}

function calcularHeaderCurto(
  tipoTaxa: string,
  prazoMeses: number,
  periodoFixaMeses: number,
  fallback: string
): string {
  const tipo = tipoTaxa.toLowerCase();
  if (tipo.includes("variável") || tipo.includes("variavel")) return "Variável";
  if (tipo.includes("mista")) {
    const anos = periodoFixaMeses > 0 ? Math.round(periodoFixaMeses / 12) : "?";
    return `Tx Mista ${anos}a`;
  }
  if (tipo.includes("fixa")) {
    const anos = prazoMeses > 0 ? Math.round(prazoMeses / 12) : "?";
    return `Tx Fixa ${anos}a`;
  }
  return fallback || "—";
}

// ============================================================
// Normalizador principal
// ============================================================

export function normalizeFineExtraction(
  sim: FineExtractionApi
): BankComparison {
  const warnings: string[] = [...(sim._meta?.avisos ?? [])];

  // ------- Estruturais -------
  const montanteFinanciamento = toNumberOrNull(sim.montante_financiamento) ?? 0;
  const prazoMeses = toNumberOrNull(sim.prazo_meses) ?? 0;
  const avaliacaoPotencial = toNumberOrNull(sim.avaliacao_potencial);

  // Cascata para montanteEscritura: literal → avaliação como proxy → null
  let montanteEscritura = toNumberOrNull(sim.montante_escritura);
  if (
    montanteEscritura == null ||
    (typeof montanteEscritura === "number" && montanteEscritura === 0)
  ) {
    montanteEscritura = avaliacaoPotencial;
  }

  const avaliacao =
    avaliacaoPotencial != null && avaliacaoPotencial > 0
      ? avaliacaoPotencial
      : montanteEscritura;

  const capitaisProprios =
    montanteEscritura != null && montanteEscritura > 0
      ? montanteEscritura - montanteFinanciamento
      : null;

  const ltv =
    avaliacao != null && avaliacao > 0
      ? Math.round((montanteFinanciamento / avaliacao) * 10000) / 100
      : null;

  // ------- Encargos individuais (C2: preservar null) -------
  const encargos = {
    comissaoAvaliacao: toNumberOrNull(sim.comissao_avaliacao),
    comissaoAbertura: toNumberOrNull(sim.comissao_abertura),
    outrasComissoes: toNumberOrNull(sim.outras_comissoes),
    formalizacao: toNumberOrNull(sim.formalizacao_escritura),
    isUtilizacaoCredito: toNumberOrNull(sim.is_utilizacao_credito),
    isCompraVenda: toNumberOrNull(sim.is_compra_venda),
    imt: toNumberOrNull(sim.imt),
    copiaCertificada: toNumberOrNull(sim.copia_certificada_documento),
    depositoOnline: toNumberOrNull(sim.deposito_online),
    dpa: toNumberOrNull(sim.documento_particular_autenticado),
    outorga: toNumberOrNull(sim.outorga),
    registosHipoteca: toNumberOrNull(sim.registos_hipoteca),
  };

  // ------- Total encargos (C3: fonte única + warning se divergir) -------
  const somaEncargos = Object.values(encargos)
    .map((v) => v ?? 0)
    .reduce((s, v) => s + v, 0);
  const totalCalculado = Math.round(somaEncargos * 100) / 100;
  const totalModelo = toNumberOrNull(sim.total_encargos);

  let totalEncargos: number | null;
  if (totalModelo != null) {
    totalEncargos = totalModelo;
    const delta = Math.abs(totalModelo - totalCalculado);
    if (delta > 10) {
      warnings.push(
        `Total de encargos do modelo (€${totalModelo.toFixed(2)}) difere da soma manual (€${totalCalculado.toFixed(2)}) em €${delta.toFixed(2)} — verificar`
      );
    }
  } else if (totalCalculado > 0) {
    totalEncargos = totalCalculado;
  } else {
    totalEncargos = null;
  }

  // ------- Bonificações decompostas (P2 fix) -------
  const bonificacoes: Bonification[] = (sim.bonificacoes ?? []).map((b) => ({
    produto: b.produto,
    impactoPp: b.impacto_pp,
    obrigatorio: b.obrigatorio,
  }));

  // ------- Seguros (lidar com anual vs mensal) -------
  // Se vier seguro_multirriscos_anual mas não mensal, dividir por 12
  const seguroMultirriscos =
    toNumberOrNull(sim.seguro_multirriscos_mensal) ??
    (sim.seguro_multirriscos_anual != null
      ? Math.round((Number(sim.seguro_multirriscos_anual) / 12) * 100) / 100
      : null);

  // ------- Tipo de taxa / header -------
  const tipoTaxa = toStringOrEmpty(sim.tipo_taxa);
  const periodoFixaMeses = toNumberOrNull(sim.periodo_fixa_meses) ?? 0;
  const headerCurto = calcularHeaderCurto(
    tipoTaxa,
    prazoMeses,
    periodoFixaMeses,
    toStringOrEmpty(sim.header_curto)
  );

  const dados: BankComparisonDados = {
    // Header / identificação
    tipoTaxa,
    headerCurto,
    tipoFinanciamento: toStringOrEmpty(sim.tipo_financiamento) || "—",

    // Estruturais
    montanteEscritura,
    montanteFinanciamento,
    avaliacao,
    ltv,
    capitaisProprios,
    prazo: prazoMeses,

    // Taxas (C1: TAN split preservado)
    indexante: normalizarIndexante(toStringOrEmpty(sim.indexante)),
    spread: toNumberOrNull(sim.spread),
    spreadBase: toNumberOrNull(sim.spread_base),
    spreadContratado: toNumberOrNull(sim.spread_contratado),
    spreadPeriodoVariavel: toNumberOrNull(sim.spread_periodo_variavel),
    bonificacao: toNumberOrNull(sim.bonificacao_1ano),
    bonificacoes,
    tanFixa: toNumberOrNull(sim.tan_fixa),
    tanVariavel: toNumberOrNull(sim.tan_variavel),
    tan: toNumberOrNull(sim.tan),
    taeg: toNumberOrNull(sim.taeg),

    // Prestações (C2: null preservado)
    prestacaoMensal: toNumberOrNull(sim.prestacao),
    prestacaoPosTaxaFixa: toNumberOrNull(sim.prestacao_periodo_variavel),
    mtic: toNumberOrNull(sim.mtic),

    // Seguros
    seguroVida: toNumberOrNull(sim.seguro_vida_mensal),
    seguroMultirriscos,

    // Encargos
    totalEncargos,
    ...encargos,

    // Outros
    feeGestao: toNumberOrNull(sim.fee_gestao_mensal),
    observacoes: toStringOrEmpty(sim.observacoes),
    notas: warnings.length > 0 ? warnings.join("; ") : "",
  };

  return {
    banco: toStringOrEmpty(sim.banco) || "Desconhecido",
    dados,
    warnings,
  };
}
