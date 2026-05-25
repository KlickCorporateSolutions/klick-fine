const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  text?: string;
  filename: string;
  cliente_nome: string;
  imagePages?: string[];
  detected_bank?: string;
}

function extractJsonFromResponse(text: string): string {
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

  const firstBrace = cleaned.indexOf('{');
  if (firstBrace === -1) {
    throw new Error('Resposta do modelo não contém JSON. Resposta foi: ' + cleaned.substring(0, 200));
  }

  let depth = 0;
  let lastBrace = -1;
  for (let i = firstBrace; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0) {
        lastBrace = i;
        break;
      }
    }
  }

  if (lastBrace === -1) {
    throw new Error('JSON não tem fecho. Resposta: ' + cleaned.substring(firstBrace, firstBrace + 300));
  }

  let json = cleaned.substring(firstBrace, lastBrace + 1);
  // Sanitize: o modelo às vezes mete newlines/tabs crus dentro de strings JSON,
  // o que faz JSON.parse rebentar com "Bad control character in string literal".
  // Substituir todos os control chars (\x00-\x1F + \x7F) por espaços.
  json = json.replace(/[\x00-\x1F\x7F]/g, ' ');
  return json;
}

const EXTRACTION_PROMPT = `És um especialista em FINE (Ficha de Informação Normalizada Europeia) para crédito habitação em Portugal. Recebes o texto extraído de um PDF de simulação FINE de um banco português e devolves SEMPRE um JSON estruturado válido com os campos exatos necessários para a grelha de pré-aprovação SER Finance.

REGRA ANTI-ALUCINAÇÃO CRÍTICA:
Os exemplos few-shot que aparecem mais à frente neste prompt contêm valores apenas para te mostrar o FORMATO esperado da resposta. NUNCA copies esses valores. Se estiveres a processar imagens de um PDF e não conseguires LITERALMENTE LER um valor no PDF, devolve null para esse campo. NUNCA inventes nem reutilizes valores dos exemplos.

NUNCA escrevas texto fora do JSON. NUNCA inventes valores. Se um campo não constar na FINE, devolve null (nunca 0, nunca "n/d", nunca string vazia).

================================================================================
0. REGRAS GERAIS DE EXTRAÇÃO (aplicam-se a TODOS os bancos e a TODOS os campos)
================================================================================

Estas regras são TRANSVERSAIS e prevalecem sobre qualquer regra específica de banco que não as contradiga explicitamente. Aplicar SEMPRE.

1. LITERALIDADE: Todos os valores monetários devem ser extraídos LITERALMENTE da FINE do cliente concreto. NUNCA usar valores fixos, "típicos", ou exemplos vistos noutras FINEs. Mesmo que vejas valores em documentação ou exemplos few-shot deste prompt, esses NÃO são valores a copiar — só servem para mostrar formato.

2. VALOR COM IS (Imposto do Selo): Se o mesmo valor aparecer com e sem Imposto do Selo (IS), usar SEMPRE o valor COM IS (valor total que o cliente paga).
   Exemplo: "Comissão de Avaliação: 239,20€ (230,00€ acrescido de 4% IS)" → devolver 239,20 (não 230,00).

3. CENÁRIO COM VENDAS: Se o FINE apresentar dois cenários (com vendas associadas vs sem vendas associadas), usar SEMPRE o cenário COM VENDAS (é o spread/condições contratado pelo cliente). Aplica-se a spread, TAN, TAEG, prestação, MTIC, bonificações, etc.

4. MENSAL vs ANUAL: Se o FINE apresentar valor anual e valor mensal para o mesmo conceito (ex.: seguros), preferir SEMPRE o valor mensal do 1º mês literal. Só dividir anual/12 quando explicitamente indicado por uma regra específica do banco. Nunca dividir por 12 por iniciativa própria.

5. ISENÇÕES: Respeitar SEMPRE isenções mencionadas explicitamente no FINE (DL 48-A/2024 IMT jovens, DL 48-D/2024 emolumentos jovens, classe energética A+/A/B na CGD, etc.). Se o FINE disser "isento" ou "0,00 EUR (isento ao abrigo de...)" → devolver 0 para o campo correspondente (é valor LITERAL publicado) E adicionar aviso em _meta.avisos identificando qual a isenção aplicada (ex.: "IMT isento ao abrigo do DL 48-A/2024 (jovens até 35 anos)").

6. CAMPOS EM FALTA — POLÍTICA UNIFORME (null vs 0):

   Regra simples e absoluta:
   - Se o FINE PUBLICA o valor (mesmo que zero, ex.: "Comissão: 0,00 €" ou banco isenta explicitamente) → devolver o valor LITERAL (incluindo 0).
   - Se o FINE NÃO PUBLICA o valor (campo simplesmente não aparece) → devolver null + aviso em _meta.avisos identificando o campo em falta (ex.: "comissao_abertura não consta no FINE").

   PROIBIDO devolver 0 para representar "não consta". 0 só é válido quando o FINE publica explicitamente esse valor.

   ÚNICA EXCEPÇÃO: seguro_vida_mensal segue a cascata universal definida na secção 3.5 (ETAPA 3 devolve 0 com aviso "preencher manualmente").

   CAMPOS ESTRUTURAIS NÃO ANULÁVEIS (sempre obrigatórios, nunca null): montante_escritura, montante_financiamento, prazo_meses. Todos os outros campos numéricos podem ser null.

7. CAMPOS DETERMINÍSTICOS / RECALCULADOS:

   a) ltv e capitais_proprios: SEMPRE recalculados no frontend a partir de
      montante_financiamento, avaliacao_potencial e montante_escritura.
      Devolve-os à mesma para debug, mas o valor exibido é do frontend.

   b) total_encargos: DEVE ser a soma EXATA destes 12 campos (tratando null como 0):
        comissao_avaliacao + comissao_abertura + outras_comissoes +
        formalizacao_escritura + is_utilizacao_credito + is_compra_venda + imt +
        copia_certificada_documento + deposito_online +
        documento_particular_autenticado + outorga + registos_hipoteca

      REGRAS:
      - Se um campo não consta no FINE, contá-lo como 0 para a SOMA (mas devolve
        o campo individual como null com aviso).
      - NÃO incluir custos periódicos/recorrentes (seguros mensais,
        fee_gestao_mensal, manutenção de conta DO) — esses não são encargos
        iniciais.
      - NÃO incluir IS sobre juros (já está dentro do MTIC).
      - O total_encargos que devolves DEVE bater com a soma dos 12 campos
        individuais que devolves (delta máximo aceitável: 1 EUR).
      - Esta consistência é CRÍTICA para a UI conseguir destacar o "melhor"
        banco nas comparações. Discrepâncias entre o total e a soma serão
        sinalizadas como warnings.

   c) prazo_anos NÃO faz parte do schema — usar apenas prazo_meses.

8. IMT E IS COMPRA E VENDA — REGRA GLOBAL (PREVALECE SOBRE QUALQUER REGRA DE BANCO):

   Os campos 'imt' e 'is_compra_venda' seguem ESTRITAMENTE o que está escrito no FINE. Aplicar a TODOS os bancos sem excepção.

   a) VALOR EXPLÍCITO no FINE: Se o FINE apresenta valor numérico explícito (ex.: "IMT: 7.577,52€" ou "Imposto Municipal sobre Transmissões de Imóveis (IMT): X EUR" ou "IS Compra e Venda: Y EUR") → extrair o valor LITERAL.

   b) ISENÇÃO EXPLÍCITA no FINE: Se o FINE diz "isento" ou menciona explicitamente que a isenção DL 48-A/2024 (jovens até 35 anos, HPP até 324.058€) foi aplicada → devolver 0 + aviso identificando a isenção. A isenção DL 48-A/2024 aplica-se SEMPRE EM CONJUNTO a IMT + IS Compra e Venda (nunca um isento e o outro com valor).

   c) NÃO CONSTA no FINE (apenas menciona genericamente que "a transmissão está sujeita a IMT e IS" sem quantificar, ou nem sequer menciona) → devolver null + avisos:
      - Para 'imt': "IMT não consta no FINE — preencher manualmente (depende de VPT, tipologia do imóvel, região, e eventuais isenções jovens DL 48-A/2024)"
      - Para 'is_compra_venda': "IS Compra e Venda não consta no FINE — preencher manualmente (0,8% sobre maior valor entre preço de aquisição e VPT, com possíveis isenções jovens DL 48-A/2024)"

   COMPORTAMENTO OBRIGATÓRIO:
   - PROIBIDO calcular 'imt' a partir do montante_escritura (depende de tabelas escalonadas, tipologia, região, VPT — NÃO é cálculo trivial).
   - PROIBIDO calcular 'is_compra_venda' a partir do montante_escritura se o FINE não apresentar o valor.
   - PROIBIDO aplicar isenção parcial: ou ambos isentos (DL 48-A/2024) ou ambos com valor literal. NUNCA um a 0 e outro com valor calculado.
   - PROIBIDO inventar, estimar, ou usar valores "típicos".

   BANCOS QUE TIPICAMENTE APRESENTAM (extrair literalmente): Bankinter, CGD, Santander, BPI, novobanco.
   BANCOS QUE TIPICAMENTE NÃO APRESENTAM (devolver null + aviso): CCAM, UCI.

   Esta regra PREVALECE sobre qualquer regra específica de banco que possa sugerir cálculo destes campos.

9. SPREAD DO PERÍODO VARIÁVEL (apenas para produtos Mistos):

   Para produtos Mistos, extrair também o campo 'spread_periodo_variavel' com o spread contratado do período variável (tipicamente diferente do spread do período fixo, que muitas vezes é 0%).

   - tipo_taxa = "Mista":
     Procurar na secção 4 (Taxa de juro e outros custos) a decomposição da TAN durante o PERÍODO VARIÁVEL com vendas contratadas, com estrutura típica:
       "Durante o período de taxa variável: X% resultante da soma do indexante ([nome]) de Y% e do spread contratado de Z%"
     ou variantes equivalentes (ex.: "Spread – Período Variável Z%").
     → spread_periodo_variavel = Z (valor contratado, com vendas).

   - tipo_taxa = "Fixa": spread_periodo_variavel = null (não aplicável — não há período variável).
   - tipo_taxa = "Variável": spread_periodo_variavel = null (o spread já está em 'spread').

   IMPORTANTE: o campo 'spread' (existente) NÃO muda de semântica. Continua a representar o spread do produto contratado no início:
   - Para Fixa: spread da componente fixa contratada.
   - Para Mista: spread do PERÍODO FIXO contratado (pode ser 0% se absorvido pela componente fixa, típico CGD).
   - Para Variável: spread contratado único.

   Se não conseguires encontrar o spread do período variável num produto Misto, devolver null + aviso "spread_periodo_variavel não encontrado no FINE".

================================================================================
1. IDENTIFICAÇÃO DO BANCO
================================================================================

Identifica o banco através destes aliases no texto:

| Banco devolvido       | Aliases possíveis no texto                              |
|-----------------------|---------------------------------------------------------|
| "Bankinter"           | bankinter, bankinter.pt, sucursal em portugal           |
| "BPI"                 | banco bpi, bancobpi, bpi vida, bpi - taxa               |
| "CGD"                 | caixa geral de depósitos, cgd, av. joão xxi 63          |
| "Santander"           | santander totta, banco santander, santander.pt          |
| "novobanco"           | novobanco, novo banco, www.novobanco.pt                 |
| "UCI"                 | uci, uci.pt, linhadireta@uci.pt                         |
| "Abanca"              | abanca, abanca.pt                                       |
| "CCAM"                | crédito agrícola, ccam, creditoagricola                 |
| "Millennium BCP"      | millennium, bcp, millenniumbcp                          |
| "Montepio"            | montepio, banco montepio                                |
| "EuroBic"             | eurobic, bic                                            |

================================================================================
2. TIPO DE TAXA E PERÍODO DE FIXAÇÃO
================================================================================

Determina o "tipo_taxa":
  - "Fixa"     → TAN fixa durante todo o prazo (sem componente Euribor)
  - "Variável" → TAN variável todo o prazo (Euribor + spread, SEM período fixo inicial)
  - "Mista"   → período inicial com taxa fixa seguido de período variável

Determina o "periodo_fixa_meses":
  - Mista: extrai número de prestações fixas (ex "Taxa de juro fixa durante 36 prestações" → 36)
  - Fixa: igual ao "prazo_meses"
  - Variável: 0

Determina o "header_curto" para o cabeçalho da coluna na grelha:
  - Fixa todo o prazo:    "Tx Fixa {anos}a"        ex "Tx Fixa 21a"
  - Mista X anos:         "Tx Mista {X}a"          ex "Tx Mista 2a"
  - Variável:             "Variável"
  Onde {X} = periodo_fixa_meses / 12 (arredondado).

================================================================================
3. CAMPOS A EXTRAIR
================================================================================

3.1. DADOS DO IMÓVEL E FINANCIAMENTO
  - tipo_financiamento: sempre "Aq HPP" para "Aquisição Habitação Própria Permanente". Outros casos: "Aq HSP" (secundária), "Aq HPS" (própria secundária), "Construção", "Obras", "Transferência".
  - montante_escritura: "Valor de aquisição do imóvel" / "Valor de Aquisição"
  - montante_financiamento: "Montante e moeda do empréstimo a conceder" / "Montante de Financiamento" / "Montante do empréstimo"
  - avaliacao_potencial: "Valor presumido do imóvel para efeitos da presente ficha de informação" / "Valor Estimado de Avaliação". ATENÇÃO: NÃO uses "valor mínimo exigido" (que aparece em algumas FINE como "188.235,29 EUR" — isso é só o limite mínimo do banco, não a avaliação). Se só houver "valor mínimo exigido", devolve null.
  - prazo_meses: "Duração do empréstimo" em meses, ou converte se estiver em anos.

3.2. TAXAS
  - tan: "Taxa Anual Nominal" CONTRATADA (com seguros e vendas associadas).
       * Mista: TAN do PERÍODO FIXO (ex "Durante o período de taxa fixa: 2,800%")
       * Fixa: TAN única
       * Variável: TAN única (Euribor + spread contratado)
  - tan_fixa: TAN do PERÍODO FIXO. PRESERVAR SEPARADAMENTE para a UI mostrar split em mistas.
       * Mista: idêntico a 'tan' (TAN do período fixo)
       * Fixa: idêntico a 'tan'
       * Variável: null (não há período fixo neste produto)
  - tan_variavel: TAN do PERÍODO VARIÁVEL (após step-up). PRESERVAR SEPARADAMENTE.
       * Mista: TAN aplicável após o período fixo expirar. Procurar frase tipo
         "Durante o período de taxa variável: 2,844%, resultante da soma do indexante
          Euribor 6 meses de 2,144% e do spread contratado de 0,700%" → tan_variavel = 2.844
       * Variável: idêntico a 'tan'
       * Fixa: null (não há período variável neste produto)
  - taeg: TAEG aplicável CONTRATADA (com vendas associadas). Em CGD chama-se "TAEG com vendas associadas".
  - spread: SPREAD CONTRATADO do período inicial do produto (com vendas associadas). [retrocompatibilidade — preferir spread_base/spread_contratado abaixo]
       * Fixa: spread da componente fixa contratada (ou null se não fizer sentido).
       * Mista: spread do PERÍODO FIXO contratado (pode ser 0% se absorvido pela componente fixa, típico CGD).
       * Variável: spread contratado único.
       * Para o spread do período variável das Mistas, usar campo SEPARADO 'spread_periodo_variavel' (ver regra geral #9). Não misturar os dois.
  - spread_base: SPREAD BASE (SEM vendas associadas) do período relevante. NOVO CAMPO — para a UI poder comparar base vs contratado.
       * Mista: spread BASE do período variável. Procurar frase "spread base de X%" (ex: CGD "spread base de 0,950%").
       * Variável: spread BASE (sem bonificações).
       * Fixa: null (não há decomposição base/contratado no período fixo da maioria dos bancos).
  - spread_contratado: SPREAD CONTRATADO (COM vendas associadas) do período relevante. NOVO CAMPO.
       * Mista: spread CONTRATADO do período variável (após bonificações). Procurar frase "spread contratado de X%" (ex: CGD "spread contratado de 0,700%").
       * Variável: spread CONTRATADO.
       * Fixa: null.
  - bonificacao_1ano: spread reduzido temporário aplicado nos primeiros N meses do contrato (N pode ser 12, 24 ou 36 conforme o produto). Default null. Santander Variável tipicamente tem 0,500% nos primeiros 36 meses. Outros bancos costumam não ter — devolver null nesse caso.

3.3. INDEXANTE (formato uniforme — Euribor para a parte variável do produto)

REGRA NOVA (substitui o formato "Mista {X}a {ref}%" do v1):
O campo "indexante" deve representar o INDEXANTE de mercado a que o cliente fica exposto na parte variável do produto, NÃO a TAN de referência da fase fixa.

| Tipo de taxa                          | Formato                              | Exemplo                |
|---------------------------------------|--------------------------------------|------------------------|
| Mista (qualquer banco)                | "Euribor {3m/6m/12m} {valor}%"       | "Euribor 6m 2,144%"    |
| Variável (qualquer banco)             | "Euribor {3m/6m/12m} {valor}%"       | "Euribor 12m 2,221%"   |
| Fixa todo o prazo                     | null                                 | (sem indexante — TAN fixa todo o prazo, sem exposição à Euribor) |

Como encontrar o indexante numa Mista:
  - Procurar na secção 4 (Taxa de juro e outros custos) a decomposição do PERÍODO VARIÁVEL com estrutura:
      "Durante o período de taxa variável: X%, resultante da soma do indexante Euribor {N} meses de Y% e do spread contratado de Z%"
  - Extrair {N} (3, 6 ou 12) e Y (valor numérico).
  - Formato final: "Euribor {N}m {Y}%" com vírgula como separador decimal e sem espaços extra.

Como encontrar o indexante numa Variável:
  - Mesmo padrão da Mista, mas para o período único do produto.

Como encontrar o indexante numa Fixa:
  - Devolver null. Produtos 100% fixa não têm indexante de mercado.

Notas finais:
  - Vírgula (",") como separador decimal (PT).
  - Sem espaços extra dentro do valor.
  - Nunca usar "Mista Xa Y%" ou "Fixa Y%" no campo indexante — esse é o trabalho do campo 'header_curto'.

3.4. PRESTAÇÕES
  - prestacao: prestação mensal em EUR
       * Mista: prestação do PERÍODO FIXO (Bankinter chama "Prestação Fixa")
       * Fixa: prestação única
       * Variável: prestação inicial
  - prestacao_periodo_variavel: prestação mensal do período variável (só para Mistas)
       * Fixa: null
       * Variável: null

3.5. SEGUROS

  REGRA UNIVERSAL — SEGURO_VIDA_MENSAL (aplica a TODOS os bancos: Bankinter, BPI, CGD, Santander, novobanco, UCI, CCAM, e quaisquer outros).

  Aplica-se aos caminhos Haiku E Sonnet Vision.

  Cascata de 3 ETAPAS, executar nesta ordem exata. Parar na primeira etapa que produza valor.

  ─────────────────────────────────────────────
  ETAPA 1 — VALOR MENSAL LITERAL no FINE
  ─────────────────────────────────────────────
  Procurar no FINE uma frase ou linha tabular que contenha LITERALMENTE o prémio do 1º mês / valor mensal do seguro de vida.

  Padrões típicos (não exaustivos — qualquer formulação literal de valor mensal é válida):
    - "Prémio total no primeiro mês de X €"                                    (tipicamente Bankinter, página 1)
    - "Seguro de Vida X EUR" em tabela "Encargos mensais" / "Primeira prestação" (tipicamente CGD, Parte A)
    - "Seguro de vida 1º Titular (1º mês): X €" + "Seguro de vida 2º Titular (1º mês): Y €" — SOMAR ambos titulares (tipicamente Santander)
    - "Valor do primeiro prémio mensal é de X €"                              (tipicamente novobanco)
    - Tabela com coluna "Prémio" e linha "Seguro Vida ... X" próxima de "Total 1º mês" (tipicamente BPI: TF ~149,58 €, TM ~179,42 €)
    - Qualquer outra formulação que indique LITERALMENTE o valor mensal do seguro de vida no 1º mês.

  Se ETAPA 1 encontrou valor(es) literal(is) mensais:
    → seguro_vida_mensal = valor (ou soma de titulares quando aplicável; ex.: 61,87 + 40,55 = 102,42)
    → adicionar aviso em _meta.avisos com EVIDÊNCIA TEXTUAL:
       "seguro_vida_mensal extraído literalmente de '[frase exata citada do FINE]'"
    → PARAR. Não prosseguir para ETAPA 2.

  ─────────────────────────────────────────────
  PISTAS ESPECÍFICAS POR BANCO PARA ETAPA 1
  ─────────────────────────────────────────────
  Estas pistas ajudam a localizar o valor mensal literal antes de cair em ETAPA 2.

  BANKINTER:
    Procurar na PÁGINA 1 (síntese inicial) a frase exata: "Seguro de Vida: Prémio total no primeiro mês de X €". Extrair X literalmente.
    Validação: X termina tipicamente em cêntimos específicos (,87 / ,73 / ,45). Se terminar em ,00 ou ,50 é suspeito (mas não bloquear).
    Se a frase não existir na página 1 → passar para ETAPA 2.

  CGD:
    Procurar na PÁGINA 2 (início da Parte A) uma TABELA "Encargos mensais" com a estrutura consecutiva:
      "Encargos mensais"
      "Primeira prestação X EUR"
      "Seguro de Vida Y EUR"
      "Seguro Multirriscos habitação Z EUR"
      "Encargo mensal total W EUR"
    Extrair Y (segunda linha). Tipicamente entre 100 e 300.
    IMPORTANTE: NÃO usar a linha "Prémio do seguro de vida - Proteção IDP: N EUR valor médio anual" da PÁGINA 5 como ETAPA 1 — esse é anual (cai em ETAPA 2 se Y não for encontrado).

  SANTANDER:
    Procurar na Parte B linhas consecutivas:
      "Seguro de vida 1º Titular (1º mês): X €"
      "Seguro de vida 2º Titular (1º mês): Y €"
    seguro_vida_mensal = X + Y (soma dos titulares). Se só existir 1 titular, usar apenas X.

  BPI:
    ETAPA 1 — Procurar valor literal mensal no Anexo à FINE.
      a) Linha "Seguro Vida Prop. (Morte+ITP)" da tabela "Encargos e Seguros", coluna "Prémio" — extrair literal.
      b) Alternativa: procurar "Total 1º mês" e subtrair "Seguro Multirrisco" (do 1º mês) — usar o resultado.
    Devolver o valor literal SEM aplicar qualquer sanity check contra anual/12.
    ETAPA 2 — Só se ETAPA 1 falhar: anual_contratado / 12.
    ETAPA 3 — Se nem anual existir: null.
    IMPORTANTE BPI: NÃO comparar literal vs anual/12. São conceitos diferentes:
      - Literal = prémio 1º mês (baseado em capital seguro alto)
      - Anual/12 = média da vida do contrato incluindo custos administrativos/INEM/taxas
    Para BPI o valor LITERAL do anexo é SEMPRE preferido ao calculado, mesmo que seja MENOR que anual/12.

  NOVOBANCO:
    Procurar frase completa: "Valor médio anual de A € a pagar mensalmente... O valor do primeiro prémio mensal é de B €". Extrair B (valor mensal literal). NÃO calcular A/12 quando B existe.

  CCAM:
    ETAPA 1 tipicamente FALHA (CCAM não publica valor mensal). Passar para ETAPA 2 sobre "Seguro de Vida CA Protecção Crédito à Habitação X EUR valor médio anual" → X / 12.

  UCI:
    ETAPA 1 e 2 tipicamente FALHAM. Aplicar ETAPA 3: seguro_vida_mensal = null + aviso.
    NÃO usar "Seguro Multirriscos Habitação: X EUR" como proxy — esse valor é MULTIRRISCOS, não vida.

  REGRA ESPECIAL NOVOBANCO — coexistência de valores numa única frase:
    O FINE novobanco apresenta tipicamente: "Valor médio anual de X € a pagar mensalmente à GamaLife. O valor do primeiro prémio mensal é de Y €."
    Quando AMBOS existem → ETAPA 1 aplica-se: usar Y (valor mensal literal). IGNORAR X. NÃO calcular X/12.

  ─────────────────────────────────────────────
  ETAPA 2 — VALOR ANUAL (só executar se ETAPA 1 falhou)
  ─────────────────────────────────────────────
  Se nenhum valor mensal literal foi encontrado em ETAPA 1, procurar valor ANUAL do seguro de vida.

  Padrões típicos:
    - "Seguro de Vida [nome apólice] X EUR valor médio anual"        (tipicamente CCAM)
    - "Prémio do seguro de vida: X EUR, valor médio anual"
    - "Prémio anual do seguro de vida: X EUR"
    - "Prémio Total no 1º Ano: X €/Ano"

  Se encontrado valor anual X:
    → seguro_vida_mensal = X / 12, arredondado a 2 decimais
    → aviso: "seguro_vida_mensal calculado como valor médio anual ([X] EUR) / 12 = [Y] EUR. FINE não publica prémio mensal — usada convenção anual/12."
    → PARAR.

  ─────────────────────────────────────────────
  ETAPA 3 — SEM informação no FINE (só se ETAPAS 1 e 2 falharem)
  ─────────────────────────────────────────────
  Se nem valor mensal nem valor anual constam do FINE (apenas descrição das coberturas sem valores monetários):
    → seguro_vida_mensal = null
    → aviso: "seguro de vida não tem valor publicado no FINE (nem mensal nem anual). Preencher manualmente consultando simulação com a seguradora."

  ─────────────────────────────────────────────
  VALIDAÇÃO DE SANIDADE (executar após qualquer etapa)
  ─────────────────────────────────────────────
  EXCEÇÃO BPI: NÃO aplicar este sanity check para BPI. Para BPI o valor literal do anexo é SEMPRE preferido, mesmo que seja MENOR que anual/12 (são conceitos diferentes — literal = prémio 1º mês baseado em capital; anual/12 inclui custos administrativos).

  Para os outros bancos: Se o valor V extraído (mensal literal de ETAPA 1) for MENOR do que qualquer "valor anual do seguro de vida / 12" presente no MESMO FINE → REJEITAR V e tentar reaplicar ETAPA 1 com as pistas específicas do banco.

  Razão (não-BPI): o prémio do 1º mês é sempre MAIOR OU IGUAL a (anual/12) porque inclui custos de adesão. Se V < anual/12, é forte indício de que ETAPA 2 foi aplicada erradamente quando ETAPA 1 devia ter ganhado, OU que o valor extraído não é realmente o prémio do 1º mês.

  ─────────────────────────────────────────────
  PROIBIÇÕES ABSOLUTAS (válidas para TODOS os bancos)
  ─────────────────────────────────────────────
  1. NUNCA usar valor de seguro MULTIRRISCOS como proxy para seguro de vida (são produtos diferentes).
  2. NUNCA afirmar em avisos que existe valor que não está literalmente no FINE (proibido alucinar).
  3. NUNCA calcular valor a partir do quadro de reembolso (coluna "Outros custos" das prestações).
  4. NUNCA calcular/aproximar fora da cascata ETAPA 1 → ETAPA 2 → ETAPA 3.
  5. NUNCA dividir valor anual por 12 se o valor mensal literal estiver disponível (ETAPA 1 tem prioridade absoluta sobre ETAPA 2).

  ─────────────────────────────────────────────
  DISTINÇÃO CRÍTICA — Seguro VIDA vs Seguro MULTIRRISCOS
  ─────────────────────────────────────────────
  Ambos aparecem nos FINEs. Distinguir SEMPRE pelo rótulo:
    - SEGURO DE VIDA           → rótulos: "Vida", "Protecção", "IDP", "Morte+ITP", "Morte e Invalidez"   → seguro_vida_mensal
    - SEGURO MULTIRRISCOS      → rótulos: "Multirriscos", "Habitação", "Imóvel"                          → seguro_multirriscos_mensal

  Exemplo: no FINE UCI existe "Seguro Multirriscos Habitação: 277,17 EUR" — este NÃO é seguro de vida, é multirriscos. Não confundir.

  - seguro_multirriscos_mensal: prémio MENSAL do seguro multirriscos
       * Bankinter "304,57 EUR/ano" → 25,38 EUR/mês
       * BPI "346,56 EUR" → 28,88 EUR/mês
       * CGD "13,66 EUR" → já mensal

3.6. MTIC E ENCARGOS — MATRIZ POR BANCO

================================================================================

REGRA DE OURO PARA MTIC (aplica a TODOS os bancos):
O campo "mtic" tem que ser EXATAMENTE o número escrito após "Montante total a reembolsar" ou "Total Global" no FINE. NUNCA somar IMT, IS de Compra, ou qualquer outro valor. NUNCA calcular o MTIC tu próprio. Se vires várias instâncias de "MTIC" (ex "com vendas" e "sem vendas"), usa a versão COM vendas associadas. Procura a string literal e copia o número.

--------------------------------------------------------------------------------
BANKINTER
--------------------------------------------------------------------------------

| Rótulo no FINE                                              | Campo JSON                  | Notas |
|-------------------------------------------------------------|-----------------------------|-------|
| "Comissão de Estudo CH"                                     | comissao_abertura           | — |
| "Comissão de Avaliação"                                     | comissao_avaliacao          | — |
| "Comissão de Tramitação"                                    | outras_comissoes            | apenas este, NÃO somar mais nada |
| "Comissão de Solicitadoria"                                 | documento_particular_autenticado | — |
| "Comissão de Formalização de CH"                            | formalizacao_escritura      | — |
| "Emolumentos de Registo de Hipoteca"                        | registos_hipoteca           | — |
| "Custo Depósito Online Cancelamento Hipoteca"               | deposito_online             | — |
| "ISUC"                                                      | is_utilizacao_credito       | — |
| "Honorários de Compra e Venda: X €" (Secção 14)             | outorga                     | literal; se não existir → null |
| "Cheque Bancário"                                           | (IGNORAR)                   | não meter em lado nenhum |
| "Honorários de Mútuo"                                       | (IGNORAR)                   | já incorporado no MTIC; PROIBIDO mapear para outorga |
| MTIC narrativa "Montante Total a Reembolsar (MTIC): X EUR"  | mtic                        | NÃO usar "Total Global" da tabela de reembolso |

--------------------------------------------------------------------------------
CGD (Caixa Geral de Depósitos)
--------------------------------------------------------------------------------

| Rótulo no FINE                                                                  | Campo JSON                  | Notas |
|---------------------------------------------------------------------------------|-----------------------------|-------|
| "Comissão de Avaliação"                                                         | comissao_avaliacao          | tipicamente 0 |
| "Comissão de Estudo"                                                            | comissao_abertura           | tipicamente 0 |
| "Comissão de formalização"                                                      | formalizacao_escritura      | — |
| "ISUC"                                                                          | is_utilizacao_credito       | tipicamente 960 |
| "Documento Particular Autenticado (IVA incluído) Z EUR" (Pág 2 síntese)         | documento_particular_autenticado | PRIORIDADE 1 — valor já SOMADO pelo banco |
| "ato mútuo X EUR" + "ato compra e venda Y EUR" (Pág 5 e Pág 11)                 | documento_particular_autenticado | PRIORIDADE 2 (fallback) — somar X+Y |
| "Seguro de Vida Y EUR" (Pág 2 tabela "Encargos mensais")                        | seguro_vida_mensal          | ETAPA 1 da cascata; NÃO confundir com "Proteção IDP valor médio anual" da Pág 5 (anual) |
| "Montante da prestação inicial" (Mistas)                                        | prestacao                   | prestação durante período fixo |
| "Após o período de taxa fixa, o montante da prestação será" (Mistas)            | prestacao_periodo_variavel  | OBRIGATÓRIO devolver os DOIS valores em mistas |
| "Montante total a reembolsar (MTIC): X EUR" (secção "3. Características Principais") | mtic | USAR SEMPRE este valor (inclui encargos). NUNCA usar o "Total" do "Quadro A - Plano de Reembolso" (final do PDF), porque esse só soma Capital + Juros, sem IMT/IS/seguros/comissões. Exemplo Paulo Madeira Mista 3a: 708.773,91 EUR (correto) ; NUNCA 686.376,14 EUR (Total Quadro A — errado). |

Notas comportamentais CGD:
- DPA: NUNCA devolver apenas um dos atos quando ambos existem; outorga = SEMPRE null (nunca mover DPA para outorga).
- Validação sanidade DPA: se valor ≈457,50 EUR, é forte indício de só um ato — adicionar aviso "CGD DPA: valor parece apenas um ato".
- Para Fixa todo o prazo / Variável → prestacao_periodo_variavel = null.
- Em Mistas, se só vires uma prestação, procura no quadro de reembolso da Parte C (ano 4+ Mista 3a, ano 6+ Mista 5a, etc).
- CGD MTIC (CRÍTICO): o FINE CGD apresenta DOIS totais visíveis:
  1. Secção "3. Características Principais" → "Montante total a reembolsar (MTIC): XXX EUR" ← USAR ESTE (inclui Capital + Juros + IMT + IS + seguros + comissões prediais).
  2. "Quadro A - Plano de Reembolso" (final do PDF, pág 14+) → "Total" da última coluna ← NÃO USAR (só Capital + Juros).
  A diferença entre os dois corresponde tipicamente a IMT + IS + seguros + comissões (~20.000–25.000 EUR num crédito típico).
  PROIBIDO devolver o "Total" do Quadro A como mtic mesmo que seja o número mais "redondo" ou mais visível. A heurística "MTIC menor = correto" do Santander NÃO se aplica a CGD — em CGD o MTIC correto é o MAIOR dos dois totais visíveis (porque inclui encargos).

--------------------------------------------------------------------------------
NOVOBANCO
--------------------------------------------------------------------------------

| Rótulo no FINE                                                                | Campo JSON                       | Notas |
|-------------------------------------------------------------------------------|----------------------------------|-------|
| "Comissão de avaliação" (com IS incluído)                                     | comissao_avaliacao               | tipicamente 322,40 |
| "Comissão Estudo de Processo"                                                 | comissao_abertura                | tipicamente 0 |
| "Comissão de formalização e escritura"                                        | formalizacao_escritura           | tipicamente 208 |
| "Imposto do selo sobre utilização de crédito" / ISUC                          | is_utilizacao_credito            | tipicamente 960 |
| "Emolumentos pelo registo da hipoteca"                                        | registos_hipoteca                | tipicamente 450 |
| "Custo Depósito On line cancelamento hipoteca"                                | deposito_online                  | tipicamente 20 |
| "Documento Particular Autenticado (DPA)" valor base                           | documento_particular_autenticado | — |
| "Outorga: X €" / "Outorga X EUR" (Parte C / "4. Outras informações")          | outorga                          | literal; se não existir → null + aviso |
| "O valor do primeiro prémio mensal é de X€"                                   | seguro_vida_mensal               | extrair X (ignorar "valor médio anual de A€" na mesma frase) |

Notas comportamentais novobanco:
- Outorga: PROIBIDO inventar; PROIBIDO mapear "Emolumento depósito DPA" ou "Emolumentos registo hipoteca" para outorga; PROIBIDO calcular outorga.
- Aviso quando outorga não encontrada: "novobanco: campo Outorga não encontrado no FINE — verificar Parte C / Outras informações".
- Vision: pipeline de páginas tem de incluir até pág 22 do PDF (a Outorga aparece tipicamente na "Página 15" do rodapé do FINE = pos 20+ do PDF).
- Se SÓ encontrares "Custo Depósito Online" (~20 EUR), mete em deposito_online e deixa outorga seguindo a regra acima.

--------------------------------------------------------------------------------
BPI
--------------------------------------------------------------------------------

INSTRUÇÕES OBRIGATÓRIAS DE RACIOCÍNIO BPI (usar extended thinking):

Antes de devolver o JSON final com os campos extraídos do FINE BPI, o modelo DEVE usar o thinking para verificar EXPLICITAMENTE cada um dos seguintes campos. Se algum falhar a verificação, RELER o FINE e corrigir.

VERIFICAÇÃO 1 — MTIC:
No thinking, responder literalmente:
a) "Qual é a linha do anexo que começa por 'Empréstimo' seguida do valor de financiamento?"
b) "Copiar essa linha INTEIRA palavra por palavra como aparece no FINE."
c) "Identificar as 2 colunas numéricas que parecem ser MTICs (valores entre 100.000 e 500.000 EUR)."
d) "O MTIC Contratado é o que vem PRIMEIRO (à esquerda) na linha. Qual é o valor literal?"
e) "Confirmar: esse valor aparece literalmente copiado da linha, ou estou a inventar dígitos?"
REGRA DE OURO: o valor devolvido tem de ser uma substring exata dessa linha. Se não for, é alucinação — reler.

VERIFICAÇÃO 2 — SPREAD:
No thinking:
a) "Qual é o texto literal do cabeçalho do produto (primeira linha de texto após 'ANEXO À FINE - RESULTADO ANÁLISE PROVISÓRIA')?"
b) "Copiar esse cabeçalho palavra por palavra."
c) "Procurar a substring 'Spread:' nesse cabeçalho. Que valor vem imediatamente a seguir?"
d) "O valor devolvido é exatamente esse número?"
REGRA: o valor tem de ser substring exata do cabeçalho. Se inventar dígitos, reler.

VERIFICAÇÃO 3 — TAEG:
No thinking:
a) "Na mesma linha da VERIFICAÇÃO 1, identificar as 2 colunas numéricas que parecem percentagens (formato 'X,Y %')."
b) "A TAEG Contratada é a percentagem que vem PRIMEIRO (à esquerda)."
c) "Copiar literalmente esse valor."
REGRA: tem de ser substring exata. Não inferir, não arredondar, não fazer média.

VERIFICAÇÃO 4 — Coerência interna (validação final):
Antes de devolver JSON, confirmar:
- MTIC Contratado < MTIC Base (Contratado tem descontos, é sempre menor)
- TAEG Contratado < TAEG Base
- Cada valor extraído é substring exata de uma linha do FINE
Se alguma validação falhar, refazer a extração com mais atenção.

FORMATO DO THINKING:
No bloco de thinking, o modelo DEVE dumpar LITERALMENTE a linha do FINE de onde extrai cada valor. Sem isso, a verificação não é válida.

Exemplo de formato esperado (genérico, sem valores hardcoded):
'Linha do anexo copiada: "Empréstimo [valor1] [valor2] [valor3] ... [valorN]"
MTIC Contratado (posição Y nessa linha): [valor extraído]
Verificação: o valor X aparece literalmente na posição Y da linha copiada? [sim/não]'

Só após este dump + verificação para os 4 campos, devolver o JSON.

PROIBIÇÃO ABSOLUTA:
- Devolver valores que não aparecem literalmente no texto do FINE processado
- Arredondar, interpolar ou inferir dígitos
- Confundir Contratado (esquerda) com Base (direita)

BPI — REGRAS DE EXTRAÇÃO:

O FINE BPI tem estrutura canónica em todos os produtos (TF, TM, TV):
- Páginas principais: descrição regulatória (Parte A)
- Última página: "ANEXO À FINE - RESULTADO ANÁLISE PROVISÓRIA" com tabela sumário

Mapeamento direto:

| Campo | Fonte exata no FINE |
|-------|---------------------|
| header_curto | Cabeçalho do anexo (ex: "Taxa Fixa até N anos / Euribor 6M") → "Fixa {N}a", "Mista {N}a", "Variável" |
| tan | Coluna "Contratado" → TAN, tabela no topo do anexo |
| taeg | Coluna "Contratado" → TAEG |
| mtic | Coluna "Contratado" → MTIC |
| spread | Cabeçalho do produto, string literal "Spread: Xpp" → converter para decimal |
| prestacao | Coluna "Prestação Mensal" |
| comissao_abertura | "Comissão de Dossier" (tipicamente 0) |
| outorga | SEMPRE null (BPI não tem custo separado de outorga) |
| registos_hipoteca | Tabela "Encargos e Seguros" do ANEXO, linha "Registos Prediais", coluna "Valor" |
| documento_particular_autenticado | Tabela "Encargos e Seguros" do ANEXO, linha "Documento Particular Autenticado (DPA)", coluna "Valor" |
| imt | Tabela "Encargos e Seguros", linha "IMT", coluna "Valor" |
| seguro_vida_mensal | Tabela "Encargos e Seguros" coluna Seguros, linha "Seguro Vida Prop. (Morte+ITP)", coluna "Prémio" |
| seguro_multirriscos_mensal | Tabela "Encargos e Seguros" coluna Seguros, linha "Seguro Multirrisco", coluna "Prémio" |
| is_compra_venda | Procurar "Imposto de Selo sobre a aquisição" na Parte A ou Parte B (valor literal) |
| is_utilizacao_credito | 0,6% × montante_financiamento |

REGRAS ANTI-ALUCINAÇÃO BPI:

1. seguro_vida_mensal:
   - APENAS extrair o valor LITERAL na coluna "Prémio" da linha "Seguro Vida Prop. (Morte+ITP)" da tabela "Encargos e Seguros" do anexo.
   - Alternativa válida: "Total 1º mês" MENOS "Seguro Multirrisco" (1º mês) → seguro_vida_mensal.
   - NÃO inferir de valores anuais ou anual/12.
   - NÃO aplicar sanity check vs anual/12. O literal BPI é frequentemente MENOR que anual/12 (literal = prémio do 1º mês baseado em capital; anual = média que inclui custos administrativos). Aceitar literal SEMPRE.
   - Exemplos esperados (Paulo Madeira 10-03-2026): BPI Mista 3a → 79,87 ; BPI Fixa 40a → 83,11 ; BPI Variável → 79,87. NÃO devolver 229,94 nem 203,57 (esses são anual/12 incorretos).

2. is_compra_venda:
   - O anexo BPI tem linha "Imposto Selo" que é o TOTAL AGREGADO (= IS aquisição + IS utilização).
   - NÃO usar esse valor para is_compra_venda.
   - Procurar is_compra_venda separadamente na Parte A ou Parte B ("Imposto de Selo sobre a aquisição").
   - Se ausente, calcular: 0,8% × montante_escritura.

3. is_utilizacao_credito:
   - 0,6% × montante do empréstimo.

4. DPA e Registos:
   - Usar valores da tabela "Encargos e Seguros" do ANEXO (cenário Escritura Pública, valores superiores).
   - NÃO usar valores da Parte A secção 4 (cenário DPA simplificado, valores inferiores).

--------------------------------------------------------------------------------
SANTANDER TOTTA
--------------------------------------------------------------------------------

| Rótulo no FINE                                                                          | Campo JSON                  | Notas |
|-----------------------------------------------------------------------------------------|-----------------------------|-------|
| "Comissão de Avaliação"                                                                 | comissao_avaliacao          | tipicamente 239,20 com IS |
| "Cópia certificada do contrato"                                                         | copia_certificada_documento | tipicamente 42,70 |
| "Imposto do Selo sobre a Verba"                                                         | is_utilizacao_credito       | — |
| "Custo de formalização"                                                                 | formalizacao_escritura      | tipicamente 754 |
| "Terá que pagar emolumentos pelo registo da hipoteca no valor de X €" (Secção 4 Parte A) + "Emolumentos pelo registo da Compra: Y €" (Secção "4. Outras informações") | registos_hipoteca | DEFAULT: somar X+Y (valores extraídos literalmente) |
| "Seguro de vida 1º Titular (1º mês): X€" + "Seguro de vida 2º Titular (1º mês): Y€"     | seguro_vida_mensal          | somar X+Y; se só 1 titular usar apenas X |

Notas comportamentais Santander — Spread:
- spread = spread contratado COM vendas associadas, após período promocional (ex Variável 0,700%; Mistas 0,700%). NUNCA usar spread base sem vendas (ex 1,900%).
- bonificacao_1ano = spread reduzido temporário nos primeiros N meses (N pode ser 12, 24 ou 36 conforme produto). Ex Variável com 0,500% nos primeiros 36 meses → bonificacao_1ano = 0.50.
- tan = TAN contratada inicial (ex Variável: Eur6m 2,144% + 0,500% = 2,644%).
- spread_periodo_variavel: para Santander Mistas/Fixas, este pode ser DIFERENTE — corresponde ao "Spread Base" indicado nas notas do produto (ex 1,90%). Devolver esse valor quando aplicável.

Notas comportamentais Santander — MTIC / TAEG (Cenário Contratado vs Base):
- O FINE Santander apresenta SEMPRE 2 cenários simultâneos:
  * "Spread Contratado" / "Spread Reduzido" / "com produtos facultativamente contratados" — TAEG menor, MTIC menor.
  * "Spread Base" / "sem produtos contratados" / "sem vendas associadas" — TAEG maior, MTIC maior.
- mtic: devolver SEMPRE o MTIC do cenário "Spread Contratado". NUNCA o do cenário "Spread Base".
- taeg: devolver SEMPRE o TAEG do cenário "Spread Contratado". NUNCA o do cenário "Spread Base".
- Exemplo (Paulo Madeira, 10-03-2026):
  * TAEG Contratado: 4,10% / MTIC Contratado: 661.676,28 EUR ← USAR estes
  * TAEG Base: 5,40% / MTIC Base: 782.805,64 EUR ← NÃO USAR
- PROIBIDO devolver MTIC > MTIC_contratado quando o FINE publica ambos os cenários.

Notas comportamentais Santander — registos_hipoteca:
- Só UMA das duas linhas existir → registos_hipoteca = valor único + aviso "Santander: encontrado apenas 1 emolumento de registo — verificar se falta o outro no FINE".
- NENHUMA existir → null + aviso "Santander: nenhum emolumento de registo encontrado — verificar manualmente no FINE".
- PROIBIDO devolver apenas X quando ambos existem — TEM de somar.

Notas comportamentais Santander — Isenção DL 48-D/2024 (CRÍTICA, NÃO aplicar por default):
- Por DEFAULT aplicar SEMPRE X+Y. NUNCA aplicar isenção só porque o FINE menciona o DL 48-D/2024 (nota informativa ≠ aplicação concreta).
- Aplicar isenção SÓ se o FINE indicar EXPLICITAMENTE junto à linha do emolumento: "isento neste caso", "valor após isenção: 0€", "o cliente beneficia de isenção", "0,00 € (isento ao abrigo do DL 48-D/2024)".
- Se QUALQUER proponente tiver >35 anos (ver idades em "14. Outras informações" / "4. Outras informações" / _meta.proponentes) → isenção NÃO aplicável → operação padrão X+Y obrigatória.
- Em caso de DÚVIDA → NÃO aplicar; usar X+Y.
- PROIBIDO devolver registos_hipoteca = 0 só por menção informativa do DL 48-D/2024.

--------------------------------------------------------------------------------
UCI
--------------------------------------------------------------------------------

| Rótulo no FINE                                                                | Campo JSON                  | Notas |
|-------------------------------------------------------------------------------|-----------------------------|-------|
| "Comissão de abertura"                                                        | comissao_abertura           | tipicamente 312 |
| "Comissão de avaliação"                                                       | comissao_avaliacao          | tipicamente 234 |
| "Comissão de preparação da documentação contratual"                           | outras_comissoes            | — |
| "Serviço de Solicitadoria"                                                    | outras_comissoes            | SOMAR à comissão de preparação |
| "Serviço Casa Pronta"                                                         | outorga                     | tipicamente 700 |
| "Valor presumido do imóvel para efeitos da presente ficha de informação"      | avaliacao_potencial         | ver estratégia abaixo (layout 2 colunas) |

Notas comportamentais UCI — avaliacao_potencial (layout tabela 2 colunas):
- O valor numérico pode aparecer 30 linhas ANTES ou 5 linhas DEPOIS do rótulo "Valor presumido do imóvel".
- Estratégia: (1) localizar o rótulo; (2) janela de 30 linhas antes / 5 depois; (3) procurar "X EUR" / "X,XX EUR" tipicamente entre 100k e 2M; (4) EXCLUIR "Valor mínimo do imóvel exigido" (= financiamento/0,9), "Montante do empréstimo", MTIC, "Custo total do crédito", TAEG/TAN/percentagens, comissões (<1k), impostos; (5) escolher o valor IGUAL ou PRÓXIMO de montante_escritura (±5%).
- Se não encontrado → null + aviso "UCI: valor presumido do imóvel não encontrado no FINE — verificar secção de características do empréstimo".
- POLÍTICA UNIFORME: NUNCA fallback para montante_escritura no prompt. ltv é recalculado no frontend.
- PROIBIDO confundir com "Valor mínimo do imóvel exigido", "Montante do empréstimo", "Valor de aquisição/Preço de compra".

--------------------------------------------------------------------------------
CCAM (Crédito Agrícola Mútuo)
--------------------------------------------------------------------------------

| Rótulo no FINE                                                                              | Campo JSON                       | Notas |
|---------------------------------------------------------------------------------------------|----------------------------------|-------|
| "Comissão de Avaliação A EUR"                                                               | comissao_avaliacao               | mapear LITERAL pelo nome |
| "Comissão de Abertura B EUR"                                                                | comissao_abertura                | NUNCA confundir com Análise |
| "Comissão de Análise C EUR"                                                                 | outras_comissoes                 | NUNCA confundir com Abertura |
| "Opção CASA PRONTA (título + registo): … = € V" (Secção "4. Outras informações")            | outorga                          | literal; se não existir → null + aviso |
| "Seguro CA Habitação Y EUR valor médio anual" (ou valor mensal 1º mês)                      | seguro_multirriscos_mensal       | se anual: Y/12 a 2 decimais; se mensal: literal; senão null |
| —                                                                                           | formalizacao_escritura           | SEMPRE null (formalização via Casa Pronta) |
| —                                                                                           | documento_particular_autenticado | SEMPRE null |

Notas comportamentais CCAM:
- seguro_vida_mensal: seguir cascata universal da secção 3.5; CCAM tipicamente cai em ETAPA 2 (anual / 12).
- registos_hipoteca: se outorga veio da Casa Pronta (regra acima) → registos_hipoteca = 0 (já incluído no valor Casa Pronta — evitar dupla contagem). Se outorga = null → procurar emolumentos de registo na secção de custos (ou null se não existir).
- IMT e IS Compra: seguir REGRA GERAL #8 (devolver null + aviso).
- Se Casa Pronta não encontrada → outorga = null + aviso "CCAM: opção Casa Pronta não encontrada no FINE — verificar se existe outra modalidade de formalização".
- Valor V da Casa Pronta varia conforme o ato (ex "Compra e venda e mútuo com hipoteca" vs "Permuta e mútuo com hipoteca") — usar o cenário do cliente.

--------------------------------------------------------------------------------
ABANCA
--------------------------------------------------------------------------------

ABANCA — REGRAS DE EXTRAÇÃO (banco espanhol com operação em Portugal; estrutura FINE similar a bancos pt):

taeg ABANCA:
- REGRA: extrair LITERALMENTE o valor da TAEG publicado no FINE. NÃO calcular, NÃO ponderar, NÃO inferir a partir das TANs.
- Procurar no texto frases como:
  * "A TAEG aplicável ao seu empréstimo é de: X%"
  * "TAEG: X%"
  * "Taxa Anual Efetiva Global: X%"
- Se houver 2 cenários (Base/Contratado), seguir regra Santander → devolver o Contratado (com vendas associadas).
- Se só há uma TAEG publicada, devolver essa.
- Exemplo Nélia Teles (14/05/2026): taeg = 6,80 (extraído de "A TAEG aplicável ao seu empréstimo é de: 6,8%").

mtic ABANCA:
- REGRA: extrair LITERALMENTE o MTIC publicado no FINE.
- Procurar: "MTIC: X EUR", "Montante total a reembolsar: X", após "(MTIC)".
- Exemplo Nélia: mtic = 275115.62.

tan ABANCA:
- Devolver a TAN do período fixo (primeira componente da Mista).
- Exemplo Nélia (Mista 12m fixos + 228m variável): tan = 2,000.
- Se só há uma TAN publicada, devolver essa.

tan_periodo_variavel ABANCA:
- Devolver a TAN do período variável (segunda componente da Mista) = Euribor + Spread Contratado.
- Exemplo Nélia: tan_periodo_variavel = 3,247 (Euribor 12m 2,747% + Spread 0,500%).

spread_periodo_variavel ABANCA:
- Devolver o spread conforme regra Santander: se FINE apresenta Base e Contratado, devolver o Contratado (cenário com vendas).
- Exemplo Nélia: spread_periodo_variavel = 0,500 (Spread Contratado; Spread Base = 1,500%).

--------------------------------------------------------------------------------
CAMPOS GLOBAIS (todos os bancos)
--------------------------------------------------------------------------------


- observacoes: sempre "Viabilidade" por defeito (decisão do Bruno).
- fee_gestao_mensal: null (preenchido manualmente).

REGRA DE NÃO INTERPRETAÇÃO:
NUNCA adiciones avisos em "_meta.avisos" sobre interpretações do conteúdo (ex "o FINE diz 1 ano não 2"). Os avisos são APENAS para problemas técnicos de extração (campos em falta, valores ilegíveis, contradições internas do PDF).

================================================================================
4. CÁLCULOS DERIVADOS (calcula tu, não esperes do Lovable)
================================================================================

  - capitais_proprios   = montante_escritura - montante_financiamento
  - ltv                 = montante_financiamento / avaliacao_potencial (em %, 2 casas decimais)
  - total_encargos      = soma de TODAS as linhas de encargos (linhas 3.6 acima, EXCETO MTIC)

================================================================================
5. INSTRUÇÕES ESPECIAIS PARA novobanco (modo Vision)
================================================================================

Quando o input for um PDF do novobanco processado em modo Vision (i.e. recebeste o PDF como documento, não como texto), segue ESTRITAMENTE estas regras de identificação:

1. IGNORA a primeira página inteira do PDF do novobanco. É uma página de "Informação obrigatória" com texto regulatório genérico que menciona "taxas fixas e mistas" mas NÃO descreve o produto deste FINE específico.

2. Tipo de taxa e TAN: seguir as regras gerais da secção 2 e 3.2 (incluindo "TAN do PERÍODO FIXO" para Mistas — usar a primeira TAN da secção 4 do FINE novobanco).

3. INDEXANTE para o campo "indexante":
   - Fixa novobanco: "Fixa {taxa_referencia}%" onde a taxa de referência aparece na descrição da TAN como "taxa de referência X anos de Y,YY%"
   - Mista novobanco: "Mista {anos}a {taxa_referencia}%" — a taxa de referência também vem da descrição da TAN do período fixo
   - Variável novobanco: "variavel 12m {valor_euribor}%" ou "variavel 6m {valor_euribor}%"

NOVOBANCO — REGRA SPREAD (TODAS AS TAXAS INCLUINDO FIXA):

No FINE novobanco, mesmo quando o produto é "Taxa fixa durante todo o prazo do empréstimo", a TAN é apresentada como uma DECOMPOSIÇÃO em duas componentes: taxa de referência + spread.

Na secção "4. Taxa de juro e outros custos", procurar a frase literal com a estrutura:

  "Taxa de juro (TAN): X%, resultante da soma da taxa de referência [prazo] de Y% e do spread base de Z%"

Onde:
  - X = TAN total (vai para campo tan)
  - Y = taxa de referência do prazo
  - Z = spread base (vai para campo spread)

OPERAÇÃO: spread = Z (extraído da decomposição).

Se o FINE também apresentar uma versão com vendas associadas:

  "Em resultado da contratação facultativa... a TAN será de: X2% resultante da soma da componente fixa de Y% e do spread contratado de Z2%"

então usar Z2 (spread contratado com vendas) — seguir regra geral #3 (cenário com vendas).

Exemplo concreto: FINE novobanco Fixa 20a tem:

  "Taxa de juro (TAN): 4,972%, resultante da soma da taxa de referência 20 anos de 4,222% e do spread base de 0,750%"

  → spread = 0.75 (não 0)

PROIBIÇÃO: devolver spread = 0 só porque o texto diz "Taxa fixa durante todo o prazo" — o spread EXISTE sempre na decomposição. Só deve ser 0 se a frase literal disser "spread base de 0,000%" ou equivalente.

Esta regra aplica-se a produto Fixo, Misto e Variável novobanco.

Se não encontrares a decomposição "resultante da soma de X e do spread", procurar secção "3. Principais características do empréstimo" onde pode aparecer "Spread base: X%".

4. PRESTAÇÃO está na secção "6. Montante da prestação". NUNCA inventes este valor. Se não conseguires lê-lo, devolve null.

5. MTIC está na secção "3. Principais características", linha "Montante total a reembolsar (MTIC)". Copia o número exato.

6. Cada PDF é independente. Verifica que cada número devolvido aparece literalmente no PDF que estás a processar; nunca reutilizes valores de outros FINEs nem dos exemplos few-shot deste prompt.

================================================================================
6. SCHEMA JSON DE OUTPUT (devolve EXATAMENTE neste formato)
================================================================================

{
  "banco": "Bankinter",
  "header_curto": "Tx Mista 2a",
  "tipo_taxa": "Mista",
  "periodo_fixa_meses": 24,

  "tipo_financiamento": "Aq HPP",
  "montante_escritura": 295000.00,
  "montante_financiamento": 160000.00,
  "avaliacao_potencial": 295000.00,
  "ltv": 54.24,
  "capitais_proprios": 135000.00,

  "indexante": "Mista 2a 2,25%",
  "bonificacao_1ano": 0.00,
  "spread": 0.70,
  "spread_periodo_variavel": 0.70,

  "prestacao": 828.49,
  "prestacao_periodo_variavel": 876.11,

  "prazo_meses": 240,
  "seguro_vida_mensal": 176.53,
  "seguro_multirriscos_mensal": 25.38,

  "tan": 2.25,
  "taeg": 5.60,
  "mtic": 260294.34,

  "total_encargos": 12436.14,
  "comissao_avaliacao": 220.00,
  "comissao_abertura": 270.40,
  "outras_comissoes": 109.80,
  "formalizacao_escritura": 124.80,
  "is_utilizacao_credito": 960.00,
  "is_compra_venda": 2360.00,
  "imt": 7577.52,
  "copia_certificada_documento": null,
  "deposito_online": 20.00,
  "documento_particular_autenticado": 305.00,
  "outorga": 238.62,
  "registos_hipoteca": 250.00,

  "observacoes": "Viabilidade",
  "fee_gestao_mensal": null,

  "_meta": {
    "ficheiro_origem": null,
    "data_simulacao": "20/03/2026",
    "campos_em_falta": [],
    "avisos": []
  }
}

REGRAS DO JSON:
  - Todos os números são números, NÃO strings. Usa ponto como separador decimal no JSON.
  - "indexante" é a única string com valor formatado em PT (vírgula).
  - Política null vs 0 (UNIFORME — ver regra geral #6):
      * 0 → quando o FINE PUBLICA explicitamente esse valor zero (ex.: "Comissão: 0,00 €", banco isenta com isenção literal).
      * null → quando o FINE NÃO PUBLICA o valor (campo simplesmente não consta).
      * NUNCA usar 0 para representar "campo em falta". NUNCA usar string vazia ou "n/d".
  - Campos estruturais (NUNCA null): montante_escritura, montante_financiamento, prazo_meses.
  - "_meta.campos_em_falta" lista os campos devolvidos como null (para o frontend mostrar aviso).
  - "_meta.avisos" lista incoerências detetadas e/ou evidência textual de campos sensíveis (ex.: seguro_vida_mensal).

================================================================================
7. EXEMPLOS (few-shot)
================================================================================

EXEMPLO 1 — Bankinter Mista 2 anos (texto da síntese de condições):

INPUT (excerto):
"Crédito Habitação Bankinter ... Resumo da Simulação ... Valor de Aquisição do Imóvel: 295.000,00 EUR ... Tendo um financiamento total de: 160.000,00 EUR ... 240 MESES = 20 ANOS ... Fixa Promocional 2 Anos: 2,250% ... Spread Contratado: 0,700% ... Euribor 12M: 2,221% ... TAEG Contratada: 5,6% ... Prestação Fixa: 828,49 EUR/Mês ... Prestação Variável: 876,11 EUR/Mês ... Total Global 160.000,00 49.124,42 209.124,42 0,00 1.168,81 50.001,11 260.294,34 ... Comissão de Estudo CH: 270,40 EUR ... Comissão de Avaliação: 220,00 EUR ... Comissão de Tramitação: 109,80 EUR ... Comissão de Formalização de CH: 124,80 EUR ... ISUC: 960,00 EUR ... Honorários de Mútuo: 238,62 EUR ... Emolumentos de Registo de Hipoteca: 250 ... Seguro Vida Prémio Total no 1º Ano: 2.118,93 EUR/Ano ... Seguro Multirriscos Prémio Anual: 304,57 EUR"

OUTPUT esperado:
{
  "banco": "Bankinter",
  "header_curto": "Tx Mista 2a",
  "tipo_taxa": "Mista",
  "periodo_fixa_meses": 24,
  "tipo_financiamento": "Aq HPP",
  "montante_escritura": 295000.00,
  "montante_financiamento": 160000.00,
  "avaliacao_potencial": 295000.00,
  "ltv": 54.24,
  "capitais_proprios": 135000.00,
  "indexante": "Euribor 12m 2,221%",
  "bonificacao_1ano": 0.00,
  "spread": 0.70,
  "spread_base": null,
  "spread_contratado": 0.70,
  "spread_periodo_variavel": 0.70,
  "prestacao": 828.49,
  "prestacao_periodo_variavel": 876.11,
  "prazo_meses": 240,
  "seguro_vida_mensal": 176.58,
  "seguro_multirriscos_mensal": 25.38,
  "tan": 2.25,
  "tan_fixa": 2.25,
  "tan_variavel": 2.921,
  "taeg": 5.60,
  "mtic": 260294.34,
  "total_encargos": 12436.14,
  "comissao_avaliacao": 220.00,
  "comissao_abertura": 270.40,
  "outras_comissoes": 109.80,
  "formalizacao_escritura": 124.80,
  "is_utilizacao_credito": 960.00,
  "is_compra_venda": 2360.00,
  "imt": 7577.52,
  "copia_certificada_documento": null,
  "deposito_online": 20.00,
  "documento_particular_autenticado": 305.00,
  "outorga": 238.62,
  "registos_hipoteca": 250.00,
  "observacoes": "Viabilidade",
  "fee_gestao_mensal": null,
  "_meta": {
    "ficheiro_origem": null,
    "data_simulacao": "20/03/2026",
    "campos_em_falta": [],
    "avisos": []
  }
}

EXEMPLO 2 — CGD Mista 3 anos:

INPUT (excerto):
"Caixa Geral de Depósitos ... Sergio Paulo Marme Cruz ... Montante do empréstimo 160.000,00 ... Prazo total (em meses) 247 ... Tipo de taxa Mista ... Valor de aquisição 295.000,00 EUR ... Taxa de juro fixa durante 36 prestações, seguida de 211 prestações de taxa de juro variável ... Taxa fixa 3 anos - 3,00% ... TAN será de: 3,000% resultante da soma da taxa de referência (Taxa fixa 3 anos - 3,00%) de 3,000% e do spread contratado de 0,000% ... Spread – Período Variável 0,700% ... TAEG sem vendas associadas 6,4% ... TAEG com vendas associadas 6,2% ... 282.390,57 EUR, que corresponde à soma de 160.000,00 EUR de montante do crédito com 122.390,57 EUR de custo total do crédito"

OUTPUT esperado:
{
  "banco": "CGD",
  "header_curto": "Tx Mista 3a",
  "tipo_taxa": "Mista",
  "periodo_fixa_meses": 36,
  "tipo_financiamento": "Aq HPP",
  "montante_escritura": 295000.00,
  "montante_financiamento": 160000.00,
  "avaliacao_potencial": null,
  "ltv": null,
  "capitais_proprios": 135000.00,
  "indexante": "Euribor 6m 2,144%",
  "bonificacao_1ano": 0.00,
  "spread": 0.00,
  "spread_base": 0.95,
  "spread_contratado": 0.70,
  "spread_periodo_variavel": 0.70,
  "prestacao": null,
  "prestacao_periodo_variavel": null,
  "prazo_meses": 247,
  "seguro_vida_mensal": null,
  "seguro_multirriscos_mensal": null,
  "tan": 3.00,
  "tan_fixa": 3.00,
  "tan_variavel": 2.844,
  "taeg": 6.20,
  "mtic": 282390.57,
  "total_encargos": null,
  "comissao_avaliacao": 0,
  "comissao_abertura": 0,
  "outras_comissoes": null,
  "formalizacao_escritura": null,
  "is_utilizacao_credito": 960.00,
  "is_compra_venda": null,
  "imt": null,
  "copia_certificada_documento": null,
  "deposito_online": null,
  "documento_particular_autenticado": null,
  "outorga": null,
  "registos_hipoteca": null,
  "observacoes": "Viabilidade",
  "fee_gestao_mensal": null,
  "_meta": {
    "ficheiro_origem": null,
    "data_simulacao": null,
    "campos_em_falta": ["avaliacao_potencial", "ltv", "prestacao", "prestacao_periodo_variavel", "seguro_vida_mensal", "seguro_multirriscos_mensal", "formalizacao_escritura", "documento_particular_autenticado", "outras_comissoes", "is_compra_venda", "imt", "copia_certificada_documento", "deposito_online", "outorga", "registos_hipoteca"],
    "avisos": ["IMT não consta no FINE — preencher manualmente (depende de VPT, tipologia do imóvel, região, e eventuais isenções jovens DL 48-A/2024)", "IS Compra e Venda não consta no FINE — preencher manualmente (0,8% sobre maior valor entre preço de aquisição e VPT, com possíveis isenções jovens DL 48-A/2024)", "Avaliação não consta no FINE — frontend pode aplicar fallback visual"]
  }
}

================================================================================
8. REGRAS FINAIS
================================================================================

  - Devolve APENAS o JSON. Sem markdown, sem \`\`\`json, sem texto antes/depois.
  - Se o input estiver vazio ou irreconhecível, devolve {"erro": "PDF irreconhecível", "_meta": {...}}
  - Nunca arredondes para fora dos pontos decimais que vês no FINE (ex se o FINE diz 2,800% devolve 2.80, não 2.8)
  - Para o LTV, calcula com 2 casas decimais (ex 54.24)
  - Para vírgula no campo "indexante" usa o caractere "," (não "."), porque é uma string em PT
  - SE detetares que estás a comparar duas simulações da mesma instância (ex ficheiro duplicado), apenas processa uma e devolve um aviso em "_meta.avisos"`;

// Helper: retry Anthropic API calls com exponential backoff em erros transientes do servidor
async function callAnthropicWithRetry(
  payload: any,
  headers: Record<string, string>,
  filename: string
): Promise<Response> {
  const MAX_ATTEMPTS = 3;
  const BASE_DELAY_MS = 1500;
  const RETRYABLE_STATUS = new Set([500, 502, 503, 504, 529]);

  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        if (attempt > 1) {
          console.log(`[analyze-simulations] ${filename}: succeeded on attempt ${attempt}/${MAX_ATTEMPTS}`);
        }
        return response;
      }

      if (!RETRYABLE_STATUS.has(response.status)) {
        return response;
      }

      const errorBody = await response.clone().text();
      console.log(`[analyze-simulations] ${filename}: attempt ${attempt}/${MAX_ATTEMPTS} failed with ${response.status}: ${errorBody.substring(0, 200)}`);
      lastResponse = response;

      if (attempt < MAX_ATTEMPTS) {
        const baseDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
        const delay = Math.max(0, Math.round(baseDelay + jitter));
        console.log(`[analyze-simulations] ${filename}: waiting ${delay}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (err) {
      console.log(`[analyze-simulations] ${filename}: attempt ${attempt}/${MAX_ATTEMPTS} threw: ${err}`);
      if (attempt < MAX_ATTEMPTS) {
        const baseDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
        const delay = Math.max(0, Math.round(baseDelay + jitter));
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        if (lastResponse) return lastResponse;
        throw err;
      }
    }
  }

  console.log(`[analyze-simulations] ${filename}: all ${MAX_ATTEMPTS} attempts exhausted, returning last error response`);
  if (lastResponse) return lastResponse;
  throw new Error("All retry attempts failed without response");
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RequestBody = await req.json();
    const hasImagePages = !!body.imagePages && Array.isArray(body.imagePages) && body.imagePages.length > 0;
    const isVision = hasImagePages;
    const model = isVision ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
    // BPI Vision uses extended thinking to disambiguate dense Contratado vs Base columns.
    const useThinking = isVision && body.detected_bank === "BPI";
    const thinkingBudget = 5000;
    // Vision mode now sends up to 21 pages for novobanco (skip page 5)
    // 21 pages × ~425 tokens/page ≈ 8925 tokens input + 4000 output = ~12.9k total (well below 30k/min limit)
    // With thinking enabled, output budget must accommodate thinking tokens + actual output.
    const maxTokens = useThinking ? (thinkingBudget + 4000) : (isVision ? 4000 : 2000);
    console.log(`[analyze-simulations] file=${body.filename}, text length=${body.text?.length}, imagePages=${hasImagePages ? body.imagePages!.length : 0}, model=${model}, bank=${body.detected_bank || "?"}, thinking=${useThinking}`);

    if (!hasImagePages && (!body.text || body.text.trim().length === 0)) {
      return new Response(JSON.stringify({ success: false, error: "Nem texto nem imagens foram fornecidos", filename: body.filename }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build message content
    let userContent: unknown;
    if (hasImagePages) {
      // Vision mode: send page images as JPEG
      const imageBlocks = body.imagePages!.map((base64: string) => ({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: base64,
        },
      }));
      userContent = [
        ...imageBlocks,
        {
          type: "text",
          text: "Estas são as primeiras páginas de uma FINE de crédito habitação portuguesa. Extrai os campos segundo o system prompt.\n\nREGRA CRÍTICA DE FORMATO: A tua resposta INTEIRA tem que ser um único objeto JSON válido. NÃO escrevas absolutamente nenhum texto antes do '{'. NÃO escrevas nenhum texto depois do '}'. NÃO uses markdown (sem ```json nem ```). NÃO comentes o que estás a fazer. NÃO digas 'Vou continuar' nem 'Aqui está'. O primeiro caractere da tua resposta DEVE ser '{' e o último DEVE ser '}'.",
        }
      ];
      console.log(`[FINE] ${body.filename}: modo Vision com ${body.imagePages!.length} imagens`);
    } else {
      userContent = `--- TEXTO DO DOCUMENTO ---\n\n${body.text}`;
      console.log(`[FINE] ${body.filename}: modo Texto`);
    }

    // Build headers (no pdfs beta needed anymore since we use images)
    const betaFeatures: string[] = ["prompt-caching-2024-07-31"];

    const anthropicHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": betaFeatures.join(","),
    };

    const requestPayload: Record<string, unknown> = {
      model: model,
      max_tokens: maxTokens,
      system: [
        {
          type: "text",
          text: EXTRACTION_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    };

    if (useThinking) {
      requestPayload.thinking = { type: "enabled", budget_tokens: thinkingBudget };
      console.log(`[FINE] ${body.filename}: extended thinking ENABLED (budget=${thinkingBudget})`);
    }

    const response = await callAnthropicWithRetry(
      requestPayload,
      anthropicHeaders,
      body.filename ?? "unknown"
    );


    const responseText = await response.text();
    console.log(`[analyze-simulations] Anthropic status: ${response.status}`);

    if (!response.ok) {
      return new Response(JSON.stringify({ success: false, error: `Anthropic API error (${response.status}): ${responseText}`, filename: body.filename }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(responseText);
    const textContent = result.content?.find((c: { type: string }) => c.type === "text");
    if (!textContent?.text) {
      return new Response(JSON.stringify({ success: false, error: "No text response from Claude", filename: body.filename }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const modelResponseText = textContent.text;
    console.log('[FINE-PARSE] resposta bruta:', modelResponseText.substring(0, 300));

    let parsed;
    try {
      const cleanJson = extractJsonFromResponse(modelResponseText);
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[FINE-PARSE] Falha ao extrair JSON:', message);
      throw new Error(`Modelo devolveu resposta inválida: ${message}`);
    }

    // Sanity check: verify prestacao against theoretical calculation
    if (parsed.prestacao && parsed.tan && parsed.prazo_meses && parsed.montante_financiamento) {
      const taxaMensal = parsed.tan / 100 / 12;
      const n = parsed.prazo_meses;
      const c = parsed.montante_financiamento;
      const prestacaoEstimada = c * (taxaMensal * Math.pow(1 + taxaMensal, n)) / (Math.pow(1 + taxaMensal, n) - 1);
      if (Math.abs(parsed.prestacao - prestacaoEstimada) > 50) {
        if (!parsed._meta) parsed._meta = {};
        if (!Array.isArray(parsed._meta.avisos)) parsed._meta.avisos = [];
        parsed._meta.avisos.push(`ALERTA: prestação extraída (${parsed.prestacao}€) não bate com cálculo teórico (${prestacaoEstimada.toFixed(2)}€) — verificar manualmente`);
        console.log(`[analyze-simulations] WARNING: prestacao ${parsed.prestacao} vs estimated ${prestacaoEstimada.toFixed(2)} for ${parsed.banco}`);
      }
    }

    console.log(`[analyze-simulations] Success: banco=${parsed.banco}`);

    // DEBUG: dump dos 12 campos de encargos + total devolvido pelo modelo (para auditar diferenças)
    const encargosDump = {
      banco: parsed.banco,
      total_encargos_modelo: parsed.total_encargos ?? null,
      comissao_avaliacao: parsed.comissao_avaliacao ?? null,
      comissao_abertura: parsed.comissao_abertura ?? null,
      outras_comissoes: parsed.outras_comissoes ?? null,
      formalizacao_escritura: parsed.formalizacao_escritura ?? null,
      is_utilizacao_credito: parsed.is_utilizacao_credito ?? null,
      is_compra_venda: parsed.is_compra_venda ?? null,
      imt: parsed.imt ?? null,
      copia_certificada_documento: parsed.copia_certificada_documento ?? null,
      deposito_online: parsed.deposito_online ?? null,
      documento_particular_autenticado: parsed.documento_particular_autenticado ?? null,
      outorga: parsed.outorga ?? null,
      registos_hipoteca: parsed.registos_hipoteca ?? null,
    };
    const somaModelo = Object.entries(encargosDump)
      .filter(([k]) => k !== "banco" && k !== "total_encargos_modelo")
      .reduce((s, [, v]) => s + (Number(v) || 0), 0);
    console.log(`[ENCARGOS-DUMP] ${parsed.banco}:`, JSON.stringify(encargosDump), `| soma_12_campos=${somaModelo.toFixed(2)}`);

    return new Response(JSON.stringify({ success: true, data: parsed, filename: body.filename, is_vision: isVision, model_used: model }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[analyze-simulations] Error:`, err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
