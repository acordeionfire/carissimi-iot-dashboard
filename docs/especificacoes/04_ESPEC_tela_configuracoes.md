# ESPEC 04 — TELA DE CONFIGURAÇÕES (`configuracoes.html` + `js/configuracoes.js`, arquivos NOVOS)

**Objetivo:** permitir ao gestor editar **fuso, horário de funcionamento (turno)** e **valores em R$/hora** da empresa, com tudo salvo no banco.

**Você cria:** `configuracoes.html` e `js/configuracoes.js`. **Mexe só** nesses dois e no **item de menu "Configurações"** dentro do `index.html` e `relatorios.html` (uma linha em cada, descrita na seção 6). Usa o `style.css` existente. Se faltar algum estilo, crie classes novas com o prefixo `cfg-` e entregue esse trecho **separado**, indicando que deve ser colado no **fim** do `style.css` (você não entrega o `style.css` inteiro).
**Depende de:** ESPEC 02 (formato `Config`) e ESPEC 03 (`window.ConfigEmpresa`). Siga a Diretriz de identidade visual e o layout das outras páginas (menu lateral, cabeçalho, pílula de conexão).

## 1. Estrutura da página
Menu lateral igual às outras páginas, com **Configurações** ativo. Título "Configurações". Cabeçalho mostra empresa (nome fantasia e CNPJ). Três cartões:

### 1.1 Empresa e fuso
- Mostra razão social, nome fantasia, CNPJ (somente leitura).
- Campo **Fuso horário** (select com `ConfigEmpresa.FUSOS_BRASIL`; texto amigável, ex.: "Brasília (America/Sao_Paulo)"). Botão **Salvar fuso**.
- Texto de apoio: "O banco guarda os horários em UTC; as contas usam o fuso da empresa."

### 1.2 Horário de funcionamento (turno)
- Uma linha por dia da semana (Segunda a Domingo). Cada dia tem **uma ou mais faixas** (`HH:MM` até `HH:MM`) com botões **+ faixa** e **remover**. Dia sem faixas = "Fechado".
- Atalhos: **"Seg–Sex 07:00–17:00"**, **"Seg–Sex com almoço (07–12 e 13–17)"** e **"Copiar a segunda para os dias úteis"**, **"Limpar tudo"**.
- Resumo ao vivo: "Total semanal programado: 45 h 00 min" e, por dia, a soma.
- Validação ao digitar, usando `ConfigEmpresa.validarHorarios`: erros em vermelho junto da linha; o botão **Salvar horário** fica desabilitado enquanto houver erro.
- Aviso quando **não há nenhuma faixa**: "Sem horário cadastrado: os indicadores usam 24 h corridas e incluem noites e fins de semana."
- Nota fixa: "Horas extras não precisam ser cadastradas: ATIVO fora do horário (a partir de 5 min contínuos) é reconhecido automaticamente como hora extra produtiva. Feriados em dias úteis são detectados sozinhos quando nenhuma máquina liga no dia."
  (Mostrar os 5 min lendo `Metrics.CONFIG_METRICAS`, não escrever o número fixo.)

### 1.3 Valores para o cálculo financeiro (estimativa média por hora)
Quatro campos em R$/hora, **com texto de apoio e exemplo**:

| Campo | Rótulo | Apoio |
|---|---|---|
| `custoOciosidadeHora` | Custo de ociosidade (máquina ligada sem operar) | "Quanto custa 1 hora ligada sem cortar: energia, operador, depreciação." |
| `custoOportunidadeHora` | Custo de oportunidade (máquina desligada no expediente) — estimado | "O que se deixa de ganhar por hora desligada (margem da peça × peças por hora). Só é perda real se havia demanda." |
| `valorCapacidadeHora` | Valor da capacidade produtiva | "Quanto vale 1 hora de produção plena." |
| `custoOperacionalHora` | Custo operacional (máquina ligada) | "Quanto custa manter a máquina ligada, operando ou não." |

- Linha de aviso fixa: "São **estimativas médias por empresa e por hora**, não valores contábeis exatos." Deixar em branco o que não souber: o painel avisa o que falta.
- Aceitar digitação em pt-BR (`1.234,56` e `1234,56`); mostrar formatado como `R$ 1.234,56`. `inputmode="decimal"`.
- Botões: **Salvar valores** e **Limpar tudo** (pede confirmação; grava `null` nos quatro).
- **Bloco opcional O1 (só se o usuário aprovar):** campo **"Peças por execução (estimativa)"**, número > 0, padrão 1, apoio: "Quantas peças, em média, uma execução produz. Serve só para estimar peças; o sistema não conta peças."

### 1.4 Parâmetros do sistema (somente leitura)
Pequena tabela com as constantes de `Metrics.CONFIG_METRICAS`: mínimo de hora extra, mínimo de execução, tolerância de SEM_SINAL. Texto: "Ajustados no código (`js/metrics.js`)."

## 2. Comportamento
1. Ao abrir: `obterEmpresaAtual` → `carregarConfig` → preencher. Mostrar "Carregando…". Se falhar, mostrar aviso vermelho "Não foi possível carregar a configuração (usando padrão)" e **desabilitar os botões de salvar**.
2. Cada cartão salva **separadamente** (fuso, horário, valores). Depois de salvar: mensagem verde "Salvo" (some em 4 s, com `aria-live="polite"`), e recarregar do banco para refletir o que ficou gravado.
3. Se tentar sair com alteração não salva: `beforeunload` pergunta.
4. **Modo demo (`?demo=1`):** faixa "Modo demonstração: nada é salvo" e botões de salvar desabilitados.
5. Pílula de conexão e menu como nas outras páginas. Responsivo: no celular, os dias empilham e as faixas quebram em duas linhas.
6. Acessibilidade: todo campo tem `<label>`; erros ligados ao campo por `aria-describedby`.

## 3. Casos de teste

| # | Ação | Esperado |
|---|---|---|
| T1 | Abrir a página (banco com o turno inicial) | 5 dias úteis com 2 faixas; fim de semana "Fechado"; total semanal **45 h** |
| T2 | Faixa 11:00–13:00 sobre 07:00–12:00 | Erro vermelho; "Salvar horário" desabilitado |
| T3 | Clicar "Seg–Sex 07:00–17:00" e salvar; recarregar a página | Mostra uma faixa por dia; total semanal **50 h** |
| T4 | Digitar `1.234,56` em ociosidade e salvar; recarregar | Mostra `R$ 1.234,56` |
| T5 | "Limpar tudo" nos valores | Pede confirmação; depois os 4 campos vazios no banco |
| T6 | Remover todas as faixas e salvar | Salva; aparece o aviso "Sem horário cadastrado…" |
| T7 | Fechar a aba com alteração pendente | Pergunta se quer sair |
| T8 | Abrir com `?demo=1` | Faixa de demo; botões desabilitados |
| T9 | Desligar a internet e abrir | Aviso de falha; botões de salvar desabilitados |

## 4. Como o usuário testa
1. Colocar os dois arquivos novos na pasta (o `configuracoes.js` dentro de `js/`), conferir o item de menu e abrir `configuracoes.html` pelo Live Server (e depois na Vercel).
2. Rodar T1–T9. Conferir no Supabase (Table Editor → `horarios_funcionamento` e `empresas`) que o que aparece na tela é o que está gravado.

## 5. Critérios de aceite
- [ ] T1–T9 passam; nenhum valor fica só no navegador.
- [ ] Visual consistente com Dashboard/Relatórios (Diretriz).
- [ ] Nenhum texto de apoio contradiz as definições da ESPEC 00.

## 6. Item de menu nas outras páginas (única alteração permitida fora dos seus arquivos)
Hoje o menu lateral **não tem** o item Configurações (só Dashboard e Relatórios ativos; Equipamentos, Histórico e Indicadores "em breve"). Acrescente, no `index.html` e no `relatorios.html`, um item **Configurações** com link para `configuracoes.html`, no mesmo padrão dos outros itens (e a versão do menu para celular, que vira botões no topo). Entregue só as **linhas a acrescentar**, com o arquivo e a posição; as ESPEC 05 e 06 aplicam a mudança nos arquivos completos delas.
