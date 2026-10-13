# ESPEC 01 — BANCO DE DADOS (Supabase)

**Arquivos prontos (já testados num PostgreSQL local, inclusive rodando a migração duas vezes):**
`migracao_v10.sql` · `conferir_migracao_v10.sql` · `dados_de_teste_opcional.sql`

Esta especificação não precisa de IA: o SQL já está pronto. Ela explica o que ele faz e como rodar. Outra IA só precisa dela para **entender o modelo**.

## O que a migração faz

| Mudança | Para quê |
|---|---|
| `empresas.fuso_horario` | Calcular dia/hora/turno no horário da empresa (o banco guarda UTC) |
| `empresas.custo_*`, `valor_capacidade_hora` | Valores em R$/h salvos por empresa (hoje somem no navegador) |
| `empresas.pecas_por_execucao` | **Opcional**: estimar peças = execuções × este número (padrão 1) |
| tabela `horarios_funcionamento` | Turno por empresa; várias faixas por dia; `24:00` permitido |
| `equipamentos.ultimo_sinal_em` | Sinal periódico do CLP/Node-RED (nulo até existir) |
| `historico_status.sinais_brutos` | Guardar o sinal bruto do CLP (rastreabilidade) |
| índices em `historico_status` | Consultas por período mais rápidas |
| função `salvar_horarios` | Grava o turno inteiro de uma vez (tudo ou nada) |
| turno inicial da Carissimi | Seg–sex 07–12 e 13–17, **a confirmar** com a empresa |

Nada é apagado nem alterado nos dados existentes.

## Passo a passo (iniciante)

1. Supabase → seu projeto → **SQL Editor** → **New query**.
2. **Antes de tudo (checagem rápida):** cole e rode
   `select table_name, column_name, data_type from information_schema.columns where table_name in ('empresas','equipamentos','historico_status') and column_name in ('id','empresa_id','equipamento_id');`
   Os `id` devem ser numéricos (`integer` ou `bigint`). Se aparecer `uuid`, **pare** e avise: a migração precisa de ajuste.
3. Abra `migracao_v10.sql`, copie **tudo**, cole no editor, clique **Run**. Deve terminar com "Success".
4. Se as suas outras tabelas têm **RLS ligado**, rode também as 3 linhas comentadas no fim do arquivo (tire os `--`). Se não sabe, rode a conferência abaixo e teste a tela: se a tela de Configurações não conseguir salvar, é isso.
5. Abra `conferir_migracao_v10.sql` e rode **bloco por bloco**:
   - bloco 1 → 6 linhas; bloco 2 → 10 linhas (turno da Carissimi); bloco 3 → 2 linhas.
6. **(Opcional)** `dados_de_teste_opcional.sql`: **apaga o histórico do primeiro equipamento** e cria 14 dias úteis realistas (com hora extra e 1 dia sem atividade). Use para validar os cálculos e para a apresentação. Não use com dados reais.

## Valores esperados com os dados de teste opcionais (para validar a ESPEC 02)

Por dia útil normal: 4 execuções e cerca de 8h20 de ATIVO (2h15 + 2h25 + 1h55 + cerca de 1h50, com variação de poucos minutos por dia). O dia com hora extra termina às 18:00 (a última execução fica ATIVO 1 h a mais além das 17:00). Os horários são determinísticos: rodar o script de novo gera os mesmos minutos. Um dia útil (o 7º do intervalo) não tem **nenhum** evento: deve aparecer como **dia desconsiderado** (o estado INATIVO do dia anterior continua).

## Critérios de aceite

- [ ] Migração roda duas vezes sem erro.
- [ ] Os 3 blocos de conferência dão os resultados descritos.
- [ ] O site continua carregando Dashboard e Relatórios exatamente como antes.

## Fica para depois (2ª fase)

RLS por empresa (trocar as políticas abertas), tabela `excecoes_calendario`, coluna `tag_mqtt` em `equipamentos` (quando houver várias máquinas), restrição de valores em `status` (comentada no fim do SQL, para rodar depois que o Node-RED estiver estável).
