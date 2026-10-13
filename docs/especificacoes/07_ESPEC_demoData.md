# ESPEC 07 — DADOS DE DEMONSTRAÇÃO (`js/demoData.js`)

**Objetivo:** fazer o `?demo=1` mostrar, **sem banco**, todos os recursos novos (turno, hora extra, dia desconsiderado, execuções, SEM_SINAL) com números previsíveis, para testar e para apresentar.

**Você altera:** `js/demoData.js`. **Não altere** outros arquivos. Leia as ESPEC 00, 02 e 03 (formatos `Config`, `Evento`, `equipamentos`).

## 1. O que o arquivo precisa exportar
- `DEMO_CONFIG` — um `Config` completo (ESPEC 02): `empresaId: 0`, `fuso: 'America/Sao_Paulo'`, turno seg–sex 07:00–12:00 e 13:00–17:00, e `financeiro` preenchido com valores **fictícios** (ex.: ociosidade 60, oportunidade 180, capacidade 220, operacional 90 R$/h; `pecasPorExecucao: 1`).
- `DEMO_EMPRESA` — `{ id: 0, razao_social: 'Empresa Demonstração Ltda', nome_fantasia: 'Demonstração', cnpj: '00.000.000/0001-00' }`.
- `gerarDemoEquipamentos(agora)` — lista com **6 tornos** (o tamanho atual do `demoData.js`; os 4 primeiros recebem os cenários da seção 3 e os outros 2 ficam em operação normal) (`id`, `empresa_id`, `nome`, `modelo`, `status_atual`, `atualizado_em`, `ultimo_sinal_em`).
- `gerarDemoEventos(agora)` — eventos de **100 dias** (como hoje) até `agora`, de todos os tornos (formato `Evento` + `empresa_id`), ordenados por data.
- Se o arquivo atual exporta outros nomes usados por `dashboard.js`/`relatorios.js`, **mantenha esses nomes** (como aliases) e liste em "Divergências".

## 2. Geração determinística
Use um gerador pseudoaleatório com **semente fixa** (ex.: mulberry32): rodar duas vezes gera os mesmos dados. Todos os horários são definidos no **fuso `America/Sao_Paulo`** e convertidos para UTC com `Metrics.instanteLocal` (ou equivalente); gerar em UTC cru está errado.

## 3. Cenários obrigatórios (um por máquina ou por dia, bem identificados em comentários)

| Cenário | Como gerar |
|---|---|
| **Torno 1 — operação normal** | Dia útil: ATIVO ~07:00, pausas curtas de EM_ESPERA (10–20 min) 2 vezes, INATIVO no almoço e às 17:00. Cerca de 4–6 execuções/dia, variação de ±10 min. |
| **Torno 2 — baixa demanda** | Muito tempo INATIVO dentro do turno em ~40 % dos dias úteis (liga só algumas horas ou não liga). |
| **Torno 3 — manutenção** | Um bloco de **3 dias úteis seguidos** quase todo INATIVO dentro do turno (parada prolongada). |
| **Torno 4 — comunicação instável** | 2 intervalos de `SEM_SINAL` (um de 20 min, outro de 3 h, dentro do turno), e `ultimo_sinal_em` = `agora − 2 min` normalmente. |
| **Hora extra** | Em ~1 de cada 5 dias úteis, o Torno 1 fica ATIVO até 18:30. |
| **Sábado trabalhado** | Em 2 sábados do intervalo, o Torno 1 trabalha 08:00–12:00 (ATIVO com 1 pausa). |
| **Dia desconsiderado (feriado)** | Escolha **2 dias úteis passados e já encerrados** em que **nenhum** torno tem ATIVO nem EM_ESPERA (todos INATIVO o dia todo). |
| **Execução curta** | Em alguns dias, um ATIVO de **5 s** (deve ser ignorado pelo contador). |
| **Hoje** | Se `agora` cair dentro do turno, o Torno 1 está ATIVO há ~40 min; não deixe "hoje" ser dia desconsiderado. |
| **Status atual** | `status_atual` de cada equipamento = último evento (Torno 4 pode terminar em `SEM_SINAL` só se o intervalo estiver aberto; padrão: terminar normal). |

## 4. Autoverificação (obrigatória)
Exponha `window.DemoData.verificar(agora)` que imprime no console, usando `Metrics.calcularTudo` com o período "últimos 30 dias":
- nº de dias desconsiderados (esperado **2**, e as datas);
- horas extras do Torno 1 (> 0) e do Torno 2 (≈ 0);
- execuções do Torno 1 (média diária entre 4 e 6 nos dias úteis ativos);
- `tempoSemSinal` do Torno 4 (≈ 3 h 20 min, só nos 2 intervalos);
- Disponibilidade (OEE): Torno 1 entre 70 % e 90 %, Torno 2 entre 25 % e 60 %, Torno 3 menor que o Torno 1 e o Torno 2 no mês do bloco de manutenção;
- que **nenhum** dia de "hoje" aparece como desconsiderado.
Cada item imprime ✔ ou ✘. Se algum falhar, ajuste a geração até todos passarem.

## 5. Casos de teste (console, com `?demo=1`)

| # | Ação | Esperado |
|---|---|---|
| T1 | `DemoData.verificar(new Date())` | Todos ✔ |
| T2 | Recarregar duas vezes | Mesmos números (determinístico) |
| T3 | Abrir Dashboard e Relatórios com `?demo=1` | Faixa "2 dias desconsiderados"; horas extras; execuções; Torno 4 com SEM SINAL no gráfico |
| T4 | Abrir `configuracoes.html?demo=1` | Mostra o turno do `DEMO_CONFIG`; salvar desabilitado |

## 6. Como o usuário testa
Trocar o arquivo, abrir `index.html?demo=1`, abrir o console (F12) e rodar `DemoData.verificar(new Date())`.

## 7. Critérios de aceite
- [ ] Todos os cenários da seção 3 presentes e comentados.
- [ ] `verificar` imprime só ✔.
- [ ] Nada de `Math.random()` solto: só o gerador com semente.
- [ ] Nenhuma dependência externa nova.
