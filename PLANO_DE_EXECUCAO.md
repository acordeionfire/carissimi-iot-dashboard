# PLANO DE EXECUÇÃO — CARISSIMI IoT (v10.1)

**Como usar (1 minuto por etapa):**
1. Abra o projeto no Antigravity (todos os arquivos já estão no workspace; **não precisa anexar nada**).
2. Abra uma conversa nova com o agente e cole o **prompt da etapa** (fica em cada etapa abaixo).
3. Quando ele terminar, abra o site (Live Server), confira, compare com o visual anterior e **só então faça o commit**.
4. Uma etapa por vez. Nunca duas ao mesmo tempo.

Se uma etapa der errado: `git restore .` volta ao último commit.

## Regras desta rodada (valem em todas as etapas e SUBSTITUEM as ESPEC em caso de conflito)

1. **Identidade visual:** não redesenhar. Componentes por elemento:

| Elemento | Use | Diretriz |
|---|---|---|
| KPI percentual (Disponibilidade (OEE), Máquina ligada) | `.kpi` **com** `.anel` (`--p`, `--cor`) | 6.5 |
| KPI numérico (Execuções, Horas extras, Cobertura de dados) | `.kpi` **sem** anel, como "Equipamentos monitorados" | 6.5 |
| Faixas de aviso | `.aviso` / `#faixaAviso` | 6.15 |
| Alertas | `.alerta` | 6.9 |
| Cartão da máquina | `.maquina` (acrescentar linhas na estrutura existente) | 6.6 |
| Estado SEM SINAL | variação neutra/cinza do estado, seguindo a seção 2.3; se faltar cor, criar variável nova no `:root` | 2 |
| Linha do tempo | `.linha-tempo` | 6.7 |
| Financeiro | `.resposta`, `.fin-linha` | 6.10 |
| Tabelas | `.tabela-rolagem` | 6.13 |
| Janela "Configurar valores" | `<dialog class="dialogo">` | 6.14 |
| Tela Configurações | `.topo`, `.painel`, `.botao`, menu e pílula como nas outras páginas | 4, 5, 6 |

2. **Frases das ESPEC que mudam:** "entregue arquivos completos" → **edite no lugar**; "entregue o trecho de CSS separado" → **acrescente no fim do `style.css`** com comentário de seção e prefixo; "anexei os arquivos" → **eles já estão no workspace**.
3. **Opcionais não aprovados:** "peças estimadas" (O1) **não** é implementado. Nenhuma coluna `pecas_por_execucao` aparece na tela.
4. **Contrato de funções:** o `docs/INVENTARIO_FUNCOES.md` (Etapa 0) é a lista oficial do que existe. Nada que ele liste pode sumir ou mudar de nome.
5. **Compatibilidade durante a rodada:** enquanto as telas não forem atualizadas, o Dashboard e os Relatórios **antigos continuam abrindo sem erro** com o `metrics.js` novo.
6. **Nada de segredos** no workspace, no chat ou no Git.

---

## ETAPA 0 — Inventário (só leitura)
**Prompt:** `Execute a ETAPA 0 de docs/PLANO_DE_EXECUCAO.md. Siga o AGENTS.md. Não altere nenhum código.`
**Pode criar:** apenas `docs/INVENTARIO_FUNCOES.md`.
**O que fazer:** (a) listar **todas** as funções e constantes expostas por `js/metrics.js` (nome, parâmetros, o que devolve, em 1 linha); (b) para cada `.js` e `.html`, listar quais membros de `Metrics` e de outros objetos globais ele usa, **inclusive via alias** (ex.: `const M = window.Metrics`); (c) listar as classes CSS usadas hoje em KPIs, cartão de máquina, alertas, avisos, tabelas e janela; (d) listar chaves de `localStorage`.
**Aceite:** `git diff` mostra só o arquivo novo. **Você:** abra o arquivo e confira que cita `formatarData` e as demais funções de formatação.

## ETAPA 1 — Banco (você faz, sem agente)
Se a migração ainda não foi rodada: siga `docs/especificacoes/01_ESPEC_BANCO.md` (rodar `migracao_v10.sql` no Supabase e conferir). Se já rodou, pule.

## ETAPA 2 — Cálculos (`metrics.js`)
**Prompt:** `Execute a ETAPA 2 de docs/PLANO_DE_EXECUCAO.md, seguindo docs/especificacoes/02_ESPEC_metrics.md e o AGENTS.md.`
**Pode alterar:** `js/metrics.js`. **Pode criar:** `testes/testes_metrics.html` (página de teste fora do site: roda os casos T1–T10 e mostra ✔/✘).
**Atenção:** mantenha **todas** as funções do inventário (inclusive as de formatação) com o mesmo nome e a mesma assinatura.
**Aceite:** T1–T10 ✔; abra `index.html` e `relatorios.html` (versões antigas) e confirme que continuam funcionando sem erro no console (F12).

## ETAPA 3 — Configuração da empresa (`configEmpresa.js`)
**Prompt:** `Execute a ETAPA 3 de docs/PLANO_DE_EXECUCAO.md, seguindo docs/especificacoes/03_ESPEC_configEmpresa.md e o AGENTS.md.`
**Pode criar:** `js/configEmpresa.js` e `testes/testes_config.html` (casos T1–T9 de validação, que não precisam de banco).
**Aceite:** os testes puros ✔; no console, `ConfigEmpresa.carregarConfig(window.supabaseClient, 1)` mostra o turno da Carissimi (T10/T11 manuais).

## ETAPA 4 — Tela de Configurações
**Prompt:** `Execute a ETAPA 4 de docs/PLANO_DE_EXECUCAO.md, seguindo docs/especificacoes/04_ESPEC_tela_configuracoes.md, a Diretriz de identidade visual e o AGENTS.md.`
**Pode criar:** `configuracoes.html`, `js/configuracoes.js`. **Pode alterar:** `style.css` (só acrescentar) e, em `index.html` e `relatorios.html`, **somente** acrescentar o item de menu "Configurações" (se já existir, não mexa).
**Aceite:** T1–T9 da ESPEC 04; visual igual ao das outras páginas.

## ETAPA 5 — Dashboard
**Prompt:** `Execute a ETAPA 5 de docs/PLANO_DE_EXECUCAO.md, seguindo docs/especificacoes/05_ESPEC_dashboard.md, a Diretriz de identidade visual e o AGENTS.md. NÃO redesenhe: reaproveite os componentes existentes.`
**Pode alterar:** `index.html`, `js/dashboard.js`, `style.css` (só acrescentar).
**Aceite:** T1–T10 da ESPEC 05; **compare com o visual anterior**: anéis nos KPIs percentuais, mesma grade de 4 colunas, período destacado no cabeçalho.

## ETAPA 6 — Relatórios
**Prompt:** `Execute a ETAPA 6 de docs/PLANO_DE_EXECUCAO.md, seguindo docs/especificacoes/06_ESPEC_relatorios.md, a Diretriz de identidade visual e o AGENTS.md. NÃO redesenhe.`
**Pode alterar:** `relatorios.html`, `js/relatorios.js`, `style.css` (só acrescentar).
**Aceite:** T1–T9 da ESPEC 06; tela, CSV e PDF com os mesmos números.

## ETAPA 7 — Dados de demonstração
**Prompt:** `Execute a ETAPA 7 de docs/PLANO_DE_EXECUCAO.md, seguindo docs/especificacoes/07_ESPEC_demoData.md e o AGENTS.md.`
**Pode alterar:** `js/demoData.js`.
**Aceite:** `DemoData.verificar(new Date())` imprime só ✔; Dashboard e Relatórios com `?demo=1` mostram todos os cenários.

## ETAPA 8 — Node-RED (só depois da decisão do professor)
**Prompt:** `Execute a ETAPA 8 de docs/PLANO_DE_EXECUCAO.md, seguindo docs/especificacoes/08_ESPEC_contrato_dados_node-red.md e o AGENTS.md.`
**Pode criar:** pasta `nodered/` (fluxo, LEIA-ME). **Pode alterar:** `painel-teste-mqtt.html` (somente o descrito na ESPEC 08, seção D).
**Atenção:** nenhuma senha ou chave em arquivo.

---

## Se o agente desviar
- Visual mudou: `git restore index.html style.css` e repita a etapa com o aviso "NÃO redesenhe; use o `.kpi` com `.anel` da Diretriz 6.5".
- Erro "is not a function": mande `Compare os membros de Metrics chamados nos .js/.html com os exportados e corrija no metrics.js, sem renomear nas páginas.`
- Apareceu recurso que você não pediu: `Remova o que não está na etapa; os opcionais não foram aprovados.`
