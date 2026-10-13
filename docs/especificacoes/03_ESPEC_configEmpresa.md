# ESPEC 03 — CONFIGURAÇÃO DA EMPRESA (`js/configEmpresa.js`, arquivo NOVO)

**Objetivo:** um único lugar que **lê e grava** o turno, o fuso e os valores em R$ no Supabase. Dashboard, Relatórios e a tela de Configurações usam este arquivo. Ninguém mais fala direto com `horarios_funcionamento` nem com as colunas novas de `empresas`.

**Você cria:** `js/configEmpresa.js`. **Não altere** outros arquivos. Leia a ESPEC 00 e o formato `Config` da ESPEC 02.

## 1. Funções públicas (expostas em `window.ConfigEmpresa`)

| Função | Faz |
|---|---|
| `obterEmpresaAtual(supabase)` | Retorna a **primeira empresa** (menor `id`), como as telas já fazem hoje. Devolve `{ id, razao_social, nome_fantasia, cnpj }` ou `null`. (Quando existir login, só esta função muda.) |
| `carregarConfig(supabase, empresaId)` | Lê `empresas` (fuso + 5 valores) e `horarios_funcionamento`. Devolve um `Config` (ESPEC 02). |
| `salvarFinanceiro(supabase, empresaId, financeiro)` | `update` em `empresas`. Campo vazio vira `null`. |
| `salvarFuso(supabase, empresaId, fuso)` | `update empresas set fuso_horario`. |
| `salvarHorarios(supabase, empresaId, horarios)` | Valida (abaixo) e chama `supabase.rpc('salvar_horarios', { p_empresa_id, p_horarios })`. |
| `validarHorarios(horarios)` | `{ ok: boolean, erros: string[], horariosNormalizados }` |
| `configPadrao()` | `Config` vazio: `fuso 'America/Sao_Paulo'`, `horarios []`, valores `null`. Usado quando a leitura falha. |
| `FUSOS_BRASIL` | Lista fixa para a tela: `America/Sao_Paulo`, `America/Manaus`, `America/Cuiaba`, `America/Campo_Grande`, `America/Belem`, `America/Fortaleza`, `America/Recife`, `America/Bahia`, `America/Porto_Velho`, `America/Rio_Branco`, `America/Noronha`. |

Retornos: todas as funções assíncronas devolvem `{ ok: true, dados }` ou `{ ok: false, erro: 'mensagem em português' }`. **Nunca lançam exceção para fora.**

## 2. Regras

1. **Formato de entrada/saída dos horários:** `[{ diaSemana: 0..6, inicio: 'HH:MM', fim: 'HH:MM' }]`. Na gravação converta para `{ dia_semana, hora_inicio, hora_fim }` (a RPC espera esses nomes). Na leitura, converta `time` do banco (`07:00:00`) para `'07:00'`; `24:00:00` → `'24:00'`.
2. **Validação (`validarHorarios`):**
   - `diaSemana` inteiro de 0 a 6; `inicio`/`fim` no formato `HH:MM` (`fim` pode ser `24:00`, `inicio` não);
   - `fim > inicio`;
   - faixas do mesmo dia **não podem se sobrepor** (erro com mensagem: "Segunda: 07:00–12:00 e 11:00–13:00 se sobrepõem"). Faixas que apenas se tocam (12:00–13:00 e 13:00–17:00) são aceitas;
   - lista vazia é **válida** (significa "sem horário": o sistema usa 24 h e mostra aviso).
   - Ordene por dia e início ao normalizar.
3. **Financeiro:** aceita número ou `null`. Texto vazio/`undefined`/`NaN` → `null`. Negativo → erro "valor não pode ser negativo". `pecasPorExecucao` deve ser > 0 (padrão 1). Arredonde a 2 casas.
4. **Fuso:** se o fuso salvo no banco for inválido (o `Intl` lança `RangeError`), `carregarConfig` troca por `America/Sao_Paulo` e devolve `aviso: 'Fuso inválido; usando America/Sao_Paulo'`.
5. **Falha de rede/banco:** `carregarConfig` devolve `{ ok: false, erro, dados: configPadrao() }` para a tela poder seguir com o padrão e avisar.
6. **Sem `localStorage`** para estes dados. O valor antigo salvo no navegador **é ignorado** (não migrar).
7. **Modo demo (`?demo=1`):** `carregarConfig` devolve `DEMO_CONFIG` (definido na ESPEC 07) sem tocar no banco, e as funções `salvar*` devolvem `{ ok: false, erro: 'Modo demonstração: nada é salvo.' }`.
8. Cache simples em memória por página (um `Config` por `empresaId`), com `limparCache()` exposta. Depois de qualquer `salvar*` com sucesso, invalide o cache.

## 3. Casos de teste (console)

| # | Entrada | Esperado |
|---|---|---|
| T1 | `validarHorarios([{diaSemana:1,inicio:'07:00',fim:'12:00'},{diaSemana:1,inicio:'13:00',fim:'17:00'}])` | `ok: true` |
| T2 | faixas `07:00–12:00` e `11:00–13:00` no mesmo dia | `ok: false`, erro cita "se sobrepõem" |
| T3 | `fim` = `06:00`, `inicio` = `07:00` | `ok: false` |
| T4 | `fim: '24:00'` | `ok: true` |
| T5 | `inicio: '24:00'` | `ok: false` |
| T6 | `diaSemana: 7` | `ok: false` |
| T7 | `[]` | `ok: true` |
| T8 | financeiro `{custoOciosidadeHora: '', valorCapacidadeHora: 120.456}` | `custoOciosidadeHora: null`, `valorCapacidadeHora: 120.46` |
| T9 | financeiro com `-1` | erro de negativo |
| T10 | `salvarHorarios` com turno válido e depois `carregarConfig` | volta exatamente o mesmo turno, ordenado |
| T11 | Desligar a internet e chamar `carregarConfig` | `ok:false` + `dados` = `configPadrao()`, sem exceção |

## 4. Como o usuário testa
1. Colocar `configEmpresa.js` na pasta `js/` e incluir `<script src="js/configEmpresa.js"></script>` **temporariamente** no `index.html` (depois do `supabaseClient.js`) — as ESPEC 04–06 já trazem essa linha definitiva.
2. No console (F12): `ConfigEmpresa.carregarConfig(window.supabaseClient, 1).then(console.log)` → deve mostrar o turno da Carissimi (10 faixas) e `fuso: 'America/Sao_Paulo'`.
3. Rodar os testes T1–T11 (a IA entrega o bloco de console pronto).

## 5. Critérios de aceite
- [ ] T1–T11 passam.
- [ ] Nenhuma função lança exceção para o chamador.
- [ ] Nada de `localStorage`.
- [ ] Nomes `{ dia_semana, hora_inicio, hora_fim }` só aparecem dentro deste arquivo.
