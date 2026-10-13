-- Rode DEPOIS da migração para conferir. Cada bloco deve dar o resultado descrito.

-- 1) Deve listar 6 linhas (as colunas novas de empresas):
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'empresas'
  and column_name in ('fuso_horario','custo_ociosidade_hora','custo_oportunidade_hora',
                      'valor_capacidade_hora','custo_operacional_hora','pecas_por_execucao')
order by column_name;

-- 2) Deve mostrar 10 linhas (seg–sex, 2 faixas por dia) para a Carissimi:
select dia_semana, hora_inicio, hora_fim
from public.horarios_funcionamento
order by empresa_id, dia_semana, hora_inicio;

-- 3) Deve listar ultimo_sinal_em e sinais_brutos (2 linhas):
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'equipamentos' and column_name = 'ultimo_sinal_em')
    or (table_name = 'historico_status' and column_name = 'sinais_brutos'));

-- 4) Teste da função (troque 1 pelo id da sua empresa). Deve voltar 10 linhas:
-- select public.salvar_horarios(1, (
--   select jsonb_agg(jsonb_build_object('dia_semana', dia_semana,
--          'hora_inicio', to_char(hora_inicio,'HH24:MI'), 'hora_fim', to_char(hora_fim,'HH24:MI')))
--   from public.horarios_funcionamento where empresa_id = 1));
-- select count(*) from public.horarios_funcionamento where empresa_id = 1;
