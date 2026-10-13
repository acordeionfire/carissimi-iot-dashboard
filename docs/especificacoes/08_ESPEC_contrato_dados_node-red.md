# ESPEC 08 — CONTRATO DE DADOS (CLP → MQTT → Node-RED → Supabase) e FLUXO NODE-RED

**Objetivo:** definir (1) o **contrato de dados** que a equipe de automação, o Node-RED e o site precisam seguir e (2) o **fluxo Node-RED** que traduz os sinais do CLP nos status do projeto, grava no Supabase e vigia o sinal periódico.

**Status:** o Node-RED é **sugestão do professor, em avaliação** (CONTEXTO v10.1, item I). Esta especificação vale se for adotado. O contrato (parte A) vale de qualquer forma.
**Você entrega (parte B):** o fluxo exportado (`flows.json`), um `LEIA-ME` de instalação e teste para iniciante e a versão ajustada de `painel-teste-mqtt.html` (seção D). Leia as ESPEC 00 e 01.

## A. CONTRATO DE DADOS

### A1. Broker e tópicos (por equipamento; hoje `torno01`)
Broker HiveMQ Cloud privado (host e portas estão no CONTEXTO v10.1; **senhas nunca entram em arquivo, e-mail ou Git**). Cada cliente usa o seu usuário:

| Cliente | Usuário | Porta | Pode |
|---|---|---|---|
| CLP LOGO! 8.4 | `carissimi-clp` | 8883 (MQTT/TLS) | publicar `…/raw` e `…/heartbeat` |
| Node-RED | **novo** `carissimi-nodered` | 8883 (MQTT/TLS) | assinar `carissimi/+/raw`, `…/heartbeat`, `…/status` |
| Painel de teste (navegador) | `carissimi-app` | 8884 (WSS, `/mqtt`) | publicar mensagens simuladas |

| Tópico | Quem publica | Conteúdo |
|---|---|---|
| `carissimi/<tag>/raw` | CLP | **Sinais brutos** (A2) |
| `carissimi/<tag>/heartbeat` | CLP | Sinal periódico de vida (A3) |
| `carissimi/<tag>/status` | (legado) | `{"status":"ativo\|espera\|inativo"}` já traduzido. Node-RED **aceita** (compatibilidade com o painel de teste atual) |

`<tag>` é o nome curto da máquina (`torno01`). O Node-RED mantém uma **tabela de mapeamento** `tag → equipamento_id, empresa_id` (hoje `torno01 → 1, 1`), num nó de configuração fácil de editar. Quando houver várias máquinas, uma coluna `tag_mqtt` em `equipamentos` poderá substituir a tabela (2ª fase).
O Node-RED **não** republica status no MQTT: o site recebe tudo pelo Realtime do Supabase.

### A2. Sinais brutos (PROPOSTA — a equipe de automação confirma quais sinais físicos existem)
Mensagem em JSON, qualquer chave ausente = "desconhecido":
```json
{ "ligada": 1, "operando": 0 }
```
Aceitar `1/0`, `true/false`, `"1"/"0"`, `"on"/"off"`. **Tabela de tradução (proposta):**

| ligada | operando | Status | Observação |
|---|---|---|---|
| 0 | 0 | `INATIVO` | desligada |
| 1 | 0 | `EM_ESPERA` | ligada, sem operar (inclui espera, preparação, troca de peça) |
| 1 | 1 | `ATIVO` | ligada e operando |
| 0 | 1 | — | **combinação inválida**: descartar, registrar no log, manter o status anterior |

**Pendências da automação (CONTEXTO v10.1):** quais entradas/saídas do LOGO! viram `ligada` e `operando` (ex.: energização do painel; sinal de "ciclo em execução"/corrente do eixo-árvore) e como o LOGO! monta essa mensagem. Se a mensagem real for diferente, **só a tabela de tradução e o nó de leitura mudam**; o resto do contrato permanece.

### A3. Sinal periódico (heartbeat)
- O CLP publica em `…/heartbeat` a cada **~60 s**: `{"ts":"2026-10-05T13:00:00Z"}` (o `ts` é opcional; o relógio do LOGO! pode não ser confiável — o Node-RED usa a **hora de recebimento**).
- **Qualquer** mensagem recebida (raw, status ou heartbeat) conta como "sinal".
- O heartbeat **nunca** cria linha em `historico_status`. Só atualiza `equipamentos.ultimo_sinal_em`.

### A4. Gravação no Supabase (REST)
Cabeçalhos: `apikey` e `Authorization: Bearer <chave>`, `Content-Type: application/json`, `Prefer: return=minimal`. A **chave de serviço (service_role)** fica **somente nas credenciais do Node-RED**; nunca no navegador, no Git ou no fluxo exportado.

| Situação | Chamada |
|---|---|
| Mudança de status | 1) `POST /rest/v1/historico_status` `{equipamento_id, empresa_id, status, registrado_em, sinais_brutos}` 2) `PATCH /rest/v1/equipamentos?id=eq.<id>` `{status_atual, atualizado_em, ultimo_sinal_em}` |
| Heartbeat / sinal sem mudança | `PATCH /rest/v1/equipamentos?id=eq.<id>` `{ultimo_sinal_em}` — **no máximo 1 por 30 s por máquina** |
| SEM_SINAL | `POST historico_status` com `status:'SEM_SINAL'` e depois `PATCH` com `status_atual:'SEM_SINAL'` |

- `registrado_em` é **sempre enviado explicitamente**, em UTC ISO-8601 (`2026-10-05T13:00:00.123Z`), com a hora em que o Node-RED recebeu o sinal. Assim, reenvio após queda de internet não distorce durações.
- `sinais_brutos` guarda o JSON recebido (ou `null`).

## B. FLUXO NODE-RED (requisitos)

1. **Entrada:** nós MQTT in (TLS, porta 8883) para `carissimi/+/raw`, `…/heartbeat`, `…/status`. Reconexão automática.
2. **Tradução:** aplica a tabela A2 (ou aceita o legado `status`, normalizando `ativo/espera/inativo` para `ATIVO/EM_ESPERA/INATIVO`; valor desconhecido → log + descarte).
3. **Estabilidade (debounce):** só confirma uma mudança se o novo status se mantiver por **2 s** (parâmetro editável). Isso filtra ruído elétrico. **Não** é o mínimo de execução do site (10 s), que é outra regra.
4. **Deduplicação:** só grava em `historico_status` quando `status ≠ último status gravado` daquela máquina. O último status fica em contexto do fluxo e, **ao iniciar**, é lido de `equipamentos.status_atual`.
5. **Watchdog / SEM_SINAL:** se passar **3 min** sem **nenhum** sinal de uma máquina, grava um evento `SEM_SINAL` com `registrado_em` = **hora do último sinal** e marca `status_atual = 'SEM_SINAL'`. Quando o sinal voltar, grava o **primeiro status válido como novo evento mesmo que seja igual ao anterior** (o site ignora `SEM_SINAL` ao contar execuções). Ao iniciar o Node-RED, o watchdog começa a contar do zero.
6. **Fila e reenvio:** se o Supabase falhar (rede/5xx/timeout), os registros entram numa **fila por máquina** (ordem preservada) com novas tentativas após 5 s, 15 s, 60 s, depois a cada 5 min; fila limitada a 1000 itens; erros 4xx (dado inválido) vão para o log e **não** travam a fila. Limitação aceita nesta fase: a fila é em memória (se o Node-RED reiniciar, perde-se o que estava na fila); registrar no `LEIA-ME` como evolução (armazenamento em arquivo).
7. **Ordem de gravação:** `historico_status` antes de `equipamentos`.
8. **Sem lógica de negócio:** nada de régua de turno, execuções ou indicadores no Node-RED (isso é do `metrics.js`).
9. **Segurança:** editor do Node-RED com senha (`adminAuth`), acessível só em `localhost` (ou rede local protegida), **nunca exposto à internet**; credenciais (broker e Supabase) no armazenamento de credenciais do Node-RED, fora do `flows.json`; nenhuma porta aberta no roteador.
10. **Onde roda (decisão pendente com o professor):** um PC já existente e **sempre ligado** (rodar como serviço, com reinício automático) **ou** uma hospedagem gratuita na nuvem (conferir os limites atuais do plano). A especificação não depende da escolha; o `LEIA-ME` descreve pelo menos o caso "PC Windows/Linux com Node.js LTS".
11. **Relógio:** o computador que roda o Node-RED deve ter a hora sincronizada (NTP).
12. **Observabilidade:** nó `debug` ligado ao log de: mudanças gravadas, descartes, SEM_SINAL, falhas e reenvios (um texto por linha, em português).

## C. Casos de teste de aceite (publicar mensagens com um cliente MQTT, ex.: o painel de teste ou o cliente web da HiveMQ)

| # | Ação | Esperado no Supabase |
|---|---|---|
| A1 | `…/raw` `{"ligada":1,"operando":1}` | 1 linha `ATIVO` em `historico_status`; `status_atual='ATIVO'`; `ultimo_sinal_em` atualizado |
| A2 | Repetir a mesma mensagem 5 vezes | **Nenhuma** linha nova; só `ultimo_sinal_em` (no máx. 1 por 30 s) |
| A3 | `{"ligada":1,"operando":0}` | 1 linha `EM_ESPERA` |
| A4 | `{"ligada":0,"operando":0}` | 1 linha `INATIVO` |
| A5 | `{"ligada":0,"operando":1}` | **Descartada**, aparece no log; nada novo no banco |
| A6 | Alternar ATIVO→EM_ESPERA→ATIVO em menos de 2 s | Nenhuma linha (debounce) |
| A7 | Heartbeat a cada minuto por 10 min | Zero linhas novas em `historico_status`; `ultimo_sinal_em` avançando |
| A8 | Parar de enviar tudo por 4 min | 1 linha `SEM_SINAL` com `registrado_em` ≈ hora do último sinal; `status_atual='SEM_SINAL'` |
| A9 | Voltar a enviar `ATIVO` (igual ao de antes da queda) | 1 linha **nova** `ATIVO` (mesmo sendo igual ao anterior ao SEM_SINAL) |
| A10 | Tirar a internet do Node-RED, gerar 3 mudanças, religar | As 3 linhas chegam **em ordem**, com os horários **originais** |
| A11 | Legado `…/status` `{"status":"ativo"}` | Mesmo efeito de A1 |
| A12 | Payload inválido (`{"x":1}`, texto solto) | Log e descarte; sem exceção |
| A13 | Reiniciar o Node-RED com a máquina em ATIVO e reenviar ATIVO | **Nenhuma** linha duplicada (último status lido do banco) |
| A14 | Conferir o editor | Pede senha; não responde de outro computador da rede (ou só da rede local, conforme decidido) |

## D. Ajuste no `painel-teste-mqtt.html` (para não gravar em duplicidade)
Quando o Node-RED estiver ativo, **só ele grava no banco**. Entregue uma versão em que: (a) os botões **publicam o formato bruto** (`{"ligada":…,"operando":…}`) em `…/raw` e um botão "enviar heartbeat" em `…/heartbeat`; (b) a gravação direta no Supabase fica **desligada por padrão**, com uma chave "Gravar direto no Supabase (modo antigo)" visível e desmarcada; (c) o restante (Paho MQTT, luz piloto) não muda. Mantenha o aviso sobre o campo "Usuário" vir vazio (o texto cinza é só exemplo).

## E. Entregáveis e como o usuário testa
1. `flows.json` + `LEIA-ME` (instalação do Node.js e do Node-RED, como importar o fluxo, onde colocar as credenciais, como iniciar como serviço, como parar).
2. `painel-teste-mqtt.html` ajustado.
3. Passo a passo: instalar → importar → configurar credenciais → rodar A1–A14 conferindo no Supabase (Table Editor → `historico_status` e `equipamentos`).

## F. Critérios de aceite
- [ ] A1–A14 passam.
- [ ] Nenhuma senha/chave aparece no `flows.json`, no `LEIA-ME` ou no HTML.
- [ ] Nenhuma lógica de indicador no Node-RED.
- [ ] O painel de teste não grava em duplicidade por padrão.

## G. Perguntas ainda em aberto (não bloqueiam o início)
Sinais físicos reais do LOGO! (A2) · onde o Node-RED roda 24/7 (B10) · se o professor exige alguma versão/estrutura específica do fluxo.
