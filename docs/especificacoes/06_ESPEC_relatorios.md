# ESPEC 06 — RELATÓRIOS (`relatorios.html` + `js/relatorios.js`)

**Objetivo:** fazer os Relatórios usarem a configuração da empresa e as funções da ESPEC 02/03: régua do turno, nomenclatura OEE, execuções, horas extras, dias desconsiderados, SEM_SINAL e custo de oportunidade. CSV e PDF saem com os mesmos números da tela.

**Você altera:** `relatorios.html` e `js/relatorios.js`. **Não altere** `style.css` (classes novas: entregue trecho separado com prefixo `rel-`), `metrics.js`, `configEmpresa.js` ou outras páginas. Leia as ESPEC 00, 02 e 03. **Muito do que a ESPEC 05 diz sobre carregamento de dados vale aqui igual** (seção 1 da ESPEC 05).

## 1. Carregamento
Igual à ESPEC 05, seção 1: ordem dos scripts, config da empresa, eventos de **todas** as máquinas + evento anterior ao início, `ultimo_sinal_em`, `Metrics.calcularTudo`, comparação com o período anterior de mesma duração, presets via `Metrics.periodoPreset(..., config.fuso)`. Mantém o limite atual de registros e o aviso quando ele for atingido; o filtro de equipamento passa `filtroEquipamentoId`, **sem** deixar de carregar as demais máquinas.

## 2. O que muda na tela

### 2.1 Faixas de aviso (mesmas da ESPEC 05, seção 2.1)
Sem horário, dias desconsiderados, configuração não carregada, status desconhecido. Acrescentar: **SEM_SINAL no período** ("Equipamento X ficou N h sem sinal; esse tempo não entra nos cálculos") e **cobertura de dados < 100 %** ("Só 82 % do horário de funcionamento tem dados registrados").

### 2.2 Resumo (cartões no topo)
Disponibilidade (OEE), Máquina ligada, Tempo produtivo, Tempo improdutivo, **Execuções** (com tempo médio), **Horas extras produtivas**, Cobertura de dados; cada um com comparação ▲/▼ com o período anterior. Mesmos tooltips da ESPEC 05 (2.2). **O1 (se aprovado):** "Peças estimadas (guia)".

### 2.3 Conclusões automáticas (texto gerado; só frases que se aplicam)
Modelos (adapte a concordância de número/gênero):
1. "A **Disponibilidade (OEE)** foi de **X %**, Y pontos **acima/abaixo** do período anterior."
2. "Foram registradas **N execuções** (tempo médio de H por execução). Este número é uma **referência** para estimar peças: não é contagem de peças."
3. "Houve **H h** de produção **fora do horário de funcionamento** (horas extras)." — só se > 0.
4. "A máquina ficou **desligada H h dentro do expediente** (pode indicar baixa demanda ou manutenção)." — só se > 0.
5. "**N dia(s) foram desconsiderados** por não haver nenhum equipamento ligado: 07/10, 12/10." — só se houver.
6. "Estimativa de **custo de oportunidade**: R$ X (só é perda real se havia demanda)." — só se o valor estiver informado.
7. Frase de alerta se `cobertura < 100 %` ou houver SEM_SINAL.
Linguagem sempre neutra: nunca afirmar a causa da inatividade.

### 2.4 Gráficos
- Evolução por **hora / dia / semana** (baldes no fuso da empresa) alimentada por `Metrics.agregar(segmentos, janela)`: séries **ATIVO (no turno)**, **ATIVO fora do turno (hora extra)**, **EM_ESPERA**, **INATIVO**. SEM_SINAL aparece como hachurado/cinza só se for relevante.
- Distribuição (rosca) com as mesmas quatro categorias.
- Escala em percentual do **tempo contado** de cada balde; balde sem tempo contado fica vazio (não 0 %).

### 2.5 Tabelas
**Por equipamento** (com linha de total, média ponderada):
`Equipamento | Programado | Ativo | Espera | Inativo | Horas extras | Disponibilidade (OEE) | Máquina ligada | Execuções | Tempo médio/exec. | Paradas | Maior período sem produzir | Custo de oportunidade (se houver valor)`.
**Por hora/dia/semana:** `Período | Programado | Ativo | Espera | Inativo | Horas extras | Disponibilidade (OEE) | Execuções | Paradas`. Linhas de dia desconsiderado aparecem marcadas ("desconsiderado") e sem percentuais.

### 2.6 Quadro "Como os números são calculados" (reescrever; texto-base)
> **Base de tempo.** Os indicadores usam o **horário de funcionamento** cadastrado em Configurações (fuso: *<fuso>*). Dentro do horário conta todo o tempo; fora dele só conta ATIVO contínuo de pelo menos *<5 min>* (hora extra). Noites, fins de semana e feriados sem atividade **não** entram. *(Se não houver horário: 24 h corridas.)*
> **Status.** ATIVO = ligada e operando · EM_ESPERA = ligada sem operar (espera, preparação, troca de peça) · INATIVO = desligada (só conta no expediente; pode indicar baixa demanda ou manutenção) · SEM SINAL = sem comunicação (fora dos cálculos).
> **Disponibilidade (OEE)** = tempo ATIVO ÷ tempo programado (inclui hora extra). **Máquina ligada** = (ATIVO + EM_ESPERA) ÷ tempo programado. Este sistema mede **apenas a Disponibilidade**, primeiro componente do OEE; Performance e Qualidade não são medidas.
> **Execuções** = vezes em que a máquina passou a ATIVO (execuções com menos de *<10 s>* são ignoradas). É uma **referência** para estimar peças, não uma contagem.
> **Dias desconsiderados** = dias de expediente sem nenhuma máquina ligada (provável feriado).
> **Custos** são **estimativas médias por empresa e por hora** informadas em Configurações; o custo de oportunidade só é perda real se havia demanda.
> **Fórmula do impacto.** horas em espera × custo de ociosidade + horas desligadas no expediente × custo de oportunidade.

(Os valores entre `< >` vêm de `Metrics.CONFIG_METRICAS` e do `config`, não escritos fixos.)

### 2.7 CSV e PDF
- **CSV (2 tabelas, como hoje):** mesmas colunas da seção 2.5; `;` como separador, vírgula decimal, UTF-8 com BOM; tempos em `hh:mm:ss`; percentuais com 1 casa; cabeçalho com empresa, período, fuso e data de geração; uma linha final "Observação: Execuções é referência, não contagem de peças."
- **PDF (impressão):** inclui avisos, resumo, conclusões, gráficos, tabelas e o quadro 2.6. Itens novos não podem quebrar o layout de impressão.
- O CSV e o PDF **não recalculam**: usam o mesmo `resultado` da tela.

### 2.8 Menu e demo
Acrescentar **Configurações** no menu (e no celular). `?demo=1` usa `DEMO_CONFIG` e `demoData.js` (ESPEC 07).

## 3. Casos de teste (banco real com `dados_de_teste_opcional.sql` e `?demo=1`)

| # | Cenário | Esperado |
|---|---|---|
| T1 | Período "Mês atual" com os dados de teste | Aviso de 1 dia desconsiderado; horas extras > 0; execuções ≈ 4 × dias úteis com atividade |
| T2 | Filtro por equipamento | Números do equipamento; a lista de dias desconsiderados **não muda** ao filtrar |
| T3 | CSV do período do T1 | Mesmos números da tela; abre no Excel com acentos corretos e vírgula decimal |
| T4 | PDF | Contém o quadro 2.6 com fuso e mínimos reais |
| T5 | Sem horário cadastrado | Faixa de aviso; números em 24 h |
| T6 | Valores em R$ vazios | Custos "não calculado", com aviso do que falta; sem `NaN` |
| T7 | Período com tudo INATIVO e dia já encerrado | Dia desconsiderado, sem percentuais (— ) |
| T8 | Executar os cenários T1, T4 e T5 da ESPEC 02 no `?demo=1` | Mesmos números |
| T9 | Comparação com período anterior sem dados | Mostra "—", não ▲/▼ falso |

## 4. Como o usuário testa
Substituir os dois arquivos, abrir `relatorios.html?demo=1`, depois sem `?demo=1`; conferir os cartões, exportar CSV e PDF e comparar com a tela.

## 5. Critérios de aceite
- [ ] T1–T9 passam; sem erro no console.
- [ ] Nenhum rótulo "Utilização" nem "custo de parada".
- [ ] A tela, o CSV e o PDF mostram exatamente os mesmos números.
- [ ] Texto das conclusões nunca afirma causa de inatividade nem chama execuções de "peças".
