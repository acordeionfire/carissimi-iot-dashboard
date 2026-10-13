# INVENTÁRIO DE FUNÇÕES E CONTRATOS — CARISSIMI IoT
Documento gerado na **ETAPA 0** do `docs/PLANO_DE_EXECUCAO.md` para garantir compatibilidade e integridade de contratos antes de qualquer alteração de código.

---

## (a) Funções e constantes expostas por `js/metrics.js`

Atualmente o arquivo exporta o objeto global `window.Metricas` (e deve manter alias para `window.Metrics`).

### Constantes
1. `MIN`: número (`60000`) — milissegundos em 1 minuto.
2. `HORA`: número (`3600000`) — milissegundos em 1 hora.
3. `DIA`: número (`86400000`) — milissegundos em 1 dia (24 horas).
4. `ESTADOS`: array (`['ativo', 'espera', 'inativo']`) — identificadores dos estados monitorados.
5. `ROTULO`: objeto (`{ ativo: 'ATIVO', espera: 'ESPERA', inativo: 'INATIVO' }`) — rótulos textuais formatados em caixa alta.
6. `PARAMETROS_FINANCEIROS`: array de 4 objetos (`[ { chave, rotulo } ]`) — metadados dos parâmetros financeiros configuráveis (`custoOciosidadeHora`, `custoParadaHora`, `valorCapacidadeHora`, `custoOperacionalHora`).

### Funções de Cálculo, Normalização e Período
1. `normalizarStatus(valor)`: aceita string/qualquer valor e devolve `'ativo'`, `'espera'`, `'inativo'` ou `null` caso não reconheça.
2. `resolverPeriodo(chave, agora, custom)`: aceita chave de período (`'hoje'`, `'24h'`, `'7d'`, `'30d'`, `'mes'`, `'mesAnterior'`, `'custom'`), timestamp `agora` e objeto `custom`; devolve `{ de, ate, rotulo }` em milissegundos (horário local).
3. `periodoAnterior(chave, p)`: aceita chave e objeto `{ de, ate }`; devolve intervalo `{ de, ate }` com mesma duração deslocado no tempo para comparação.
4. `segmentosDe(eventos, de, ate, agora)`: aceita lista de eventos `[{ t, status }]`, janela `de`, `ate`, e `agora`; devolve array de blocos recortados e contíguos `[{ estado, inicio, fim }]`.
5. `calcularEquipamento(equip, eventos, de, ate, agora)`: aceita dados do equipamento, eventos e limites de tempo; devolve objeto detalhado com métricas individuais do equipamento (`{ equip, segmentos, monitoradoMs, periodoMs, ativoMs, esperaMs, inativoMs, pctAtivo, pctEspera, pctInativo, temDados, paradas, mediaAtivoMs, mediaEsperaMs, mediaInativoMs, maiorAtivoMs, maiorParadaMs }`).
6. `situacaoAtual(equip, eventos, agora)`: aceita equipamento, eventos e `agora`; devolve `{ estado, desde, ultimaAtualizacao }` representando o status em tempo real.
7. `resumoFrota(lista)`: aceita lista de métricas por equipamento; devolve indicadores agregados da frota (`{ total, comDados, monitoradoH, ativoH, esperaH, inativoH, improdutivoH, temDados, utilizacaoPct, disponibilidadePct, ociosaPct }`).
8. `contarAgora(situacoes)`: aceita array de situações atuais; devolve contagem consolidada `{ ativo, espera, inativo, semInfo }`.
9. `serieTemporal(segmentosPorEquip, de, ate, quantidade)`: aceita lista de segmentos de todas as máquinas e janela; devolve array de pontos (`[{ rotulo, ativo, espera, inativo }]`) para gráfico de evolução temporal.
10. `calcularFinanceiro(resumo, params)`: aceita resumo da frota e parâmetros financeiros; devolve lista de 4 itens financeiros (`[{ chave, rotulo, formula, valor, faltando }]`).
11. `impactoEquipamento(m, params)`: aceita métricas do equipamento `m` e objeto `params`; devolve impacto em R$ (número) ou `null`.

### Funções de Formatação (pt-BR)
1. `formatarDuracao(ms)`: converte milissegundos para string legível pt-BR (`'< 1 min'`, `'45 min'`, `'2h 15min'`, `'2 d 4 h'`, `'—'`).
2. `formatarHoras(horas)`: formata número de horas com 1 casa decimal e sufixo `' h'` (ex.: `'12,5 h'`).
3. `formatarPct(valor, casas)`: formata número para percentual pt-BR com sufixo `'%'` (ex.: `'85,4%'`).
4. `formatarMoeda(valor)`: formata número para moeda Real pt-BR sem centavos (ex.: `'R$ 1.500'`).
5. `formatarDataHora(ts)`: formata timestamp em `'dd/mm hh:mm'` ou `'—'` se nulo.
6. `formatarHora(ts)`: formata timestamp como `'hh:mm'`.
7. `formatarData(ts)`: nota de contrato — no código inicial é obtido via `formatarDataHora(ts).split(' ')[0]`. Para cumprimento da ESPEC 00/02 e dos requisitos de aceitação do plano, deve ser disponibilizado explicitamente como alias/função retornando `'dd/mm/aaaa'` ou `'dd/mm'`.

---

## (b) Membros de `Metrics` / `Metricas` e outros objetos globais consumidos

### 1. `js/dashboard.js`
- **Alias:** `const M = window.Metricas;`
- **Membros chamados:**
  - `M.formatarHora(ts)`
  - `M.formatarDataHora(ts)`
  - `M.PARAMETROS_FINANCEIROS`
  - `M.resolverPeriodo(chave, agora, custom)`
  - `M.periodoAnterior(chave, p)`
  - `M.situacaoAtual(e, ev, agora)`
  - `M.calcularEquipamento(e, ev, de, ate, agora)`
  - `M.resumoFrota(metricas)`
  - `M.contarAgora(situacoes)`
  - `M.serieTemporal(segmentos, de, ate, quantidade)`
  - `M.calcularFinanceiro(resumo, params)`
  - `M.HORA`, `M.MIN`, `M.DIA`
  - `M.formatarPct(valor, casas)`
  - `M.formatarHoras(horas)`
  - `M.ROTULO`
  - `M.formatarDuracao(ms)`
  - `M.impactoEquipamento(m, params)`
  - `M.formatarMoeda(valor)`
  - `M.normalizarStatus(status)`
- **Outros globais consumidos:**
  - `window.supabaseClient` (operações `.from('empresas')`, `.from('equipamentos')`, `.from('historico_status')`, canais realtime `.channel()`)
  - `window.Chart` (instâncias de gráficos Chart.js)
  - `window.DemoData` (`DemoData.gerar`, `DemoData.novoEventoAleatorio`)
  - `window.localStorage` (chave de parâmetros financeiros)

### 2. `js/relatorios.js`
- **Alias:** `const M = window.Metricas;`
- **Membros chamados:**
  - `M.PARAMETROS_FINANCEIROS`
  - `M.resolverPeriodo(chave, agora, custom)`
  - `M.periodoAnterior(chave, p)`
  - `M.DIA`, `M.HORA`
  - `M.calcularEquipamento(e, ev, de, ate, agora)`
  - `M.resumoFrota(metricas)`
  - `M.impactoEquipamento(m, params)`
  - `M.formatarHoras(horas)`
  - `M.formatarPct(valor, casas)`
  - `M.formatarMoeda(valor)`
  - `M.formatarDuracao(ms)`
- **Outros globais consumidos:**
  - `window.supabaseClient` (consultas no Supabase)
  - `window.Chart` (gráficos de pizza e barras empilhadas)
  - `window.DemoData` (`DemoData.gerar`)
  - `window.localStorage` (chave de parâmetros financeiros)

### 3. `index.html` e `relatorios.html`
- Não realizam chamadas diretas inline a `Metricas`/`Metrics`.
- Carregam os scripts na ordem: CDN Supabase → CDN Chart.js → `supabaseClient.js` → `metrics.js` → `demoData.js` → script da página (`dashboard.js` ou `relatorios.js`).

### 4. `js/demoData.js`
- Expõe `window.DemoData = { gerar, novoEventoAleatorio };`. Não consome `Metricas`.

### 5. `js/supabaseClient.js`
- Consome `window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` e expõe `window.supabaseClient`.

---

## (c) Classes CSS utilizadas atualmente

### 1. KPIs
- Grade e Container: `.grade-kpi`, `.kpi`, `.kpi-corpo`
- Tipografia e Valores: `.kpi-rotulo`, `.kpi-valor`, `.kpi-dica`
- Componente de Anel Percentual: `.anel` (com variáveis inline `--p` e `--cor`), `.anel::after`
- Variações e Deltas: `.delta`, `.delta.sobe`, `.delta.desce`, `.delta.neutro`
- Cores de Estado e Destaque: `.cor-ativo`, `.cor-espera`, `.cor-inativo`, `.cor-primaria`, `.cor-suave`

### 2. Cartão de Máquina
- Container: `.maquina`
- Bordas por Estado: `.maquina.est-ativo`, `.maquina.est-espera`, `.maquina.est-inativo`
- Animação de Alerta: `.maquina.piscar`
- Estrutura Interna: `.maquina-cab`, `.maquina-nome`, `.maquina-modelo`, `.maquina-tempo`, `.maquina-dados`, `.maquina-rodape`

### 3. Alertas
- Container: `.alerta`
- Variantes: `.alerta.critico`, `.alerta.info`
- Elementos Internos: `.alerta .ico`, `.alerta-titulo`, `.alerta-detalhe`, `.alerta-limite`

### 4. Avisos e Conexão
- Container de Aviso Geral: `.aviso`, `#faixaAviso`
- Variantes: `.aviso.erro`, `.aviso.demo`
- Elementos: `.aviso code`, `.aviso .botao`
- Pílula de Status da Conexão: `.pilula-conexao`, `.pilula-conexao.aviso`, `.pilula-conexao.offline`, `.pilula-conexao.online`, `.pilula-conexao .led`

### 5. Tabelas
- Container com Rolagem: `.tabela-rolagem`
- Tabela e Células: `table`, `.tabela-estreita`, `th`, `td`
- Formatação Numérica e Barras: `.num`, `.barra-progresso`, `.barra-trilho`

### 6. Janela Modal (Dialog)
- Elemento Nativo Estilizado: `<dialog class="dialogo">`
- Fundo Escurecido: `.dialogo::backdrop`
- Conteúdo: `.dialogo h3`, `.dialogo-texto`, `.dialogo-botoes`
- Formulário Modal: `.campo-form`, `.campo-ajuda`

---

## (d) Chaves de `localStorage` encontradas

- **`'carrissimi.financeiro'`**: chave onde tanto `dashboard.js` quanto `relatorios.js` salvam e leem os parâmetros financeiros (`custoOciosidadeHora`, `custoParadaHora`, `valorCapacidadeHora`, `custoOperacionalHora`).
  - *Nota da ESPEC 00 / ESPEC 03 / AGENTS.md:* Nas próximas etapas, as configurações da empresa passarão para a tabela `empresas` no Supabase via `ConfigEmpresa.js`, eliminando gradualmente o uso de `localStorage` para configurações de negócio da empresa.

## (e) ACRESCENTADO NA ETAPA 2 (colar no fim de `docs/INVENTARIO_FUNCOES.md`)

Objeto global: `window.Metricas` (oficial) e `window.Metrics` (**alias do mesmo objeto**).
**Convenções do bloco novo:** instantes são **números em ms** (Date e texto ISO são aceitos na entrada); estados internos em **minúsculas** (`'ativo'`, `'espera'`, `'inativo'` e o técnico `'sem_sinal'`); evento aceito = `{ equipamento_id, status, registrado_em }` ou `{ equipamento_id, status, t }`.

**Constantes novas:** `CONFIG_METRICAS` (`MIN_HORA_EXTRA_MS` 5 min · `MIN_EXECUCAO_S` 10 · `TOLERANCIA_SEM_SINAL_MS` 5 min · `FUSO_PADRAO`), `ESTADOS_TODOS`, `ROTULO_COMPLETO` (inclui SEM SINAL), `PARAMETROS_FINANCEIROS_V10` (usa `custoOportunidadeHora`).
*(`ESTADOS`, `ROTULO` e `PARAMETROS_FINANCEIROS` não mudaram.)*

**Funções novas:**
- Fuso/períodos: `partesLocais(instante, fuso)`, `instanteLocal(ano, mes, dia, minutosDoDia, fuso)`, `minutosDe('HH:MM')`, `periodoPreset(nome, agora, fuso)` (`hoje`, `24h`, `7d`, `30d`, `mes_atual`, `mes_anterior`; `ate` exclusivo), `periodoPersonalizado('AAAA-MM-DD', 'AAAA-MM-DD', agora, fuso)`, `periodoAnteriorMesmaDuracao(p)`.
- Blocos/turno: `construirBlocos(eventos, periodo, agora)`, `aplicarFrescor(blocos, ultimoSinalEm, agora)`, `faixasDoTurno(config, periodo)`, `diasDesconsiderados(blocosTodos, config, periodo, agora)`, `aplicarRegua(blocos, faixasValidas)`.
- Indicadores: `agregar(segmentos, janela?, faixas?)`, `somarIndicadores(lista)`, `contarExecucoes(eventos, periodo, agora, faixasValidas)` → `{ [id]: {total, dentroTurno, foraTurno, duracaoTotalMs, tempoMedioMs} }`, `contarParadas(...)` → `{ [id]: n }`.
- **Principal:** `calcularTudo({ eventos, equipamentos, periodo, config, agora, filtroEquipamentoId? })` → `{ porEquipamento, total, diasDesconsiderados, semHorarioCadastrado, avisos, segmentos, faixasValidas }`.
- Expediente: `estaNoExpediente(instante, config)`, `tempoNoEstadoNoExpedienteMs(blocosDoEquipamento, faixasValidas, agora)`.
- Formatação no fuso da empresa: `formatarDataHoraFuso(ts, fuso)`, `formatarHoraFuso(ts, fuso)`, `formatarDiaCurto('AAAA-MM-DD')`.

**Mudanças em funções antigas (comportamento igual ao de antes para os dados atuais):**
- `normalizarStatus` agora reconhece `SEM_SINAL` → `'sem_sinal'` (antes devolvia `null`).
- `serieTemporal` só soma como "inativo" o estado `'inativo'` (antes, qualquer outro estado caía aí; só importa quando existir SEM_SINAL).
- `calcularFinanceiro(a, b)`: com o formato antigo (`resumoFrota`, `params`) devolve a lista de 4 itens de sempre; com **indicadores** de `calcularTudo` devolve `{ itens, impacto, parcial, faltando }`.

**Campos dos Indicadores** (por equipamento e `total`): `tempoProgramadoMs`, `tempoMonitoradoDentroMs`, `coberturaDados`, `tempoAtivoDentroMs`, `tempoEsperaMs`, `tempoInativoMs`, `horasExtrasMs`, `tempoAtivoTotalMs`, `tempoSemSinalMs`, `denominadorMs`, `disponibilidadeOEE`, `maquinaLigada`, `tempoProdutivoMs`, `tempoImprodutivoMs`, `execucoes`, `execucoesDentro`, `execucoesFora`, `duracaoExecucoesMs`, `tempoMedioExecucaoMs`, `paradas`, `maiorPeriodoSemProduzirMs`. Razões sem denominador valem `null`.


## (f) ACRESCENTADO NA ETAPA 3 (colar no fim de `docs/INVENTARIO_FUNCOES.md`)

Arquivo novo: `js/configEmpresa.js` → objeto global **`window.ConfigEmpresa`**. Carregar **depois** do `supabaseClient.js` e **antes** do `metrics.js`. Nenhum outro arquivo acessa `horarios_funcionamento` nem as colunas novas de `empresas`.

**Regra geral:** nenhuma função lança erro; todas devolvem `{ ok: true, dados, aviso? }` ou `{ ok: false, erro: 'texto em português', dados? }`. Todas aceitam `supabase` como 1º argumento (se vier vazio, usam `window.supabaseClient`).

**Formato `Config`** (igual ao da ESPEC 02):
`{ empresaId, fuso, horarios: [{ diaSemana (0=domingo..6=sábado), inicio: 'HH:MM', fim: 'HH:MM' (pode ser '24:00') }], financeiro: { custoOciosidadeHora, custoOportunidadeHora, valorCapacidadeHora, custoOperacionalHora (R$/h ou null), pecasPorExecucao (padrão 1; só dado, sem tela) } }`

**Funções:**
- `obterEmpresaAtual(supabase)` → `{ ok, dados: { id, razao_social, nome_fantasia, cnpj } | null }` (a de menor `id`).
- `carregarConfig(supabase, empresaId, { forcar? })` → `{ ok, dados: Config, aviso? }`; com falha: `{ ok:false, erro, dados: configPadrao(empresaId) }`. Usa cache em memória.
- `salvarFinanceiro(supabase, empresaId, financeiro)`, `salvarFuso(supabase, empresaId, fuso)`, `salvarHorarios(supabase, empresaId, horarios)` (grava o turno inteiro pela função SQL `salvar_horarios`).
- `validarHorarios(horarios)` → `{ ok, erros[], horariosNormalizados }`; `validarFinanceiro(financeiro)` → `{ ok, erros[], financeiroNormalizado }`.
- `configPadrao(empresaId?)`, `paraNumero(texto)` (aceita `1.234,56`, `1234,5`, `R$ 10`), `modoDemo()`, `limparCache()`.
- Constantes: `FUSOS_BRASIL` (`[{ valor, rotulo }]`), `CAMPOS_FINANCEIROS` (`[{ chave, coluna, rotulo }]`).
- Só para os testes automáticos: `_forcarDemoParaTeste(v)` (não usar nas telas).

**Modo demonstração (`?demo=1`):** `carregarConfig` devolve `window.DemoData.DEMO_CONFIG` (definido na ESPEC 07; até lá, a configuração padrão) e `obterEmpresaAtual` devolve `DemoData.DEMO_EMPRESA`, ambos com `demo: true`. Todas as funções `salvar*` devolvem `{ ok:false, erro:'Modo demonstração: nada é salvo.' }`.

**Atenção:** `localStorage` com a chave `carissimi.financeiro` (ou `carrissimi.financeiro`, conforme o código) **não é lido nem migrado**; some quando as telas passarem a usar `ConfigEmpresa`.



## (g) ACRESCENTADO NA ETAPA 5 (colar no fim de `docs/INVENTARIO_FUNCOES.md`)

**`index.html`** — scripts, nesta ordem: `supabase-js` → `chart.js` → `supabaseClient.js` → **`configEmpresa.js`** → `metrics.js` → `demoData.js` → `dashboard.js`.
**`js/dashboard.js`** — não faz mais nenhuma conta de tempo e **não usa `localStorage`**. Consome:
- `window.ConfigEmpresa`: `obterEmpresaAtual`, `carregarConfig` (com `forcar`), `salvarFinanceiro`, `configPadrao`.
- `window.Metricas` (alias `Metrics`): `calcularTudo`, `periodoPreset`, `periodoPersonalizado`, `periodoAnteriorMesmaDuracao`, `partesLocais`, `agregar`, `faixasDoTurno`, `estaNoExpediente`, `tempoNoEstadoNoExpedienteMs`, `calcularFinanceiro` (formato novo), `formatarHoraFuso`, `formatarDataHoraFuso`, `formatarDiaCurto`, `situacaoAtual`, `contarAgora`, `normalizarStatus`, `formatarDuracao`, `formatarHoras`, `formatarPct`, `formatarMoeda`; constantes `HORA`, `MIN`, `DIA`, `ROTULO_COMPLETO`, `CONFIG_METRICAS`, `PARAMETROS_FINANCEIROS_V10`.
- `window.DemoData`: `gerar`, `novoEventoAleatorio` e, quando existir (Etapa 7), `DEMO_CONFIG`. Até lá usa uma configuração de demonstração própria (`CONFIG_DEMO_TEMPORARIA`, no topo do `dashboard.js`).
- Tabelas: `equipamentos` (agora também `ultimo_sinal_em`), `historico_status`, `empresas` e `horarios_funcionamento` (estas duas só pelo `ConfigEmpresa`).

**Classes CSS novas** (bloco `style_acrescentar_dashboard.css`): `grade-kpi-3`, `b-semdados`, `led-extra`, `lt-seg.fora-turno`. O estado SEM SINAL reaproveita `est-semdados` / `led-semdados`.
**`localStorage`:** a chave `carissimi.financeiro` (ou `carrissimi.financeiro`) deixou de ser usada pelo Dashboard. O Relatório ainda a usa até a Etapa 6.
