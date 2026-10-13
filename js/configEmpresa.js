/* ============================================================
   configEmpresa.js — LÊ e GRAVA a configuração da empresa
   (fuso horário, horário de funcionamento e valores em R$/hora).

   Dashboard, Relatórios e a tela de Configurações usam SÓ este
   arquivo para falar com horarios_funcionamento e com as colunas
   novas da tabela empresas. (ESPEC 03)

   Regras importantes:
   - Nenhuma função lança erro para fora: todas devolvem
     { ok: true, dados } ou { ok: false, erro: 'mensagem' }.
   - Nada de localStorage: o que vale é o que está no banco.
   - No modo demonstração (?demo=1) nada é lido nem gravado.
   ============================================================ */
(function () {
  'use strict';

  const FUSO_PADRAO = 'America/Sao_Paulo';

  const FUSOS_BRASIL = [
    { valor: 'America/Sao_Paulo', rotulo: 'Brasília (America/Sao_Paulo)' },
    { valor: 'America/Manaus', rotulo: 'Manaus (America/Manaus)' },
    { valor: 'America/Cuiaba', rotulo: 'Cuiabá (America/Cuiaba)' },
    { valor: 'America/Campo_Grande', rotulo: 'Campo Grande (America/Campo_Grande)' },
    { valor: 'America/Belem', rotulo: 'Belém (America/Belem)' },
    { valor: 'America/Fortaleza', rotulo: 'Fortaleza (America/Fortaleza)' },
    { valor: 'America/Recife', rotulo: 'Recife (America/Recife)' },
    { valor: 'America/Bahia', rotulo: 'Salvador (America/Bahia)' },
    { valor: 'America/Porto_Velho', rotulo: 'Porto Velho (America/Porto_Velho)' },
    { valor: 'America/Rio_Branco', rotulo: 'Rio Branco (America/Rio_Branco)' },
    { valor: 'America/Noronha', rotulo: 'Fernando de Noronha (America/Noronha)' },
  ];

  const NOMES_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  // Os 4 valores em R$/hora (+ peças por execução, que existe só como DADO; não tem tela).
  const CAMPOS_FINANCEIROS = [
    { chave: 'custoOciosidadeHora', coluna: 'custo_ociosidade_hora', rotulo: 'Custo de ociosidade' },
    { chave: 'custoOportunidadeHora', coluna: 'custo_oportunidade_hora', rotulo: 'Custo de oportunidade' },
    { chave: 'valorCapacidadeHora', coluna: 'valor_capacidade_hora', rotulo: 'Valor da capacidade produtiva' },
    { chave: 'custoOperacionalHora', coluna: 'custo_operacional_hora', rotulo: 'Custo operacional' },
  ];

  const VALOR_MAXIMO = 9999999999.99; // limite da coluna numeric(12,2)

  /* ---------- Estado interno ---------- */

  const cache = new Map(); // empresaId -> Config
  let demoForcado = null;  // só para os testes automáticos

  function limparCache() {
    cache.clear();
  }

  function clonar(x) {
    return JSON.parse(JSON.stringify(x));
  }

  /* ---------- Modo demonstração ---------- */

  function modoDemo() {
    if (demoForcado !== null) return demoForcado;
    try {
      return new URLSearchParams(window.location.search).get('demo') === '1';
    } catch (e) {
      return false;
    }
  }

  function empresaDemo() {
    const d = window.DemoData;
    return (d && d.DEMO_EMPRESA) || { id: 0, razao_social: 'Empresa Demonstração Ltda', nome_fantasia: 'Demonstração', cnpj: '00.000.000/0001-00' };
  }

  function configDemo() {
    const d = window.DemoData;
    return d && d.DEMO_CONFIG ? clonar(d.DEMO_CONFIG) : configPadrao(0);
  }

  const ERRO_DEMO = 'Modo demonstração: nada é salvo.';

  /* ---------- Utilidades ---------- */

  function fusoValido(fuso) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: fuso });
      return true;
    } catch (e) {
      return false;
    }
  }

  function mensagemDeErro(e) {
    const m = e && e.message ? String(e.message) : '';
    if (/fetch|network|rede|timeout|offline/i.test(m)) return 'Sem conexão com o banco de dados.';
    return 'Erro ao falar com o banco: ' + (m || 'motivo desconhecido');
  }

  // 'H:MM', 'HH:MM' ou 'HH:MM:SS' -> 'HH:MM' (ou null se inválido). '24:00' é permitido.
  function normalizarHora(txt) {
    const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(txt === undefined || txt === null ? '' : txt).trim());
    if (!m) return null;
    const h = +m[1];
    const mi = +m[2];
    if (mi > 59 || h > 24 || (h === 24 && mi !== 0)) return null;
    return String(h).padStart(2, '0') + ':' + m[2];
  }

  function minutos(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  // Aceita número, '1234.56', '1234,56' e '1.234,56'. Vazio/inválido -> null.
  function paraNumero(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = String(v).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
    if (s === '') return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function arredondar2(n) {
    return Math.round(n * 100) / 100;
  }

  /* ---------- Configuração padrão ---------- */

  function configPadrao(empresaId) {
    return {
      empresaId: empresaId === undefined ? null : empresaId,
      fuso: FUSO_PADRAO,
      horarios: [],
      financeiro: {
        custoOciosidadeHora: null,
        custoOportunidadeHora: null,
        valorCapacidadeHora: null,
        custoOperacionalHora: null,
        pecasPorExecucao: 1,
      },
    };
  }

  /* ---------- Validação ---------- */

  // horarios: [{ diaSemana: 0..6, inicio: 'HH:MM', fim: 'HH:MM' }]
  // Devolve { ok, erros: [texto], horariosNormalizados } (ordenado por dia e início).
  // Lista vazia é válida (significa "sem horário": o sistema usa 24 h e mostra aviso).
  function validarHorarios(horarios) {
    const erros = [];
    const validos = [];
    (horarios || []).forEach((h, i) => {
      if (!h || typeof h !== 'object') {
        erros.push('Faixa ' + (i + 1) + ': formato inválido.');
        return;
      }
      const dia = Number(h.diaSemana);
      const nome = Number.isInteger(dia) && dia >= 0 && dia <= 6 ? NOMES_DIA[dia] : 'Faixa ' + (i + 1);
      if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
        erros.push(nome + ': dia da semana inválido (use 0 a 6).');
        return;
      }
      const ini = normalizarHora(h.inicio);
      const fim = normalizarHora(h.fim);
      if (ini === null || ini === '24:00') {
        erros.push(nome + ': horário de início inválido ("' + h.inicio + '"). Use HH:MM.');
        return;
      }
      if (fim === null) {
        erros.push(nome + ': horário de fim inválido ("' + h.fim + '"). Use HH:MM (ou 24:00).');
        return;
      }
      if (minutos(fim) <= minutos(ini)) {
        erros.push(nome + ': o fim (' + fim + ') precisa ser depois do início (' + ini + ').');
        return;
      }
      validos.push({ diaSemana: dia, inicio: ini, fim });
    });

    validos.sort((a, b) => a.diaSemana - b.diaSemana || minutos(a.inicio) - minutos(b.inicio));

    // sobreposição no mesmo dia (faixas que só se tocam, como 12:00–13:00 e 13:00–17:00, são aceitas)
    let diaAtual = null;
    let maior = null;
    for (const f of validos) {
      if (f.diaSemana !== diaAtual) {
        diaAtual = f.diaSemana;
        maior = f;
        continue;
      }
      if (minutos(f.inicio) < minutos(maior.fim)) {
        erros.push(NOMES_DIA[f.diaSemana] + ': ' + maior.inicio + '–' + maior.fim + ' e ' + f.inicio + '–' + f.fim + ' se sobrepõem.');
      }
      if (minutos(f.fim) > minutos(maior.fim)) maior = f;
    }

    return { ok: erros.length === 0, erros, horariosNormalizados: validos };
  }

  // financeiro: valores em R$/hora (número ou texto). Vazio = null (não informado).
  function validarFinanceiro(financeiro) {
    const f = financeiro || {};
    const erros = [];
    const saida = {};
    for (const c of CAMPOS_FINANCEIROS) {
      const bruto = f[c.chave];
      const n = paraNumero(bruto);
      if (n === null) {
        const preenchido = bruto !== null && bruto !== undefined && String(bruto).trim() !== '';
        if (preenchido) erros.push(c.rotulo + ': valor inválido.');
        saida[c.chave] = null;
      } else if (n < 0) {
        erros.push(c.rotulo + ': valor não pode ser negativo.');
        saida[c.chave] = null;
      } else if (n > VALOR_MAXIMO) {
        erros.push(c.rotulo + ': valor muito alto.');
        saida[c.chave] = null;
      } else {
        saida[c.chave] = arredondar2(n);
      }
    }
    const p = paraNumero(f.pecasPorExecucao);
    if (p === null) {
      saida.pecasPorExecucao = 1;
    } else if (p <= 0) {
      erros.push('Peças por execução: precisa ser maior que zero.');
      saida.pecasPorExecucao = 1;
    } else {
      saida.pecasPorExecucao = arredondar2(p);
    }
    return { ok: erros.length === 0, erros, financeiroNormalizado: saida };
  }

  /* ---------- Leitura ---------- */

  // Devolve { ok, dados: { id, razao_social, nome_fantasia, cnpj } | null }
  async function obterEmpresaAtual(supabase) {
    if (modoDemo()) return { ok: true, dados: empresaDemo(), demo: true };
    const sb = supabase || window.supabaseClient;
    try {
      const r = await sb.from('empresas').select('id, razao_social, nome_fantasia, cnpj')
        .order('id', { ascending: true }).limit(1);
      if (r.error) throw r.error;
      return { ok: true, dados: r.data && r.data.length ? r.data[0] : null };
    } catch (e) {
      return { ok: false, erro: mensagemDeErro(e), dados: null };
    }
  }

  function horaDoBanco(t) {
    return normalizarHora(t) || null;
  }

  // Devolve { ok, dados: Config, aviso? }. Em caso de falha: { ok:false, erro, dados: configPadrao() }
  async function carregarConfig(supabase, empresaId, opcoes) {
    if (modoDemo()) return { ok: true, dados: configDemo(), demo: true };
    const sb = supabase || window.supabaseClient;
    if (!(opcoes && opcoes.forcar) && cache.has(empresaId)) return { ok: true, dados: clonar(cache.get(empresaId)) };
    try {
      const [rEmp, rHor] = await Promise.all([
        sb.from('empresas')
          .select('fuso_horario, custo_ociosidade_hora, custo_oportunidade_hora, valor_capacidade_hora, custo_operacional_hora, pecas_por_execucao')
          .eq('id', empresaId).maybeSingle(),
        sb.from('horarios_funcionamento').select('dia_semana, hora_inicio, hora_fim')
          .eq('empresa_id', empresaId)
          .order('dia_semana', { ascending: true }).order('hora_inicio', { ascending: true }),
      ]);
      if (rEmp.error) throw rEmp.error;
      if (rHor.error) throw rHor.error;
      if (!rEmp.data) return { ok: false, erro: 'Empresa não encontrada.', dados: configPadrao(empresaId) };

      const e = rEmp.data;
      const cfg = configPadrao(empresaId);
      let aviso;
      if (e.fuso_horario && fusoValido(e.fuso_horario)) cfg.fuso = e.fuso_horario;
      else if (e.fuso_horario) aviso = 'Fuso inválido; usando ' + FUSO_PADRAO;
      for (const c of CAMPOS_FINANCEIROS) cfg.financeiro[c.chave] = paraNumero(e[c.coluna]);
      const pecas = paraNumero(e.pecas_por_execucao);
      cfg.financeiro.pecasPorExecucao = pecas && pecas > 0 ? pecas : 1;
      cfg.horarios = (rHor.data || [])
        .map((h) => ({ diaSemana: Number(h.dia_semana), inicio: horaDoBanco(h.hora_inicio), fim: horaDoBanco(h.hora_fim) }))
        .filter((h) => h.inicio && h.fim);

      cache.set(empresaId, cfg);
      const saida = { ok: true, dados: clonar(cfg) };
      if (aviso) saida.aviso = aviso;
      return saida;
    } catch (err) {
      return { ok: false, erro: mensagemDeErro(err), dados: configPadrao(empresaId) };
    }
  }

  /* ---------- Gravação ---------- */

  async function atualizarEmpresa(sb, empresaId, campos) {
    const r = await sb.from('empresas').update(campos).eq('id', empresaId).select('id');
    if (r.error) throw r.error;
    if (!r.data || !r.data.length) {
      throw new Error('nenhuma linha foi atualizada (confira as permissões da tabela empresas)');
    }
  }

  async function salvarFinanceiro(supabase, empresaId, financeiro) {
    if (modoDemo()) return { ok: false, erro: ERRO_DEMO };
    const v = validarFinanceiro(financeiro);
    if (!v.ok) return { ok: false, erro: v.erros.join(' ') };
    const sb = supabase || window.supabaseClient;
    try {
      const f = v.financeiroNormalizado;
      const campos = { pecas_por_execucao: f.pecasPorExecucao };
      for (const c of CAMPOS_FINANCEIROS) campos[c.coluna] = f[c.chave];
      await atualizarEmpresa(sb, empresaId, campos);
      cache.delete(empresaId);
      return { ok: true, dados: f };
    } catch (e) {
      return { ok: false, erro: mensagemDeErro(e) };
    }
  }

  async function salvarFuso(supabase, empresaId, fuso) {
    if (modoDemo()) return { ok: false, erro: ERRO_DEMO };
    if (!fuso || !fusoValido(fuso)) return { ok: false, erro: 'Fuso horário inválido.' };
    const sb = supabase || window.supabaseClient;
    try {
      await atualizarEmpresa(sb, empresaId, { fuso_horario: fuso });
      cache.delete(empresaId);
      return { ok: true, dados: fuso };
    } catch (e) {
      return { ok: false, erro: mensagemDeErro(e) };
    }
  }

  // Grava o turno INTEIRO de uma vez (função salvar_horarios do banco: tudo ou nada).
  async function salvarHorarios(supabase, empresaId, horarios) {
    if (modoDemo()) return { ok: false, erro: ERRO_DEMO };
    const v = validarHorarios(horarios);
    if (!v.ok) return { ok: false, erro: v.erros.join(' ') };
    const sb = supabase || window.supabaseClient;
    try {
      const r = await sb.rpc('salvar_horarios', {
        p_empresa_id: empresaId,
        p_horarios: v.horariosNormalizados.map((h) => ({ dia_semana: h.diaSemana, hora_inicio: h.inicio, hora_fim: h.fim })),
      });
      if (r.error) throw r.error;
      cache.delete(empresaId);
      return { ok: true, dados: v.horariosNormalizados };
    } catch (e) {
      return { ok: false, erro: mensagemDeErro(e) };
    }
  }

  window.ConfigEmpresa = {
    FUSOS_BRASIL, CAMPOS_FINANCEIROS,
    obterEmpresaAtual, carregarConfig,
    salvarFinanceiro, salvarFuso, salvarHorarios,
    validarHorarios, validarFinanceiro, configPadrao,
    paraNumero, modoDemo, limparCache,
    _forcarDemoParaTeste: (v) => { demoForcado = v; }, // só para os testes automáticos
  };
})();
