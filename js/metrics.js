/* ============================================================
   metrics.js — CÁLCULOS DOS INDICADORES (sem nada de tela aqui)
   Portado do metrics.ts do Lovable para JavaScript puro e
   adaptado aos dados reais do Supabase (historico_status).

   Ideia central: cada linha de historico_status é um "evento"
   (a máquina mudou para tal status naquele horário). O tempo
   em cada estado é o intervalo entre um evento e o próximo.
   ============================================================
   v10 (ESPEC 02): este arquivo ganhou o bloco "NOVO NA v10" (régua do
   turno, horas extras, execuções, SEM_SINAL, dias desconsiderados,
   fuso da empresa). Tudo que existia continua igual.
   ============================================================ */
(function () {
  'use strict';

  const MIN = 60 * 1000;
  const HORA = 60 * MIN;
  const DIA = 24 * HORA;

  const ESTADOS = ['ativo', 'espera', 'inativo'];
  const ROTULO = { ativo: 'ATIVO', espera: 'ESPERA', inativo: 'INATIVO' };

  /* ---------- Status vindo do banco ---------- */

  // Aceita "ativo", "Ativo", "ATIVO " etc. Devolve null se não reconhecer.
  function normalizarStatus(valor) {
    const v = String(valor || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s_-]+/g, ' '); // "EM_ESPERA", "em-espera" e "em  espera" viram "em espera"
    if (v === 'ativo') return 'ativo';
    if (v === 'espera' || v === 'em espera') return 'espera';
    if (v === 'inativo') return 'inativo';
    if (v === 'sem sinal') return 'sem_sinal'; // estado técnico (v10)
    return null;
  }

  /* ---------- Períodos ---------- */

  function inicioDoDia(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function deslocarDias(ts, dias) {
    const d = new Date(ts);
    d.setDate(d.getDate() + dias);
    return d.getTime();
  }

  // Devolve { de, ate, rotulo } em milissegundos (horário local do navegador).
  function resolverPeriodo(chave, agora, custom) {
    switch (chave) {
      case 'hoje':
        return { de: inicioDoDia(agora), ate: agora, rotulo: 'Hoje' };
      case '24h':
        return { de: agora - DIA, ate: agora, rotulo: 'Últimas 24 horas' };
      case '30d':
        return { de: agora - 30 * DIA, ate: agora, rotulo: 'Últimos 30 dias' };
      case 'mes': {
        const d = new Date(agora);
        const de = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        return { de, ate: agora, rotulo: 'Mês atual' };
      }
      case 'mesAnterior': {
        const d = new Date(agora);
        const de = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
        const ate = new Date(d.getFullYear(), d.getMonth(), 1).getTime() - 1;
        return { de, ate, rotulo: 'Mês anterior' };
      }
      case 'custom': {
        const de = custom && custom.de ? custom.de : agora - 7 * DIA;
        const ate = Math.min(custom && custom.ate ? custom.ate : agora, agora);
        return { de, ate: Math.max(ate, de + MIN), rotulo: 'Período personalizado' };
      }
      case '7d':
      default:
        return { de: agora - 7 * DIA, ate: agora, rotulo: 'Últimos 7 dias' };
    }
  }

  // Período equivalente imediatamente anterior (para comparar: "melhorou ou piorou?")
  function periodoAnterior(chave, p) {
    const duracao = p.ate - p.de;
    if (chave === 'hoje' || chave === '24h') {
      return { de: deslocarDias(p.de, -1), ate: deslocarDias(p.ate, -1) };
    }
    if (chave === '7d') {
      return { de: deslocarDias(p.de, -7), ate: deslocarDias(p.ate, -7) };
    }
    if (chave === '30d') {
      return { de: deslocarDias(p.de, -30), ate: deslocarDias(p.ate, -30) };
    }
    if (chave === 'mes') {
      const d = new Date(p.de);
      const de = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
      return { de, ate: de + duracao };
    }
    if (chave === 'mesAnterior') {
      const d = new Date(p.de);
      const de = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
      return { de, ate: p.de - 1 };
    }
    return { de: p.de - duracao, ate: p.de };
  }

  /* ---------- Segmentos (blocos de tempo em cada estado) ---------- */

  // eventos: [{ t: milissegundos, status: 'ativo' }]  (qualquer ordem)
  // Devolve blocos [{ estado, inicio, fim }] recortados em [de, ate].
  // Tempo sem nenhum evento conhecido NÃO entra na conta (não inventamos dados).
  function segmentosDe(eventos, de, ate, agora) {
    const lista = [...eventos].sort((a, b) => a.t - b.t);
    const segs = [];
    for (let i = 0; i < lista.length; i++) {
      const estado = normalizarStatus(lista[i].status);
      const proximo = i + 1 < lista.length ? lista[i + 1].t : agora;
      const inicio = Math.max(lista[i].t, de);
      const fim = Math.min(proximo, ate);
      if (!estado || fim <= inicio) continue;

      const ultimo = segs[segs.length - 1];
      if (ultimo && ultimo.estado === estado && ultimo.fim === inicio) {
        ultimo.fim = fim; // mesmo estado repetido: junta num bloco só
      } else {
        segs.push({ estado, inicio, fim });
      }
    }
    return segs;
  }

  function somar(segs, estado) {
    let total = 0;
    for (const s of segs) if (s.estado === estado) total += s.fim - s.inicio;
    return total;
  }

  function media(segs, estado) {
    const lista = segs.filter((s) => s.estado === estado);
    if (!lista.length) return 0;
    return lista.reduce((t, s) => t + (s.fim - s.inicio), 0) / lista.length;
  }

  // Maior tempo contínuo sem produzir (espera + inativo seguidos)
  function maiorSequencia(segs, estados) {
    let melhor = 0;
    let corrente = 0;
    let fimAnterior = null;
    for (const s of segs) {
      if (estados.includes(s.estado)) {
        corrente = fimAnterior === s.inicio ? corrente + (s.fim - s.inicio) : s.fim - s.inicio;
        fimAnterior = s.fim;
        melhor = Math.max(melhor, corrente);
      } else {
        corrente = 0;
        fimAnterior = null;
      }
    }
    return melhor;
  }

  /* ---------- Métricas por equipamento ---------- */

  function calcularEquipamento(equip, eventos, de, ate, agora) {
    const segs = segmentosDe(eventos, de, ate, agora);
    const ativoMs = somar(segs, 'ativo');
    const esperaMs = somar(segs, 'espera');
    const inativoMs = somar(segs, 'inativo');
    const monitoradoMs = ativoMs + esperaMs + inativoMs;
    const pct = (x) => (monitoradoMs > 0 ? (x / monitoradoMs) * 100 : 0);

    return {
      equip,
      segmentos: segs,
      monitoradoMs,
      periodoMs: Math.max(ate - de, 1),
      ativoMs,
      esperaMs,
      inativoMs,
      pctAtivo: pct(ativoMs),
      pctEspera: pct(esperaMs),
      pctInativo: pct(inativoMs),
      temDados: monitoradoMs > 0,
      paradas: segs.filter((s) => s.estado === 'inativo').length,
      mediaAtivoMs: media(segs, 'ativo'),
      mediaEsperaMs: media(segs, 'espera'),
      mediaInativoMs: media(segs, 'inativo'),
      maiorAtivoMs: maiorSequencia(segs, ['ativo']),
      maiorParadaMs: maiorSequencia(segs, ['espera', 'inativo']),
    };
  }

  // Situação de AGORA (não depende do período escolhido)
  function situacaoAtual(equip, eventos, agora) {
    const lista = [...eventos].sort((a, b) => a.t - b.t).filter((e) => e.t <= agora);
    const ultimo = lista[lista.length - 1];
    const estado = normalizarStatus(equip.status_atual) || (ultimo ? normalizarStatus(ultimo.status) : null);

    // "desde quando está nesse estado": volta nos eventos enquanto o status for o mesmo
    let desde = null;
    if (ultimo && normalizarStatus(ultimo.status) === estado) {
      let i = lista.length - 1;
      while (i > 0 && normalizarStatus(lista[i - 1].status) === estado) i--;
      desde = lista[i].t;
    } else if (equip.atualizado_em) {
      desde = Date.parse(equip.atualizado_em);
    }

    let ultimaAtualizacao = equip.atualizado_em ? Date.parse(equip.atualizado_em) : null;
    if (ultimo && (!ultimaAtualizacao || ultimo.t > ultimaAtualizacao)) ultimaAtualizacao = ultimo.t;

    return { estado, desde, ultimaAtualizacao };
  }

  /* ---------- Resumo da frota inteira ---------- */

  function resumoFrota(lista) {
    const soma = (campo) => lista.reduce((t, m) => t + m[campo], 0);
    const ativoMs = soma('ativoMs');
    const esperaMs = soma('esperaMs');
    const inativoMs = soma('inativoMs');
    const monitoradoMs = ativoMs + esperaMs + inativoMs;
    const seguro = monitoradoMs || 1;
    const h = (ms) => ms / HORA;

    return {
      total: lista.length,
      comDados: lista.filter((m) => m.temDados).length,
      monitoradoH: h(monitoradoMs),
      ativoH: h(ativoMs),
      esperaH: h(esperaMs),
      inativoH: h(inativoMs),
      improdutivoH: h(esperaMs + inativoMs),
      temDados: monitoradoMs > 0,
      utilizacaoPct: (ativoMs / seguro) * 100,
      disponibilidadePct: ((ativoMs + esperaMs) / seguro) * 100,
      ociosaPct: ((esperaMs + inativoMs) / seguro) * 100,
    };
  }

  function contarAgora(situacoes) {
    const c = { ativo: 0, espera: 0, inativo: 0, semInfo: 0 };
    for (const s of situacoes) {
      if (s.estado && c[s.estado] !== undefined) c[s.estado]++;
      else c.semInfo++;
    }
    return c;
  }

  /* ---------- Série para o gráfico de evolução ---------- */

  function rotuloBucket(ts, duracao, passo) {
    const d = new Date(ts);
    const dois = (n) => String(n).padStart(2, '0');
    if (duracao <= 2 * DIA) return dois(d.getHours()) + 'h';
    const dia = dois(d.getDate()) + '/' + dois(d.getMonth() + 1);
    return passo < DIA ? dia + ' ' + dois(d.getHours()) + 'h' : dia;
  }

  function serieTemporal(segmentosPorEquip, de, ate, quantidade) {
    const n = quantidade || 12;
    const duracao = ate - de;
    const passo = duracao / n;
    const pontos = [];
    for (let i = 0; i < n; i++) {
      const a = de + i * passo;
      const b = a + passo;
      let ativo = 0;
      let espera = 0;
      let inativo = 0;
      for (const segs of segmentosPorEquip) {
        for (const s of segs) {
          const ini = Math.max(s.inicio, a);
          const fim = Math.min(s.fim, b);
          if (fim <= ini) continue;
          if (s.estado === 'ativo') ativo += fim - ini;
          else if (s.estado === 'espera') espera += fim - ini;
          else if (s.estado === 'inativo') inativo += fim - ini;
        }
      }
      const total = ativo + espera + inativo;
      pontos.push({
        rotulo: rotuloBucket(a, duracao, passo),
        ativo: total ? +((ativo / total) * 100).toFixed(1) : null,
        espera: total ? +((espera / total) * 100).toFixed(1) : null,
        inativo: total ? +((inativo / total) * 100).toFixed(1) : null,
      });
    }
    return pontos;
  }

  /* ---------- Indicadores financeiros (estimativas) ---------- */

  const PARAMETROS_FINANCEIROS = [
    { chave: 'custoOciosidadeHora', rotulo: 'Custo de ociosidade por hora (espera)' },
    { chave: 'custoParadaHora', rotulo: 'Custo de parada por hora (inativo)' },
    { chave: 'valorCapacidadeHora', rotulo: 'Valor da capacidade produtiva por hora' },
    { chave: 'custoOperacionalHora', rotulo: 'Custo operacional por hora (máquina ligada)' },
  ];

  function itemFinanceiro(chave, rotulo, horas, parametro, params, formula) {
    const taxa = params[parametro];
    const rotuloParam = PARAMETROS_FINANCEIROS.find((p) => p.chave === parametro).rotulo;
    return {
      chave,
      rotulo,
      formula,
      valor: taxa === null || taxa === undefined ? null : horas * taxa,
      faltando: taxa === null || taxa === undefined ? rotuloParam : null,
    };
  }

  function calcularFinanceiroLegado(resumo, params) {
    return [
      itemFinanceiro('ociosidade', 'Custo estimado de ociosidade', resumo.esperaH,
        'custoOciosidadeHora', params, 'horas em espera × custo de ociosidade/h'),
      itemFinanceiro('parada', 'Custo estimado de máquina parada', resumo.inativoH,
        'custoParadaHora', params, 'horas inativas × custo de parada/h'),
      itemFinanceiro('capacidade', 'Capacidade não utilizada (valor potencial)',
        resumo.monitoradoH - resumo.ativoH, 'valorCapacidadeHora', params,
        'horas não produtivas × valor da capacidade/h'),
      itemFinanceiro('operacional', 'Custo operacional do período', resumo.ativoH + resumo.esperaH,
        'custoOperacionalHora', params, 'horas ligada (ativo + espera) × custo operacional/h'),
    ];
  }

  function impactoEquipamento(m, params) {
    const o = params.custoOciosidadeHora;
    const p = params.custoParadaHora;
    if ((o === null || o === undefined) && (p === null || p === undefined)) return null;
    return (m.esperaMs / HORA) * (o || 0) + (m.inativoMs / HORA) * (p || 0);
  }

  /* ---------- Formatação (português do Brasil) ---------- */

  function formatarDuracao(ms) {
    if (!ms || ms <= 0) return '—';
    const totalMin = Math.round(ms / MIN);
    if (totalMin < 1) return '< 1 min';
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return m + ' min';
    if (h >= 48) return Math.floor(h / 24) + ' d ' + (h % 24) + ' h';
    return h + 'h ' + String(m).padStart(2, '0') + 'min';
  }

  function formatarHoras(horas) {
    return (
      horas.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h'
    );
  }

  function formatarPct(valor, casas) {
    const c = casas === undefined ? 1 : casas;
    return (
      valor.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }) + '%'
    );
  }

  function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    });
  }

  function formatarDataHora(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const dois = (n) => String(n).padStart(2, '0');
    return (
      dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + ' ' + dois(d.getHours()) + ':' + dois(d.getMinutes())
    );
  }

  function formatarHora(ts) {
    const d = new Date(ts);
    const dois = (n) => String(n).padStart(2, '0');
    return dois(d.getHours()) + ':' + dois(d.getMinutes());
  }

  /* ============================================================
     ====================  NOVO NA v10 (ESPEC 02)  ===============
     Tudo daqui para baixo é ACRESCENTADO. As funções antigas
     (acima) continuam iguais, para o Dashboard e os Relatórios
     atuais seguirem funcionando até serem atualizados.

     Convenções deste bloco:
       - Todos os instantes são NÚMEROS em milissegundos (como no
         resto do arquivo). Date e texto ISO também são aceitos na
         ENTRADA e convertidos.
       - Estados internos em minúsculas: 'ativo', 'espera',
         'inativo' e o técnico 'sem_sinal'.
       - Evento aceito: { equipamento_id, status, registrado_em }
         ou { equipamento_id, status, t }.
       - Toda conta de dia/hora/turno usa o FUSO DA EMPRESA.
     ============================================================ */

  /* ---------- Constantes (um lugar só) ---------- */

  const CONFIG_METRICAS = {
    MIN_HORA_EXTRA_MS: 5 * MIN,       // ATIVO contínuo fora do turno só vira hora extra a partir disso
    MIN_EXECUCAO_S: 10,               // execução mais curta que isso não conta (validar com a automação)
    TOLERANCIA_SEM_SINAL_MS: 5 * MIN, // sem sinal por mais que isso => SEM_SINAL (só se ultimo_sinal_em existir)
    FUSO_PADRAO: 'America/Sao_Paulo',
  };

  const ESTADOS_TODOS = ['ativo', 'espera', 'inativo', 'sem_sinal'];
  const ROTULO_COMPLETO = { ativo: 'ATIVO', espera: 'ESPERA', inativo: 'INATIVO', sem_sinal: 'SEM SINAL' };

  const PARAMETROS_FINANCEIROS_V10 = [
    { chave: 'custoOciosidadeHora', rotulo: 'Custo de ociosidade por hora (espera)' },
    { chave: 'custoOportunidadeHora', rotulo: 'Custo de oportunidade por hora (inativo, estimado)' },
    { chave: 'valorCapacidadeHora', rotulo: 'Valor da capacidade produtiva por hora' },
    { chave: 'custoOperacionalHora', rotulo: 'Custo operacional por hora (máquina ligada)' },
  ];

  /* ---------- Conversões básicas ---------- */

  // Aceita número (ms), Date ou texto ISO. Devolve ms (ou null se não der).
  function paraMs(x) {
    if (x === null || x === undefined || x === '') return null;
    if (typeof x === 'number') return Number.isFinite(x) ? x : null;
    if (x instanceof Date) return Number.isNaN(x.getTime()) ? null : x.getTime();
    const n = Date.parse(x);
    return Number.isNaN(n) ? null : n;
  }

  function tempoDoEvento(e) {
    if (e.t !== undefined && e.t !== null) return paraMs(e.t);
    return paraMs(e.registrado_em);
  }

  function idDoEvento(e) {
    return e.equipamento_id !== undefined ? e.equipamento_id : e.equipamentoId;
  }

  /* ---------- Fuso horário (sem biblioteca, só Intl) ---------- */

  const _formatadores = {};

  function fusoSeguro(fuso) {
    const f = fuso || CONFIG_METRICAS.FUSO_PADRAO;
    try {
      formatadorDoFuso(f);
      return f;
    } catch (e) {
      return CONFIG_METRICAS.FUSO_PADRAO; // fuso inválido: volta para o padrão
    }
  }

  function formatadorDoFuso(fuso) {
    if (!_formatadores[fuso]) {
      _formatadores[fuso] = new Intl.DateTimeFormat('en-US', {
        timeZone: fuso, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    }
    return _formatadores[fuso];
  }

  function partesCompletas(instante, fuso) {
    const o = {};
    for (const p of formatadorDoFuso(fusoSeguro(fuso)).formatToParts(new Date(instante))) {
      if (p.type !== 'literal') o[p.type] = parseInt(p.value, 10);
    }
    return { ano: o.year, mes: o.month, dia: o.day, hora: o.hour === 24 ? 0 : o.hour, minuto: o.minute, segundo: o.second };
  }

  // { ano, mes, dia, diaSemana (0=domingo..6=sábado), minutosDoDia } no fuso informado
  function partesLocais(instante, fuso) {
    const p = partesCompletas(instante, fuso);
    const diaSemana = new Date(Date.UTC(p.ano, p.mes - 1, p.dia)).getUTCDay();
    return { ano: p.ano, mes: p.mes, dia: p.dia, diaSemana, minutosDoDia: p.hora * 60 + p.minuto };
  }

  function deslocamentoMs(instante, fuso) {
    const p = partesCompletas(instante, fuso);
    return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - Math.floor(instante / 1000) * 1000;
  }

  // Instante UTC (ms) de um horário LOCAL. minutosDoDia = 1440 significa 24:00 (00:00 do dia seguinte).
  function instanteLocal(ano, mes, dia, minutosDoDia, fuso) {
    const f = fusoSeguro(fuso);
    const base = Date.UTC(ano, mes - 1, dia, 0, minutosDoDia, 0);
    const off1 = deslocamentoMs(base, f);
    let r = base - off1;
    const off2 = deslocamentoMs(r, f);
    if (off2 !== off1) r = base - off2;
    return r;
  }

  function somarDiasLocais(ano, mes, dia, n) {
    const d = new Date(Date.UTC(ano, mes - 1, dia + n));
    return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate(), diaSemana: d.getUTCDay() };
  }

  function dataISO(ano, mes, dia) {
    const dois = (n) => String(n).padStart(2, '0');
    return ano + '-' + dois(mes) + '-' + dois(dia);
  }

  // 'HH:MM' (ou 'HH:MM:SS') -> minutos do dia. '24:00' = 1440. Inválido = null.
  function minutosDe(hhmm) {
    const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    const h = +m[1];
    const mi = +m[2];
    if (mi > 59 || h > 24 || (h === 24 && mi !== 0)) return null;
    return h * 60 + mi;
  }

  /* ---------- Períodos no fuso da empresa ---------- */

  // nome: 'hoje' | '24h' | '7d' | '30d' | 'mes_atual' ('mes') | 'mes_anterior' ('mesAnterior')
  // Devolve { de, ate, rotulo } em ms. 'ate' é EXCLUSIVO.
  function periodoPreset(nome, agora, fuso) {
    const f = fusoSeguro(fuso);
    const a = paraMs(agora);
    const p = partesLocais(a, f);
    switch (nome) {
      case 'hoje':
        return { de: instanteLocal(p.ano, p.mes, p.dia, 0, f), ate: a, rotulo: 'Hoje' };
      case '24h':
        return { de: a - DIA, ate: a, rotulo: 'Últimas 24 horas' };
      case '30d':
        return { de: a - 30 * DIA, ate: a, rotulo: 'Últimos 30 dias' };
      case 'mes':
      case 'mes_atual':
        return { de: instanteLocal(p.ano, p.mes, 1, 0, f), ate: a, rotulo: 'Mês atual' };
      case 'mesAnterior':
      case 'mes_anterior': {
        const ant = p.mes === 1 ? { ano: p.ano - 1, mes: 12 } : { ano: p.ano, mes: p.mes - 1 };
        return {
          de: instanteLocal(ant.ano, ant.mes, 1, 0, f),
          ate: instanteLocal(p.ano, p.mes, 1, 0, f),
          rotulo: 'Mês anterior',
        };
      }
      case '7d':
      default:
        return { de: a - 7 * DIA, ate: a, rotulo: 'Últimos 7 dias' };
    }
  }

  // Período personalizado por DATAS locais ('AAAA-MM-DD'), inclusive nas duas pontas.
  function periodoPersonalizado(deISO, ateISO, agora, fuso) {
    const f = fusoSeguro(fuso);
    const a = paraMs(agora);
    const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deISO || '');
    const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ateISO || '');
    if (!m1 || !m2) return periodoPreset('7d', a, f);
    const de = instanteLocal(+m1[1], +m1[2], +m1[3], 0, f);
    const ate = instanteLocal(+m2[1], +m2[2], +m2[3], 1440, f);
    return { de, ate: Math.max(Math.min(ate, a), de + MIN), rotulo: 'Período personalizado' };
  }

  // Período imediatamente anterior, com a MESMA duração (para a comparação ▲/▼).
  function periodoAnteriorMesmaDuracao(p) {
    const duracao = p.ate - p.de;
    return { de: p.de - duracao, ate: p.de };
  }

  /* ---------- Blocos ---------- */

  // Agrupa eventos por equipamento, já com tempo em ms e estado normalizado.
  function agruparEventos(eventos) {
    const grupos = new Map();
    for (const e of eventos || []) {
      const t = tempoDoEvento(e);
      if (t === null) continue;
      const id = idDoEvento(e);
      if (!grupos.has(id)) grupos.set(id, []);
      grupos.get(id).push({ t, estado: normalizarStatus(e.status), bruto: e.status });
    }
    for (const lista of grupos.values()) lista.sort((a, b) => a.t - b.t);
    return grupos;
  }

  // Conta eventos com status que o sistema não reconhece (para avisar na tela).
  function contarStatusDesconhecidos(eventos) {
    const r = {};
    for (const e of eventos || []) {
      if (normalizarStatus(e.status) === null) {
        const k = String(e.status === undefined || e.status === null ? '(vazio)' : e.status);
        r[k] = (r[k] || 0) + 1;
      }
    }
    return r;
  }

  function blocosDeLista(lista, id, de, efAte, agora) {
    const blocos = [];
    for (let i = 0; i < lista.length; i++) {
      const estado = lista[i].estado;
      const proximo = i + 1 < lista.length ? lista[i + 1].t : agora;
      const inicio = Math.max(lista[i].t, de);
      const fim = Math.min(proximo, efAte);
      // status desconhecido (estado null) NÃO gera bloco: tempo desconhecido não entra na conta
      if (!estado || fim <= inicio) continue;
      const ultimo = blocos[blocos.length - 1];
      if (ultimo && ultimo.estado === estado && ultimo.fim === inicio) ultimo.fim = fim;
      else blocos.push({ equipamentoId: id, estado, inicio, fim });
    }
    return blocos;
  }

  // Blocos de TODOS os equipamentos, recortados no período efetivo [de, min(ate, agora)).
  function construirBlocos(eventos, periodo, agora) {
    const de = paraMs(periodo.de);
    const a = paraMs(agora);
    const efAte = Math.min(paraMs(periodo.ate), a);
    const saida = [];
    for (const [id, lista] of agruparEventos(eventos)) {
      for (const b of blocosDeLista(lista, id, de, efAte, a)) saida.push(b);
    }
    return saida;
  }

  // Se o equipamento ficou sem sinal além da tolerância, o final do último bloco vira SEM_SINAL (virtual).
  function aplicarFrescor(blocos, ultimoSinalEm, agora) {
    const us = paraMs(ultimoSinalEm);
    if (us === null || !blocos.length) return blocos;
    if (paraMs(agora) - us <= CONFIG_METRICAS.TOLERANCIA_SEM_SINAL_MS) return blocos;
    const copia = blocos.map((b) => ({ ...b }));
    const ult = copia[copia.length - 1];
    if (ult.estado === 'sem_sinal') return copia;
    const corte = Math.max(us + CONFIG_METRICAS.TOLERANCIA_SEM_SINAL_MS, ult.inicio);
    if (ult.fim <= corte) return copia;
    const fimOriginal = ult.fim;
    if (corte <= ult.inicio) {
      ult.estado = 'sem_sinal';
    } else {
      ult.fim = corte;
      copia.push({ equipamentoId: ult.equipamentoId, estado: 'sem_sinal', inicio: corte, fim: fimOriginal });
    }
    return copia;
  }

  /* ---------- Turno (faixas) ---------- */

  // config: { fuso, horarios: [{ diaSemana, inicio:'HH:MM', fim:'HH:MM' }] }
  // Devolve faixas { inicio, fim, data, inicioCheio, fimCheio } recortadas em [periodo.de, periodo.ate].
  // Sem horários cadastrados devolve [].
  function faixasDoTurno(config, periodo) {
    const fuso = fusoSeguro(config && config.fuso);
    const hs = ((config && config.horarios) || [])
      .map((h) => ({ dia: Number(h.diaSemana), ini: minutosDe(h.inicio), fim: minutosDe(h.fim) }))
      .filter((h) => h.dia >= 0 && h.dia <= 6 && h.ini !== null && h.fim !== null && h.fim > h.ini);
    if (!hs.length) return [];
    const de = paraMs(periodo.de);
    const ate = paraMs(periodo.ate);
    if (ate <= de) return [];

    const p0 = partesLocais(de, fuso);
    const p1 = partesLocais(Math.max(de, ate - 1), fuso);
    const nDias = Math.round((Date.UTC(p1.ano, p1.mes - 1, p1.dia) - Date.UTC(p0.ano, p0.mes - 1, p0.dia)) / DIA);

    const faixas = [];
    for (let n = -1; n <= nDias + 1; n++) {
      const d = somarDiasLocais(p0.ano, p0.mes, p0.dia, n);
      const data = dataISO(d.ano, d.mes, d.dia);
      const doDia = [];
      for (const h of hs) {
        if (h.dia !== d.diaSemana) continue;
        const cheioIni = instanteLocal(d.ano, d.mes, d.dia, h.ini, fuso);
        const cheioFim = instanteLocal(d.ano, d.mes, d.dia, h.fim, fuso);
        doDia.push({ inicio: cheioIni, fim: cheioFim, data, inicioCheio: cheioIni, fimCheio: cheioFim });
      }
      doDia.sort((x, y) => x.inicio - y.inicio);
      // junta faixas do mesmo dia que se tocam ou se sobrepõem
      const mescladas = [];
      for (const f of doDia) {
        const u = mescladas[mescladas.length - 1];
        if (u && f.inicio <= u.fim) {
          u.fim = Math.max(u.fim, f.fim);
          u.fimCheio = u.fim;
        } else mescladas.push({ ...f });
      }
      for (const f of mescladas) {
        const inicio = Math.max(f.inicio, de);
        const fim = Math.min(f.fim, ate);
        if (fim > inicio) faixas.push({ inicio, fim, data: f.data, inicioCheio: f.inicioCheio, fimCheio: f.fimCheio });
      }
    }
    faixas.sort((x, y) => x.inicio - y.inicio);
    return faixas;
  }

  function tempoEmFaixas(faixas, janela) {
    let total = 0;
    for (const f of faixas) {
      const ini = Math.max(f.inicio, janela ? janela.inicio : -Infinity);
      const fim = Math.min(f.fim, janela ? janela.fim : Infinity);
      if (fim > ini) total += fim - ini;
    }
    return total;
  }

  function dentroDeFaixa(instante, faixas) {
    for (const f of faixas) if (instante >= f.inicio && instante < f.fim) return true;
    return false;
  }

  // Dia com turno, já encerrado e inteiro dentro do período, em que NENHUMA máquina teve ATIVO nem ESPERA.
  // blocosTodos: blocos de TODAS as máquinas da empresa (mesmo que a tela filtre uma só).
  function diasDesconsiderados(blocosTodos, config, periodo, agora) {
    const fuso = fusoSeguro(config && config.fuso);
    const de = paraMs(periodo.de);
    const ef = Math.min(paraMs(periodo.ate), paraMs(agora));
    if (ef <= de) return [];
    const faixas = faixasDoTurno(config, { de: de - 2 * DIA, ate: ef + 2 * DIA });

    const porDia = new Map();
    for (const f of faixas) {
      if (!porDia.has(f.data)) porDia.set(f.data, []);
      porDia.get(f.data).push(f);
    }

    const resultado = [];
    for (const [data, fs] of porDia) {
      const [ano, mes, dia] = data.split('-').map(Number);
      const diaIni = instanteLocal(ano, mes, dia, 0, fuso);
      const diaFim = instanteLocal(ano, mes, dia, 1440, fuso);
      const ultimoFimCheio = Math.max(...fs.map((f) => f.fimCheio));
      if (diaIni < de || ultimoFimCheio > ef) continue; // dia não está inteiro/encerrado dentro do período
      const janelaDia = { inicio: diaIni, fim: Math.min(diaFim, ef) };

      let monitoradoNoTurno = 0;
      let teveAtividade = false;
      for (const b of blocosTodos) {
        if (b.estado === 'ativo' || b.estado === 'espera') {
          if (Math.min(b.fim, janelaDia.fim) > Math.max(b.inicio, janelaDia.inicio)) teveAtividade = true;
        }
        if (b.estado !== 'sem_sinal') {
          monitoradoNoTurno += tempoEmFaixas(
            fs.map((f) => ({ inicio: f.inicioCheio, fim: f.fimCheio })),
            { inicio: b.inicio, fim: b.fim }
          );
        }
      }
      if (!teveAtividade && monitoradoNoTurno > 0) resultado.push({ data, inicio: diaIni, fim: diaFim });
    }
    resultado.sort((a, b) => a.inicio - b.inicio);
    return resultado;
  }

  /* ---------- Régua do turno ---------- */

  // Devolve segmentos { equipamentoId, estado, inicio, fim, dentroTurno }.
  // Dentro da faixa conta tudo. Fora, só ATIVO contínuo >= mínimo (hora extra). O resto é descartado.
  function aplicarRegua(blocos, faixasValidas, opcoes) {
    const minExtra = opcoes && opcoes.minHoraExtraMs !== undefined ? opcoes.minHoraExtraMs : CONFIG_METRICAS.MIN_HORA_EXTRA_MS;
    const faixas = [...faixasValidas].sort((a, b) => a.inicio - b.inicio);
    const saida = [];

    const fora = (b, ini, fim) => {
      if (b.estado === 'ativo' && fim - ini >= minExtra && fim > ini) {
        saida.push({ equipamentoId: b.equipamentoId, estado: 'ativo', inicio: ini, fim, dentroTurno: false });
      }
    };

    for (const b of blocos) {
      let cursor = b.inicio;
      for (const f of faixas) {
        if (f.fim <= b.inicio) continue;
        if (f.inicio >= b.fim) break;
        const ini = Math.max(b.inicio, f.inicio);
        const fim = Math.min(b.fim, f.fim);
        if (ini > cursor) fora(b, cursor, ini);
        saida.push({ equipamentoId: b.equipamentoId, estado: b.estado, inicio: ini, fim, dentroTurno: true });
        cursor = fim;
      }
      if (cursor < b.fim) fora(b, cursor, b.fim);
    }
    saida.sort((a, b) => a.inicio - b.inicio);
    return saida;
  }

  /* ---------- Indicadores ---------- */

  function razao(a, b) {
    return b > 0 ? a / b : null;
  }

  // Completa os campos calculados a partir dos tempos básicos.
  function completarIndicadores(x) {
    const ativoTotal = x.tempoAtivoDentroMs + x.horasExtrasMs;
    const monitorado = x.tempoAtivoDentroMs + x.tempoEsperaMs + x.tempoInativoMs;
    const denominador = monitorado + x.horasExtrasMs;
    return {
      ...x,
      tempoMonitoradoDentroMs: monitorado,
      coberturaDados: razao(monitorado, x.tempoProgramadoMs),
      tempoAtivoTotalMs: ativoTotal,
      denominadorMs: denominador,
      disponibilidadeOEE: razao(ativoTotal, denominador),
      maquinaLigada: razao(ativoTotal + x.tempoEsperaMs, denominador),
      tempoProdutivoMs: ativoTotal,
      tempoImprodutivoMs: x.tempoEsperaMs + x.tempoInativoMs,
      tempoMedioExecucaoMs: x.execucoes > 0 ? x.duracaoExecucoesMs / x.execucoes : null,
    };
  }

  function indicadoresVazios() {
    return {
      tempoProgramadoMs: 0, tempoAtivoDentroMs: 0, tempoEsperaMs: 0, tempoInativoMs: 0,
      horasExtrasMs: 0, tempoSemSinalMs: 0,
      execucoes: 0, execucoesDentro: 0, execucoesFora: 0, duracaoExecucoesMs: 0,
      paradas: 0, maiorPeriodoSemProduzirMs: 0,
    };
  }

  // Soma os tempos dos segmentos (opcionalmente só o trecho dentro de uma janela { inicio, fim }).
  // Se vier "faixas", calcula também o tempo programado da janela.
  function agregar(segmentos, janela, faixas) {
    const x = indicadoresVazios();
    for (const s of segmentos) {
      const ini = Math.max(s.inicio, janela ? janela.inicio : -Infinity);
      const fim = Math.min(s.fim, janela ? janela.fim : Infinity);
      if (fim <= ini) continue;
      const d = fim - ini;
      if (s.dentroTurno) {
        if (s.estado === 'ativo') x.tempoAtivoDentroMs += d;
        else if (s.estado === 'espera') x.tempoEsperaMs += d;
        else if (s.estado === 'inativo') x.tempoInativoMs += d;
        else if (s.estado === 'sem_sinal') x.tempoSemSinalMs += d;
      } else if (s.estado === 'ativo') {
        x.horasExtrasMs += d;
      }
    }
    if (faixas) x.tempoProgramadoMs = tempoEmFaixas(faixas, janela || null);
    return completarIndicadores(x);
  }

  // Soma Indicadores de vários equipamentos e recalcula as razões (média PONDERADA, nunca média de %).
  function somarIndicadores(lista) {
    const x = indicadoresVazios();
    for (const i of lista) {
      for (const k of Object.keys(x)) {
        if (k === 'maiorPeriodoSemProduzirMs') x[k] = Math.max(x[k], i[k] || 0);
        else x[k] += i[k] || 0;
      }
    }
    return completarIndicadores(x);
  }

  /* ---------- Execuções e paradas ---------- */

  // Percorre os eventos de UM equipamento. "Real" = ignorando SEM_SINAL ao olhar o status anterior.
  function execucoesDe(lista, de, efAte, agora, faixasValidas) {
    const minMs = CONFIG_METRICAS.MIN_EXECUCAO_S * 1000;
    const seq = lista.filter((e) => e.estado); // desconhecidos não participam
    const r = { total: 0, dentroTurno: 0, foraTurno: 0, duracaoTotalMs: 0, tempoMedioMs: null };
    let anteriorReal = null;
    for (let i = 0; i < seq.length; i++) {
      const e = seq[i];
      if (e.estado === 'ativo' && anteriorReal !== 'ativo') {
        if (e.t >= de && e.t < efAte) {
          // duração = tempo ATIVO desta execução (SEM_SINAL não soma e não encerra)
          let dur = 0;
          let inicioTrecho = e.t;
          let j = i + 1;
          let ativoAgora = true;
          for (; j <= seq.length; j++) {
            const fimTrecho = j < seq.length ? seq[j].t : agora;
            const prox = j < seq.length ? seq[j].estado : null;
            if (ativoAgora) dur += Math.max(0, Math.min(fimTrecho, efAte) - Math.min(inicioTrecho, efAte));
            if (j >= seq.length) break;
            if (prox === 'ativo') { ativoAgora = true; inicioTrecho = seq[j].t; }
            else if (prox === 'sem_sinal') { ativoAgora = false; }
            else break; // espera ou inativo encerra a execução
          }
          if (dur >= minMs) {
            r.total++;
            r.duracaoTotalMs += dur;
            if (dentroDeFaixa(e.t, faixasValidas)) r.dentroTurno++;
            else r.foraTurno++;
          }
        }
      }
      if (e.estado !== 'sem_sinal') anteriorReal = e.estado;
    }
    r.tempoMedioMs = r.total > 0 ? r.duracaoTotalMs / r.total : null;
    return r;
  }

  // Devolve { [equipamentoId]: { total, dentroTurno, foraTurno, duracaoTotalMs, tempoMedioMs } }
  function contarExecucoes(eventos, periodo, agora, faixasValidas) {
    const de = paraMs(periodo.de);
    const a = paraMs(agora);
    const efAte = Math.min(paraMs(periodo.ate), a);
    const saida = {};
    for (const [id, lista] of agruparEventos(eventos)) saida[id] = execucoesDe(lista, de, efAte, a, faixasValidas);
    return saida;
  }

  // Entradas em INATIVO que acontecem DENTRO do turno. Devolve { [equipamentoId]: número }
  function contarParadas(eventos, periodo, agora, faixasValidas) {
    const de = paraMs(periodo.de);
    const a = paraMs(agora);
    const efAte = Math.min(paraMs(periodo.ate), a);
    const saida = {};
    for (const [id, lista] of agruparEventos(eventos)) {
      let n = 0;
      let anteriorReal = null;
      for (const e of lista) {
        if (!e.estado) continue;
        if (e.estado === 'inativo' && anteriorReal !== 'inativo' && e.t >= de && e.t < efAte && dentroDeFaixa(e.t, faixasValidas)) n++;
        if (e.estado !== 'sem_sinal') anteriorReal = e.estado;
      }
      saida[id] = n;
    }
    return saida;
  }

  // Maior sequência contínua de ESPERA/INATIVO dentro do turno.
  function maiorSemProduzir(segmentos) {
    let melhor = 0;
    let corrente = 0;
    let fimAnterior = null;
    const lista = segmentos.filter((s) => s.dentroTurno).sort((a, b) => a.inicio - b.inicio);
    for (const s of lista) {
      if (s.estado === 'espera' || s.estado === 'inativo') {
        corrente = fimAnterior === s.inicio ? corrente + (s.fim - s.inicio) : s.fim - s.inicio;
        fimAnterior = s.fim;
        melhor = Math.max(melhor, corrente);
      } else {
        corrente = 0;
        fimAnterior = null;
      }
    }
    return melhor;
  }

  /* ---------- Função principal ---------- */

  // entrada: { eventos, equipamentos:[{id, nome, status_atual, ultimo_sinal_em}], periodo, config, agora, filtroEquipamentoId? }
  // eventos = de TODAS as máquinas da empresa (incluindo o último evento ANTES do início do período).
  function calcularTudo(entrada) {
    const agora = paraMs(entrada.agora);
    const periodo = { de: paraMs(entrada.periodo.de), ate: paraMs(entrada.periodo.ate) };
    const efAte = Math.min(periodo.ate, agora);
    const config = entrada.config || {};
    const todos = entrada.equipamentos || [];
    const filtro = entrada.filtroEquipamentoId;
    const eventos = entrada.eventos || [];
    const grupos = agruparEventos(eventos);

    // 1) blocos de cada equipamento (com SEM_SINAL virtual quando o último sinal está velho)
    const blocosPorId = {};
    const todosBlocos = [];
    for (const eq of todos) {
      let bl = blocosDeLista(grupos.get(eq.id) || [], eq.id, periodo.de, efAte, agora);
      bl = aplicarFrescor(bl, eq.ultimo_sinal_em, agora);
      blocosPorId[eq.id] = bl;
      for (const b of bl) todosBlocos.push(b);
    }

    // 2) turno e dias desconsiderados (a detecção usa TODAS as máquinas, mesmo com filtro)
    const semHorarioCadastrado = !((config.horarios || []).length);
    let faixasValidas;
    let dias = [];
    if (semHorarioCadastrado) {
      faixasValidas = efAte > periodo.de ? [{ inicio: periodo.de, fim: efAte, data: null }] : [];
    } else {
      dias = diasDesconsiderados(todosBlocos, config, periodo, agora);
      const fora = new Set(dias.map((d) => d.data));
      faixasValidas = faixasDoTurno(config, { de: periodo.de, ate: efAte }).filter((f) => !fora.has(f.data));
    }
    const programadoPorMaquina = tempoEmFaixas(faixasValidas, null);

    // 3) indicadores por equipamento
    const exec = contarExecucoes(eventos, periodo, agora, faixasValidas);
    const par = contarParadas(eventos, periodo, agora, faixasValidas);
    const escolhidos = filtro === undefined || filtro === null ? todos : todos.filter((e) => e.id === filtro);
    const porEquipamento = {};
    const segmentos = [];
    const semSinal = [];
    const semRegistros = [];
    for (const eq of escolhidos) {
      const segs = aplicarRegua(blocosPorId[eq.id] || [], faixasValidas);
      for (const s of segs) segmentos.push(s);
      const base = agregar(segs, null, faixasValidas);
      const ex = exec[eq.id] || { total: 0, dentroTurno: 0, foraTurno: 0, duracaoTotalMs: 0 };
      const completo = completarIndicadores({
        ...indicadoresVazios(),
        tempoProgramadoMs: programadoPorMaquina,
        tempoAtivoDentroMs: base.tempoAtivoDentroMs,
        tempoEsperaMs: base.tempoEsperaMs,
        tempoInativoMs: base.tempoInativoMs,
        horasExtrasMs: base.horasExtrasMs,
        tempoSemSinalMs: base.tempoSemSinalMs,
        execucoes: ex.total,
        execucoesDentro: ex.dentroTurno,
        execucoesFora: ex.foraTurno,
        duracaoExecucoesMs: ex.duracaoTotalMs,
        paradas: par[eq.id] || 0,
        maiorPeriodoSemProduzirMs: maiorSemProduzir(segs),
      });
      porEquipamento[eq.id] = completo;
      if (completo.tempoSemSinalMs > 0) semSinal.push(eq.id);
      const temEstadoConhecido = (blocosPorId[eq.id] || []).some((b) => b.estado !== 'sem_sinal');
      if (!temEstadoConhecido) semRegistros.push(eq.id);
    }

    return {
      porEquipamento,
      total: somarIndicadores(Object.values(porEquipamento)),
      diasDesconsiderados: dias,
      semHorarioCadastrado,
      avisos: {
        statusDesconhecidos: contarStatusDesconhecidos(eventos),
        equipamentosSemSinal: semSinal,
        equipamentosSemRegistros: semRegistros,
      },
      segmentos,
      faixasValidas,
    };
  }

  /* ---------- Expediente e tempo no estado ---------- */

  // true se o instante cai numa faixa do turno cadastrado. Sem horário cadastrado: true (24 h).
  function estaNoExpediente(instante, config) {
    if (!config || !(config.horarios || []).length) return true;
    const t = paraMs(instante);
    return dentroDeFaixa(t, faixasDoTurno(config, { de: t - DIA, ate: t + DIA }));
  }

  // Tempo, DENTRO do turno, desde o início do estado atual (último bloco do equipamento).
  function tempoNoEstadoNoExpedienteMs(blocosDoEquipamento, faixasValidas, agora) {
    if (!blocosDoEquipamento.length) return 0;
    const ult = blocosDoEquipamento[blocosDoEquipamento.length - 1];
    return tempoEmFaixas(faixasValidas, { inicio: ult.inicio, fim: Math.min(ult.fim, paraMs(agora)) });
  }

  /* ---------- Financeiro (versão v10) ---------- */

  function faltaValor(v) {
    return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
  }

  function itemFin(chave, rotulo, horas, valorHora, param, formula) {
    return { chave, rotulo, formula, valor: faltaValor(valorHora) ? null : horas * valorHora, faltando: faltaValor(valorHora) ? param : null };
  }

  function financeiroDeIndicadores(ind, fin) {
    const h = (ms) => ms / HORA;
    const itens = [
      itemFin('ociosidade', 'Custo estimado de ociosidade', h(ind.tempoEsperaMs), fin.custoOciosidadeHora,
        'custoOciosidadeHora', 'horas em espera (no turno) × custo de ociosidade/h'),
      itemFin('oportunidade', 'Custo de oportunidade (estimado)', h(ind.tempoInativoMs), fin.custoOportunidadeHora,
        'custoOportunidadeHora', 'horas desligada (no turno) × custo de oportunidade/h — só é perda real se havia demanda'),
      itemFin('capacidade', 'Capacidade não utilizada (valor potencial)', h(ind.tempoEsperaMs + ind.tempoInativoMs),
        fin.valorCapacidadeHora, 'valorCapacidadeHora', 'horas não produtivas (no turno) × valor da capacidade/h'),
      itemFin('operacional', 'Custo operacional do período', h(ind.tempoAtivoTotalMs + ind.tempoEsperaMs),
        fin.custoOperacionalHora, 'custoOperacionalHora', 'horas ligada (ativo + espera) × custo operacional/h'),
    ];
    const parcelas = itens.filter((i) => (i.chave === 'ociosidade' || i.chave === 'oportunidade') && i.valor !== null);
    return {
      itens,
      impacto: parcelas.length ? parcelas.reduce((t, i) => t + i.valor, 0) : null,
      parcial: parcelas.length < 2,
      faltando: itens.filter((i) => i.faltando).map((i) => i.faltando),
    };
  }

  /* ---------- Financeiro: a mesma função atende o formato antigo e o novo ---------- */

  // Formato ANTIGO: calcularFinanceiro(resumoFrota, params)  -> lista de 4 itens (telas atuais)
  // Formato NOVO:   calcularFinanceiro(indicadores, financeiro) -> { itens, impacto, parcial, faltando }
  function calcularFinanceiro(a, b) {
    if (a && a.tempoEsperaMs !== undefined && a.monitoradoH === undefined) return financeiroDeIndicadores(a, b || {});
    return calcularFinanceiroLegado(a, b);
  }

  /* ---------- Formatação no fuso da empresa (as antigas continuam no fuso do navegador) ---------- */

  function formatarDataHoraFuso(ts, fuso) {
    const t = paraMs(ts);
    if (t === null) return '—';
    const dois = (n) => String(n).padStart(2, '0');
    const p = partesCompletas(t, fuso);
    return dois(p.dia) + '/' + dois(p.mes) + ' ' + dois(p.hora) + ':' + dois(p.minuto);
  }

  function formatarHoraFuso(ts, fuso) {
    const t = paraMs(ts);
    if (t === null) return '—';
    const dois = (n) => String(n).padStart(2, '0');
    const p = partesCompletas(t, fuso);
    return dois(p.hora) + ':' + dois(p.minuto);
  }

  // 'AAAA-MM-DD' -> 'dd/mm' (usado na faixa de dias desconsiderados)
  function formatarDiaCurto(dataIso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataIso || '');
    return m ? m[3] + '/' + m[2] : '—';
  }

  window.Metricas = {
    MIN, HORA, DIA, ESTADOS, ROTULO, PARAMETROS_FINANCEIROS,
    normalizarStatus, resolverPeriodo, periodoAnterior, segmentosDe,
    calcularEquipamento, situacaoAtual, resumoFrota, contarAgora, serieTemporal,
    calcularFinanceiro, impactoEquipamento,
    formatarDuracao, formatarHoras, formatarPct, formatarMoeda, formatarDataHora, formatarHora,

    // ----- NOVO na v10 (ESPEC 02) -----
    CONFIG_METRICAS, ESTADOS_TODOS, ROTULO_COMPLETO, PARAMETROS_FINANCEIROS_V10,
    periodoPreset, periodoPersonalizado, periodoAnteriorMesmaDuracao,
    partesLocais, instanteLocal, minutosDe,
    construirBlocos, aplicarFrescor, faixasDoTurno, diasDesconsiderados, aplicarRegua,
    agregar, somarIndicadores, contarExecucoes, contarParadas,
    calcularTudo, estaNoExpediente, tempoNoEstadoNoExpedienteMs,
    formatarDataHoraFuso, formatarHoraFuso, formatarDiaCurto,
  };

  // As especificações escrevem "Metrics"; o código sempre usou "Metricas". Os dois são o MESMO objeto.
  window.Metrics = window.Metricas;
})();
