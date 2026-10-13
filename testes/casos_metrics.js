/* ============================================================
   casos_metrics.js — CASOS DE TESTE do js/metrics.js (ESPEC 02)
   Não faz parte do site. É usado pela página testes_metrics.html.
   Cada caso lança um erro se algo estiver diferente do esperado.
   Fuso de todos os exemplos: America/Sao_Paulo (UTC−3).
   Turno: segunda a sexta, 07–12 e 13–17.
   ============================================================ */
(function () {
  'use strict';

  const SP = 'America/Sao_Paulo';
  const Z = (s) => Date.parse(s);
  const MIN = 60000;
  const H = 3600000;

  function montar(M) {
    const casos = [];
    const caso = (nome, fn) => casos.push({ nome, fn });

    const igual = (obtido, esperado, msg) => {
      if (obtido !== esperado) throw new Error((msg || 'valor') + ': esperado ' + esperado + ' mas veio ' + obtido);
    };
    const perto = (obtido, esperado, tol, msg) => {
      if (obtido === null || obtido === undefined || Math.abs(obtido - esperado) > tol) {
        throw new Error((msg || 'valor') + ': esperado ≈ ' + esperado + ' mas veio ' + obtido);
      }
    };
    const verdade = (cond, msg) => { if (!cond) throw new Error(msg); };

    const diasUteis = [1, 2, 3, 4, 5];
    const CFG = {
      fuso: SP,
      horarios: diasUteis.flatMap((d) => [
        { diaSemana: d, inicio: '07:00', fim: '12:00' },
        { diaSemana: d, inicio: '13:00', fim: '17:00' },
      ]),
    };
    const EQ1 = [{ id: 1, nome: 'Torno', status_atual: 'INATIVO', ultimo_sinal_em: null }];
    const ev = (id, status, iso) => ({ equipamento_id: id, status, registrado_em: iso });
    const dia = (iso) => ({ de: Z(iso + 'T03:00:00Z'), ate: Z(iso + 'T03:00:00Z') + 24 * H }); // dia local (SP) que começa em iso 03:00Z

    /* ---------- Compatibilidade (nada do que existia pode quebrar) ---------- */

    caso('C1 — Metrics e Metricas são o MESMO objeto', () => {
      verdade(window.Metrics === window.Metricas, 'Metrics !== Metricas');
    });

    caso('C2 — todas as funções e constantes do inventário continuam existindo', () => {
      const funcoes = ['normalizarStatus', 'resolverPeriodo', 'periodoAnterior', 'segmentosDe', 'calcularEquipamento',
        'situacaoAtual', 'resumoFrota', 'contarAgora', 'serieTemporal', 'calcularFinanceiro', 'impactoEquipamento',
        'formatarDuracao', 'formatarHoras', 'formatarPct', 'formatarMoeda', 'formatarDataHora', 'formatarHora'];
      const constantes = ['MIN', 'HORA', 'DIA', 'ESTADOS', 'ROTULO', 'PARAMETROS_FINANCEIROS'];
      for (const f of funcoes) igual(typeof M[f], 'function', f);
      for (const c of constantes) verdade(M[c] !== undefined, 'faltando constante ' + c);
      igual(M.ESTADOS.join(','), 'ativo,espera,inativo', 'ESTADOS não pode mudar');
    });

    caso('C3 — funções antigas dão o mesmo resultado de antes', () => {
      igual(M.normalizarStatus('EM_ESPERA'), 'espera');
      igual(M.normalizarStatus(' Ativo '), 'ativo');
      igual(M.normalizarStatus('FOO'), null);
      const t0 = Z('2026-10-05T10:00:00Z');
      const evs = [{ t: t0, status: 'ATIVO' }, { t: t0 + 2 * H, status: 'EM_ESPERA' }, { t: t0 + 3 * H, status: 'INATIVO' }];
      const m = M.calcularEquipamento({ id: 1 }, evs, t0, t0 + 6 * H, t0 + 6 * H);
      igual(m.ativoMs, 2 * H, 'ativoMs'); igual(m.esperaMs, H, 'esperaMs'); igual(m.inativoMs, 3 * H, 'inativoMs');
      igual(m.paradas, 1, 'paradas (antigo conta blocos INATIVO)');
      igual(M.formatarDuracao(135 * MIN), '2h 15min');
      igual(M.formatarPct(85.44, 1), '85,4%');
    });

    caso('C4 — função financeira antiga (formato do Dashboard atual) continua igual', () => {
      const itens = M.calcularFinanceiro({ esperaH: 2, inativoH: 1, monitoradoH: 10, ativoH: 7 }, { custoOciosidadeHora: 10, custoParadaHora: 20, valorCapacidadeHora: null, custoOperacionalHora: 5 });
      igual(itens.length, 4, 'quantidade de itens');
      igual(itens[0].valor, 20, 'ociosidade'); igual(itens[1].valor, 20, 'parada'); igual(itens[2].valor, null, 'capacidade sem valor');
    });

    /* ---------- ESPEC 02: T1 a T10 ---------- */

    caso('T1 — régua básica (hora extra, execuções, OEE)', () => {
      const eventos = [
        ev(1, 'INATIVO', '2026-10-04T23:00:00Z'), ev(1, 'ATIVO', '2026-10-05T10:00:00Z'),
        ev(1, 'EM_ESPERA', '2026-10-05T12:00:00Z'), ev(1, 'ATIVO', '2026-10-05T12:30:00Z'),
        ev(1, 'INATIVO', '2026-10-05T15:00:00Z'), ev(1, 'ATIVO', '2026-10-05T16:00:00Z'),
        ev(1, 'EM_ESPERA', '2026-10-05T20:30:00Z'), ev(1, 'INATIVO', '2026-10-05T21:00:00Z'),
      ];
      const r = M.calcularTudo({ eventos, equipamentos: EQ1, periodo: dia('2026-10-05'), config: CFG, agora: Z('2026-10-06T12:00:00Z') });
      const t = r.porEquipamento[1];
      igual(t.tempoProgramadoMs, 9 * H, 'programado'); igual(t.tempoAtivoDentroMs, 8.5 * H, 'ativo dentro');
      igual(t.tempoEsperaMs, 0.5 * H, 'espera'); igual(t.tempoInativoMs, 0, 'inativo');
      igual(t.horasExtrasMs, 0.5 * H, 'horas extras'); igual(t.denominadorMs, 9.5 * H, 'denominador');
      perto(t.disponibilidadeOEE, 9 / 9.5, 1e-9, 'disponibilidade OEE'); igual(t.maquinaLigada, 1, 'máquina ligada');
      igual(t.execucoes, 3, 'execuções'); igual(t.execucoesDentro, 3, 'execuções dentro'); igual(t.tempoMedioExecucaoMs, 3 * H, 'tempo médio');
      igual(t.paradas, 0, 'paradas'); igual(t.maiorPeriodoSemProduzirMs, 0.5 * H, 'maior período sem produzir'); igual(t.coberturaDados, 1, 'cobertura');
    });

    caso('T2 — dia desconsiderado (feriado inferido)', () => {
      const r = M.calcularTudo({ eventos: [ev(1, 'INATIVO', '2026-10-05T20:00:00Z')], equipamentos: EQ1, periodo: dia('2026-10-06'), config: CFG, agora: Z('2026-10-07T12:00:00Z') });
      igual(r.diasDesconsiderados.map((d) => d.data).join(','), '2026-10-06', 'dias');
      const t = r.porEquipamento[1];
      igual(t.tempoProgramadoMs, 0, 'programado'); igual(t.disponibilidadeOEE, null, 'OEE'); igual(t.paradas, 0, 'paradas');
    });

    caso('T3 — dia ainda não encerrado NÃO é desconsiderado', () => {
      const r = M.calcularTudo({ eventos: [ev(1, 'INATIVO', '2026-10-05T20:00:00Z')], equipamentos: EQ1, periodo: dia('2026-10-06'), config: CFG, agora: Z('2026-10-06T13:00:00Z') });
      igual(r.diasDesconsiderados.length, 0, 'dias');
      const t = r.porEquipamento[1];
      igual(t.tempoInativoMs, 3 * H, 'inativo (07h–10h local)'); igual(t.disponibilidadeOEE, 0, 'OEE');
    });

    caso('T4 — execuções: ATIVO anterior ao período e execução curta não contam', () => {
      const eventos = [
        ev(1, 'ATIVO', '2026-10-05T02:00:00Z'), ev(1, 'EM_ESPERA', '2026-10-05T10:00:00Z'),
        ev(1, 'ATIVO', '2026-10-05T10:30:00Z'), ev(1, 'EM_ESPERA', '2026-10-05T10:30:05Z'),
        ev(1, 'ATIVO', '2026-10-05T11:00:00Z'), ev(1, 'EM_ESPERA', '2026-10-05T11:20:00Z'),
      ];
      const t = M.calcularTudo({ eventos, equipamentos: EQ1, periodo: dia('2026-10-05'), config: CFG, agora: Z('2026-10-06T12:00:00Z') }).porEquipamento[1];
      igual(t.execucoes, 1, 'execuções'); igual(t.tempoMedioExecucaoMs, 20 * MIN, 'tempo médio');
    });

    caso('T5 — SEM_SINAL é transparente para execuções e fica fora do denominador', () => {
      const eventos = [
        ev(1, 'ATIVO', '2026-10-05T10:00:00Z'), ev(1, 'SEM_SINAL', '2026-10-05T11:00:00Z'),
        ev(1, 'ATIVO', '2026-10-05T11:30:00Z'), ev(1, 'EM_ESPERA', '2026-10-05T12:30:00Z'),
      ];
      const t = M.calcularTudo({ eventos, equipamentos: EQ1, periodo: dia('2026-10-05'), config: CFG, agora: Z('2026-10-06T12:00:00Z') }).porEquipamento[1];
      igual(t.execucoes, 1, 'execuções'); igual(t.tempoSemSinalMs, 30 * MIN, 'tempo sem sinal');
      igual(t.duracaoExecucoesMs, 2 * H, 'duração da execução'); igual(t.tempoMonitoradoDentroMs, 8.5 * H, 'monitorado (sem o SEM_SINAL)');
    });

    caso('T6 — status desconhecido gera aviso (não passa em silêncio)', () => {
      const eventos = [ev(1, 'ATIVO', '2026-10-05T10:00:00Z'), ev(1, 'FOO', '2026-10-05T11:00:00Z'), ev(1, 'ATIVO', '2026-10-05T11:10:00Z')];
      const r = M.calcularTudo({ eventos, equipamentos: EQ1, periodo: dia('2026-10-05'), config: CFG, agora: Z('2026-10-06T12:00:00Z') });
      igual(r.avisos.statusDesconhecidos.FOO, 1, 'aviso FOO');
      const t = r.porEquipamento[1];
      for (const k of Object.keys(t)) verdade(!(typeof t[k] === 'number' && !Number.isFinite(t[k])), k + ' virou NaN/Infinity');
    });

    caso('T7 — sem horário cadastrado: 24 h corridas e aviso', () => {
      const eventos = [ev(1, 'ATIVO', '2026-10-05T03:00:00Z'), ev(1, 'INATIVO', '2026-10-05T09:00:00Z')];
      const r = M.calcularTudo({ eventos, equipamentos: EQ1, periodo: dia('2026-10-05'), config: { fuso: SP, horarios: [] }, agora: Z('2026-10-06T12:00:00Z') });
      igual(r.semHorarioCadastrado, true, 'semHorarioCadastrado');
      const t = r.porEquipamento[1];
      igual(t.tempoProgramadoMs, 24 * H, 'programado'); igual(t.tempoAtivoDentroMs, 6 * H, 'ativo'); igual(t.disponibilidadeOEE, 0.25, 'OEE');
    });

    caso('T8 — "Hoje" usa o fuso da empresa, não o do navegador', () => {
      const p = M.periodoPreset('hoje', Z('2026-10-06T01:00:00Z'), SP);
      igual(p.de, Z('2026-10-05T03:00:00Z'), 'início de "hoje"');
    });

    caso('T9 — SEM_SINAL virtual quando o último sinal está velho', () => {
      const blocos = [{ equipamentoId: 1, estado: 'ativo', inicio: Z('2026-10-05T11:00:00Z'), fim: Z('2026-10-05T12:10:00Z') }];
      const agora = Z('2026-10-05T12:10:00Z');
      const r = M.aplicarFrescor(blocos, Z('2026-10-05T12:00:00Z'), agora);
      igual(r.length, 2, 'blocos'); igual(r[1].estado, 'sem_sinal', 'estado do trecho final'); igual(r[1].inicio, Z('2026-10-05T12:05:00Z'), 'início do SEM_SINAL');
      igual(M.aplicarFrescor(blocos, null, agora).length, 1, 'ultimo_sinal_em nulo não muda nada');
    });

    caso('T10 — total da empresa é média PONDERADA', () => {
      const cfg = { fuso: SP, horarios: [{ diaSemana: 1, inicio: '07:00', fim: '10:00' }] };
      const eqs = [{ id: 1, nome: 'A' }, { id: 2, nome: 'B' }];
      const eventos = [
        ev(1, 'ATIVO', '2026-10-05T10:00:00Z'), ev(1, 'INATIVO', '2026-10-05T11:30:00Z'),
        ev(2, 'ATIVO', '2026-10-05T10:00:00Z'), ev(2, 'SEM_SINAL', '2026-10-05T11:00:00Z'),
      ];
      const r = M.calcularTudo({ eventos, equipamentos: eqs, periodo: dia('2026-10-05'), config: cfg, agora: Z('2026-10-06T12:00:00Z') });
      perto(r.porEquipamento[1].disponibilidadeOEE, 0.5, 1e-9, 'máquina A'); perto(r.porEquipamento[2].disponibilidadeOEE, 1, 1e-9, 'máquina B');
      perto(r.total.disponibilidadeOEE, 0.625, 1e-9, 'total ponderado (não 75%)');
    });

    /* ---------- Casos extras que protegem as regras do CONTEXTO ---------- */

    caso('X1 — ATIVO fora do turno com menos de 5 min não vira hora extra', () => {
      const eventos = [ev(1, 'ATIVO', '2026-10-05T19:58:00Z'), ev(1, 'INATIVO', '2026-10-05T20:02:00Z')];
      const t = M.calcularTudo({ eventos, equipamentos: EQ1, periodo: dia('2026-10-05'), config: CFG, agora: Z('2026-10-06T12:00:00Z') }).porEquipamento[1];
      igual(t.horasExtrasMs, 0, 'horas extras'); igual(t.tempoAtivoDentroMs, 2 * MIN, 'ativo dentro do turno');
    });

    caso('X2 — sábado trabalhado conta como hora extra (dia sem turno não é "feriado")', () => {
      const r = M.calcularTudo({ eventos: [ev(1, 'ATIVO', '2026-10-10T11:00:00Z'), ev(1, 'INATIVO', '2026-10-10T13:00:00Z')], equipamentos: EQ1, periodo: dia('2026-10-10'), config: CFG, agora: Z('2026-10-11T12:00:00Z') });
      const t = r.porEquipamento[1];
      igual(t.horasExtrasMs, 2 * H, 'horas extras'); igual(t.tempoProgramadoMs, 0, 'programado'); igual(t.disponibilidadeOEE, 1, 'OEE'); igual(r.diasDesconsiderados.length, 0, 'dias');
    });

    caso('X3 — filtro por máquina NÃO muda a detecção de dias desconsiderados', () => {
      const eqs = [{ id: 1, nome: 'A' }, { id: 2, nome: 'B' }];
      const eventos = [ev(1, 'INATIVO', '2026-10-05T20:00:00Z'), ev(2, 'ATIVO', '2026-10-06T10:00:00Z'), ev(2, 'INATIVO', '2026-10-06T20:00:00Z')];
      const r = M.calcularTudo({ eventos, equipamentos: eqs, periodo: dia('2026-10-06'), config: CFG, agora: Z('2026-10-07T12:00:00Z'), filtroEquipamentoId: 1 });
      igual(r.diasDesconsiderados.length, 0, 'dias (a máquina B trabalhou)');
      igual(Object.keys(r.porEquipamento).length, 1, 'só a máquina filtrada');
      igual(r.porEquipamento[1].tempoInativoMs, 9 * H, 'inativo da máquina A');
    });

    caso('X4 — fuso inválido não derruba o cálculo', () => {
      const p = M.partesLocais(Z('2026-10-05T10:00:00Z'), 'Foo/Bar');
      igual(p.dia, 5, 'dia'); igual(p.minutosDoDia, 7 * 60, 'cai no fuso padrão (07:00)');
    });

    caso('X5 — conversão de horário local para UTC (inclui 24:00)', () => {
      igual(M.instanteLocal(2026, 10, 5, 7 * 60, SP), Z('2026-10-05T10:00:00Z'), '07:00 local');
      igual(M.instanteLocal(2026, 10, 5, 1440, SP), Z('2026-10-06T03:00:00Z'), '24:00 local');
    });

    caso('X6 — estaNoExpediente (almoço fora; sem horário = sempre)', () => {
      igual(M.estaNoExpediente(Z('2026-10-05T14:00:00Z'), CFG), true, '11:00 local');
      igual(M.estaNoExpediente(Z('2026-10-05T15:30:00Z'), CFG), false, '12:30 local (almoço)');
      igual(M.estaNoExpediente(Z('2026-10-05T15:30:00Z'), { fuso: SP, horarios: [] }), true, 'sem horário');
    });

    caso('X7 — financeiro novo: parcial quando falta valor', () => {
      const ind = M.agregar([
        { equipamentoId: 1, estado: 'espera', inicio: 0, fim: 1 * H, dentroTurno: true },
        { equipamentoId: 1, estado: 'inativo', inicio: 1 * H, fim: 3 * H, dentroTurno: true },
        { equipamentoId: 1, estado: 'ativo', inicio: 3 * H, fim: 4 * H, dentroTurno: true },
      ]);
      const f = M.calcularFinanceiro(ind, { custoOciosidadeHora: 60, custoOportunidadeHora: null, valorCapacidadeHora: 100, custoOperacionalHora: 10 });
      igual(f.impacto, 60, 'impacto só com o que foi informado'); igual(f.parcial, true, 'parcial');
      verdade(f.faltando.indexOf('custoOportunidadeHora') >= 0, 'deveria listar custoOportunidadeHora');
      igual(f.itens.find((i) => i.chave === 'capacidade').valor, 300, 'capacidade = 3 h × 100');
      igual(f.itens.find((i) => i.chave === 'operacional').valor, 20, 'operacional = (1 h ativo + 1 h espera) × 10');
    });

    caso('X8 — formatação no fuso da empresa', () => {
      igual(M.formatarDataHoraFuso(Z('2026-10-05T10:00:00Z'), SP), '05/10 07:00');
      igual(M.formatarDiaCurto('2026-10-07'), '07/10');
    });

    caso('X9 — períodos: mês anterior e personalizado (fuso da empresa)', () => {
      const p = M.periodoPreset('mes_anterior', Z('2026-10-15T12:00:00Z'), SP);
      igual(p.de, Z('2026-09-01T03:00:00Z'), 'início de setembro'); igual(p.ate, Z('2026-10-01T03:00:00Z'), 'fim (exclusivo)');
      const c = M.periodoPersonalizado('2026-10-01', '2026-10-02', Z('2026-10-20T12:00:00Z'), SP);
      igual(c.de, Z('2026-10-01T03:00:00Z'), 'início'); igual(c.ate, Z('2026-10-03T03:00:00Z'), 'fim (dia 02 inteiro)');
    });

    return casos;
  }

  function rodar(M) {
    return montar(M).map((c) => {
      try { c.fn(); return { nome: c.nome, ok: true }; }
      catch (e) { return { nome: c.nome, ok: false, erro: e.message }; }
    });
  }

  window.TestesMetrics = { rodar };
})();
