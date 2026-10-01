/* ============================================================
   dashboard.js — a TELA do dashboard
   - busca os dados no Supabase (equipamentos + historico_status)
   - escuta mudanças em tempo real (Realtime)
   - usa js/metrics.js para calcular e desenha tudo na página

   Dica: abra a página com  ?demo=1  para ver com dados fictícios.
   ============================================================ */
(function () {
  'use strict';

  const M = window.Metricas;
  const sb = window.supabaseClient;
  const MODO_DEMO = new URLSearchParams(location.search).get('demo') === '1';

  /* ------------------------------------------------------------
     AJUSTES QUE VOCÊ PODE MUDAR
     ------------------------------------------------------------ */
  const LIMITES = {
    esperaProlongadaMin: 60,   // alerta se ficar em ESPERA por mais que isso (minutos)
    paradaProlongadaHoras: 2,  // alerta se ficar INATIVO por mais que isso, dentro do turno
    utilizacaoBaixaPct: 20,    // alerta se a utilização do período ficar abaixo disso (considera as 24h do dia)
    esperaAltaPct: 25,         // alerta se a espera passar disso do tempo monitorado
    paradasPorDia: 6,          // alerta se a média de paradas por dia passar disso
    minimoHorasParaAlertar: 1, // não alerta com menos que isso de dados no período
    turno: { inicio: 7, fim: 18, dias: [1, 2, 3, 4, 5] }, // segunda a sexta, 7h às 18h
  };
  const INTERVALO_ATUALIZAR_TELA_MS = 30 * 1000;      // recalcula os tempos "há X min"
  const INTERVALO_RECARGA_COMPLETA_MS = 5 * 60 * 1000; // rede de segurança
  const CHAVE_PARAMETROS = 'carrissimi.financeiro';

  const PERIODOS = [
    { chave: 'hoje', rotulo: 'Hoje' },
    { chave: '24h', rotulo: '24 horas' },
    { chave: '7d', rotulo: '7 dias' },
    { chave: '30d', rotulo: '30 dias' },
    { chave: 'mes', rotulo: 'Mês atual' },
    { chave: 'custom', rotulo: 'Personalizado' },
  ];

  const COR = { ativo: '#3fcd63', espera: '#f3ba25', inativo: '#ed4042', semdados: '#7a8189' };

  /* ------------------------------------------------------------
     ESTADO DA PÁGINA
     ------------------------------------------------------------ */
  const estado = {
    periodo: '7d',
    custom: { de: null, ate: null },
    empresa: null,
    equipamentos: [],
    eventos: {}, // { equipamento_id: [ { id, t, status } ] }
    params: lerParametros(),
    ordem: { campo: 'utilizacao', dir: 'asc' },
    conexao: 'conectando',
    ultimaCarga: null,
    carregando: false,
    erro: null,
    statusVisto: {},
    demo: null,
  };

  const graficos = {};

  /* ------------------------------------------------------------
     UTILITÁRIOS
     ------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);

  function esc(texto) {
    return String(texto == null ? '' : texto).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatarCnpj(cnpj) {
    const n = String(cnpj || '').replace(/\D/g, '');
    if (n.length !== 14) return cnpj || '';
    return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  function paraInputData(ts) {
    const d = new Date(ts);
    const dois = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate());
  }

  function deInputData(texto, fimDoDia) {
    const [a, m, d] = texto.split('-').map(Number);
    return fimDoDia ? new Date(a, m - 1, d, 23, 59, 59, 999).getTime() : new Date(a, m - 1, d).getTime();
  }

  function ehHoje(ts) {
    return new Date(ts).toDateString() === new Date().toDateString();
  }

  function horaOuData(ts) {
    return ehHoje(ts) ? M.formatarHora(ts) : M.formatarDataHora(ts);
  }

  function lerParametros() {
    const vazio = {};
    M.PARAMETROS_FINANCEIROS.forEach((p) => (vazio[p.chave] = null));
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_PARAMETROS) || '{}');
      M.PARAMETROS_FINANCEIROS.forEach((p) => {
        const v = Number(salvo[p.chave]);
        if (salvo[p.chave] !== null && salvo[p.chave] !== undefined && isFinite(v) && v >= 0) vazio[p.chave] = v;
      });
    } catch (e) { /* sem armazenamento: segue sem valores */ }
    return vazio;
  }

  function salvarParametros(valores) {
    estado.params = valores;
    try { localStorage.setItem(CHAVE_PARAMETROS, JSON.stringify(valores)); } catch (e) { /* ignora */ }
  }

  function periodoAtual(agora) {
    return M.resolverPeriodo(estado.periodo, agora, estado.custom);
  }

  const ICONES = {
    alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    pausa: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    queda: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  };
  const icone = (nome) => '<svg viewBox="0 0 24 24" class="ico">' + ICONES[nome] + '</svg>';

  /* ------------------------------------------------------------
     CARREGAR DADOS
     ------------------------------------------------------------ */
  function indexarEventos(linhas) {
    const mapa = {};
    for (const r of linhas) {
      if (!mapa[r.equipamento_id]) mapa[r.equipamento_id] = [];
      mapa[r.equipamento_id].push({ id: r.id, t: Date.parse(r.registrado_em), status: r.status });
    }
    return mapa;
  }

  function carregarDemo() {
    if (!estado.demo) estado.demo = window.DemoData.gerar(Date.now());
    estado.empresa = estado.demo.empresa;
    estado.equipamentos = estado.demo.equipamentos;
    estado.eventos = indexarEventos(estado.demo.eventos);
  }

  async function carregarSupabase() {
    const agora = Date.now();
    const p = periodoAtual(agora);
    const ant = M.periodoAnterior(estado.periodo, p);
    const desdeIso = new Date(Math.min(p.de, ant.de)).toISOString();

    const [rEquip, rEmp] = await Promise.all([
      sb.from('equipamentos').select('id,empresa_id,nome,modelo,status_atual,atualizado_em').order('nome'),
      sb.from('empresas').select('id,razao_social,nome_fantasia,cnpj').limit(1),
    ]);
    if (rEquip.error) throw rEquip.error;
    if (rEmp.error) throw rEmp.error;

    const equipamentos = rEquip.data || [];
    let linhas = [];

    if (equipamentos.length) {
      // 1) todos os eventos desde o início da janela (busca em páginas de 1000)
      const TAMANHO = 1000;
      for (let inicio = 0; inicio < 30000; inicio += TAMANHO) {
        const r = await sb
          .from('historico_status')
          .select('id,equipamento_id,status,registrado_em')
          .gte('registrado_em', desdeIso)
          .order('registrado_em', { ascending: true })
          .order('id', { ascending: true })
          .range(inicio, inicio + TAMANHO - 1);
        if (r.error) throw r.error;
        linhas = linhas.concat(r.data || []);
        if (!r.data || r.data.length < TAMANHO) break;
      }

      // 2) o último evento ANTES da janela de cada máquina (para saber em que estado ela começou)
      const anteriores = await Promise.all(
        equipamentos.map((e) =>
          sb.from('historico_status')
            .select('id,equipamento_id,status,registrado_em')
            .eq('equipamento_id', e.id)
            .lt('registrado_em', desdeIso)
            .order('registrado_em', { ascending: false })
            .limit(1)
        )
      );
      anteriores.forEach((r) => {
        if (r.error) throw r.error;
        if (r.data && r.data.length) linhas.push(r.data[0]);
      });
    }

    estado.empresa = (rEmp.data && rEmp.data[0]) || null;
    estado.equipamentos = equipamentos;
    estado.eventos = indexarEventos(linhas);
  }

  async function carregar(silencioso) {
    if (estado.carregando) { estado.recarregarDepois = true; return; }
    estado.carregando = true;
    if (!silencioso) $('principal').classList.add('carregando');
    estado.erro = null;
    try {
      if (MODO_DEMO) {
        carregarDemo();
      } else {
        if (!sb) throw new Error('CONFIG');
        await carregarSupabase();
      }
      estado.ultimaCarga = Date.now();
    } catch (e) {
      if (!(e && e.message === 'CONFIG')) console.error('Erro ao carregar dados:', e);
      // Falha numa atualização em segundo plano: mantém o que já está na tela
      if (!(silencioso && estado.equipamentos.length)) estado.erro = e;
    } finally {
      estado.carregando = false;
      $('principal').classList.remove('carregando');
    }
    renderizar();
    if (estado.recarregarDepois) {
      estado.recarregarDepois = false;
      carregar(true);
    }
  }

  /* ------------------------------------------------------------
     TEMPO REAL
     ------------------------------------------------------------ */
  function definirConexao(tipo, texto) {
    estado.conexao = tipo;
    const el = $('conexao');
    el.className = 'pilula-conexao ' + tipo;
    $('conexaoTexto').textContent = texto;
    el.querySelector('.led').className = 'led';
  }

  // Chamada quando chega um evento novo (do Realtime ou da demonstração)
  function aplicarEventoNovo(linha) {
    if (!linha || !linha.equipamento_id) return;
    const equip = estado.equipamentos.find((e) => e.id === linha.equipamento_id);
    if (!equip) { carregar(true); return; }

    const lista = estado.eventos[linha.equipamento_id] || (estado.eventos[linha.equipamento_id] = []);
    if (lista.some((e) => e.id === linha.id)) return;
    const ev = { id: linha.id, t: Date.parse(linha.registrado_em), status: linha.status };
    lista.push(ev);
    lista.sort((a, b) => a.t - b.t);

    const ultimo = lista[lista.length - 1];
    if (ultimo === ev) {
      equip.status_atual = linha.status;
      equip.atualizado_em = linha.registrado_em;
    }
    renderizar();
  }

  function iniciarTempoReal() {
    if (MODO_DEMO) {
      definirConexao('demo', 'Demonstração');
      // simula o CLP mandando uma mudança de vez em quando
      setInterval(() => {
        if (!estado.demo || !estado.equipamentos.length) return;
        const linha = window.DemoData.novoEventoAleatorio(estado.equipamentos, estado.demo.proximoId++);
        aplicarEventoNovo(linha);
      }, 20000);
      return;
    }
    if (!sb) { definirConexao('erro', 'Sem conexão'); return; }

    let jaConectou = false;
    sb.channel('dashboard-carrissimi')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'historico_status' },
        (payload) => aplicarEventoNovo(payload.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipamentos' }, (payload) => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          const equip = estado.equipamentos.find((e) => e.id === payload.new.id);
          if (equip) { Object.assign(equip, payload.new); renderizar(); return; }
        }
        carregar(true); // equipamento criado, apagado ou desconhecido
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          definirConexao('ok', 'Ao vivo');
          if (jaConectou) carregar(true); // reconectou: busca o que possa ter perdido
          jaConectou = true;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          definirConexao('aviso', 'Reconectando…');
        } else if (status === 'CLOSED') {
          definirConexao('erro', 'Desconectado');
        }
      });
  }

  /* ------------------------------------------------------------
     CÁLCULO GERAL (usa metrics.js)
     ------------------------------------------------------------ */
  function calcularTudo(agora) {
    const p = periodoAtual(agora);
    const ant = M.periodoAnterior(estado.periodo, p);
    const situacoes = {};
    const metricas = [];
    const metricasAnt = [];

    for (const e of estado.equipamentos) {
      const ev = estado.eventos[e.id] || [];
      situacoes[e.id] = M.situacaoAtual(e, ev, agora);
      metricas.push(M.calcularEquipamento(e, ev, p.de, p.ate, agora));
      metricasAnt.push(M.calcularEquipamento(e, ev, ant.de, ant.ate, agora));
    }

    const resumo = M.resumoFrota(metricas);
    return {
      agora, p, ant, situacoes, metricas,
      resumo,
      resumoAnt: M.resumoFrota(metricasAnt),
      contagem: M.contarAgora(estado.equipamentos.map((e) => situacoes[e.id])),
      serie: M.serieTemporal(metricas.map((m) => m.segmentos), p.de, p.ate, 12),
      financeiro: M.calcularFinanceiro(resumo, estado.params),
      cobertura: resumo.total
        ? Math.min(100, ((resumo.monitoradoH * M.HORA) / ((p.ate - p.de) * resumo.total)) * 100)
        : 0,
    };
  }

  /* ------------------------------------------------------------
     DESENHAR A TELA
     ------------------------------------------------------------ */
  function renderizar() {
    const agora = Date.now();
    const principal = $('principal');
    renderAviso();

    if (estado.erro || !estado.equipamentos.length) {
      principal.classList.add('so-aviso');
      $('subtitulo').textContent = estado.carregando ? 'Carregando…' : 'Sem dados para mostrar';
      renderEmpresa();
      renderPeriodos();
      return;
    }
    principal.classList.remove('so-aviso');

    const c = calcularTudo(agora);
    renderEmpresa();
    renderPeriodos();
    renderCabecalho(c);
    renderKpis(c);
    renderMaquinas(c);
    renderLinhaTempo(c);
    renderCapacidade(c);
    renderAlertas(c);
    renderFinanceiro(c);
    renderAtividade(c);
    renderGraficos(c);
    renderTabela(c);
    renderRodape();
  }

  function renderAviso() {
    const el = $('faixaAviso');
    let html = '';
    if (estado.carregando && !estado.ultimaCarga) return; // primeira carga: mantém "Carregando…"

    const botaoRecarregar = '<button type="button" class="botao" data-recarregar>Tentar novamente</button>';

    if (MODO_DEMO) {
      html += '<div class="aviso demo"><span><strong>Modo demonstração</strong> — os dados abaixo são fictícios e não vêm do Supabase.</span>' +
        '<a class="botao" href="' + esc(location.pathname) + '">Sair da demonstração</a></div>';
    }

    if (estado.erro) {
      const msg = estado.erro && estado.erro.message ? estado.erro.message : String(estado.erro);
      if (msg === 'CONFIG') {
        const semBiblioteca = !window.supabase;
        html += '<div class="aviso erro"><span>' +
          (semBiblioteca
            ? '<strong>Não consegui carregar a biblioteca do Supabase.</strong> Confira sua internet e recarregue a página.'
            : '<strong>Falta configurar a conexão com o Supabase.</strong> Abra o arquivo <code>js/supabaseClient.js</code> e cole a URL e a chave do seu projeto.') +
          '</span><a class="botao" href="?demo=1">Ver demonstração</a></div>';
      } else {
        html += '<div class="aviso erro"><span><strong>Não foi possível carregar os dados.</strong> ' + esc(msg) +
          '</span>' + botaoRecarregar + '</div>';
      }
    } else if (!estado.carregando && !estado.equipamentos.length && estado.ultimaCarga) {
      html += '<div class="aviso"><span><strong>Nenhum equipamento encontrado.</strong> ' +
        'Se você já cadastrou equipamentos, confira se a tabela <code>equipamentos</code> permite leitura (RLS/policy de SELECT) para a chave anon.</span>' +
        '<a class="botao" href="?demo=1">Ver demonstração</a></div>';
    }
    el.innerHTML = html;
  }

  function renderEmpresa() {
    const e = estado.empresa;
    $('empresaNome').textContent = e ? e.nome_fantasia || e.razao_social || 'Empresa' : '—';
    $('empresaCnpj').textContent = e && e.cnpj ? 'CNPJ ' + formatarCnpj(e.cnpj) : '';
  }

  function renderPeriodos() {
    const alvo = $('periodos');
    if (!alvo.children.length) {
      alvo.innerHTML = PERIODOS.map((p) =>
        '<button type="button" data-periodo="' + p.chave + '">' + p.rotulo + '</button>'
      ).join('');
    }
    alvo.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.periodo === estado.periodo)));
    $('periodoCustom').hidden = estado.periodo !== 'custom';
  }

  function sincronizarDatas() {
    if (estado.custom.de) $('dataDe').value = paraInputData(estado.custom.de);
    if (estado.custom.ate) $('dataAte').value = paraInputData(estado.custom.ate);
  }

  function renderCabecalho(c) {
    $('subtitulo').textContent =
      'Visão geral da fábrica · ' + c.p.rotulo + ' (' + M.formatarDataHora(c.p.de) + ' → ' + M.formatarDataHora(c.p.ate) + ')';
  }

  /* ---------- KPIs ---------- */

  function delta(atual, anterior, temBase, tipo, maiorEhMelhor) {
    if (!temBase) return '<span class="delta neutro">sem base de comparação</span>';
    const diff = atual - anterior;
    if (Math.abs(diff) < 0.05) return '<span class="delta neutro">■ estável vs. anterior</span>';
    const sobe = diff > 0;
    const bom = sobe === maiorEhMelhor;
    const valor = Math.abs(diff).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const unidade = tipo === 'pp' ? ' p.p.' : ' h';
    return '<span class="delta ' + (bom ? 'bom' : 'ruim') + '">' + (sobe ? '▲ ' : '▼ ') + valor + unidade + ' vs. anterior</span>';
  }

  function kpi(rotulo, valor, dica, cor, extra, anel) {
    return '<div class="kpi">' +
      (anel || '') +
      '<div class="kpi-corpo"><p class="kpi-rotulo">' + rotulo + '</p>' +
      '<p class="kpi-valor ' + (cor || '') + '">' + valor + '</p>' +
      (dica ? '<p class="kpi-dica">' + dica + '</p>' : '') + (extra || '') + '</div></div>';
  }

  function anel(pct, cor) {
    return '<div class="anel" style="--p:' + Math.max(0, Math.min(100, pct)).toFixed(1) + ';--cor:' + cor + '" aria-hidden="true"></div>';
  }

  function renderKpis(c) {
    const r = c.resumo;
    const a = c.resumoAnt;
    const n = c.contagem;

    $('kpisAgora').innerHTML =
      kpi('Equipamentos monitorados', String(r.total),
        n.semInfo ? n.semInfo + ' sem informação de estado' : 'Tornos cadastrados com CLP') +
      kpi('Ativos agora', String(n.ativo), 'de ' + r.total + ' equipamentos', 'cor-ativo') +
      kpi('Em espera agora', String(n.espera), 'ligados, sem produzir', 'cor-espera') +
      kpi('Inativos agora', String(n.inativo), 'parados / desligados', 'cor-inativo');

    const semDados = !r.temDados;
    $('kpisPeriodo').innerHTML =
      kpi('Utilização', semDados ? '—' : M.formatarPct(r.utilizacaoPct), 'Tempo efetivamente ativo', 'cor-ativo',
        delta(r.utilizacaoPct, a.utilizacaoPct, r.temDados && a.temDados, 'pp', true),
        anel(semDados ? 0 : r.utilizacaoPct, COR.ativo)) +
      kpi('Disponibilidade', semDados ? '—' : M.formatarPct(r.disponibilidadePct), 'Ativo + espera (máquina ligada)', 'cor-primaria',
        delta(r.disponibilidadePct, a.disponibilidadePct, r.temDados && a.temDados, 'pp', true),
        anel(semDados ? 0 : r.disponibilidadePct, '#19d1d2')) +
      kpi('Tempo produtivo', M.formatarHoras(r.ativoH), 'de ' + M.formatarHoras(r.monitoradoH) + ' monitoradas', 'cor-ativo',
        delta(r.ativoH, a.ativoH, r.temDados && a.temDados, 'h', true)) +
      kpi('Tempo improdutivo', M.formatarHoras(r.improdutivoH), 'Espera + inatividade', 'cor-inativo',
        delta(r.improdutivoH, a.improdutivoH, r.temDados && a.temDados, 'h', false));
  }

  /* ---------- Cartões das máquinas ---------- */

  function seloEstado(estadoAtual) {
    const k = estadoAtual || 'semdados';
    const rot = estadoAtual ? M.ROTULO[estadoAtual] : 'SEM DADOS';
    return '<span class="selo est-' + k + '"><span class="led led-' + k + '"></span>' + rot + '</span>';
  }

  function renderMaquinas(c) {
    const cartoes = estado.equipamentos.map((e) => {
      const sit = c.situacoes[e.id];
      const m = c.metricas.find((x) => x.equip.id === e.id);
      const k = sit.estado || 'semdados';
      const mudou = estado.statusVisto[e.id] !== undefined && estado.statusVisto[e.id] !== sit.estado;
      estado.statusVisto[e.id] = sit.estado;

      const tempo = sit.desde
        ? '<strong>' + M.formatarDuracao(c.agora - sit.desde) + '</strong><span>neste estado desde ' + horaOuData(sit.desde) + '</span>'
        : '<strong>—</strong><span>sem registro de mudança de estado</span>';

      const barra = m.temDados
        ? '<div class="barra-empilhada" title="Composição do período">' +
          '<i class="b-ativo" style="width:' + m.pctAtivo + '%"></i>' +
          '<i class="b-espera" style="width:' + m.pctEspera + '%"></i>' +
          '<i class="b-inativo" style="width:' + m.pctInativo + '%"></i></div>'
        : '<div class="barra-empilhada"></div>';

      const dados = m.temDados
        ? '<dl class="maquina-dados">' +
          '<div><dt>Utilização</dt><dd class="cor-ativo">' + M.formatarPct(m.pctAtivo) + '</dd></div>' +
          '<div><dt>Ativo</dt><dd>' + M.formatarHoras(m.ativoMs / M.HORA) + '</dd></div>' +
          '<div><dt>Paradas</dt><dd>' + m.paradas + '</dd></div></dl>'
        : '<p class="maquina-rodape">Sem dados neste período.</p>';

      return '<article class="maquina est-' + k + (mudou ? ' piscar' : '') + '">' +
        '<header class="maquina-cab"><div><p class="maquina-nome">' + esc(e.nome) + '</p>' +
        '<p class="maquina-modelo">' + esc(e.modelo || 'modelo não informado') + '</p></div>' + seloEstado(sit.estado) + '</header>' +
        '<div class="maquina-tempo">' + tempo + '</div>' + barra + dados +
        '<p class="maquina-rodape">Última atualização: ' + (sit.ultimaAtualizacao ? M.formatarDataHora(sit.ultimaAtualizacao) : '—') + '</p>' +
        '</article>';
    });
    $('maquinas').innerHTML = cartoes.join('');
  }

  /* ---------- Linha do tempo ---------- */

  function renderLinhaTempo(c) {
    const { de, ate } = c.p;
    const duracao = Math.max(ate - de, 1);
    const linhas = c.metricas.map((m) => {
      const segs = m.segmentos.map((s) => {
        const esq = ((s.inicio - de) / duracao) * 100;
        const larg = ((s.fim - s.inicio) / duracao) * 100;
        const dica = M.ROTULO[s.estado] + ' · ' + M.formatarDataHora(s.inicio) + ' → ' + M.formatarDataHora(s.fim) +
          ' (' + M.formatarDuracao(s.fim - s.inicio) + ')';
        return '<div class="lt-seg b-' + s.estado + '" style="left:' + esq.toFixed(3) + '%;width:' + larg.toFixed(3) + '%" title="' + dica + '"></div>';
      }).join('');
      return '<div class="lt-nome" title="' + esc(m.equip.nome) + '">' + esc(m.equip.nome) + '</div><div class="lt-faixa">' + segs + '</div>';
    }).join('');

    const marcas = [];
    for (let i = 0; i <= 5; i++) {
      const ts = de + (duracao * i) / 5;
      const rot = duracao <= 2 * M.DIA ? M.formatarHora(ts) : M.formatarDataHora(ts).split(' ')[0];
      marcas.push('<span style="left:' + i * 20 + '%">' + rot + '</span>');
    }
    $('linhaTempo').innerHTML = '<div class="linha-tempo">' + linhas +
      '<div class="lt-espaco"></div><div class="lt-eixo">' + marcas.join('') + '</div></div>';
  }

  /* ---------- Capacidade ---------- */

  function passo(rotulo, valor, pct, classe) {
    return '<div><div class="passo-topo"><span>' + rotulo + '</span><span>' + M.formatarHoras(valor) + ' · ' + M.formatarPct(pct) + '</span></div>' +
      '<div class="trilho"><i class="' + classe + '" style="width:' + Math.min(pct, 100) + '%"></i></div></div>';
  }

  function itemCap(rotulo, valor, cor) {
    return '<div class="item"><p class="item-rotulo">' + rotulo + '</p><p class="item-valor ' + (cor || '') + '">' + valor + '</p></div>';
  }

  function renderCapacidade(c) {
    const r = c.resumo;
    if (!r.temDados) {
      $('capacidade').innerHTML = '<p class="estado-vazio">Ainda não há registros de estado neste período.</p>';
      return;
    }
    const ociosaH = r.esperaH + r.inativoH;
    $('capacidade').innerHTML =
      '<div class="passos">' +
      passo('Capacidade disponível', r.monitoradoH, 100, 'b-primaria') +
      passo('Capacidade utilizada', r.ativoH, r.utilizacaoPct, 'b-ativo') +
      passo('Capacidade ociosa', ociosaH, r.ociosaPct, 'b-inativo') +
      '<div><p class="subtitulo-mini">Composição do tempo monitorado</p>' +
      '<div class="barra-empilhada" style="margin-top:0;height:12px">' +
      '<i class="b-ativo" style="width:' + r.ativoH / r.monitoradoH * 100 + '%" title="Ativo"></i>' +
      '<i class="b-espera" style="width:' + r.esperaH / r.monitoradoH * 100 + '%" title="Espera"></i>' +
      '<i class="b-inativo" style="width:' + r.inativoH / r.monitoradoH * 100 + '%" title="Inativo"></i></div>' +
      '<p class="alerta-detalhe" style="margin-top:6px">Base de cálculo: só o tempo com registro do CLP — cobre ' +
      M.formatarPct(c.cobertura, 0) + ' do período.</p></div></div>' +
      '<div class="itens-2">' +
      itemCap('Horas ativas', M.formatarHoras(r.ativoH), 'cor-ativo') +
      itemCap('Horas em espera', M.formatarHoras(r.esperaH), 'cor-espera') +
      itemCap('Horas inativas', M.formatarHoras(r.inativoH), 'cor-inativo') +
      itemCap('Capacidade não utilizada', M.formatarPct(r.ociosaPct), 'cor-inativo') + '</div>';
  }

  /* ---------- Alertas ---------- */

  function dentroDoTurno(ts) {
    const d = new Date(ts);
    return LIMITES.turno.dias.includes(d.getDay()) && d.getHours() >= LIMITES.turno.inicio && d.getHours() < LIMITES.turno.fim;
  }

  function montarAlertas(c) {
    const lista = [];
    const dias = Math.max((c.p.ate - c.p.de) / M.DIA, 1);

    for (const m of c.metricas) {
      const nome = m.equip.nome;
      const sit = c.situacoes[m.equip.id];
      const naoProduz = sit.desde ? c.agora - sit.desde : 0;

      if (sit.estado === 'espera' && naoProduz > LIMITES.esperaProlongadaMin * M.MIN) {
        lista.push({ sev: 'atencao', ico: 'pausa', titulo: nome + ' em espera prolongada',
          detalhe: 'Ligado e sem produzir há ' + M.formatarDuracao(naoProduz) + '.',
          limite: 'limite: ' + LIMITES.esperaProlongadaMin + ' min' });
      }
      if (sit.estado === 'inativo' && naoProduz > LIMITES.paradaProlongadaHoras * M.HORA && dentroDoTurno(c.agora)) {
        lista.push({ sev: 'critico', ico: 'alerta', titulo: nome + ' parado em horário de turno',
          detalhe: 'Inativo há ' + M.formatarDuracao(naoProduz) + '.',
          limite: 'limite: ' + LIMITES.paradaProlongadaHoras + ' h · turno ' + LIMITES.turno.inicio + 'h–' + LIMITES.turno.fim + 'h' });
      }
      if (!m.temDados) {
        lista.push({ sev: 'info', ico: 'info', titulo: nome + ' sem registros no período',
          detalhe: 'Nenhuma mudança de estado recebida do CLP nesta janela.', limite: '' });
        continue;
      }
      if (m.monitoradoMs < LIMITES.minimoHorasParaAlertar * M.HORA) continue;

      if (m.pctAtivo < LIMITES.utilizacaoBaixaPct) {
        lista.push({ sev: 'atencao', ico: 'queda', titulo: nome + ' com utilização baixa',
          detalhe: 'Utilização de ' + M.formatarPct(m.pctAtivo) + ' no período.', limite: 'limite: ' + LIMITES.utilizacaoBaixaPct + '%' });
      }
      if (m.pctEspera > LIMITES.esperaAltaPct) {
        lista.push({ sev: 'atencao', ico: 'alerta', titulo: nome + ' com muito tempo em espera',
          detalhe: M.formatarPct(m.pctEspera) + ' do período em espera.', limite: 'limite: ' + LIMITES.esperaAltaPct + '%' });
      }
      if (m.paradas / dias > LIMITES.paradasPorDia) {
        lista.push({ sev: 'atencao', ico: 'pausa', titulo: nome + ' com muitas paradas',
          detalhe: m.paradas + ' paradas (' + (m.paradas / dias).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' por dia).',
          limite: 'limite: ' + LIMITES.paradasPorDia + ' por dia' });
      }
    }
    const peso = { critico: 0, atencao: 1, info: 2 };
    return lista.sort((a, b) => peso[a.sev] - peso[b.sev]);
  }

  function renderAlertas(c) {
    const alertas = montarAlertas(c);
    if (!alertas.length) {
      $('alertas').innerHTML = '<div class="tudo-certo"><span class="cor-ativo">' + icone('ok') + '</span>Nenhuma situação fora dos limites de referência.</div>';
      return;
    }
    const extra = alertas.length > 8 ? '<p class="alerta-detalhe" style="margin-top:8px">+ ' + (alertas.length - 8) + ' alertas não exibidos.</p>' : '';
    $('alertas').innerHTML = '<ul class="lista-alertas">' + alertas.slice(0, 8).map((a) =>
      '<li class="alerta ' + a.sev + '">' + icone(a.ico) + '<div><p class="alerta-titulo">' + esc(a.titulo) + '</p>' +
      '<p class="alerta-detalhe">' + esc(a.detalhe) + '</p>' +
      (a.limite ? '<p class="alerta-limite">' + esc(a.limite) + '</p>' : '') + '</div></li>'
    ).join('') + '</ul>' + extra;
  }

  /* ---------- Financeiro ---------- */

  function renderFinanceiro(c) {
    const r = c.resumo;
    const p = estado.params;

    // máquina com maior perda (impacto em R$ se configurado; senão, mais horas improdutivas)
    const ranking = c.metricas
      .filter((m) => m.temDados)
      .map((m) => ({ m, impacto: M.impactoEquipamento(m, p) }))
      .sort((x, y) => x.impacto !== null && y.impacto !== null
        ? y.impacto - x.impacto
        : (y.m.esperaMs + y.m.inativoMs) - (x.m.esperaMs + x.m.inativoMs));
    const pior = ranking[0];

    const respostas =
      '<div class="respostas">' +
      '<div class="resposta"><p>Quanto estamos utilizando?</p><p class="valor cor-ativo">' + (r.temDados ? M.formatarPct(r.utilizacaoPct) : '—') + '</p><p class="dica">' + M.formatarHoras(r.ativoH) + ' produtivas</p></div>' +
      '<div class="resposta"><p>Quanto deixamos de utilizar?</p><p class="valor cor-inativo">' + (r.temDados ? M.formatarPct(r.ociosaPct) : '—') + '</p><p class="dica">' + M.formatarHoras(r.improdutivoH) + ' improdutivas</p></div>' +
      '<div class="resposta"><p>Horas paradas (inativo)</p><p class="valor cor-inativo">' + M.formatarHoras(r.inativoH) + '</p><p class="dica">' + M.formatarHoras(r.esperaH) + ' em espera</p></div>' +
      '<div class="resposta"><p>Maior concentração de perdas</p><p class="valor cor-espera" style="font-size:16px;overflow-wrap:anywhere">' + (pior ? esc(pior.m.equip.nome) : '—') + '</p>' +
      '<p class="dica">' + (pior ? M.formatarPct(pior.m.pctAtivo) + ' de utilização' : '') + '</p></div></div>';

    // impacto total = ociosidade + parada (só o que estiver configurado)
    const ocio = c.financeiro.find((f) => f.chave === 'ociosidade');
    const par = c.financeiro.find((f) => f.chave === 'parada');
    const partes = [ocio.valor, par.valor].filter((v) => v !== null);
    const totalLinha = partes.length
      ? '<li class="fin-linha" style="border-color:rgba(243,186,37,.45);background:rgba(243,186,37,.06)"><div><p class="nome"><strong>Impacto estimado total</strong></p><p class="formula">ociosidade + parada</p></div>' +
        '<span class="valor">' + M.formatarMoeda(partes.reduce((t, v) => t + v, 0)) + '<small>estimado</small></span></li>'
      : '';

    const linhas = c.financeiro.map((f) =>
      '<li class="fin-linha"><div><p class="nome">' + f.rotulo + '</p><p class="formula">' + f.formula + '</p></div>' +
      (f.valor === null
        ? '<div class="fin-faltando"><b>não calculado</b>necessita: ' + esc(f.faltando) + '</div>'
        : '<span class="valor">' + M.formatarMoeda(f.valor) + '<small>estimado</small></span>') + '</li>'
    ).join('');

    $('financeiro').innerHTML = respostas + '<ul class="lista-fin">' + totalLinha + linhas + '</ul>';
  }

  /* ---------- Atividade recente ---------- */

  function renderAtividade() {
    const itens = [];
    for (const e of estado.equipamentos) {
      const lista = [...(estado.eventos[e.id] || [])].sort((a, b) => a.t - b.t);
      let anterior = null;
      for (const ev of lista) {
        const est = M.normalizarStatus(ev.status);
        if (est && est !== anterior) itens.push({ t: ev.t, nome: e.nome, de: anterior, para: est });
        if (est) anterior = est;
      }
    }
    itens.sort((a, b) => b.t - a.t);
    const recentes = itens.slice(0, 8);
    if (!recentes.length) {
      $('atividade').innerHTML = '<p class="estado-vazio">Nenhuma mudança de estado registrada ainda.</p>';
      return;
    }
    const chip = (est) => '<b class="cor-' + est + '">' + M.ROTULO[est] + '</b>';
    $('atividade').innerHTML = '<ul class="feed">' + recentes.map((i) =>
      '<li><time>' + horaOuData(i.t) + '</time><div><p class="quem">' + esc(i.nome) + '</p>' +
      '<p class="oque">' + (i.de ? chip(i.de) + '<span class="seta">→</span>' : '') + chip(i.para) + '</p></div></li>'
    ).join('') + '</ul>';
  }

  /* ---------- Gráficos (Chart.js) ---------- */

  function configurarPadraoGraficos() {
    if (typeof Chart === 'undefined') return false;
    Chart.defaults.animation = false; // painel ao vivo: sem animação, atualiza direto
    Chart.defaults.color = '#95a0aa';
    Chart.defaults.borderColor = '#2b343d';
    Chart.defaults.font.family = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.tooltip.backgroundColor = '#19212a';
    Chart.defaults.plugins.tooltip.borderColor = '#2b343d';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.titleColor = '#eaeff3';
    Chart.defaults.plugins.tooltip.bodyColor = '#eaeff3';
    Chart.defaults.plugins.tooltip.padding = 10;
    return true;
  }

  function atualizarGrafico(id, criarConfig, rotulos, conjuntos) {
    const canvas = $(id);
    if (!graficos[id]) {
      graficos[id] = new Chart(canvas, criarConfig());
    }
    const g = graficos[id];
    g.data.labels = rotulos;
    conjuntos.forEach((dados, i) => { g.data.datasets[i].data = dados; });
    g.update('none');
  }

  function renderGraficos(c) {
    const r = c.resumo;
    document.querySelectorAll('.caixa-grafico').forEach((el) => el.classList.toggle('sem-dados', !r.temDados));
    if (!configurarPadraoGraficos()) {
      document.querySelectorAll('.caixa-grafico').forEach((el) => {
        el.classList.add('sem-dados');
        el.querySelector('.vazio').textContent = 'Não foi possível carregar a biblioteca de gráficos (verifique a internet).';
      });
      return;
    }
    if (!r.temDados) return;
    $('graficoHoras').parentElement.style.height = Math.max(200, 46 * c.metricas.length + 90) + 'px';

    // Evolução (áreas empilhadas, em %)
    atualizarGrafico('graficoEvolucao', () => ({
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Ativo', data: [], borderColor: COR.ativo, backgroundColor: COR.ativo + '66', fill: 'origin' },
          { label: 'Espera', data: [], borderColor: COR.espera, backgroundColor: COR.espera + '55', fill: '-1' },
          { label: 'Inativo', data: [], borderColor: COR.inativo, backgroundColor: COR.inativo + '40', fill: '-1' },
        ].map((d) => ({ ...d, tension: 0.3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        scales: {
          y: { stacked: true, min: 0, max: 100, ticks: { callback: (v) => v + '%' }, grid: { color: '#2b343d' } },
          x: { grid: { display: false } },
        },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (i) => ' ' + i.dataset.label + ': ' + i.parsed.y.toLocaleString('pt-BR') + '%' } } },
      },
    }), c.serie.map((p) => p.rotulo), [c.serie.map((p) => p.ativo), c.serie.map((p) => p.espera), c.serie.map((p) => p.inativo)]);

    // Distribuição (rosca, em horas)
    const arred = (n) => +n.toFixed(1);
    atualizarGrafico('graficoRosca', () => ({
      type: 'doughnut',
      data: { labels: [], datasets: [{ data: [], backgroundColor: [COR.ativo, COR.espera, COR.inativo], borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (i) => {
                const total = i.dataset.data.reduce((t, v) => t + v, 0) || 1;
                return ' ' + i.label + ': ' + i.parsed.toLocaleString('pt-BR') + ' h (' + ((i.parsed / total) * 100).toFixed(1).replace('.', ',') + '%)';
              },
            },
          },
        },
      },
    }), ['Ativo', 'Espera', 'Inativo'], [[arred(r.ativoH), arred(r.esperaH), arred(r.inativoH)]]);

    // Horas por equipamento (barras empilhadas)
    const comDados = c.metricas;
    atualizarGrafico('graficoHoras', () => ({
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          { label: 'Ativo', data: [], backgroundColor: COR.ativo },
          { label: 'Espera', data: [], backgroundColor: COR.espera },
          { label: 'Inativo', data: [], backgroundColor: COR.inativo },
        ],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { callback: (v) => v + ' h' }, grid: { color: '#2b343d' } },
          y: { stacked: true, grid: { display: false } },
        },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (i) => ' ' + i.dataset.label + ': ' + i.parsed.x.toLocaleString('pt-BR') + ' h' } } },
      },
    }), comDados.map((m) => m.equip.nome), [
      comDados.map((m) => arred(m.ativoMs / M.HORA)),
      comDados.map((m) => arred(m.esperaMs / M.HORA)),
      comDados.map((m) => arred(m.inativoMs / M.HORA)),
    ]);
  }

  /* ---------- Tabela ---------- */

  const COLUNAS = [
    { id: 'nome', rotulo: 'Equipamento', valor: (l) => l.m.equip.nome.toLowerCase() },
    { id: 'status', rotulo: 'Status', valor: (l) => l.sit.estado || '' },
    { id: 'utilizacao', rotulo: 'Utilização', valor: (l) => (l.m.temDados ? l.m.pctAtivo : null) },
    { id: 'ativas', rotulo: 'Ativas', valor: (l) => (l.m.temDados ? l.m.ativoMs : null) },
    { id: 'espera', rotulo: 'Espera', valor: (l) => (l.m.temDados ? l.m.esperaMs : null) },
    { id: 'inativas', rotulo: 'Inativas', valor: (l) => (l.m.temDados ? l.m.inativoMs : null) },
    { id: 'paradas', rotulo: 'Paradas', valor: (l) => (l.m.temDados ? l.m.paradas : null) },
    { id: 'maiorParada', rotulo: 'Maior parada', valor: (l) => (l.m.temDados ? l.m.maiorParadaMs : null) },
    { id: 'impacto', rotulo: 'Impacto estimado', valor: (l) => l.impacto },
  ];

  function renderTabela(c) {
    const linhas = c.metricas.map((m) => ({ m, sit: c.situacoes[m.equip.id], impacto: M.impactoEquipamento(m, estado.params) }));
    const col = COLUNAS.find((x) => x.id === estado.ordem.campo) || COLUNAS[2];
    const sinal = estado.ordem.dir === 'asc' ? 1 : -1;

    linhas.sort((a, b) => {
      const va = col.valor(a);
      const vb = col.valor(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // sem dado vai sempre para o fim
      if (vb === null) return -1;
      if (va < vb) return -1 * sinal;
      if (va > vb) return 1 * sinal;
      return 0;
    });

    const cab = COLUNAS.map((x) => {
      const ativo = x.id === estado.ordem.campo;
      const seta = ativo ? (estado.ordem.dir === 'asc' ? '▲' : '▼') : '';
      return '<th' + (ativo ? ' aria-sort="' + (estado.ordem.dir === 'asc' ? 'ascending' : 'descending') + '"' : '') + '>' +
        '<button type="button" data-ordenar="' + x.id + '">' + x.rotulo + ' <span>' + seta + '</span></button></th>';
    }).join('');

    const corpo = linhas.map(({ m, sit, impacto }) => {
      const t = m.temDados;
      const dash = '<span class="cor-suave">—</span>';
      return '<tr>' +
        '<td><p style="font-weight:500">' + esc(m.equip.nome) + '</p><p class="sub">' + esc(m.equip.modelo || '') + '</p></td>' +
        '<td>' + seloEstado(sit.estado) + '</td>' +
        '<td>' + (t ? '<div class="util-celula"><div class="trilho"><i class="b-ativo" style="width:' + Math.min(m.pctAtivo, 100) + '%"></i></div><span class="num">' + M.formatarPct(m.pctAtivo) + '</span></div>' : dash) + '</td>' +
        '<td class="num cor-ativo">' + (t ? M.formatarHoras(m.ativoMs / M.HORA) : dash) + '</td>' +
        '<td class="num cor-espera">' + (t ? M.formatarHoras(m.esperaMs / M.HORA) : dash) + '</td>' +
        '<td class="num cor-inativo">' + (t ? M.formatarHoras(m.inativoMs / M.HORA) : dash) + '</td>' +
        '<td class="num">' + (t ? m.paradas : dash) + '</td>' +
        '<td class="num">' + (t ? M.formatarDuracao(m.maiorParadaMs) : dash) + '</td>' +
        '<td class="num">' + (impacto === null ? '<button type="button" class="link-btn" data-abrir-parametros>informar valores</button>' : M.formatarMoeda(impacto)) + '</td>' +
        '</tr>';
    }).join('');

    $('tabela').innerHTML = '<table><thead><tr>' + cab + '</tr></thead><tbody>' + corpo + '</tbody></table>';
  }

  function renderRodape() {
    const hora = estado.ultimaCarga ? new Date(estado.ultimaCarga).toLocaleTimeString('pt-BR') : '—';
    $('rodapeSync').innerHTML = 'Dados carregados às ' + hora + ' · <button type="button" class="link-btn" style="color:var(--primaria)" data-recarregar>atualizar agora</button>';
  }

  /* ------------------------------------------------------------
     JANELA DOS VALORES FINANCEIROS
     ------------------------------------------------------------ */
  function abrirParametros() {
    $('camposParametros').innerHTML = M.PARAMETROS_FINANCEIROS.map((p) =>
      '<div class="campo"><label for="p_' + p.chave + '">' + p.rotulo + '</label>' +
      '<div class="entrada"><span>R$</span><input id="p_' + p.chave + '" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00" value="' +
      (estado.params[p.chave] === null ? '' : estado.params[p.chave]) + '" /><span>/ hora</span></div></div>'
    ).join('');
    $('dlgParametros').showModal();
  }

  function lerCamposParametros() {
    const valores = {};
    M.PARAMETROS_FINANCEIROS.forEach((p) => {
      const bruto = $('p_' + p.chave).value.replace(',', '.').trim();
      const n = Number(bruto);
      valores[p.chave] = bruto !== '' && isFinite(n) && n >= 0 ? n : null;
    });
    return valores;
  }

  /* ------------------------------------------------------------
     EVENTOS (cliques etc.)
     ------------------------------------------------------------ */
  function ligarEventos() {
    document.addEventListener('click', (ev) => {
      const alvo = ev.target.closest('button, a');
      if (!alvo) return;

      if (alvo.dataset.periodo) {
        estado.periodo = alvo.dataset.periodo;
        if (estado.periodo === 'custom' && !estado.custom.de) {
          estado.custom.de = deInputData(paraInputData(Date.now() - 6 * M.DIA), false);
          estado.custom.ate = deInputData(paraInputData(Date.now()), true);
        }
        renderPeriodos();
        sincronizarDatas();
        carregar();
      } else if (alvo.dataset.ordenar) {
        const campo = alvo.dataset.ordenar;
        estado.ordem = estado.ordem.campo === campo
          ? { campo, dir: estado.ordem.dir === 'asc' ? 'desc' : 'asc' }
          : { campo, dir: campo === 'nome' || campo === 'utilizacao' ? 'asc' : 'desc' };
        renderizar();
        const novo = document.querySelector('[data-ordenar="' + campo + '"]');
        if (novo) novo.focus();
      } else if (alvo.hasAttribute('data-recarregar')) {
        carregar();
      } else if (alvo.hasAttribute('data-abrir-parametros') || alvo.id === 'btnParametros') {
        abrirParametros();
      }
    });

    const aoMudarData = () => {
      if (!$('dataDe').value || !$('dataAte').value) return;
      let de = deInputData($('dataDe').value, false);
      let ate = deInputData($('dataAte').value, true);
      if (de > ate) [de, ate] = [ate, de];
      estado.custom = { de, ate };
      carregar();
    };
    $('dataDe').addEventListener('change', aoMudarData);
    $('dataAte').addEventListener('change', aoMudarData);

    $('formParametros').addEventListener('submit', (ev) => {
      ev.preventDefault();
      salvarParametros(lerCamposParametros());
      $('dlgParametros').close();
      renderizar();
    });
    $('btnCancelarParametros').addEventListener('click', () => $('dlgParametros').close());
    $('btnLimparParametros').addEventListener('click', () => {
      const vazio = {};
      M.PARAMETROS_FINANCEIROS.forEach((p) => (vazio[p.chave] = null));
      salvarParametros(vazio);
      $('dlgParametros').close();
      renderizar();
    });

    // voltou para a aba depois de um tempo: atualiza
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && estado.ultimaCarga && Date.now() - estado.ultimaCarga > 60 * 1000) carregar(true);
    });
  }

  /* ------------------------------------------------------------
     INÍCIO
     ------------------------------------------------------------ */
  function iniciar() {
    if (MODO_DEMO) {
      document.querySelectorAll('a[data-nav]').forEach((a) => (a.href = a.getAttribute('href') + '?demo=1'));
    }
    ligarEventos();
    renderPeriodos();
    $('principal').classList.add('so-aviso');
    $('faixaAviso').innerHTML = '<div class="aviso"><span>Carregando dados…</span></div>';
    iniciarTempoReal();
    carregar();
    setInterval(() => { if (!estado.carregando && estado.equipamentos.length) renderizar(); }, INTERVALO_ATUALIZAR_TELA_MS);
    setInterval(() => { if (!MODO_DEMO) carregar(true); }, INTERVALO_RECARGA_COMPLETA_MS);
  }

  iniciar();
})();
