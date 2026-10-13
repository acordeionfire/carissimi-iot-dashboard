-- =====================================================================
-- DADOS DE TESTE REALISTAS (OPCIONAL) — CARISSIMI IoT
-- ATENÇÃO: APAGA todo o historico_status do PRIMEIRO equipamento e o
-- substitui por 14 dias úteis fictícios. Só rode se aceitar perder os
-- dados de teste atuais. Nunca rode com dados reais.
--
-- O que gera (fuso America/Sao_Paulo), por dia útil:
--   07:05 ATIVO | 09:20 EM_ESPERA | 09:35 ATIVO | 12:00 INATIVO (almoço)
--   13:05 ATIVO | 15:00 EM_ESPERA | 15:12 ATIVO | 17:00 INATIVO
--   (os horários variam alguns minutos de dia para dia)
-- Cenários embutidos: hora extra (ATIVO até 18:00 em alguns dias) e
-- 1 dia útil sem nenhuma atividade (simula feriado).
-- Cada dia útil tem 4 execuções (4 mudanças para ATIVO).
-- =====================================================================
do $$
declare
  v_equip   bigint;
  v_empresa bigint;
  v_dia     date;
  v_n       int := 0;
  v_jit     int;
  v_fim     int;
  v_tpl     int[]  := array[425, 560, 575, 720, 785, 900, 912, 1020];
  v_st      text[] := array['ATIVO','EM_ESPERA','ATIVO','INATIVO','ATIVO','EM_ESPERA','ATIVO','INATIVO'];
  i         int;
  v_min     int;
begin
  select id, empresa_id into v_equip, v_empresa from public.equipamentos order by id limit 1;
  if v_equip is null then
    raise exception 'Nenhum equipamento cadastrado.';
  end if;

  delete from public.historico_status where equipamento_id = v_equip;

  for v_dia in
    select d::date
    from generate_series(
           (now() at time zone 'America/Sao_Paulo')::date - 21,
           (now() at time zone 'America/Sao_Paulo')::date - 1,
           interval '1 day') as d
    where extract(isodow from d) between 1 and 5
  loop
    v_n := v_n + 1;
    if v_n = 7 then
      continue;  -- dia sem atividade (simula feriado)
    end if;
    v_jit := ((v_n * 7) % 11) - 5;                 -- varia de -5 a +5 minutos
    v_fim := case when v_n % 5 = 0 then 1080 else 1020 end;  -- hora extra até 18:00
    for i in 1..8 loop
      v_min := v_tpl[i] + v_jit;
      if i = 8 then v_min := v_fim; end if;
      insert into public.historico_status (equipamento_id, empresa_id, status, registrado_em)
      values (v_equip, v_empresa, v_st[i],
              ((v_dia::timestamp + v_min * interval '1 minute') at time zone 'America/Sao_Paulo'));
    end loop;
  end loop;

  update public.equipamentos e
     set status_atual = (select status from public.historico_status h
                          where h.equipamento_id = e.id order by registrado_em desc limit 1),
         atualizado_em = now()
   where e.id = v_equip;
end $$;

-- Conferir: deve mostrar cerca de 14 dias úteis com 8 linhas cada (1 dia útil fica de fora, de propósito)
-- select (registrado_em at time zone 'America/Sao_Paulo')::date as dia, count(*)
-- from public.historico_status group by 1 order by 1;
