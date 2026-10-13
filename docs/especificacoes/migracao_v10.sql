-- =====================================================================
-- CARISSIMI IoT — MIGRAÇÃO v10 (rode no SQL Editor do Supabase)
-- Seguro para rodar mais de uma vez (usa "if not exists").
-- O que faz:
--   1) empresas: fuso horário + 5 valores de configuração
--   2) tabela nova horarios_funcionamento (turno por empresa)
--   3) equipamentos: ultimo_sinal_em (sinal periódico do CLP/Node-RED)
--   4) historico_status: sinais_brutos (rastreabilidade, opcional)
--   5) índices para consultas por período
--   6) função salvar_horarios (grava o turno inteiro de uma vez, sem
--      risco de ficar pela metade)
--   7) turno inicial da Carissimi (seg–sex 07–12 e 13–17) — A CONFIRMAR
-- =====================================================================

begin;

-- 1) EMPRESAS ---------------------------------------------------------
alter table public.empresas
  add column if not exists fuso_horario text not null default 'America/Sao_Paulo',
  add column if not exists custo_ociosidade_hora   numeric(12,2),  -- R$/h ligada sem operar
  add column if not exists custo_oportunidade_hora numeric(12,2),  -- R$/h desligada no expediente (estimado)
  add column if not exists valor_capacidade_hora   numeric(12,2),  -- R$/h de produção plena
  add column if not exists custo_operacional_hora  numeric(12,2),  -- R$/h com a máquina ligada
  add column if not exists pecas_por_execucao      numeric(8,2) not null default 1; -- OPCIONAL (estimativa de peças)

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_valores_nao_negativos') then
    alter table public.empresas add constraint empresas_valores_nao_negativos check (
      coalesce(custo_ociosidade_hora,0)   >= 0 and
      coalesce(custo_oportunidade_hora,0) >= 0 and
      coalesce(valor_capacidade_hora,0)   >= 0 and
      coalesce(custo_operacional_hora,0)  >= 0 and
      pecas_por_execucao > 0
    );
  end if;
end $$;

-- 2) HORÁRIOS DE FUNCIONAMENTO ---------------------------------------
-- dia_semana: 0=domingo, 1=segunda ... 6=sábado (igual ao getDay() do JavaScript)
-- Uma linha por faixa. Vários por dia são permitidos (ex.: 07–12 e 13–17).
-- hora_fim pode ser 24:00 (para turno que vai até a meia-noite).
create table if not exists public.horarios_funcionamento (
  id          bigint generated always as identity primary key,
  empresa_id  bigint not null references public.empresas(id) on delete cascade,
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim    time not null,
  criado_em   timestamptz not null default now(),
  constraint horarios_fim_maior_que_inicio check (hora_fim > hora_inicio)
);
create index if not exists idx_horarios_empresa
  on public.horarios_funcionamento (empresa_id, dia_semana);

-- 3) EQUIPAMENTOS -----------------------------------------------------
alter table public.equipamentos
  add column if not exists ultimo_sinal_em timestamptz;

-- 4) HISTÓRICO --------------------------------------------------------
alter table public.historico_status
  add column if not exists sinais_brutos jsonb;

-- 5) ÍNDICES ----------------------------------------------------------
create index if not exists idx_hist_equip_tempo
  on public.historico_status (equipamento_id, registrado_em);
create index if not exists idx_hist_empresa_tempo
  on public.historico_status (empresa_id, registrado_em);

-- 6) FUNÇÃO: salvar o turno inteiro de uma empresa de uma vez --------
-- Exemplo de chamada pelo site:
--   supabase.rpc('salvar_horarios', { p_empresa_id: 1, p_horarios: [
--     {"dia_semana":1,"hora_inicio":"07:00","hora_fim":"12:00"}, ... ] })
create or replace function public.salvar_horarios(p_empresa_id bigint, p_horarios jsonb)
returns void
language plpgsql
as $$
begin
  delete from public.horarios_funcionamento where empresa_id = p_empresa_id;
  insert into public.horarios_funcionamento (empresa_id, dia_semana, hora_inicio, hora_fim)
  select p_empresa_id,
         (x->>'dia_semana')::smallint,
         (x->>'hora_inicio')::time,
         (x->>'hora_fim')::time
  from jsonb_array_elements(coalesce(p_horarios, '[]'::jsonb)) as x;
end;
$$;

-- 7) TURNO INICIAL DA CARISSIMI (ponto de partida — A CONFIRMAR) ------
insert into public.horarios_funcionamento (empresa_id, dia_semana, hora_inicio, hora_fim)
select e.id, d, h.ini, h.fim
from public.empresas e
cross join generate_series(1, 5) as d
cross join (values ('07:00'::time, '12:00'::time), ('13:00'::time, '17:00'::time)) as h(ini, fim)
where regexp_replace(e.cnpj, '\D', '', 'g') = '94038874000181'
  and not exists (select 1 from public.horarios_funcionamento x where x.empresa_id = e.id);

commit;

-- =====================================================================
-- SE O RLS ESTIVER LIGADO nas outras tabelas (ambiente de desenvolvimento),
-- rode também as 3 linhas abaixo (tire os "--" do começo):
--
-- alter table public.horarios_funcionamento enable row level security;
-- create policy "dev_all_horarios" on public.horarios_funcionamento
--   for all using (true) with check (true);
-- (e confirme que a tabela empresas permite UPDATE para o site)
--
-- ATENÇÃO: política "using (true)" libera tudo. É só para desenvolvimento
-- com dados de teste. Antes de dados reais: RLS por empresa (2ª fase).
-- =====================================================================

-- =====================================================================
-- PASSO OPCIONAL (rode só depois de tudo funcionando): travar os valores
-- aceitos em status. "not valid" vale só para linhas NOVAS.
--
-- alter table public.historico_status
--   add constraint historico_status_valores
--   check (status in ('ATIVO','EM_ESPERA','INATIVO','SEM_SINAL')) not valid;
-- =====================================================================
