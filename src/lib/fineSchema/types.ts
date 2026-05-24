/**
 * Tipos canónicos da FINE — formato de entrada (API/Claude) e formato
 * normalizado para a UI (BankComparison).
 *
 * O formato API espelha o que a edge function `analyze-fine` devolve.
 * O formato UI é o que alimenta a tabela de comparação.
 */

// ============================================================
// Formato bruto da API (o que o Claude devolve)
// ============================================================

export interface FineExtractionApi {
  // Identificação
  banco?: string;
  tipo_taxa?: string;
  tipo_financiamento?: string;
  header_curto?: string;
  periodo_fixa_meses?: number;

  // Dados estruturais
  montante_escritura?: number | null;
  avaliacao_potencial?: number | null;
  montante_financiamento?: number | null;
  prazo_meses?: number | null;

  // Taxas — versão expandida (C1 fix do v1)
  indexante?: string | null;
  spread?: number | null;
  spread_base?: number | null;
  spread_contratado?: number | null;
  spread_periodo_variavel?: number | null;
  bonificacao_1ano?: number | null;
  /** Bonificações decompostas por produto (P2 fix do v1) */
  bonificacoes?: Array<{
    produto: string;
    impacto_pp: number;
    obrigatorio: boolean;
  }>;
  /** TAN do período fixo (C1 fix) */
  tan_fixa?: number | null;
  /** TAN do período variável (C1 fix) */
  tan_variavel?: number | null;
  tan?: number | null;
  taeg?: number | null;

  // Prestações
  prestacao?: number | null;
  prestacao_periodo_variavel?: number | null;
  mtic?: number | null;

  // Seguros
  seguro_vida_mensal?: number | null;
  seguro_multirriscos_mensal?: number | null;
  seguro_multirriscos_anual?: number | null;

  // Encargos individuais
  total_encargos?: number | null;
  comissao_avaliacao?: number | null;
  comissao_abertura?: number | null;
  outras_comissoes?: number | null;
  formalizacao_escritura?: number | null;
  is_utilizacao_credito?: number | null;
  is_compra_venda?: number | null;
  imt?: number | null;
  copia_certificada_documento?: number | null;
  deposito_online?: number | null;
  documento_particular_autenticado?: number | null;
  outorga?: number | null;
  registos_hipoteca?: number | null;
  fee_gestao_mensal?: number | null;

  // Texto
  observacoes?: string | null;

  // Metadata
  _meta?: {
    avisos?: string[];
    isencao_dl48a?: boolean;
    encargos_dump?: string;
  };
}

// ============================================================
// Formato normalizado (UI)
// ============================================================

/**
 * Estrutura de bonificação decomposta.
 */
export interface Bonification {
  produto: string;
  impactoPp: number;
  obrigatorio: boolean;
}

/**
 * Dados normalizados de uma proposta bancária, prontos para comparação.
 *
 * Política de nulls (C2 fix da auditoria do v1):
 *   - `null`     → campo ausente na FINE (UI mostra "—")
 *   - `0`        → publicado explicitamente como zero (ex: isenção)
 *   - `undefined`→ não aplicável (ex: prestação pós-step-up para taxa fixa)
 */
export interface BankComparisonDados {
  // Header / identificação
  tipoTaxa: string;
  headerCurto: string;
  tipoFinanciamento: string;

  // Estruturais
  montanteEscritura: number | null;
  montanteFinanciamento: number;
  avaliacao: number | null;
  ltv: number | null;
  capitaisProprios: number | null;
  prazo: number;

  // Taxas
  indexante: string;
  spread: number | null;
  spreadBase: number | null;
  spreadContratado: number | null;
  spreadPeriodoVariavel: number | null;
  bonificacao: number | null;
  bonificacoes: Bonification[];
  /** TAN do período fixo, quando aplicável (C1 fix) */
  tanFixa: number | null;
  /** TAN do período variável, quando aplicável (C1 fix) */
  tanVariavel: number | null;
  tan: number | null;
  taeg: number | null;

  // Prestações
  prestacaoMensal: number | null;
  prestacaoPosTaxaFixa: number | null;
  mtic: number | null;

  // Seguros
  seguroVida: number | null;
  seguroMultirriscos: number | null;

  // Encargos
  totalEncargos: number | null;
  comissaoAvaliacao: number | null;
  comissaoAbertura: number | null;
  outrasComissoes: number | null;
  formalizacao: number | null;
  isUtilizacaoCredito: number | null;
  isCompraVenda: number | null;
  imt: number | null;
  copiaCertificada: number | null;
  depositoOnline: number | null;
  dpa: number | null;
  outorga: number | null;
  registosHipoteca: number | null;

  // Outros
  feeGestao: number | null;
  observacoes: string;
  notas: string;
}

export interface BankComparison {
  banco: string;
  dados: BankComparisonDados;
  /** Avisos não-bloqueantes da normalização (ex: discrepância entre total modelo vs soma) */
  warnings: string[];
}
