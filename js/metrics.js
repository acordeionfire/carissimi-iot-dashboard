/* ============================================================
   metrics.js — CÁLCULOS DOS INDICADORES (sem nada de tela aqui)
   Portado do metrics.ts do Lovable para JavaScript puro e
   adaptado aos dados reais do Supabase (historico_status).

   Ideia central: cada linha de historico_status é um "evento"
   (a máquina mudou para tal status naquele horário). O tempo
   em cada estado é o intervalo entre um evento e o próximo.
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
          else inativo += fim - ini;
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

  function calcularFinanceiro(resumo, params) {
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

  window.Metricas = {
    MIN, HORA, DIA, ESTADOS, ROTULO, PARAMETROS_FINANCEIROS,
    normalizarStatus, resolverPeriodo, periodoAnterior, segmentosDe,
    calcularEquipamento, situacaoAtual, resumoFrota, contarAgora, serieTemporal,
    calcularFinanceiro, impactoEquipamento,
    formatarDuracao, formatarHoras, formatarPct, formatarMoeda, formatarDataHora, formatarHora,
  };
})();
