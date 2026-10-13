# AGENTS.md — CARISSIMI IoT (leia SEMPRE antes de qualquer tarefa)

Projeto: site de monitoramento de tornos CNC (HTML + CSS + JavaScript puro, Supabase). A marca se escreve **CARISSIMI** (um R só). O usuário é **iniciante em programação**: explique em português simples e sem jargão.

## Onde estão as regras (ordem de prioridade se houver conflito)
1. `docs/CONTEXTO_DO_PROJETO_INDUSTRIA_4_0_v10.1.txt` — fonte da verdade.
2. `docs/PLANO_DE_EXECUCAO.md` — etapas, regras desta rodada e prompts. **Vale mais que as ESPEC.**
3. `docs/especificacoes/NN_ESPEC_*.md` — especificação de cada arquivo (a `00_ESPEC_BASE.md` vale para todas).
4. `docs/Diretriz_de_identidade-visual-carissimi-iot.md` — identidade visual.
Se achar contradição entre eles, **pare e pergunte**; não escolha sozinho.

## 1. Identidade visual (OBRIGATÓRIA em toda tela)
- **Não redesenhe nada.** Telas existentes devem continuar com a mesma aparência. Reaproveite os componentes da Diretriz (`.painel`, `.kpi` com `.anel`, `.maquina`, `.alerta`, `.aviso`, `.tabela-rolagem`, `<dialog class="dialogo">`…). A tabela "componente por elemento" está no PLANO.
- Toda cor vem de variável `:root`; nada de hex solto.
- Estilo novo: só **acrescentar no fim do `style.css`**, com comentário de seção e prefixo (`cfg-`, `dash-`, `rel-`). **Nunca alterar nem apagar** regra existente.
- Se uma tela já existente mudar de aparência sem que a etapa peça, **desfaça**.

## 2. Contrato entre arquivos (evita "X is not a function")
- Antes de mexer em qualquer `.js`, leia `docs/INVENTARIO_FUNCOES.md` (criado na Etapa 0). Se ele não existir, **faça a Etapa 0 primeiro**.
- **Nunca remova nem renomeie** função, constante ou propriedade pública que o inventário liste. Se precisar mudar o nome, mantenha o antigo como alias.
- Ao terminar: liste todo membro de `Metrics` (e de `ConfigEmpresa`) que os arquivos `.js` e `.html` chamam, **inclusive via alias** (ex.: `const M = window.Metrics`), e confirme que **todos existem**. Entregue essa conferência no relatório final.

## 3. Escopo
- Altere **somente os arquivos que a etapa permite**. Nunca toque em `js/supabaseClient.js`.
- **Edite os arquivos no lugar**; não crie cópias nem versões novas.
- **Não implemente nada opcional** (blocos "O1", "opcional", "se aprovado") a menos que o usuário escreva **APROVADO:** e o nome do item. Hoje **nenhum opcional está aprovado** (inclui "peças estimadas").
- Não instale pacotes, não crie build, não troque a pilha. Bibliotecas só por CDN: `supabase-js@2` e `chart.js@4.4.7`.
- Nada de `localStorage` para configuração da empresa.

## 4. Segurança
- Nenhuma chave `service_role`, senha do Supabase ou do HiveMQ em arquivo, no chat ou no Git.
- Todo texto vindo do banco é escapado antes de ir para a tela.
- Peça confirmação antes de executar comandos no terminal; nunca rode comandos que apaguem dados.

## 5. Qualidade
- Comentários em português, simples. Falha de rede nunca deixa a tela em branco: mostre aviso.
- Números e datas em pt-BR; horários sempre no **fuso da empresa**, nunca no do navegador.
- Rode os casos de teste da ESPEC da etapa. Se algum falhar, **conserte antes de entregar**.
- Não faça `git commit` sozinho: sugira a mensagem.

## 6. Relatório final (sempre, nesta ordem)
1. **Arquivos alterados** (e o que mudou em cada um, em 1 linha).
2. **Testes**: lista dos casos da ESPEC com ✔/✘.
3. **Conferência de contrato** (seção 2).
4. **Divergências encontradas** entre ESPEC e código (se houver).
5. **Passo a passo de teste para iniciante** (onde clicar e o que deve aparecer; `?demo=1` e banco real).
6. **Mensagem de commit sugerida.**
