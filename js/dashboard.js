/* ============================================================
   dashboard.js — a TELA do dashboard
   - busca os dados no Supabase (equipamentos + historico_status)
   - lê a configuração da empresa (turno, fuso, valores em R$)
   - escuta mudanças em tempo real (Realtime)
   - usa js/metrics.js para calcular e desenha tudo na página

   v10 (ESPEC 05): régua do turno, horas extras, contador de
   execuções, SEM SINAL, alertas só dentro do expediente e valores
   em R$ guardados no banco. Nenhuma conta de tempo é feita aqui:
   tudo vem de Metrics.calcularTudo().

   Dica: abra a página com  ?demo=1  para ver com dados fictícios.
   ============================================================ */
(function () {
  'use strict';

  const M = window.Metricas; // é o mesmo objeto de window.Metrics
  const C = window.ConfigEmpresa;
  const sb = window.supabaseClient;
  const MODO_DEMO = new URLSearchParams(location.search).get('demo') === '1';

  /* ------------------------------------------------------------
     AJUSTES QUE VOCÊ PODE MUDAR
     ------------------------------------------------------------ */
  const LIMITES = {
    esperaProlongadaMin: 60,       // alerta se ficar em ESPERA por mais que isso, dentro do expediente (minutos)
    paradaProlongadaHoras: 2,      // alerta se ficar INATIVO por mais que isso, dentro do expediente
    disponibilidadeBaixaPct: 20,   // alerta se a Disponibilidade (OEE) do período ficar abaixo disso
    esperaAltaPct: 25,             // alerta se a espera passar disso do tempo contado
    paradasPorDia: 6,              // alerta se a média de paradas por dia de expediente passar disso
    minimoHorasParaAlertar: 1,     // não alerta com menos que isso de dados no período
  };
  const INTERVALO_ATUALIZAR_TELA_MS = 30 * 1000;      // recalcula os tempos "há X min"
  const INTERVALO_RECARGA_COMPLETA_MS = 5 * 60 * 1000; // rede de segurança
  const ESPERA_REDESENHAR_MS = 300;                    // junta vários eventos seguidos num desenho só

  const PERIODOS = [
    { chave: 'hoje', rotulo: 'Hoje' },
    { chave: '24h', rotulo: '24 horas' },
    { chave: '7d', rotulo: '7 dias' },
    { chave: '30d', rotulo: '30 dias' },
    { chave: 'mes', rotulo: 'Mês atual' },
    { chave: 'custom', rotulo: 'Personalizado' },
  ];

  const COR = { ativo: '#3fcd63', espera: '#f3ba25', inativo: '#ed4042', semdados: '#7a8189' };

  // Configuração usada no ?demo=1 enquanto o demoData.js não trouxer a dele (ESPEC 07).
  const CONFIG_DEMO_TEMPORARIA = {
    empresaId: 0,
    fuso: 'America/Sao_Paulo',
    horarios: [1, 2, 3, 4, 5].reduce((l, d) => l.concat([
      { diaSemana: d, inicio: '07:00', fim: '12:00' }, { diaSemana: d, inicio: '13:00', fim: '17:00' },
    ]), []),
    financeiro: { custoOciosidadeHora: 60, custoOportunidadeHora: 180, valorCapacidadeHora: 220, custoOperacionalHora: 90, pecasPorExecucao: 1 },
  };

  /* ------------------------------------------------------------
     ESTADO DA PÁGINA
     ------------------------------------------------------------ */
  const estado = {
    periodo: '7d',
    custom: { de: null, ate: null }, // datas 'AAAA-MM-DD' no fuso da empresa
    empresa: null,
    config: C.configPadrao(null),
    configErro: null,
    equipamentos: [],
    eventos: {}, // { equipamento_id: [ { id, t, status } ] }
    ordem: { campo: 'disponibilidade', dir: 'asc' },
    conexao: 'conectando',
    ultimaCarga: null,
    carregando: false,
    erro: null,
    statusVisto: {},
    demo: null,
    recarregarDepois: false,
  };

  const graficos = {};
  let temporizadorDesenho = null;

  /* ------------------------------------------------------------
     UTILITÁRIOS
     ------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);
  const fuso = () => estado.config.fuso;
  const dois = (n) => String(n).padStart(2, '0');

  function esc(texto) {
    return String(texto == null ? '' : texto).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function clonar(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function formatarCnpj(cnpj) {
    const n = String(cnpj || '').replace(/\D/g, '');
    if (n.length !== 14) return cnpj || '';
    return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  // 'AAAA-MM-DD' do dia (no fuso da empresa) em que cai o instante
  function diaIso(ts) {
    const p = M.partesLocais(ts, fuso());
    return p.ano + '-' + dois(p.mes) + '-' + dois(p.dia);
  }

  function ehHoje(ts) {
    return diaIso(ts) === diaIso(Date.now());
  }

  function horaOuData(ts) {
    return ehHoje(ts) ? M.formatarHoraFuso(ts, fuso()) : M.formatarDataHoraFuso(ts, fuso());
  }

  function periodoAtual(agora) {
    if (estado.periodo === 'custom') return M.periodoPersonalizado(estado.custom.de, estado.custom.ate, agora, fuso());
    return M.periodoPreset(estado.periodo, agora, fuso());
  }

  // rótulo e classe de cor de um estado (inclui o estado técnico sem_sinal)
  const rotuloEstado = (est) => (est ? M.ROTULO_COMPLETO[est] : 'SEM DADOS');
  const classeEstado = (est) => (est && est !== 'sem_sinal' ? est : 'semdados'); // SEM SINAL usa o visual neutro de "sem dados"

  const ICONES = {
    alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    pausa: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    queda: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    semsinal: '<path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.86a10 10 0 0 1 3-2.03"/><path d="M16 10.83a10 10 0 0 1 3 2.03"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M12 20h.01"/><path d="m2 2 20 20"/>',
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
    estado.config = clonar(window.DemoData.DEMO_CONFIG || CONFIG_DEMO_TEMPORARIA);
    estado.configErro = null;
  }

  async function carregarSupabase() {
    const agora = Date.now();

    const [rEquip, rEmp] = await Promise.all([
      sb.from('equipamentos').select('id,empresa_id,nome,modelo,status_atual,atualizado_em,ultimo_sinal_em').order('nome'),
      C.obterEmpresaAtual(sb),
    ]);
    if (rEquip.error) throw rEquip.error;
    if (!rEmp.ok) throw new Error(rEmp.erro);
    estado.empresa = rEmp.dados;

    // configuração da empresa (se falhar, segue com o padrão e avisa na tela)
    if (estado.empresa) {
      const rc = await C.carregarConfig(sb, estado.empresa.id, { forcar: true });
      estado.config = rc.dados;
      estado.configErro = rc.ok ? null : rc.erro;
    } else {
      estado.config = C.configPadrao(null);
      estado.configErro = null;
    }

    const p = periodoAtual(agora);
    const ant = M.periodoAnteriorMesmaDuracao(p);
    const desdeIso = new Date(Math.min(p.de, ant.de)).toISOString();

    const equipamentos = rEquip.data || [];
    let linhas = [];

    if (equipamentos.length) {
      // 1) todos os eventos de TODAS as máquinas desde o início da janela (busca em páginas de 1000)
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

  // junta vários eventos seguidos num desenho só
  function agendarDesenho() {
    clearTimeout(temporizadorDesenho);
    temporizadorDesenho = setTimeout(renderizar, ESPERA_REDESENHAR_MS);
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
    agendarDesenho();
  }

  // O sinal periódico atualiza só ultimo_sinal_em (a cada ~1 min): isso NÃO pode redesenhar a tela toda nem fazer o cartão piscar.
  function aplicarAtualizacaoEquipamento(novo) {
    const equip = estado.equipamentos.find((e) => e.id === novo.id);
    if (!equip) { carregar(true); return; }
    const mudouStatus = equip.status_atual !== novo.status_atual;
    Object.assign(equip, novo);
    if (mudouStatus) agendarDesenho();
    else atualizarSinalNaTela(equip);
  }

  function textoSinal(equip, agora) {
    if (!equip.ultimo_sinal_em) return '';
    const diferenca = Math.max(agora - Date.parse(equip.ultimo_sinal_em), 0);
    return diferenca < 30 * 1000 ? 'Sinal: agora' : 'Sinal: há ' + M.formatarDuracao(diferenca);
  }

  function atualizarSinalNaTela(equip) {
    document.querySelectorAll('[data-sinal]').forEach((el) => {
      if (el.dataset.sinal === String(equip.id)) el.textContent = textoSinal(equip, Date.now());
    });
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
    sb.channel('dashboard-carissimi')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'historico_status' },
        (payload) => aplicarEventoNovo(payload.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipamentos' }, (payload) => {
        if (payload.eventType === 'UPDATE' && payload.new) { aplicarAtualizacaoEquipamento(payload.new); return; }
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
     CÁLCULO GERAL (tudo vem de metrics.js)
     ------------------------------------------------------------ */
  function eventosPlanos() {
    const lista = [];
    for (const e of estado.equipamentos) {
      for (const ev of estado.eventos[e.id] || []) lista.push({ equipamento_id: e.id, status: ev.status, t: ev.t });
    }
    return lista;
  }

  // Situação de AGORA; se o último sinal está velho demais, vira SEM SINAL
  function situacaoDe(e, agora) {
    const sit = M.situacaoAtual(e, estado.eventos[e.id] || [], agora);
    const us = e.ultimo_sinal_em ? Date.parse(e.ultimo_sinal_em) : null;
    const tol = M.CONFIG_METRICAS.TOLERANCIA_SEM_SINAL_MS;
    if (sit.estado !== 'sem_sinal' && us !== null && agora - us > tol) return { ...sit, estado: 'sem_sinal', desde: us + tol };
    return sit;
  }

  function rotuloBucket(ts, duracao, passo) {
    const p = M.partesLocais(ts, fuso());
    const hora = dois(Math.floor(p.minutosDoDia / 60)) + 'h';
    if (duracao <= 2 * M.DIA) return hora;
    const dia = dois(p.dia) + '/' + dois(p.mes);
    return passo < M.DIA ? dia + ' ' + hora : dia;
  }

  // Evolução no tempo (em % do tempo contado de cada trecho): ativo no turno, hora extra, espera e inativo
  function serieEvolucao(res, p, quantidade) {
    const duracao = Math.max(p.ate - p.de, 1);
    const passo = duracao / quantidade;
    const pontos = [];
    for (let i = 0; i < quantidade; i++) {
      const a = p.de + i * passo;
      const ind = M.agregar(res.segmentos, { inicio: a, fim: a + passo });
      const den = ind.denominadorMs;
      const pct = (x) => (den > 0 ? +((x / den) * 100).toFixed(1) : null);
      pontos.push({
        rotulo: rotuloBucket(a, duracao, passo),
        ativo: pct(ind.tempoAtivoDentroMs), extra: pct(ind.horasExtrasMs),
        espera: pct(ind.tempoEsperaMs), inativo: pct(ind.tempoInativoMs),
      });
    }
    return pontos;
  }

  function impactoDe(ind) {
    return M.calcularFinanceiro(ind, estado.config.financeiro).impacto;
  }

  function calcularPagina(agora) {
    const p = periodoAtual(agora);
    const ant = M.periodoAnteriorMesmaDuracao(p);
    const base = { eventos: eventosPlanos(), equipamentos: estado.equipamentos, config: estado.config, agora };
    const res = M.calcularTudo({ ...base, periodo: p });
    const resAnt = M.calcularTudo({ ...base, periodo: ant });

    const situacoes = {};
    for (const e of estado.equipamentos) situacoes[e.id] = situacaoDe(e, agora);
    const lista = estado.equipamentos.map((e) => situacoes[e.id]);
    const contagem = M.contarAgora(lista);
    contagem.semSinal = lista.filter((s) => s.estado === 'sem_sinal').length;
    contagem.semInfo -= contagem.semSinal; // SEM SINAL não é "sem informação"

    return {
      agora, p, ant, res, resAnt, situacoes, contagem,
      total: res.total, totalAnt: resAnt.total,
      financeiro: M.calcularFinanceiro(res.total, estado.config.financeiro),
      serie: serieEvolucao(res, p, 12),
    };
  }

  const temDados = (ind) => ind.denominadorMs > 0;

  /* ------------------------------------------------------------
     DESENHAR A TELA
     ------------------------------------------------------------ */
  function renderizar() {
    const agora = Date.now();
    const principal = $('principal');

    if (estado.erro || !estado.equipamentos.length) {
      renderAviso(null);
      principal.classList.add('so-aviso');
      $('subtitulo').textContent = estado.carregando ? 'Carregando…' : 'Sem dados para mostrar';
      renderEmpresa();
      renderPeriodos();
      return;
    }
    principal.classList.remove('so-aviso');

    const c = calcularPagina(agora);
    renderAviso(c);
    renderEmpresa();
    renderPeriodos();
    renderCabecalho(c);
    renderKpis(c);
    renderMaquinas(c);
    renderLinhaTempo(c);
    renderCapacidade(c);
    renderAlertas(c);
    renderFinanceiro(c);
    renderAtividade();
    renderGraficos(c);
    renderTabela(c);
    renderRodape();
  }

  function renderAviso(c) {
    const el = $('faixaAviso');
    let html = '';
    if (estado.carregando && !estado.ultimaCarga) return; // primeira carga: mantém "Carregando…"

    const botaoRecarregar = '<button type="button" class="botao" data-recarregar>Tentar novamente</button>';
    const sufixoDemo = MODO_DEMO ? '?demo=1' : '';

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

    if (estado.configErro) {
      html += '<div class="aviso erro"><span><strong>Não foi possível carregar a configuração da empresa;</strong> usando o padrão. ' + esc(estado.configErro) + '</span>' +
        botaoRecarregar + '</div>';
    }

    if (c) {
      if (c.res.semHorarioCadastrado) {
        html += '<div class="aviso"><span><strong>Sem horário de funcionamento cadastrado:</strong> usando 24 h corridas ' +
          '(noites e fins de semana entram na conta).</span><a class="botao" href="configuracoes.html' + sufixoDemo + '">Configurar</a></div>';
      }
      const dias = c.res.diasDesconsiderados;
      if (dias.length) {
        const lista = dias.slice(0, 5).map((d) => M.formatarDiaCurto(d.data)).join(', ') + (dias.length > 5 ? ' e mais ' + (dias.length - 5) : '');
        html += '<div class="aviso"><span><strong>' + dias.length + (dias.length === 1 ? ' dia desconsiderado' : ' dias desconsiderados') +
          ' do cálculo</strong> por não haver nenhum equipamento ligado: ' + esc(lista) + '.</span></div>';
      }
      const desc = c.res.avisos.statusDesconhecidos;
      const chaves = Object.keys(desc);
      if (chaves.length) {
        const n = chaves.reduce((t, k) => t + desc[k], 0);
        html += '<div class="aviso"><span><strong>' + n + (n === 1 ? ' registro ignorado' : ' registros ignorados') +
          '</strong> por status desconhecido: ' + esc(chaves.join(', ')) + '.</span></div>';
      }
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
    if (estado.custom.de) $('dataDe').value = estado.custom.de;
    if (estado.custom.ate) $('dataAte').value = estado.custom.ate;
  }

  function renderCabecalho(c) {
    $('subtitulo').textContent =
      'Visão geral da fábrica · ' + c.p.rotulo + ' (' + M.formatarDataHoraFuso(c.p.de, fuso()) + ' → ' + M.formatarDataHoraFuso(c.p.ate, fuso()) + ')';
  }

  /* ---------- KPIs ---------- */

  // tipo: 'pp' (pontos percentuais), 'h' (horas) ou 'n' (quantidade)
  function delta(atual, anterior, temBase, tipo, maiorEhMelhor) {
    if (!temBase) return '<span class="delta neutro">sem base de comparação</span>';
    const diff = atual - anterior;
    if (Math.abs(diff) < (tipo === 'n' ? 0.5 : 0.05)) return '<span class="delta neutro">■ estável vs. anterior</span>';
    const sobe = diff > 0;
    const bom = sobe === maiorEhMelhor;
    const casas = tipo === 'n' ? 0 : 1;
    const valor = Math.abs(diff).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    const unidade = tipo === 'pp' ? ' p.p.' : tipo === 'h' ? ' h' : '';
    return '<span class="delta ' + (bom ? 'bom' : 'ruim') + '">' + (sobe ? '▲ ' : '▼ ') + valor + unidade + ' vs. anterior</span>';
  }

  function kpi(rotulo, valor, dica, cor, extra, anel, ajuda) {
    return '<div class="kpi"' + (ajuda ? ' title="' + esc(ajuda) + '"' : '') + '>' +
      (anel || '') +
      '<div class="kpi-corpo"><p class="kpi-rotulo">' + rotulo + '</p>' +
      '<p class="kpi-valor ' + (cor || '') + '">' + valor + '</p>' +
      (dica ? '<p class="kpi-dica">' + dica + '</p>' : '') + (extra || '') + '</div></div>';
  }

  function anel(pct, cor) {
    return '<div class="anel" style="--p:' + Math.max(0, Math.min(100, pct)).toFixed(1) + ';--cor:' + cor + '" aria-hidden="true"></div>';
  }

  const pct100 = (razao) => (razao === null ? 0 : razao * 100);

  function renderKpis(c) {
    const r = c.total;
    const a = c.totalAnt;
    const n = c.contagem;
    const base = temDados(r) && temDados(a);

    const dicaFrota = [];
    if (n.semSinal) dicaFrota.push(n.semSinal + ' sem sinal');
    if (n.semInfo) dicaFrota.push(n.semInfo + ' sem informação de estado');

    $('kpisAgora').innerHTML =
      kpi('Equipamentos monitorados', String(estado.equipamentos.length),
        dicaFrota.length ? dicaFrota.join(' · ') : 'Tornos cadastrados com CLP') +
      kpi('Ativos agora', String(n.ativo), 'de ' + estado.equipamentos.length + ' equipamentos', 'cor-ativo') +
      kpi('Em espera agora', String(n.espera), 'ligados, sem produzir', 'cor-espera') +
      kpi('Inativos agora', String(n.inativo), 'parados / desligados', 'cor-inativo');

    const semDados = !temDados(r);
    const execMedio = r.tempoMedioExecucaoMs === null ? 'sem execuções no período' : 'Tempo médio: ' + M.formatarDuracao(r.tempoMedioExecucaoMs);

    $('kpisPeriodo').innerHTML =
      kpi('Disponibilidade (OEE)', semDados ? '—' : M.formatarPct(pct100(r.disponibilidadeOEE)), 'Tempo produzindo ÷ tempo programado', 'cor-ativo',
        delta(pct100(r.disponibilidadeOEE), pct100(a.disponibilidadeOEE), base, 'pp', true),
        anel(semDados ? 0 : pct100(r.disponibilidadeOEE), COR.ativo),
        'Tempo produzindo ÷ tempo programado. Inclui o ATIVO fora do horário (hora extra). Este sistema mede só a Disponibilidade, o primeiro componente do OEE.') +
      kpi('Máquina ligada', semDados ? '—' : M.formatarPct(pct100(r.maquinaLigada)), 'Ativo + espera ÷ tempo programado', 'cor-primaria',
        delta(pct100(r.maquinaLigada), pct100(a.maquinaLigada), base, 'pp', true),
        anel(semDados ? 0 : pct100(r.maquinaLigada), '#19d1d2'),
        'Tempo com a máquina ligada (ativo + espera) ÷ tempo programado.') +
      kpi('Tempo produtivo', M.formatarHoras(r.tempoProdutivoMs / M.HORA), 'de ' + M.formatarHoras(r.denominadorMs / M.HORA) + ' contadas', 'cor-ativo',
        delta(r.tempoProdutivoMs / M.HORA, a.tempoProdutivoMs / M.HORA, base, 'h', true)) +
      kpi('Tempo improdutivo', M.formatarHoras(r.tempoImprodutivoMs / M.HORA), 'Espera + inatividade no horário', 'cor-inativo',
        delta(r.tempoImprodutivoMs / M.HORA, a.tempoImprodutivoMs / M.HORA, base, 'h', false)) +
      kpi('Execuções', String(r.execucoes), execMedio, 'cor-primaria',
        delta(r.execucoes, a.execucoes, base, 'n', true), '',
        'Quantas vezes a máquina passou a ATIVO no período. É uma REFERÊNCIA para estimar peças, não uma contagem de peças: uma peça pode gerar mais de uma execução e uma execução pode gerar várias peças.') +
      kpi('Horas extras produtivas', M.formatarHoras(r.horasExtrasMs / M.HORA), 'Produção fora do horário', 'cor-ativo',
        delta(r.horasExtrasMs / M.HORA, a.horasExtrasMs / M.HORA, base, 'h', true), '',
        'ATIVO fora do horário de funcionamento (a partir de ' + M.formatarDuracao(M.CONFIG_METRICAS.MIN_HORA_EXTRA_MS) + ' contínuos).');
  }

  /* ---------- Cartões das máquinas ---------- */

  function seloEstado(est) {
    const k = classeEstado(est);
    return '<span class="selo est-' + k + '"><span class="led led-' + k + '"></span>' + rotuloEstado(est) + '</span>';
  }

  function renderMaquinas(c) {
    const cartoes = estado.equipamentos.map((e) => {
      const sit = c.situacoes[e.id];
      const ind = c.res.porEquipamento[e.id];
      const k = classeEstado(sit.estado);
      const mudou = estado.statusVisto[e.id] !== undefined && estado.statusVisto[e.id] !== sit.estado;
      estado.statusVisto[e.id] = sit.estado;
      const t = temDados(ind);

      const tempo = sit.desde
        ? '<strong>' + M.formatarDuracao(c.agora - sit.desde) + '</strong><span>neste estado desde ' + horaOuData(sit.desde) + '</span>'
        : '<strong>—</strong><span>sem registro de mudança de estado</span>';

      const den = ind.denominadorMs || 1;
      const barra = t
        ? '<div class="barra-empilhada" title="Composição do período">' +
          '<i class="b-ativo" style="width:' + (ind.tempoAtivoTotalMs / den) * 100 + '%"></i>' +
          '<i class="b-espera" style="width:' + (ind.tempoEsperaMs / den) * 100 + '%"></i>' +
          '<i class="b-inativo" style="width:' + (ind.tempoInativoMs / den) * 100 + '%"></i></div>'
        : '<div class="barra-empilhada"></div>';

      const dados = t
        ? '<dl class="maquina-dados">' +
          '<div><dt>Disp. (OEE)</dt><dd class="cor-ativo">' + M.formatarPct(pct100(ind.disponibilidadeOEE)) + '</dd></div>' +
          '<div><dt>Execuções</dt><dd>' + ind.execucoes + '</dd></div>' +
          '<div><dt>Paradas</dt><dd>' + ind.paradas + '</dd></div></dl>' +
          '<p class="maquina-rodape">Ativo ' + M.formatarHoras(ind.tempoAtivoTotalMs / M.HORA) +
          (ind.tempoMedioExecucaoMs !== null ? ' · Tempo médio/exec.: ' + M.formatarDuracao(ind.tempoMedioExecucaoMs) : '') + '</p>'
        : '<p class="maquina-rodape">Sem dados dentro do horário neste período.</p>';

      return '<article class="maquina est-' + k + (mudou ? ' piscar' : '') + '">' +
        '<header class="maquina-cab"><div><p class="maquina-nome">' + esc(e.nome) + '</p>' +
        '<p class="maquina-modelo">' + esc(e.modelo || 'modelo não informado') + '</p></div>' + seloEstado(sit.estado) + '</header>' +
        '<div class="maquina-tempo">' + tempo + '</div>' + barra + dados +
        '<p class="maquina-rodape">Última atualização: ' + (sit.ultimaAtualizacao ? M.formatarDataHoraFuso(sit.ultimaAtualizacao, fuso()) : '—') +
        (e.ultimo_sinal_em ? ' · <span data-sinal="' + esc(e.id) + '">' + esc(textoSinal(e, c.agora)) + '</span>' : '') + '</p>' +
        '</article>';
    });
    $('maquinas').innerHTML = cartoes.join('');
  }

  /* ---------- Linha do tempo ---------- */

  function renderLinhaTempo(c) {
    const { de, ate } = c.p;
    const duracao = Math.max(ate - de, 1);
    const linhas = estado.equipamentos.map((e) => {
      const segs = c.res.segmentos.filter((s) => String(s.equipamentoId) === String(e.id)).map((s) => {
        const esq = ((s.inicio - de) / duracao) * 100;
        const larg = ((s.fim - s.inicio) / duracao) * 100;
        const extra = s.estado === 'ativo' && !s.dentroTurno;
        const dica = rotuloEstado(s.estado) + (extra ? ' (hora extra)' : '') + ' · ' + M.formatarDataHoraFuso(s.inicio, fuso()) + ' → ' +
          M.formatarDataHoraFuso(s.fim, fuso()) + ' (' + M.formatarDuracao(s.fim - s.inicio) + ')';
        const classe = s.estado === 'sem_sinal' ? 'b-semdados' : 'b-' + s.estado;
        return '<div class="lt-seg ' + classe + (extra ? ' fora-turno' : '') + '" style="left:' + esq.toFixed(3) + '%;width:' + larg.toFixed(3) + '%" title="' + esc(dica) + '"></div>';
      }).join('');
      return '<div class="lt-nome" title="' + esc(e.nome) + '">' + esc(e.nome) + '</div><div class="lt-faixa">' + segs + '</div>';
    }).join('');

    const marcas = [];
    for (let i = 0; i <= 5; i++) {
      const ts = de + (duracao * i) / 5;
      const rot = duracao <= 2 * M.DIA ? M.formatarHoraFuso(ts, fuso()) : M.formatarDataHoraFuso(ts, fuso()).split(' ')[0];
      marcas.push('<span style="left:' + i * 20 + '%">' + rot + '</span>');
    }
    $('linhaTempo').innerHTML = '<div class="linha-tempo">' + linhas +
      '<div class="lt-espaco"></div><div class="lt-eixo">' + marcas.join('') + '</div></div>';
  }

  /* ---------- Capacidade ---------- */

  function passo(rotulo, valorH, pct, classe) {
    return '<div><div class="passo-topo"><span>' + rotulo + '</span><span>' + M.formatarHoras(valorH) + ' · ' + M.formatarPct(pct) + '</span></div>' +
      '<div class="trilho"><i class="' + classe + '" style="width:' + Math.min(pct, 100) + '%"></i></div></div>';
  }

  function itemCap(rotulo, valor, cor) {
    return '<div class="item"><p class="item-rotulo">' + rotulo + '</p><p class="item-valor ' + (cor || '') + '">' + valor + '</p></div>';
  }

  function renderCapacidade(c) {
    const r = c.total;
    if (!temDados(r)) {
      $('capacidade').innerHTML = '<p class="estado-vazio">Ainda não há registros de estado dentro do horário neste período.</p>';
      return;
    }
    const h = (ms) => ms / M.HORA;
    const den = r.denominadorMs;
    const ociosa = r.tempoImprodutivoMs;
    $('capacidade').innerHTML =
      '<div class="passos">' +
      passo('Capacidade disponível', h(den), 100, 'b-primaria') +
      passo('Capacidade utilizada', h(r.tempoAtivoTotalMs), (r.tempoAtivoTotalMs / den) * 100, 'b-ativo') +
      passo('Capacidade ociosa', h(ociosa), (ociosa / den) * 100, 'b-inativo') +
      '<div><p class="subtitulo-mini">Composição do tempo contado</p>' +
      '<div class="barra-empilhada" style="margin-top:0;height:12px">' +
      '<i class="b-ativo" style="width:' + (r.tempoAtivoTotalMs / den) * 100 + '%" title="Ativo"></i>' +
      '<i class="b-espera" style="width:' + (r.tempoEsperaMs / den) * 100 + '%" title="Espera"></i>' +
      '<i class="b-inativo" style="width:' + (r.tempoInativoMs / den) * 100 + '%" title="Inativo"></i></div>' +
      '<p class="alerta-detalhe" style="margin-top:6px">Base de cálculo: só o tempo com registro do CLP dentro do horário de funcionamento' +
      (r.coberturaDados === null ? '.' : ' — cobre ' + M.formatarPct(r.coberturaDados * 100, 0) + ' do horário programado.') + '</p></div></div>' +
      '<div class="itens-2">' +
      itemCap('Horas ativas', M.formatarHoras(h(r.tempoAtivoTotalMs)), 'cor-ativo') +
      itemCap('Horas em espera', M.formatarHoras(h(r.tempoEsperaMs)), 'cor-espera') +
      itemCap('Horas inativas', M.formatarHoras(h(r.tempoInativoMs)), 'cor-inativo') +
      itemCap('Capacidade não utilizada', M.formatarPct((ociosa / den) * 100), 'cor-inativo') + '</div>';
  }

  /* ---------- Alertas ---------- */

  // Faixas de turno entre dois instantes (para medir "há quanto tempo, DENTRO do expediente").
  // Sem horário cadastrado: 24 h corridas. Dias desconsiderados (já detectados) ficam de fora.
  function faixasParaAlerta(desde, agora, c) {
    if (!estado.config.horarios.length) return [{ inicio: desde, fim: agora }];
    const fora = new Set(c.res.diasDesconsiderados.map((d) => d.data));
    return M.faixasDoTurno(estado.config, { de: desde, ate: agora }).filter((f) => !fora.has(f.data));
  }

  function minutosDeExpediente(sit, agora, c) {
    if (!sit.desde) return 0;
    return M.tempoNoEstadoNoExpedienteMs([{ inicio: sit.desde, fim: agora }], faixasParaAlerta(sit.desde, agora, c), agora);
  }

  function montarAlertas(c) {
    const lista = [];
    const dentro = M.estaNoExpediente(c.agora, estado.config);
    const diasComTurno = estado.config.horarios.length
      ? Math.max(new Set(c.res.faixasValidas.map((f) => f.data)).size, 1)
      : Math.max((c.p.ate - c.p.de) / M.DIA, 1);

    for (const e of estado.equipamentos) {
      const nome = e.nome;
      const sit = c.situacoes[e.id];
      const ind = c.res.porEquipamento[e.id];

      if (sit.estado === 'sem_sinal') {
        lista.push({ sev: 'atencao', ico: 'semsinal', titulo: nome + ' sem sinal',
          detalhe: 'Sem comunicação com o equipamento' + (sit.desde ? ' desde ' + horaOuData(sit.desde) : '') + '. Esse tempo fica fora dos cálculos.',
          limite: 'tolerância: ' + M.formatarDuracao(M.CONFIG_METRICAS.TOLERANCIA_SEM_SINAL_MS) });
      }

      const noExpediente = dentro && (sit.estado === 'espera' || sit.estado === 'inativo') ? minutosDeExpediente(sit, c.agora, c) : 0;
      if (sit.estado === 'espera' && noExpediente > LIMITES.esperaProlongadaMin * M.MIN) {
        lista.push({ sev: 'atencao', ico: 'pausa', titulo: nome + ' em espera prolongada',
          detalhe: 'Ligado e sem produzir há ' + M.formatarDuracao(noExpediente) + ' de expediente.',
          limite: 'limite: ' + LIMITES.esperaProlongadaMin + ' min' });
      }
      if (sit.estado === 'inativo' && noExpediente > LIMITES.paradaProlongadaHoras * M.HORA) {
        lista.push({ sev: 'critico', ico: 'alerta', titulo: nome + ' desligado em horário de expediente',
          detalhe: 'Inativo há ' + M.formatarDuracao(noExpediente) + ' de expediente (pode indicar baixa demanda ou manutenção).',
          limite: 'limite: ' + LIMITES.paradaProlongadaHoras + ' h' });
      }

      if (c.res.avisos.equipamentosSemRegistros.indexOf(e.id) >= 0 || !temDados(ind)) {
        lista.push({ sev: 'info', ico: 'info', titulo: nome + ' sem registros no período',
          detalhe: 'Nenhum registro do CLP dentro do horário nesta janela.', limite: '' });
        continue;
      }
      if (ind.tempoMonitoradoDentroMs < LIMITES.minimoHorasParaAlertar * M.HORA) continue;

      const disp = pct100(ind.disponibilidadeOEE);
      if (disp < LIMITES.disponibilidadeBaixaPct) {
        lista.push({ sev: 'atencao', ico: 'queda', titulo: nome + ' com disponibilidade baixa',
          detalhe: 'Disponibilidade (OEE) de ' + M.formatarPct(disp) + ' no período.', limite: 'limite: ' + LIMITES.disponibilidadeBaixaPct + '%' });
      }
      const esperaPct = (ind.tempoEsperaMs / ind.denominadorMs) * 100;
      if (esperaPct > LIMITES.esperaAltaPct) {
        lista.push({ sev: 'atencao', ico: 'alerta', titulo: nome + ' com muito tempo em espera',
          detalhe: M.formatarPct(esperaPct) + ' do período em espera.', limite: 'limite: ' + LIMITES.esperaAltaPct + '%' });
      }
      if (ind.paradas / diasComTurno > LIMITES.paradasPorDia) {
        lista.push({ sev: 'atencao', ico: 'pausa', titulo: nome + ' com muitas paradas',
          detalhe: ind.paradas + ' paradas (' + (ind.paradas / diasComTurno).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' por dia de expediente).',
          limite: 'limite: ' + LIMITES.paradasPorDia + ' por dia' });
      }
    }

    const desc = c.res.avisos.statusDesconhecidos;
    const chaves = Object.keys(desc);
    if (chaves.length) {
      lista.push({ sev: 'info', ico: 'info', titulo: 'Registros com status desconhecido',
        detalhe: chaves.map((k) => k + ' (' + desc[k] + ')').join(', ') + ' foram ignorados.', limite: '' });
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

  function rotuloParametro(chave) {
    const p = M.PARAMETROS_FINANCEIROS_V10.find((x) => x.chave === chave);
    return p ? p.rotulo : chave;
  }

  function renderFinanceiro(c) {
    const r = c.total;
    const fin = c.financeiro;
    const den = r.denominadorMs;
    const semDados = !temDados(r);

    // máquina com maior perda (impacto em R$ se configurado; senão, mais horas improdutivas)
    const ranking = estado.equipamentos
      .map((e) => ({ e, ind: c.res.porEquipamento[e.id] }))
      .filter((x) => temDados(x.ind))
      .map((x) => ({ ...x, impacto: impactoDe(x.ind) }))
      .sort((x, y) => (x.impacto !== null && y.impacto !== null ? y.impacto - x.impacto : y.ind.tempoImprodutivoMs - x.ind.tempoImprodutivoMs));
    const pior = ranking[0];

    const respostas =
      '<div class="respostas">' +
      '<div class="resposta"><p>Quanto estamos produzindo?</p><p class="valor cor-ativo">' + (semDados ? '—' : M.formatarPct(pct100(r.disponibilidadeOEE))) + '</p><p class="dica">' + M.formatarHoras(r.tempoProdutivoMs / M.HORA) + ' produtivas</p></div>' +
      '<div class="resposta"><p>Quanto deixamos de produzir?</p><p class="valor cor-inativo">' + (semDados ? '—' : M.formatarPct((r.tempoImprodutivoMs / den) * 100)) + '</p><p class="dica">' + M.formatarHoras(r.tempoImprodutivoMs / M.HORA) + ' improdutivas</p></div>' +
      '<div class="resposta"><p>Horas desligadas no expediente</p><p class="valor cor-inativo">' + M.formatarHoras(r.tempoInativoMs / M.HORA) + '</p><p class="dica">' + M.formatarHoras(r.tempoEsperaMs / M.HORA) + ' em espera</p></div>' +
      '<div class="resposta"><p>Maior concentração de perdas</p><p class="valor cor-espera" style="font-size:16px;overflow-wrap:anywhere">' + (pior ? esc(pior.e.nome) : '—') + '</p>' +
      '<p class="dica">' + (pior ? M.formatarPct(pct100(pior.ind.disponibilidadeOEE)) + ' de disponibilidade' : '') + '</p></div></div>';

    const totalLinha = fin.impacto !== null
      ? '<li class="fin-linha" style="border-color:rgba(243,186,37,.45);background:rgba(243,186,37,.06)"><div><p class="nome"><strong>Impacto estimado total</strong></p><p class="formula">ociosidade + oportunidade' + (fin.parcial ? ' (parcial: falta um valor)' : '') + '</p></div>' +
        '<span class="valor">' + M.formatarMoeda(fin.impacto) + '<small>estimado</small></span></li>'
      : '';

    const linhas = fin.itens.map((f) =>
      '<li class="fin-linha"><div><p class="nome">' + esc(f.rotulo) + '</p><p class="formula">' + esc(f.formula) + '</p></div>' +
      (f.valor === null
        ? '<div class="fin-faltando"><b>não calculado</b>necessita: ' + esc(rotuloParametro(f.faltando)) + '</div>'
        : '<span class="valor">' + M.formatarMoeda(f.valor) + '<small>estimado</small></span>') + '</li>'
    ).join('');

    $('financeiro').innerHTML = respostas + '<ul class="lista-fin">' + totalLinha + linhas + '</ul>' +
      '<p class="alerta-detalhe" style="margin-top:10px">Custo de oportunidade: só é perda real se havia demanda; em baixa demanda a margem não existiria. ' +
      'Todos os valores são estimativas médias por hora, calculadas só com o tempo dentro do horário.</p>';
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
    const chip = (est) => '<b class="' + (est === 'sem_sinal' ? 'cor-suave' : 'cor-' + est) + '">' + rotuloEstado(est) + '</b>';
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

  const COR_EXTRA = COR.ativo + '99'; // hora extra = o verde do ativo, mais suave

  function renderGraficos(c) {
    const r = c.total;
    const comDados = temDados(r);
    document.querySelectorAll('.caixa-grafico').forEach((el) => el.classList.toggle('sem-dados', !comDados));
    if (!configurarPadraoGraficos()) {
      document.querySelectorAll('.caixa-grafico').forEach((el) => {
        el.classList.add('sem-dados');
        el.querySelector('.vazio').textContent = 'Não foi possível carregar a biblioteca de gráficos (verifique a internet).';
      });
      return;
    }
    if (!comDados) return;
    $('graficoHoras').parentElement.style.height = Math.max(200, 46 * estado.equipamentos.length + 90) + 'px';

    // Evolução (áreas empilhadas, em %)
    atualizarGrafico('graficoEvolucao', () => ({
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Ativo no horário', data: [], borderColor: COR.ativo, backgroundColor: COR.ativo + '66', fill: 'origin' },
          { label: 'Hora extra', data: [], borderColor: COR.ativo, backgroundColor: COR.ativo + '33', borderDash: [4, 3], fill: '-1' },
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
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (i) => ' ' + i.dataset.label + ': ' + (i.parsed.y === null ? '—' : i.parsed.y.toLocaleString('pt-BR') + '%') } } },
      },
    }), c.serie.map((p) => p.rotulo), [c.serie.map((p) => p.ativo), c.serie.map((p) => p.extra), c.serie.map((p) => p.espera), c.serie.map((p) => p.inativo)]);

    // Distribuição (rosca, em horas)
    const arred = (n) => +n.toFixed(1);
    const h = (ms) => arred(ms / M.HORA);
    atualizarGrafico('graficoRosca', () => ({
      type: 'doughnut',
      data: { labels: [], datasets: [{ data: [], backgroundColor: [COR.ativo, COR_EXTRA, COR.espera, COR.inativo], borderWidth: 0 }] },
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
    }), ['Ativo no horário', 'Hora extra', 'Espera', 'Inativo'], [[h(r.tempoAtivoDentroMs), h(r.horasExtrasMs), h(r.tempoEsperaMs), h(r.tempoInativoMs)]]);

    // Horas por equipamento (barras empilhadas)
    const inds = estado.equipamentos.map((e) => c.res.porEquipamento[e.id]);
    atualizarGrafico('graficoHoras', () => ({
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          { label: 'Ativo no horário', data: [], backgroundColor: COR.ativo },
          { label: 'Hora extra', data: [], backgroundColor: COR_EXTRA },
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
    }), estado.equipamentos.map((e) => e.nome), [
      inds.map((i) => h(i.tempoAtivoDentroMs)),
      inds.map((i) => h(i.horasExtrasMs)),
      inds.map((i) => h(i.tempoEsperaMs)),
      inds.map((i) => h(i.tempoInativoMs)),
    ]);
  }

  /* ---------- Tabela ---------- */

  const COLUNAS = [
    { id: 'nome', rotulo: 'Equipamento', valor: (l) => l.e.nome.toLowerCase() },
    { id: 'status', rotulo: 'Status', valor: (l) => l.sit.estado || '' },
    { id: 'disponibilidade', rotulo: 'Disp. (OEE)', valor: (l) => (temDados(l.ind) ? l.ind.disponibilidadeOEE : null) },
    { id: 'ativas', rotulo: 'Ativas', valor: (l) => (temDados(l.ind) ? l.ind.tempoAtivoTotalMs : null) },
    { id: 'espera', rotulo: 'Espera', valor: (l) => (temDados(l.ind) ? l.ind.tempoEsperaMs : null) },
    { id: 'inativas', rotulo: 'Inativas', valor: (l) => (temDados(l.ind) ? l.ind.tempoInativoMs : null) },
    { id: 'extras', rotulo: 'Horas extras', valor: (l) => (temDados(l.ind) ? l.ind.horasExtrasMs : null) },
    { id: 'execucoes', rotulo: 'Execuções', valor: (l) => (temDados(l.ind) ? l.ind.execucoes : null) },
    { id: 'medio', rotulo: 'Tempo médio/exec.', valor: (l) => l.ind.tempoMedioExecucaoMs },
    { id: 'paradas', rotulo: 'Paradas', valor: (l) => (temDados(l.ind) ? l.ind.paradas : null) },
    { id: 'maiorParada', rotulo: 'Maior parada', valor: (l) => (temDados(l.ind) ? l.ind.maiorPeriodoSemProduzirMs : null) },
    { id: 'impacto', rotulo: 'Impacto estimado', valor: (l) => l.impacto },
  ];

  function renderTabela(c) {
    const linhas = estado.equipamentos.map((e) => {
      const ind = c.res.porEquipamento[e.id];
      return { e, ind, sit: c.situacoes[e.id], impacto: impactoDe(ind) };
    });
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

    const dash = '<span class="cor-suave">—</span>';
    const corpo = linhas.map(({ e, ind, sit, impacto }) => {
      const t = temDados(ind);
      const hr = (ms) => M.formatarHoras(ms / M.HORA);
      return '<tr>' +
        '<td><p style="font-weight:500">' + esc(e.nome) + '</p><p class="sub">' + esc(e.modelo || '') + '</p></td>' +
        '<td>' + seloEstado(sit.estado) + '</td>' +
        '<td>' + (t ? '<div class="util-celula"><div class="trilho"><i class="b-ativo" style="width:' + Math.min(pct100(ind.disponibilidadeOEE), 100) + '%"></i></div><span class="num">' + M.formatarPct(pct100(ind.disponibilidadeOEE)) + '</span></div>' : dash) + '</td>' +
        '<td class="num cor-ativo">' + (t ? hr(ind.tempoAtivoTotalMs) : dash) + '</td>' +
        '<td class="num cor-espera">' + (t ? hr(ind.tempoEsperaMs) : dash) + '</td>' +
        '<td class="num cor-inativo">' + (t ? hr(ind.tempoInativoMs) : dash) + '</td>' +
        '<td class="num">' + (t ? hr(ind.horasExtrasMs) : dash) + '</td>' +
        '<td class="num">' + (t ? ind.execucoes : dash) + '</td>' +
        '<td class="num">' + (ind.tempoMedioExecucaoMs !== null ? M.formatarDuracao(ind.tempoMedioExecucaoMs) : dash) + '</td>' +
        '<td class="num">' + (t ? ind.paradas : dash) + '</td>' +
        '<td class="num">' + (t ? M.formatarDuracao(ind.maiorPeriodoSemProduzirMs) : dash) + '</td>' +
        '<td class="num">' + (impacto === null ? '<button type="button" class="link-btn" data-abrir-parametros>informar valores</button>' : M.formatarMoeda(impacto)) + '</td>' +
        '</tr>';
    }).join('');

    $('tabela').innerHTML = '<table><thead><tr>' + cab + '</tr></thead><tbody>' + corpo + '</tbody></table>';
  }

  function renderRodape() {
    const hora = estado.ultimaCarga ? M.formatarHoraFuso(estado.ultimaCarga, fuso()) : '—';
    $('rodapeSync').innerHTML = 'Dados carregados às ' + hora + ' · <button type="button" class="link-btn" style="color:var(--primaria)" data-recarregar>atualizar agora</button>';
  }

  /* ------------------------------------------------------------
     JANELA DOS VALORES FINANCEIROS (gravados no banco, por empresa)
     ------------------------------------------------------------ */
  function abrirParametros() {
    const f = estado.config.financeiro;
    $('camposParametros').innerHTML = M.PARAMETROS_FINANCEIROS_V10.map((p) =>
      '<div class="campo"><label for="p_' + p.chave + '">' + esc(p.rotulo) + '</label>' +
      '<div class="entrada"><span>R$</span><input id="p_' + p.chave + '" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00" value="' +
      (f[p.chave] === null || f[p.chave] === undefined ? '' : f[p.chave]) + '" /><span>/ hora</span></div></div>'
    ).join('');
    $('msgParametros').textContent = '';
    $('dlgParametros').showModal();
  }

  function lerCamposParametros() {
    const valores = {};
    M.PARAMETROS_FINANCEIROS_V10.forEach((p) => {
      const bruto = $('p_' + p.chave).value.replace(',', '.').trim();
      valores[p.chave] = bruto === '' ? null : Number(bruto);
    });
    return valores;
  }

  // Grava no banco (pelo ConfigEmpresa). As "peças por execução" não têm tela, mas são preservadas.
  async function salvarParametros(valores) {
    if (!estado.empresa) { $('msgParametros').textContent = 'Empresa não carregada.'; return; }
    const financeiro = { ...valores, pecasPorExecucao: estado.config.financeiro.pecasPorExecucao };
    const r = await C.salvarFinanceiro(sb, estado.empresa.id, financeiro);
    if (!r.ok) { $('msgParametros').textContent = r.erro; return; }
    const rc = await C.carregarConfig(sb, estado.empresa.id, { forcar: true });
    if (rc.ok) estado.config = rc.dados;
    $('dlgParametros').close();
    renderizar();
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
          estado.custom = { de: diaIso(Date.now() - 6 * M.DIA), ate: diaIso(Date.now()) };
        }
        renderPeriodos();
        sincronizarDatas();
        carregar();
      } else if (alvo.dataset.ordenar) {
        const campo = alvo.dataset.ordenar;
        estado.ordem = estado.ordem.campo === campo
          ? { campo, dir: estado.ordem.dir === 'asc' ? 'desc' : 'asc' }
          : { campo, dir: campo === 'nome' || campo === 'disponibilidade' ? 'asc' : 'desc' };
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
      let de = $('dataDe').value;
      let ate = $('dataAte').value;
      if (!de || !ate) return;
      if (de > ate) [de, ate] = [ate, de]; // 'AAAA-MM-DD' compara certo como texto
      estado.custom = { de, ate };
      carregar();
    };
    $('dataDe').addEventListener('change', aoMudarData);
    $('dataAte').addEventListener('change', aoMudarData);

    $('formParametros').addEventListener('submit', (ev) => {
      ev.preventDefault();
      salvarParametros(lerCamposParametros());
    });
    $('btnCancelarParametros').addEventListener('click', () => $('dlgParametros').close());
    $('btnLimparParametros').addEventListener('click', () => {
      if (!window.confirm('Apagar os quatro valores do banco? Isso vale para toda a empresa.')) return;
      const vazio = {};
      M.PARAMETROS_FINANCEIROS_V10.forEach((p) => (vazio[p.chave] = null));
      salvarParametros(vazio);
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

  // usado só pelos testes automáticos
  window._DashboardTeste = { estado, renderizar, calcularPagina };
})();
