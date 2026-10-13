# ESPEC 05 — DASHBOARD (`index.html` + `js/dashboard.js`)

**Objetivo:** fazer o Dashboard usar a configuração da empresa e as novas funções de cálculo (ESPEC 02/03): régua do turno, nomenclatura OEE, contador de execuções, SEM_SINAL, alertas só no expediente e custo de oportunidade.

**Você altera:** `index.html` e `js/dashboard.js`. **Não altere** `style.css` (se precisar de classes novas, entregue o trecho para colar no fim, com prefixo `dash-`), `metrics.js`, `configEmpresa.js` ou outras páginas. Leia as ESPEC 00, 02 e 03.

## 1. Carregamento de dados
1. Ordem das tags `<script>`: `supabaseClient.js` → `configEmpresa.js` → `metrics.js` → `demoData.js` → `dashboard.js`.
2. Ao abrir e a cada recarga completa (a cada 5 min): `obterEmpresaAtual` → `carregarConfig` → eventos.
3. **Eventos de TODAS as máquinas da empresa** (não só a filtrada), do período **e do período anterior** (comparação), **mais o último evento anterior ao início de cada período** por equipamento. Se hoje o código já busca o evento anterior, mantenha; se não, implemente (uma consulta por equipamento: último `historico_status` com `registrado_em < inicio`).
4. Selecionar também `equipamentos.ultimo_sinal_em`.
5. Falha de configuração: usar `configPadrao()`, mostrar faixa de aviso e seguir (ver 2.1).
6. Cálculo: uma chamada `Metrics.calcularTudo(...)` para o período e outra para o período anterior. A tela nunca refaz conta de tempo por conta própria.
7. Presets de período calculados com `Metrics.periodoPreset(nome, agora, config.fuso)`.

## 2. O que muda na tela

### 2.1 Faixas de aviso (acima dos KPIs; podem coexistir)
- **Sem horário:** "Sem horário de funcionamento cadastrado: usando 24 h corridas (noites e fins de semana entram na conta). **Configurar**" (link para `configuracoes.html`).
- **Dias desconsiderados:** "N dia(s) desconsiderado(s) do cálculo por não haver nenhum equipamento ligado: 07/10, 12/10." (datas no fuso da empresa; se passar de 5, "e mais K").
- **Configuração não carregada:** "Não foi possível carregar a configuração; usando padrão."
- **Status desconhecido:** "Foram ignorados N registros com status desconhecido (FOO)." 

### 2.2 KPIs (renomear e acrescentar)
| Antes | Agora |
|---|---|
| Utilização | **Disponibilidade (OEE)** = `disponibilidadeOEE` |
| Disponibilidade | **Máquina ligada** = `maquinaLigada` |
| Tempo produtivo | Tempo produtivo = `tempoProdutivoMs` |
| Tempo improdutivo | Tempo improdutivo = `tempoImprodutivoMs` |
| — | **Execuções** (nº) com subtítulo "tempo médio por execução: 1 h 05 min" |
| — | **Horas extras produtivas** (`horasExtrasMs`) |
| Equipamentos; ativos / espera / inativos agora | Mantidos; acrescentar **sem sinal agora** quando houver |

- Cada KPI mantém a comparação ▲/▼ com o período anterior (inclusive Execuções e Horas extras).
- Dica (tooltip) de **Disponibilidade (OEE)**: "Tempo produzindo ÷ tempo programado. Inclui o ATIVO fora do horário (hora extra). Este sistema mede só a Disponibilidade do OEE."
- Dica de **Execuções**: "Quantas vezes a máquina passou a ATIVO no período. É uma **referência** para estimar peças; **não é contagem de peças** (uma peça pode gerar mais de uma execução e uma execução pode gerar várias peças)."
- Dica de **Máquina ligada**: "ATIVO + ESPERA ÷ tempo programado."
- Valores `null` aparecem como "—".
- **O1 (só se aprovado):** linha "Peças estimadas (guia): N" abaixo de Execuções, `execuções × pecasPorExecucao`, com rótulo "estimativa".

### 2.3 Cartões por máquina
- Estados: ATIVO, ESPERA, INATIVO e **SEM SINAL** (visual neutro/cinza conforme a Diretriz; aplica-se quando o status atual é `SEM_SINAL` **ou** quando `aplicarFrescor` o tornar virtual).
- Conteúdo: estado, tempo no estado, composição (ativo/espera/inativo), **paradas** (só dentro do turno), **execuções** do período e tempo médio por execução.
- **Piscar só quando o status muda.** O sinal periódico atualiza `ultimo_sinal_em` na tabela `equipamentos` a cada ~1 min e dispara o Realtime: comparar `status_atual` antigo × novo; se igual, **não piscar, não redesenhar tudo** (no máximo atualizar o "último sinal").
- Mostrar "último sinal: há X min" quando `ultimo_sinal_em` existir.

### 2.4 Demais blocos
- **Linha do tempo:** mostrar os estados; trechos fora do turno em tom mais claro; hora extra destacada; SEM_SINAL em cinza hachurado.
- **Perda de capacidade / Visão financeira:** usar `Metrics.calcularFinanceiro`. Rótulo **"Custo de oportunidade (estimado)"** no lugar de "custo de parada", com a nota "só é perda real se havia demanda". Base de tempo: dentro do turno. Quando faltar valor: avisar quais campos faltam, com link para Configurações. A janela "Configurar valores" continua existindo, agora lendo/gravando por `ConfigEmpresa` (nada de `localStorage`).
- **Gráficos** (evolução, distribuição, horas por equipamento): alimentados por `Metrics.agregar(segmentos, janela)`; baldes no fuso da empresa; hora extra como série própria no gráfico de evolução.
- **Tabela ordenável:** acrescentar colunas **Execuções**, **Tempo médio/exec.**, **Horas extras**; renomear as colunas de Utilização/Disponibilidade.
- **Atividade recente:** mantém; SEM_SINAL aparece como "SEM SINAL".
- **Seletor de período:** mantém Hoje/24h/7d/30d/Mês atual/Personalizado, agora no fuso da empresa. "Personalizado" interpreta datas no fuso da empresa.

### 2.5 Alertas (constantes `LIMITES` continuam no topo)
| Alerta | Regra nova |
|---|---|
| Espera contínua > 60 min | usa `tempoNoEstadoNoExpedienteMs` (só conta dentro do turno) |
| Inativo > 2 h | idem; **remover o horário provisório fixo seg–sex 7–18 h** do código e usar `estaNoExpediente` |
| Disponibilidade (OEE) < 20 % | renomeado |
| Espera > 25 % | `tempoEspera ÷ denominador` |
| > 6 paradas/dia | `paradas ÷ nº de dias com turno válido no período` |
| Máquina sem registros no período | mantém |
| **Novo: sem sinal** | máquina em SEM_SINAL (real ou virtual) |
| **Novo: status desconhecido** | contagem em `avisos.statusDesconhecidos` |

Nenhum alerta de espera/inativo dispara fora do expediente nem em dia desconsiderado.

### 2.6 Realtime
- INSERT em `historico_status`: recalcular com **debounce de ~300 ms** (não tente atualizar contas incrementalmente).
- UPDATE em `equipamentos`: ver 2.3.
- Recarga completa de segurança a cada 5 min (mantém).

### 2.7 Menu e modo demo
- Acrescentar o item **Configurações** no menu lateral (e na versão celular) com link para `configuracoes.html`.
- `?demo=1`: usa `DEMO_CONFIG` e os dados de `demoData.js` (ESPEC 07); faixa "Modo demonstração" continua.

## 3. Casos de teste (use o `?demo=1` e o banco real com `dados_de_teste_opcional.sql`)

| # | Cenário | Esperado |
|---|---|---|
| T1 | Banco sem horário cadastrado | Faixa "Sem horário…"; números em 24 h |
| T2 | Dados de teste opcionais, período "30d" | Faixa "1 dia desconsiderado: …"; Execuções ≈ 4 × nº de dias úteis ativos; Horas extras > 0 |
| T3 | Janela "Hoje" fora do expediente (ex.: sábado) | Sem alerta de inativo; Disponibilidade `—` se não houve ATIVO |
| T4 | Atualizar `ultimo_sinal_em` no Supabase sem mudar o status | Cartão **não** pisca; "último sinal" atualiza |
| T5 | `ultimo_sinal_em` de 10 min atrás e status ATIVO | Cartão mostra SEM SINAL + alerta novo |
| T6 | Inserir `FOO` em `historico_status` | Faixa "ignorados … (FOO)" |
| T7 | Trocar de "7d" para "30d" | KPIs, gráficos e comparação refeitos sem erro de console |
| T8 | Executar os cenários T1–T5 da ESPEC 02 via `?demo=1` | Mesmos números |
| T9 | Navegador com fuso diferente (ex.: simular UTC) | "Hoje" continua sendo o dia da empresa |
| T10 | Desligar a internet no meio | Tela continua com o último estado; pílula indica desconectado |

## 4. Como o usuário testa
1. Substituir `index.html` e `js/dashboard.js` (e colar, se houver, o trecho de CSS no fim do `style.css`).
2. Abrir `index.html?demo=1` → conferir faixas, KPIs e alertas; depois abrir sem `?demo=1`.
3. Para T4/T5: Supabase → Table Editor → `equipamentos` → editar `ultimo_sinal_em` manualmente.

## 5. Critérios de aceite
- [ ] T1–T10 passam; sem erro no console.
- [ ] Nenhum rótulo "Utilização" nem "custo de parada" restante na tela.
- [ ] Nenhuma conta de tempo fora de `metrics.js`; nenhum `localStorage` para valores.
- [ ] A tela diz claramente "Execuções ≠ peças".
