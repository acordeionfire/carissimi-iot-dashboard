/* ============================================================
   casos_config.js — CASOS DE TESTE do js/configEmpresa.js (ESPEC 03)
   Não faz parte do site. É usado pela página testes_config.html.
   Os testes que mexem no banco usam um Supabase FALSO (de mentira),
   então não gravam nada de verdade.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Supabase falso: só o que o configEmpresa.js usa ---------- */
  function criarSupabaseFalso(estado) {
    estado.chamadasRpc = [];
    const falhar = () => { if (estado.falhaRede) throw new Error('TypeError: Failed to fetch'); };
    function construir(tabela) {
      const q = { op: 'select', filtros: [], ordens: [], limite: null, valores: null, unico: false };
      const b = {
        select() { return b; },
        update(v) { q.op = 'update'; q.valores = v; return b; },
        eq(c, v) { q.filtros.push([c, v]); return b; },
        order(c, o) { q.ordens.push([c, !(o && o.ascending === false)]); return b; },
        limit(n) { q.limite = n; return b; },
        maybeSingle() { q.unico = true; return b; },
        then(res, rej) { return Promise.resolve().then(executar).then(res, rej); },
      };
      function executar() {
        falhar();
        if (estado.erroRetornado) return { data: null, error: { message: 'permission denied for table ' + tabela } };
        let rows = (estado[tabela] || []).filter((r) => q.filtros.every(([c, v]) => String(r[c]) === String(v)));
        if (q.op === 'update') {
          if (estado.bloquearUpdate) return { data: [], error: null };
          rows.forEach((r) => Object.assign(r, q.valores));
          return { data: rows.map((r) => ({ id: r.id })), error: null };
        }
        for (const [c, asc] of [...q.ordens].reverse()) {
          rows = [...rows].sort((x, y) => (x[c] < y[c] ? -1 : x[c] > y[c] ? 1 : 0) * (asc ? 1 : -1));
        }
        if (q.limite !== null) rows = rows.slice(0, q.limite);
        return { data: q.unico ? rows[0] || null : rows, error: null };
      }
      return b;
    }
    return {
      from: construir,
      rpc(nome, args) {
        falhar();
        estado.chamadasRpc.push({ nome, args });
        if (nome === 'salvar_horarios') {
          estado.horarios_funcionamento = (estado.horarios_funcionamento || [])
            .filter((h) => h.empresa_id !== args.p_empresa_id)
            .concat(args.p_horarios.map((h, i) => ({
              id: 1000 + i, empresa_id: args.p_empresa_id, dia_semana: h.dia_semana,
              hora_inicio: h.hora_inicio + ':00', hora_fim: h.hora_fim + ':00', // o banco devolve HH:MM:SS
            })));
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
  }

  function bancoNovo() {
    return {
      empresas: [
        { id: 2, razao_social: 'Outra Ltda', nome_fantasia: 'Outra', cnpj: '2', fuso_horario: 'America/Sao_Paulo' },
        {
          id: 1, razao_social: 'Casa do Mecânico Ltda', nome_fantasia: 'Carissimi', cnpj: '94.038.874/0001-81',
          fuso_horario: 'America/Sao_Paulo', custo_ociosidade_hora: '60.00', custo_oportunidade_hora: null,
          valor_capacidade_hora: 220, custo_operacional_hora: null, pecas_por_execucao: 1,
        },
      ],
      horarios_funcionamento: [
        { id: 1, empresa_id: 1, dia_semana: 1, hora_inicio: '13:00:00', hora_fim: '17:00:00' },
        { id: 2, empresa_id: 1, dia_semana: 1, hora_inicio: '07:00:00', hora_fim: '12:00:00' },
        { id: 3, empresa_id: 1, dia_semana: 6, hora_inicio: '08:00:00', hora_fim: '24:00:00' },
        { id: 4, empresa_id: 2, dia_semana: 3, hora_inicio: '09:00:00', hora_fim: '10:00:00' },
      ],
    };
  }

  function montar(C) {
    const casos = [];
    const caso = (nome, fn) => casos.push({ nome, fn });
    const igual = (obtido, esperado, msg) => {
      if (obtido !== esperado) throw new Error((msg || 'valor') + ': esperado ' + JSON.stringify(esperado) + ' mas veio ' + JSON.stringify(obtido));
    };
    const verdade = (cond, msg) => { if (!cond) throw new Error(msg); };
    const faixa = (d, i, f) => ({ diaSemana: d, inicio: i, fim: f });

    /* ---------- ESPEC 03: T1 a T9 (não precisam de banco) ---------- */

    caso('T1 — turno com almoço é válido', () => {
      igual(C.validarHorarios([faixa(1, '07:00', '12:00'), faixa(1, '13:00', '17:00')]).ok, true);
    });
    caso('T2 — faixas que se sobrepõem no mesmo dia', () => {
      const r = C.validarHorarios([faixa(1, '07:00', '12:00'), faixa(1, '11:00', '13:00')]);
      igual(r.ok, false, 'ok'); verdade(/se sobrep/.test(r.erros.join(' ')), 'o erro deveria citar "se sobrepõem": ' + r.erros.join(' | '));
      verdade(/Segunda/.test(r.erros.join(' ')), 'o erro deveria citar o dia (Segunda)');
    });
    caso('T3 — fim antes do início', () => {
      igual(C.validarHorarios([faixa(1, '07:00', '06:00')]).ok, false);
    });
    caso('T4 — fim 24:00 é aceito', () => {
      igual(C.validarHorarios([faixa(6, '08:00', '24:00')]).ok, true);
    });
    caso('T5 — início 24:00 é recusado', () => {
      igual(C.validarHorarios([faixa(1, '24:00', '24:00')]).ok, false);
    });
    caso('T6 — dia da semana 7 é recusado', () => {
      igual(C.validarHorarios([faixa(7, '07:00', '12:00')]).ok, false);
    });
    caso('T7 — lista vazia é válida ("sem horário")', () => {
      const r = C.validarHorarios([]);
      igual(r.ok, true, 'ok'); igual(r.horariosNormalizados.length, 0, 'normalizados');
    });
    caso('T8 — valores em R$: vazio vira null e arredonda em 2 casas', () => {
      const r = C.validarFinanceiro({ custoOciosidadeHora: '', valorCapacidadeHora: 120.456 });
      igual(r.ok, true, 'ok'); igual(r.financeiroNormalizado.custoOciosidadeHora, null, 'vazio'); igual(r.financeiroNormalizado.valorCapacidadeHora, 120.46, 'arredondado');
    });
    caso('T9 — valor negativo é recusado', () => {
      const r = C.validarFinanceiro({ custoOciosidadeHora: -1 });
      igual(r.ok, false, 'ok'); verdade(/negativo/.test(r.erros.join(' ')), 'deveria dizer que não pode ser negativo');
    });

    /* ---------- T10 e T11 e extras (com o banco falso) ---------- */

    caso('T10 — salvar o turno e ler de volta devolve o mesmo turno, ordenado', async () => {
      const banco = bancoNovo(); const sb = criarSupabaseFalso(banco); C.limparCache();
      const turno = [faixa(3, '13:00', '17:00'), faixa(3, '07:00', '12:00'), faixa(1, '08:00', '18:00')];
      const s = await C.salvarHorarios(sb, 1, turno);
      igual(s.ok, true, 'salvar');
      const r = await C.carregarConfig(sb, 1);
      igual(r.ok, true, 'carregar');
      igual(JSON.stringify(r.dados.horarios), JSON.stringify([faixa(1, '08:00', '18:00'), faixa(3, '07:00', '12:00'), faixa(3, '13:00', '17:00')]), 'turno lido');
      igual(banco.horarios_funcionamento.filter((h) => h.empresa_id === 2).length, 1, 'não pode mexer no turno de outra empresa');
    });

    caso('T11 — sem internet: não lança erro, devolve ok:false e a configuração padrão', async () => {
      const sb = criarSupabaseFalso({ ...bancoNovo(), falhaRede: true }); C.limparCache();
      const r = await C.carregarConfig(sb, 1);
      igual(r.ok, false, 'ok'); verdade(/conex/i.test(r.erro), 'mensagem deveria falar de conexão: ' + r.erro);
      igual(JSON.stringify(r.dados), JSON.stringify(C.configPadrao(1)), 'dados = configPadrao');
    });

    caso('X1 — leitura completa: fuso, valores (texto vira número) e horas "HH:MM:SS" viram "HH:MM"', async () => {
      const sb = criarSupabaseFalso(bancoNovo()); C.limparCache();
      const d = (await C.carregarConfig(sb, 1)).dados;
      igual(d.empresaId, 1, 'empresaId'); igual(d.fuso, 'America/Sao_Paulo', 'fuso');
      igual(d.financeiro.custoOciosidadeHora, 60, '"60.00" virou 60'); igual(d.financeiro.custoOportunidadeHora, null, 'null fica null');
      igual(d.financeiro.valorCapacidadeHora, 220, 'capacidade'); igual(d.financeiro.pecasPorExecucao, 1, 'peças por execução');
      igual(d.horarios[0].inicio, '07:00', 'ordenado: 07:00 vem antes de 13:00');
      igual(d.horarios[d.horarios.length - 1].fim, '24:00', '"24:00:00" virou "24:00"');
    });

    caso('X2 — salvar valores grava nas colunas certas ("" vira null)', async () => {
      const banco = bancoNovo(); const sb = criarSupabaseFalso(banco); C.limparCache();
      const s = await C.salvarFinanceiro(sb, 1, { custoOciosidadeHora: '', custoOportunidadeHora: '12,345', valorCapacidadeHora: '1.234,50', custoOperacionalHora: 5 });
      igual(s.ok, true, 'salvar');
      const e = banco.empresas.find((x) => x.id === 1);
      igual(e.custo_ociosidade_hora, null, 'ociosidade'); igual(e.custo_oportunidade_hora, 12.35, 'oportunidade');
      igual(e.valor_capacidade_hora, 1234.5, 'capacidade'); igual(e.custo_operacional_hora, 5, 'operacional');
      igual(banco.empresas.find((x) => x.id === 2).custo_operacional_hora, undefined, 'outra empresa não pode mudar');
    });

    caso('X3 — update que não atinge nenhuma linha (permissão) vira erro claro', async () => {
      const sb = criarSupabaseFalso({ ...bancoNovo(), bloquearUpdate: true }); C.limparCache();
      const s = await C.salvarFinanceiro(sb, 1, { custoOciosidadeHora: 1 });
      igual(s.ok, false, 'ok'); verdade(/permiss/.test(s.erro), 'deveria mencionar permissões: ' + s.erro);
    });

    caso('X4 — erro devolvido pelo banco (sem lançar) também vira ok:false', async () => {
      const sb = criarSupabaseFalso({ ...bancoNovo(), erroRetornado: true }); C.limparCache();
      const r = await C.carregarConfig(sb, 1);
      igual(r.ok, false, 'carregar'); verdade(/permission denied/.test(r.erro), 'deveria repassar o motivo: ' + r.erro);
    });

    caso('X5 — turno inválido nem chega ao banco', async () => {
      const banco = bancoNovo(); const sb = criarSupabaseFalso(banco);
      const s = await C.salvarHorarios(sb, 1, [faixa(1, '07:00', '12:00'), faixa(1, '11:00', '13:00')]);
      igual(s.ok, false, 'ok'); igual(banco.chamadasRpc.length, 0, 'não pode chamar o banco');
    });

    caso('X6 — fuso inválido no banco: usa o padrão e avisa', async () => {
      const banco = bancoNovo(); banco.empresas.find((e) => e.id === 1).fuso_horario = 'Marte/Olimpo';
      const sb = criarSupabaseFalso(banco); C.limparCache();
      const r = await C.carregarConfig(sb, 1);
      igual(r.ok, true, 'ok'); igual(r.dados.fuso, 'America/Sao_Paulo', 'fuso'); verdade(/inv/i.test(r.aviso || ''), 'deveria trazer um aviso');
    });

    caso('X7 — salvar fuso: aceita fuso válido e recusa inválido', async () => {
      const banco = bancoNovo(); const sb = criarSupabaseFalso(banco);
      igual((await C.salvarFuso(sb, 1, 'America/Manaus')).ok, true, 'válido');
      igual(banco.empresas.find((e) => e.id === 1).fuso_horario, 'America/Manaus', 'gravado');
      igual((await C.salvarFuso(sb, 1, 'Marte/Olimpo')).ok, false, 'inválido');
    });

    caso('X8 — cache: segunda leitura não vai ao banco; depois de salvar, lê de novo', async () => {
      const banco = bancoNovo(); const sb = criarSupabaseFalso(banco); C.limparCache();
      await C.carregarConfig(sb, 1);
      banco.empresas.find((e) => e.id === 1).custo_ociosidade_hora = 99; // muda "por fora"
      igual((await C.carregarConfig(sb, 1)).dados.financeiro.custoOciosidadeHora, 60, 'veio do cache');
      await C.salvarFinanceiro(sb, 1, { custoOciosidadeHora: 70 });
      igual((await C.carregarConfig(sb, 1)).dados.financeiro.custoOciosidadeHora, 70, 'depois de salvar, relê do banco');
    });

    caso('X9 — empresa atual = a de menor id', async () => {
      const sb = criarSupabaseFalso(bancoNovo());
      const r = await C.obterEmpresaAtual(sb);
      igual(r.ok, true, 'ok'); igual(r.dados.id, 1, 'id'); igual(r.dados.nome_fantasia, 'Carissimi', 'nome');
    });

    caso('X10 — modo demonstração: não lê nem grava', async () => {
      const banco = bancoNovo(); const sb = criarSupabaseFalso(banco);
      C._forcarDemoParaTeste(true);
      try {
        const c = await C.carregarConfig(sb, 1);
        igual(c.ok, true, 'carregar'); igual(c.demo, true, 'marcado como demo');
        const s = await C.salvarFinanceiro(sb, 1, { custoOciosidadeHora: 1 });
        igual(s.ok, false, 'salvar'); verdade(/demonstra/i.test(s.erro), 'mensagem de demo: ' + s.erro);
        igual((await C.salvarHorarios(sb, 1, [])).ok, false, 'salvar horários');
        igual((await C.obterEmpresaAtual(sb)).demo, true, 'empresa de demonstração');
        igual(banco.chamadasRpc.length, 0, 'nada chegou ao banco');
      } finally { C._forcarDemoParaTeste(null); }
    });

    caso('X11 — leitura de números em português ("1.234,56", "R$ 10")', () => {
      igual(C.paraNumero('1.234,56'), 1234.56, '1.234,56'); igual(C.paraNumero('1234,5'), 1234.5, '1234,5');
      igual(C.paraNumero('R$ 10'), 10, 'R$ 10'); igual(C.paraNumero('abc'), null, 'abc'); igual(C.paraNumero(''), null, 'vazio');
    });

    caso('X12 — valor com letras é recusado (não vira zero em silêncio)', () => {
      const r = C.validarFinanceiro({ valorCapacidadeHora: 'abc' });
      igual(r.ok, false, 'ok'); verdade(/inv/.test(r.erros.join(' ')), 'deveria dizer que é inválido');
    });

    return casos;
  }

  async function rodar(C) {
    const saida = [];
    for (const c of montar(C)) {
      try { await c.fn(); saida.push({ nome: c.nome, ok: true }); }
      catch (e) { saida.push({ nome: c.nome, ok: false, erro: e.message }); }
    }
    return saida;
  }

  window.TestesConfig = { rodar };
})();
