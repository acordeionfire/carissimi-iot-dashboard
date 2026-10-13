# ESPEC 00 — BASE (todas as IAs seguem este documento)

Projeto: **CARISSIMI IoT** (um R só) — monitoramento de tornos CNC. Fonte da verdade: `CONTEXTO_DO_PROJETO_INDUSTRIA_4_0_v10.1.txt`. Se esta especificação divergir do CONTEXTO v10.1, vale o CONTEXTO e você avisa o usuário.

## 1. Regras gerais para quem implementa

1. **Pilha fixa:** HTML + CSS + JavaScript puro (sem framework, sem build, sem npm no site). Bibliotecas só por CDN: `supabase-js@2` e `chart.js@4.4.7` (jsdelivr). Não trocar de pilha.
2. **Entregue arquivos COMPLETOS**, prontos para colar no lugar do arquivo antigo. Nunca entregue trechos soltos.
3. **Só toque nos arquivos da sua especificação.** Não renomeie arquivos, funções ou variáveis existentes que a especificação não cite. Se precisar de algo fora do seu escopo, escreva em "Pedidos para outras especificações" no fim da resposta.
4. **Nunca substitua `js/supabaseClient.js`.** O usuário mantém o dele preenchido (URL base + chave anon).
5. **Antes de codar, leia os arquivos atuais** que o usuário anexar. Se o código atual contradisser a especificação, **não adivinhe**: liste em "Divergências encontradas" e siga a especificação, a menos que ela peça o contrário.
6. **O usuário é iniciante em programação.** Comente o código em português, de forma simples. No fim, dê **passo a passo de teste** (onde clicar, o que colar, o que deve aparecer), incluindo `?demo=1` e o banco real.
7. **Identidade visual:** siga `Diretriz_de_identidade-visual-carissimi-iot.md` (cores, tipografia, componentes). Não invente estilos novos se já existir um componente equivalente.
8. **Idioma da tela e dos comentários:** português do Brasil. Números no formato pt-BR (vírgula decimal, R$, `dd/mm/aaaa`, 24 h).
9. **Segurança básica (mesmo sem login):** todo texto vindo do banco (nomes) é escapado antes de ir para a tela; nada de `innerHTML` com dado do banco sem escape.
10. **Erros visíveis:** falha de rede ou de banco nunca deixa a tela em branco. Mostrar aviso claro e, quando possível, continuar com o que já foi carregado.

## 2. Status (definições fechadas em 05/10/2026)

| Status | Significado | No cálculo |
|---|---|---|
| `ATIVO` | Ligada e operando | Tempo produzindo |
| `EM_ESPERA` | Ligada, sem operar (espera, preparação, troca de peça; inclui o antigo "setup") | Perda: ociosidade/setup |
| `INATIVO` | Desligada | Perda dentro do expediente; fora do expediente é ignorado |
| `SEM_SINAL` | **Técnico**: sem comunicação do CLP/Node-RED | Fora do cálculo; só aviso |

Não existem `SETUP` nem `DESLIGADO`. Texto na tela: "ATIVO", "ESPERA", "INATIVO", "SEM SINAL". `normalizarStatus()` aceita variações (`ativo`, `em espera`, `EM-ESPERA`…) e devolve o nome canônico acima; valor desconhecido devolve `null` e **gera aviso** (nunca é ignorado em silêncio).

## 3. Modelo de dados (depois da migração da ESPEC 01)

- `empresas`: `id`, `razao_social`, `nome_fantasia`, `cnpj`, `criado_em` + **novos**: `fuso_horario` (texto IANA, padrão `America/Sao_Paulo`), `custo_ociosidade_hora`, `custo_oportunidade_hora`, `valor_capacidade_hora`, `custo_operacional_hora` (R$/h, podem ser nulos = "não informado"), `pecas_por_execucao` (opcional, padrão 1).
- `horarios_funcionamento` (**nova**): `id`, `empresa_id`, `dia_semana` (0=domingo … 6=sábado), `hora_inicio`, `hora_fim` (`time`; `24:00` permitido), `criado_em`. Uma linha por faixa; vários por dia.
- `equipamentos`: `id`, `empresa_id`, `nome`, `modelo`, `status_atual`, `atualizado_em` + **novo** `ultimo_sinal_em` (`timestamptz`, nulo enquanto não houver sinal periódico).
- `historico_status`: `id`, `equipamento_id`, `empresa_id`, `status`, `registrado_em` (`timestamptz`, UTC) + **novo** `sinais_brutos` (`jsonb`, opcional).
- Função `salvar_horarios(p_empresa_id bigint, p_horarios jsonb)`: apaga e regrava o turno da empresa numa transação.

Convenção de tempo: **o banco guarda UTC. Toda conta de "dia", "hora", "turno", "Hoje", "Mês atual" usa o fuso da empresa** (`Intl.DateTimeFormat` com `timeZone`), nunca o fuso do navegador.

## 4. Conceitos de cálculo (resumo; o detalhe está na ESPEC 02)

- **Bloco:** intervalo `[inicio, fim)` em que um equipamento ficou num status (do evento até o próximo; o último vale até "agora").
- **Faixa:** intervalo de turno da empresa (UTC) vindo de `horarios_funcionamento`.
- **Régua do turno:** dentro da faixa conta tudo; fora, só `ATIVO` com pelo menos 5 min contínuos (hora extra). `EM_ESPERA`/`INATIVO` fora da faixa são ignorados.
- **Dia desconsiderado:** dia com turno, já encerrado, em que **nenhuma** máquina da empresa teve `ATIVO` nem `EM_ESPERA`. Sai do cálculo e a tela avisa.
- **Disponibilidade (OEE)** = ATIVO total ÷ (tempo monitorado dentro do turno + ATIVO fora do turno). (Antes chamada "Utilização".)
- **Máquina ligada** = (ATIVO total + EM_ESPERA dentro do turno) ÷ mesmo denominador. (Antes chamada "Disponibilidade".)
- **Execução:** mudança para `ATIVO`. O contador mostra **"Execuções"**, nunca "peças".
- O sistema cobre **só a Disponibilidade** do OEE. Nunca chamar de "OEE completo". Performance e Qualidade são trabalho futuro.

## 5. Constantes (ficam num único objeto `CONFIG_METRICAS` no topo de `js/metrics.js`)

| Constante | Valor inicial | Uso |
|---|---|---|
| `MIN_HORA_EXTRA_MS` | 5 min | ATIVO contínuo fora do turno só conta como hora extra a partir disso |
| `MIN_EXECUCAO_S` | 10 s | Execução mais curta que isso não conta (validar com a automação) |
| `TOLERANCIA_SEM_SINAL_MS` | 5 min | Passou disso sem sinal → SEM_SINAL (só quando `ultimo_sinal_em` existe) |
| `LIMITES` dos alertas | os atuais | Continuam em `js/dashboard.js` |

## 6. Mapa das especificações

| # | Especificação | Arquivos | Depende de |
|---|---|---|---|
| 01 | Banco | `migracao_v10.sql` (+ conferência e dados de teste) | — |
| 02 | Cálculos | `js/metrics.js` | 00, 01 |
| 03 | Configuração da empresa | `js/configEmpresa.js` (novo) | 00, 01 |
| 04 | Tela de Configurações | `configuracoes.html`, `js/configuracoes.js` (novos) | 02, 03 |
| 05 | Dashboard | `index.html`, `js/dashboard.js` | 02, 03 |
| 06 | Relatórios | `relatorios.html`, `js/relatorios.js` | 02, 03 |
| 07 | Dados de demonstração | `js/demoData.js` | 02, 03 |
| 08 | Contrato de dados + Node-RED | fora do site | 00, 01 |

**Ordem:** 01 → (02, 03, 08 em paralelo) → (04, 05, 06, 07). As specs 02, 03 e 04–07 usam as **funções e formatos definidos na ESPEC 02 e 03**: ninguém muda nomes ou formatos por conta própria.

**Regra de convivência no código:** a ordem das tags `<script>` nas páginas é `supabaseClient.js` → `configEmpresa.js` → `metrics.js` → (`demoData.js` se existir) → script da página.

## 7. Modelo de prompt para colar na IA implementadora

> Você vai implementar a **ESPEC NN** do projeto CARISSIMI IoT. Anexei: `CONTEXTO_DO_PROJETO_INDUSTRIA_4_0_v10.1.txt`, `00_ESPEC_BASE.md`, `NN_ESPEC_….md`, a `Diretriz_de_identidade-visual-carissimi-iot.md` e os arquivos atuais que você vai alterar. Siga as "Regras gerais" da ESPEC 00. Entregue os arquivos **completos**, uma seção "Divergências encontradas" (se houver), uma seção "Pedidos para outras especificações" (se houver) e o **passo a passo de teste para iniciante**. Não altere nada fora do escopo da ESPEC NN.

## 8. Fora do escopo desta rodada (2ª fase)

Login, RLS por empresa, cadastro de empresa e de equipamento, calendário de exceções (feriados), motivo da parada, Performance e Qualidade do OEE.
