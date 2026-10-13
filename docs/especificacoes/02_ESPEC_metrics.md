# ESPEC 02 — CÁLCULOS (`js/metrics.js`)

**Objetivo:** concentrar TODA a regra de negócio dos indicadores (régua do turno, horas extras, dia desconsiderado, nomenclatura OEE, execuções, SEM_SINAL, financeiro). Dashboard, Relatórios e demo só **chamam** estas funções.

**Arquivo que você altera:** `js/metrics.js` (reaproveite o que já existe: `normalizarStatus`, formatação pt-BR, períodos, série temporal). **Não altere** nenhum outro arquivo. Leia antes a ESPEC 00.

## 1. Tipos (formatos fixos — as outras especificações dependem deles)

```
Evento    = { equipamento_id, status, registrado_em }            // registrado_em: Date ou string ISO (UTC)
Periodo   = { inicio: Date, fim: Date }                          // instantes UTC
Config    = { empresaId, fuso: 'America/Sao_Paulo',
              horarios: [ { diaSemana: 0..6, inicio: 'HH:MM', fim: 'HH:MM' } ],   // fim pode ser '24:00'
              financeiro: { custoOciosidadeHora, custoOportunidadeHora, valorCapacidadeHora,
                            custoOperacionalHora, pecasPorExecucao }  }           // números ou null
Bloco     = { equipamentoId, status, inicio: Date, fim: Date }
Faixa     = { inicio: Date, fim: Date }
Segmento  = { equipamentoId, status, inicio, fim, dentroTurno: boolean }
```

## 2. Funções públicas (nomes e assinaturas obrigatórios)

| Função | Faz |
|---|---|
| `normalizarStatus(v)` | Já existe. Passa a reconhecer `SEM_SINAL`. Desconhecido → `null`. |
| `CONFIG_METRICAS` | Objeto com as constantes da ESPEC 00 (seção 5). |
| `periodoPreset(nome, agora, fuso)` | Presets (`hoje`, `24h`, `7d`, `30d`, `mes_atual`, `mes_anterior`) **no fuso da empresa**. Retorna `Periodo`. |
| `partesLocais(instante, fuso)` | `{ano, mes, dia, diaSemana, minutosDoDia}` no fuso. |
| `instanteLocal(ano, mes, dia, minutosDoDia, fuso)` | `Date` UTC de um horário local. `minutosDoDia = 1440` significa 24:00 (= 00:00 do dia seguinte). Funciona sem biblioteca (calcular o deslocamento com `Intl.DateTimeFormat(...).formatToParts`). |
| `construirBlocos(eventos, periodo, agora, opcoes?)` | `Bloco[]` por equipamento (recortados ao período; o último vai até `min(agora, periodo.fim)`). Ver regras 3.1. |
| `faixasDoTurno(config, periodo)` | `Faixa[]` ordenadas e **mescladas** (faixas que se tocam/sobrepõem viram uma). Período vazio de horários → `[]`. |
| `diasDesconsiderados(blocosTodos, config, periodo, agora)` | `[{ data: 'AAAA-MM-DD', inicio, fim }]`. Regra 3.3. |
| `aplicarRegua(blocos, faixasValidas)` | `Segmento[]` conforme regra 3.2. |
| `agregar(segmentos, janela?)` | Soma por status (ms) → objeto de **Indicadores** (seção 4). `janela` opcional recorta (usado nos gráficos por hora/dia/semana). |
| `contarExecucoes(eventos, periodo, agora, faixasValidas)` | `{ total, dentroTurno, foraTurno, duracaoTotalMs, tempoMedioMs }` por equipamento. Regra 3.4. |
| `contarParadas(eventos, periodo, agora, faixasValidas)` | Nº de entradas em `INATIVO` **dentro do turno**. |
| `aplicarFrescor(blocos, ultimoSinalEm, agora)` | Regra 3.5 (SEM_SINAL virtual). |
| `calcularTudo(entrada)` | **Função principal**. Entrada/saída na seção 5. |
| `calcularFinanceiro(indicadores, financeiro)` | Seção 6. |
| `estaNoExpediente(instante, config)` | `true` se cai dentro de uma faixa do turno cadastrado (ignora dia desconsiderado). Substitui o horário provisório fixo do `dashboard.js`. |
| `tempoNoEstadoNoExpedienteMs(blocosDoEquipamento, faixasValidas, agora)` | Tempo, **dentro do turno**, desde o início do estado atual. Usado nos alertas "espera > 60 min" e "inativo > 2 h". |
| funções de formatação pt-BR | Mantidas como estão. |

Valores nulos: indicador sem denominador → `null` (a tela mostra "—"), nunca `NaN`/`Infinity`.

## 3. Regras de negócio

### 3.1 Blocos
- Um evento vale até o próximo evento do **mesmo** equipamento; o último até `min(agora, periodo.fim)`.
- O **evento anterior ao início do período** define o status no começo do período. Se a página só carregou eventos dentro do período, o primeiro trecho fica desconhecido e **não entra** (comportamento atual: "tempo sem evento conhecido não entra").
- Eventos de status desconhecido (`normalizarStatus` = `null`): ignorados, mas contados em `avisos.statusDesconhecidos = { 'FOO': 2 }`.
- Eventos consecutivos com o mesmo status são fundidos num só bloco.
- Período efetivo = `[inicio, min(fim, agora))`. Nada do futuro entra.
- `SEM_SINAL` gera bloco, mas **nunca** entra em tempo monitorado.

### 3.2 Régua do turno (`aplicarRegua`)
1. Dentro da faixa: conta `ATIVO`, `EM_ESPERA` e `INATIVO` (`dentroTurno: true`).
2. Fora da faixa: conta **só `ATIVO`**, e só se o trecho contínuo fora da faixa tiver ≥ `MIN_HORA_EXTRA_MS` (`dentroTurno: false`). Um ATIVO que cruza o fim do turno é cortado na borda; o pedaço de fora é avaliado sozinho.
3. Fora da faixa, `EM_ESPERA`/`INATIVO` são descartados.
4. `faixasValidas` = `faixasDoTurno` **menos** os dias desconsiderados.
5. **Sem horário cadastrado** (`config.horarios` vazio): trate o período inteiro como uma faixa contínua (24 h), todo segmento `dentroTurno: true`, e marque `semHorarioCadastrado: true` no resultado.

### 3.3 Dia desconsiderado (feriado inferido)
Um dia local entra na lista se **todas** as condições valem:
- o dia tem faixas de turno cadastradas;
- está **inteiro dentro do período efetivo**;
- está **encerrado**: `agora ≥ fim da última faixa do dia`;
- houve tempo monitorado dentro do turno (> 0) em pelo menos uma máquina (senão é "sem dados", não "feriado");
- **nenhuma máquina da empresa** teve `ATIVO` nem `EM_ESPERA` em qualquer momento daquele dia local.

**Importante:** a detecção usa os eventos de **todas as máquinas da empresa**, mesmo quando a tela filtra uma só. O dia desconsiderado sai de `faixasValidas` para todos.

### 3.4 Execuções
Para cada equipamento, percorra os eventos em ordem (incluindo o último anterior ao período):
- Uma **execução** é um evento `ATIVO` cujo status anterior (ignorando `SEM_SINAL`) era diferente de `ATIVO` (ou não existia).
- Só conta se `registrado_em` está dentro do período efetivo.
- Um `ATIVO` que já vinha de antes do período **não** conta.
- Duração da execução = tempo `ATIVO` até a próxima mudança de status (`SEM_SINAL` não soma; se depois do `SEM_SINAL` voltar `ATIVO`, continua a mesma execução). Recortada ao fim do período efetivo.
- Execução com duração < `MIN_EXECUCAO_S` **não conta** (inclusive uma execução ainda em andamento que ainda não atingiu o mínimo).
- Conta **todas** as execuções do período, também as de hora extra: `dentroTurno` / `foraTurno` pelo instante de início.
- `tempoMedioMs = duracaoTotalMs ÷ total` (ou `null`).
- Total da empresa = soma dos equipamentos.
- **Opcional (O1, só se o usuário aprovar):** `pecasEstimadas = total × financeiro.pecasPorExecucao`.

### 3.5 SEM_SINAL virtual (`aplicarFrescor`)
Se o **último** bloco do equipamento não é `SEM_SINAL`, `ultimoSinalEm` existe e `agora − ultimoSinalEm > TOLERANCIA_SEM_SINAL_MS`: divida o último bloco em `ultimoSinalEm + TOLERANCIA` e transforme o resto em `SEM_SINAL` (virtual, até `agora`). Se `ultimoSinalEm` é `null`, **não faz nada** (enquanto o sinal periódico não existir, nada de falso SEM_SINAL). Nunca use `atualizado_em` para isso.

### 3.6 Paradas e maior período sem produzir
- **Paradas** = nº de entradas em `INATIVO` cujo instante cai **dentro de faixa válida** (ignora `SEM_SINAL` como status anterior).
- **Maior período sem produzir** = maior sequência contínua de tempo contado `EM_ESPERA`/`INATIVO` **dentro do turno**; `ATIVO`, `SEM_SINAL` e fronteira de faixa quebram a sequência.

## 4. Indicadores (por equipamento e total)

```
Indicadores = {
  tempoProgramadoMs,        // soma das faixas válidas no período efetivo
  tempoMonitoradoDentroMs,  // ATIVO+ESPERA+INATIVO dentro do turno
  coberturaDados,           // monitoradoDentro ÷ programado (null se programado = 0)
  tempoAtivoDentroMs, tempoEsperaMs, tempoInativoMs,
  horasExtrasMs,            // ATIVO fora do turno (já filtrado pelo mínimo)
  tempoAtivoTotalMs,        // dentro + fora
  tempoSemSinalMs,          // informativo (fora do cálculo)
  denominadorMs,            // monitoradoDentro + horasExtras
  disponibilidadeOEE,       // ativoTotal ÷ denominador     (0..1 ou null)
  maquinaLigada,            // (ativoTotal + espera) ÷ denominador
  tempoProdutivoMs,         // = ativoTotal
  tempoImprodutivoMs,       // = espera + inativo
  execucoes, execucoesDentro, execucoesFora, tempoMedioExecucaoMs,
  paradas, maiorPeriodoSemProduzirMs
}
```
**Total da empresa:** some os tempos e recalcule as razões (média **ponderada**, nunca média de percentuais).

## 5. `calcularTudo(entrada)` → `resultado`

```
entrada = { eventos,            // de TODAS as máquinas da empresa (já inclui o último evento antes do início)
            equipamentos,       // [{ id, nome, status_atual, ultimo_sinal_em }]
            periodo, config, agora,
            filtroEquipamentoId // opcional: calcula/mostra só esse; a detecção de dias usa todos
          }

resultado = { porEquipamento: { [id]: Indicadores },
              total: Indicadores,
              diasDesconsiderados: [...],
              semHorarioCadastrado: boolean,
              avisos: { statusDesconhecidos: {...}, equipamentosSemSinal: [id], equipamentosSemRegistros: [id] },
              segmentos: Segmento[],          // para gráficos por hora/dia/semana via agregar(segmentos, janela)
              faixasValidas: Faixa[] }
```
Para gráficos: `agregar(resultado.segmentos, {inicio, fim})` por balde (hora/dia/semana **no fuso da empresa**), sem recalcular tudo.
Para a comparação com o período anterior, chame `calcularTudo` de novo com o período anterior de **mesma duração**.

## 6. Financeiro (`calcularFinanceiro`)
Base de tempo: **só dentro do turno** (e horas extras onde indicado).
- `impacto = horasEspera × custoOciosidadeHora + horasInativo × custoOportunidadeHora`
- `capacidadeNaoUtilizada = (horasEspera + horasInativo) × valorCapacidadeHora`
- `custoOperacional = (horasAtivoTotal + horasEspera) × custoOperacionalHora`
- Valor `null` → aquela parcela vira "não calculado" e a função devolve `faltando: ['custoOciosidadeHora', …]` (a tela já avisa "o que falta"; mantenha esse comportamento). `impacto` total só soma parcelas informadas e vem com `parcial: true` se faltar alguma.
- Se o código atual usar fórmulas diferentes para capacidade/custo operacional, **mantenha as atuais e só troque a base de tempo**; anote em "Divergências".
- Rótulo novo: **"Custo de oportunidade (estimado)"**, no lugar de "custo de parada". Texto de apoio: "só é perda real se havia demanda".

## 7. Casos de teste (fuso `America/Sao_Paulo` = UTC−3; turno seg 07–12 e 13–17)

Nas contas, faça os testes no console do navegador (ou numa página de teste) e confira:

**T1 — régua básica.** Período: segunda 05/10/2026 00:00 → terça 00:00 (local). `agora` = 06/10/2026 12:00Z. Eventos (UTC): 04/10 23:00 INATIVO · 05/10 10:00 ATIVO · 12:00 EM_ESPERA · 12:30 ATIVO · 15:00 INATIVO · 16:00 ATIVO · 20:30 EM_ESPERA · 21:00 INATIVO.
Esperado: programado 9 h; ativoDentro 8 h30; espera 30 min; inativo 0; **horasExtras 30 min**; denominador 9 h30; **disponibilidadeOEE ≈ 94,74 %**; maquinaLigada 100 %; **execuções 3** (todas dentro); tempo médio 3 h; paradas 0; maior período sem produzir 30 min; cobertura 100 %.

**T2 — dia desconsiderado.** Período: terça 06/10 (local, dia inteiro). `agora` = 07/10 12:00Z. Eventos: 05/10 20:00Z INATIVO e mais nada.
Esperado: `diasDesconsiderados = ['2026-10-06']`; programado 0; disponibilidadeOEE `null`; paradas 0.

**T3 — dia ainda não encerrado.** Igual ao T2, mas `agora` = 06/10 13:00Z (10:00 local).
Esperado: nenhum dia desconsiderado; inativo 3 h (10:00Z–13:00Z); disponibilidadeOEE 0 %.

**T4 — execuções.** Período: 05/10 local. Eventos: 05/10 02:00Z ATIVO · 10:00Z EM_ESPERA · 10:30:00Z ATIVO · 10:30:05Z EM_ESPERA · 11:00:00Z ATIVO · 11:20Z EM_ESPERA.
Esperado: **execuções 1** (o ATIVO que veio de antes não conta; o de 5 s fica abaixo do mínimo); tempo médio 20 min.

**T5 — SEM_SINAL transparente.** Eventos: 10:00Z ATIVO · 11:00Z SEM_SINAL · 11:30Z ATIVO · 12:30Z EM_ESPERA.
Esperado: **execuções 1**; tempoSemSinal 30 min (fora do denominador); duração da execução 2 h.

**T6 — status desconhecido.** Evento com status `FOO` → ignorado; `avisos.statusDesconhecidos = { FOO: 1 }`.

**T7 — sem horário.** `config.horarios = []` → 24 h corridas, `semHorarioCadastrado: true`.

**T8 — fuso.** Navegador em UTC às 01:00Z de 06/10; `periodoPreset('hoje', agora, 'America/Sao_Paulo')` → início = 05/10 03:00Z.

**T9 — frescor.** `ultimoSinalEm` = 12:00Z, `agora` = 12:10Z, último bloco ATIVO → o trecho depois de 12:05Z vira SEM_SINAL. Com `ultimoSinalEm = null` → nada muda.

**T10 — total ponderado.** Duas máquinas, uma com 50 % e 3 h, outra com 100 % e 1 h → total = (1,5 + 1) ÷ 4 = 62,5 %, e não 75 %.

## 8. Como o usuário testa
1. Troque o `metrics.js`, abra o site com `?demo=1`, abra o console (F12) e rode as chamadas dos testes T1–T10 (a IA deve entregar um **bloco de console pronto para colar** que imprime ✔/✘ para cada teste).
2. Abra o site sem `?demo=1`: Dashboard e Relatórios continuam abrindo (os números mudam porque agora usam o turno).

## 9. Critérios de aceite
- [ ] T1–T10 passam.
- [ ] Nenhuma função devolve `NaN`/`Infinity`.
- [ ] Nenhum horário depende do fuso do navegador.
- [ ] Nomes de funções existentes que não aparecem aqui continuam funcionando.
- [ ] Constantes só em `CONFIG_METRICAS`.

## 10. Fora do escopo
Telas, textos de tela e gráficos (ESPEC 05 e 06); leitura/gravação da configuração (ESPEC 03).
