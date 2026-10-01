/* ============================================================
   relatorios.js — a tela de RELATÓRIOS
   - busca os dados no Supabase (equipamentos + historico_status)
   - calcula tudo com js/metrics.js
   - mostra resumo, conclusões, gráfico, tabelas e exporta CSV/PDF

   Dica: abra com  ?demo=1  para ver com dados fictícios.
   ============================================================ */
(function () {
  'use strict';

  const M = window.Metricas;
  const sb = window.supabaseClient;
  const MODO_DEMO = new URLSearchParams(location.search).get('demo') === '1';

  const CHAVE_PARAMETROS = 'carrissimi.financeiro'; // a mesma do Dashboard
  const LIMITE_LINHAS = 30000; // máximo de registros lidos do banco de uma vez
  const COR = { ativo: '#3fcd63', espera: '#f3ba25', inativo: '#ed4042' };
  const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  const PERIODOS = [
    { chave: 'hoje', rotulo: 'Hoje' },
    { chave: '7d', rotulo: '7 dias' },
    { chave: '30d', rotulo: '30 dias' },
    { chave: 'mes', rotulo: 'Mês atual' },
    { chave: 'mesAnterior', rotulo: 'Mês anterior' },
    { chave: 'custom', rotulo: 'Personalizado' },
  ];

  /* ------------------------------------------------------------
     ESTADO DA PÁGINA
     ------------------------------------------------------------ */
  const estado = {
    periodo: '30d',
    custom: { de: null, ate: null },
    equipFiltro: 'todos',
    empresa: null,
    equipamentos: [],
    eventos: {},
    params: lerParametros(),
    carregando: false,
    recarregarDepois: false,
    erro: null,
    truncado: false,
    ultimaCarga: null,
    ultimo: null, // último cálculo (usado nas exportações)
    demo: null,
  };
  let grafico = null;

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

  function dataBr(ts) {
    const d = new Date(ts);
    const dois = (n) => String(n).padStart(2, '0');
    return dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + '/' + d.getFullYear();
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
    estado.truncado = false;
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
    let truncado = false;

    if (equipamentos.length) {
      // 1) todos os eventos desde o início da janela (em páginas de 1000)
      const TAMANHO = 1000;
      for (let inicio = 0; inicio < LIMITE_LINHAS; inicio += TAMANHO) {
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
        if (inicio + TAMANHO >= LIMITE_LINHAS) truncado = true;
      }

      // 2) o último evento ANTES da janela de cada máquina
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
    estado.truncado = truncado;
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
     DIVISÃO DO PERÍODO (por hora, dia ou semana)
     ------------------------------------------------------------ */
  function gerarPartes(de, ate) {
    const duracao = ate - de;
    const dois = (n) => String(n).padStart(2, '0');
    const partes = [];
    let tipo;

    if (duracao <= 2 * M.DIA) {
      tipo = 'hora';
      let t = new Date(de);
      t.setMinutes(0, 0, 0);
      while (t.getTime() < ate && partes.length < 100) {
        const proximo = new Date(t);
        proximo.setHours(proximo.getHours() + 1);
        const d = t;
        partes.push({
          a: t.getTime(), b: proximo.getTime(),
          curto: dois(d.getHours()) + 'h',
          longo: dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + ' ' + dois(d.getHours()) + ':00',
        });
        t = proximo;
      }
    } else if (duracao <= 92 * M.DIA) {
      tipo = 'dia';
      let t = new Date(de);
      t.setHours(0, 0, 0, 0);
      while (t.getTime() < ate && partes.length < 400) {
        const proximo = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
        const dm = dois(t.getDate()) + '/' + dois(t.getMonth() + 1);
        partes.push({ a: t.getTime(), b: proximo.getTime(), curto: dm, longo: DIAS_SEMANA[t.getDay()] + ' ' + dm });
        t = proximo;
      }
    } else {
      tipo = 'semana';
      let t = new Date(de);
      t.setHours(0, 0, 0, 0);
      t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); // volta para a segunda-feira
      while (t.getTime() < ate && partes.length < 400) {
        const proximo = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 7);
        const dm = dois(t.getDate()) + '/' + dois(t.getMonth() + 1);
        partes.push({ a: t.getTime(), b: proximo.getTime(), curto: dm, longo: 'Semana de ' + dm });
        t = proximo;
      }
    }
    return { tipo, partes };
  }

  function calcularPartes(segmentosPorEquip, de, ate) {
    const { tipo, partes } = gerarPartes(de, ate);
    const linhas = partes.map((parte) => {
      const a = Math.max(parte.a, de);
      const b = Math.min(parte.b, ate);
      let ativo = 0;
      let espera = 0;
      let inativo = 0;
      let paradas = 0;
      for (const segs of segmentosPorEquip) {
        for (const s of segs) {
          if (s.inicio >= b) break; // os blocos estão em ordem
          if (s.fim <= a) continue;
          const dur = Math.min(s.fim, b) - Math.max(s.inicio, a);
          if (s.estado === 'ativo') ativo += dur;
          else if (s.estado === 'espera') espera += dur;
          else inativo += dur;
          if (s.estado === 'inativo' && s.inicio >= a && s.inicio < b) paradas++;
        }
      }
      const monitorado = ativo + espera + inativo;
      const pct = (x) => (monitorado ? (x / monitorado) * 100 : null);
      return {
        curto: parte.curto, longo: parte.longo,
        monitorado, ativo, espera, inativo, paradas,
        pctAtivo: pct(ativo), pctEspera: pct(espera), pctInativo: pct(inativo),
        temDados: monitorado > 0,
        duracaoParte: b - a,
      };
    });
    return { tipo, linhas };
  }

  /* ------------------------------------------------------------
     CÁLCULO GERAL
     ------------------------------------------------------------ */
  function calcular(agora) {
    const p = periodoAtual(agora);
    const ant = M.periodoAnterior(estado.periodo, p);
    const lista = estado.equipFiltro === 'todos'
      ? estado.equipamentos
      : estado.equipamentos.filter((e) => e.id === estado.equipFiltro);

    const metricas = [];
    const metricasAnt = [];
    for (const e of lista) {
      const ev = estado.eventos[e.id] || [];
      metricas.push(M.calcularEquipamento(e, ev, p.de, p.ate, agora));
      metricasAnt.push(M.calcularEquipamento(e, ev, ant.de, ant.ate, agora));
    }

    const resumo = M.resumoFrota(metricas);
    const soma = (arr, campo) => arr.reduce((t, m) => t + m[campo], 0);
    const impactos = metricas.map((m) => M.impactoEquipamento(m, estado.params));
    const impactoTotal = impactos.some((v) => v !== null)
      ? impactos.reduce((t, v) => t + (v || 0), 0)
      : null;

    return {
      agora, p, ant, lista, metricas, resumo,
      resumoAnt: M.resumoFrota(metricasAnt),
      paradas: soma(metricas, 'paradas'),
      paradasAnt: soma(metricasAnt, 'paradas'),
      impactos, impactoTotal,
      partes: calcularPartes(metricas.map((m) => m.segmentos), p.de, p.ate),
      cobertura: resumo.total
        ? Math.min(100, ((resumo.monitoradoH * M.HORA) / ((p.ate - p.de) * resumo.total)) * 100)
        : 0,
    };
  }

  /* ------------------------------------------------------------
     DESENHAR A TELA
     ------------------------------------------------------------ */
  function renderizar() {
    const principal = $('principal');
    renderAviso();
    renderEmpresa();
    renderPeriodos();
    renderFiltro();

    if (estado.erro || !estado.equipamentos.length) {
      principal.classList.add('so-aviso');
      $('subtitulo').textContent = estado.carregando ? 'Carregando…' : 'Sem dados para mostrar';
      estado.ultimo = null;
      return;
    }
    principal.classList.remove('so-aviso');

    const c = calcular(Date.now());
    estado.ultimo = c;
    $('subtitulo').textContent = c.p.rotulo + ' · ' + dataBr(c.p.de) + ' a ' + dataBr(c.p.ate);

    renderIdentidade(c);
    renderKpis(c);
    renderConclusoes(c);
    renderGrafico(c);
    renderTabelaEquip(c);
    renderTabelaPartes(c);
    $('rodapeSync').innerHTML = 'Dados carregados às ' + new Date(estado.ultimaCarga).toLocaleTimeString('pt-BR') +
      ' · <button type="button" class="link-btn" style="color:var(--primaria)" data-recarregar>atualizar agora</button>';
  }

  function renderAviso() {
    const el = $('faixaAviso');
    if (estado.carregando && !estado.ultimaCarga) return;
    let html = '';

    if (MODO_DEMO) {
      html += '<div class="aviso demo"><span><strong>Modo demonstração</strong> — os dados abaixo são fictícios e não vêm do Supabase.</span>' +
        '<a class="botao" href="' + esc(location.pathname) + '">Sair da demonstração</a></div>';
    }
    if (estado.erro) {
      const msg = estado.erro && estado.erro.message ? estado.erro.message : String(estado.erro);
      if (msg === 'CONFIG') {
        html += '<div class="aviso erro"><span>' +
          (!window.supabase
            ? '<strong>Não consegui carregar a biblioteca do Supabase.</strong> Confira sua internet e recarregue a página.'
            : '<strong>Falta configurar a conexão com o Supabase.</strong> Abra o arquivo <code>js/supabaseClient.js</code> e cole a URL e a chave do seu projeto.') +
          '</span><a class="botao" href="?demo=1">Ver demonstração</a></div>';
      } else {
        html += '<div class="aviso erro"><span><strong>Não foi possível carregar os dados.</strong> ' + esc(msg) +
          '</span><button type="button" class="botao" data-recarregar>Tentar novamente</button></div>';
      }
    } else if (!estado.equipamentos.length && estado.ultimaCarga) {
      html += '<div class="aviso"><span><strong>Nenhum equipamento encontrado.</strong> ' +
        'Se você já cadastrou equipamentos, confira se a tabela <code>equipamentos</code> permite leitura (RLS/policy de SELECT).</span>' +
        '<a class="botao" href="?demo=1">Ver demonstração</a></div>';
    }
    if (estado.truncado) {
      html += '<div class="aviso"><span><strong>Período muito grande:</strong> o sistema leu só uma parte dos registros. ' +
        'Escolha um período menor para números completos.</span></div>';
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

  function renderFiltro() {
    const sel = $('filtroEquip');
    const ids = estado.equipamentos.map((e) => e.id);
    if (estado.equipFiltro !== 'todos' && !ids.includes(estado.equipFiltro)) estado.equipFiltro = 'todos';
    const assinatura = ids.join('|') + '#' + estado.equipamentos.map((e) => e.nome).join('|');
    if (sel.dataset.assinatura !== assinatura) {
      sel.innerHTML = '<option value="todos">Todos os equipamentos</option>' +
        estado.equipamentos.map((e) => '<option value="' + esc(e.id) + '">' + esc(e.nome) + '</option>').join('');
      sel.dataset.assinatura = assinatura;
    }
    sel.value = estado.equipFiltro;
    sel.hidden = estado.equipamentos.length < 2;
  }

  /* ---------- Identificação do relatório ---------- */

  function renderIdentidade(c) {
    const e = estado.empresa;
    const selecao = c.lista.length === estado.equipamentos.length
      ? 'Todos os equipamentos (' + c.lista.length + ')'
      : c.lista.map((x) => x.nome).join(', ');
    const item = (rotulo, valor) => '<div class="item"><p class="item-rotulo">' + rotulo + '</p><p class="item-valor" style="font-size:14px">' + valor + '</p></div>';
    $('identidade').innerHTML =
      '<p class="subtitulo-mini">Relatório de utilização de equipamentos</p>' +
      '<div class="itens-4">' +
      item('Empresa', esc(e ? e.razao_social || e.nome_fantasia || '—' : '—') + (e && e.cnpj ? '<br><span class="cor-suave" style="font-size:12px">CNPJ ' + formatarCnpj(e.cnpj) + '</span>' : '')) +
      item('Período', esc(c.p.rotulo) + '<br><span class="cor-suave" style="font-size:12px">' + dataBr(c.p.de) + ' a ' + dataBr(c.p.ate) + '</span>') +
      item('Equipamentos', esc(selecao)) +
      item('Gerado em', new Date(c.agora).toLocaleString('pt-BR')) +
      '</div>';
  }

  /* ---------- KPIs ---------- */

  function delta(atual, anterior, temBase, tipo, maiorEhMelhor) {
    if (!temBase) return '<span class="delta neutro">sem base de comparação</span>';
    const diff = atual - anterior;
    const casas = tipo === 'n' ? 0 : 1;
    if (Math.abs(diff) < (tipo === 'n' ? 0.5 : 0.05)) return '<span class="delta neutro">■ estável vs. anterior</span>';
    const sobe = diff > 0;
    const valor = Math.abs(diff).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    const unidade = tipo === 'pp' ? ' p.p.' : tipo === 'h' ? ' h' : '';
    return '<span class="delta ' + (sobe === maiorEhMelhor ? 'bom' : 'ruim') + '">' + (sobe ? '▲ ' : '▼ ') + valor + unidade + ' vs. anterior</span>';
  }

  function kpi(rotulo, valor, dica, cor, extra, anel) {
    return '<div class="kpi">' + (anel || '') +
      '<div class="kpi-corpo"><p class="kpi-rotulo">' + rotulo + '</p>' +
      '<p class="kpi-valor ' + (cor || '') + '">' + valor + '</p>' +
      (dica ? '<p class="kpi-dica">' + dica + '</p>' : '') + (extra || '') + '</div></div>';
  }

  function anel(pct, cor) {
    return '<div class="anel" style="--p:' + Math.max(0, Math.min(100, pct)).toFixed(1) + ';--cor:' + cor + '" aria-hidden="true"></div>';
  }

  function maiorSemProduzir(c) {
    let melhor = null;
    for (const m of c.metricas) {
      if (m.temDados && (!melhor || m.maiorParadaMs > melhor.maiorParadaMs)) melhor = m;
    }
    return melhor;
  }

  function renderKpis(c) {
    const r = c.resumo;
    const a = c.resumoAnt;
    const base = r.temDados && a.temDados;
    const dias = Math.max((c.p.ate - c.p.de) / M.DIA, 1);
    const sem = maiorSemProduzir(c);

    $('kpisResumo1').innerHTML =
      kpi('Horas monitoradas', M.formatarHoras(r.monitoradoH),
        c.lista.length + (c.lista.length === 1 ? ' equipamento' : ' equipamentos') + ' · cobertura ' + M.formatarPct(c.cobertura, 0), 'cor-primaria') +
      kpi('Utilização', r.temDados ? M.formatarPct(r.utilizacaoPct) : '—', 'Tempo efetivamente ativo', 'cor-ativo',
        delta(r.utilizacaoPct, a.utilizacaoPct, base, 'pp', true), anel(r.temDados ? r.utilizacaoPct : 0, COR.ativo)) +
      kpi('Disponibilidade', r.temDados ? M.formatarPct(r.disponibilidadePct) : '—', 'Ativo + espera (máquina ligada)', 'cor-primaria',
        delta(r.disponibilidadePct, a.disponibilidadePct, base, 'pp', true), anel(r.temDados ? r.disponibilidadePct : 0, '#19d1d2')) +
      kpi('Impacto financeiro estimado', c.impactoTotal === null ? '—' : M.formatarMoeda(c.impactoTotal),
        c.impactoTotal === null ? '<button type="button" class="link-btn" data-abrir-parametros>informar valores por hora</button>' : 'Ociosidade + paradas (estimativa)', 'cor-espera');

    $('kpisResumo2').innerHTML =
      kpi('Tempo produtivo', M.formatarHoras(r.ativoH), 'Horas com máquina ativa', 'cor-ativo', delta(r.ativoH, a.ativoH, base, 'h', true)) +
      kpi('Tempo improdutivo', M.formatarHoras(r.improdutivoH), 'Espera + inatividade', 'cor-inativo', delta(r.improdutivoH, a.improdutivoH, base, 'h', false)) +
      kpi('Paradas', String(c.paradas), 'Média de ' + (c.paradas / dias).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' por dia', '',
        delta(c.paradas, c.paradasAnt, base, 'n', false)) +
      kpi('Maior período sem produzir', sem ? M.formatarDuracao(sem.maiorParadaMs) : '—', sem ? esc(sem.equip.nome) : 'Sem dados', 'cor-suave');
  }

  /* ---------- Conclusões em texto ---------- */

  function renderConclusoes(c) {
    const r = c.resumo;
    const a = c.resumoAnt;
    const itens = [];
    const forte = (t) => '<strong>' + t + '</strong>';

    if (!r.temDados) {
      $('conclusoes').innerHTML = '<li class="estado-vazio">Ainda não há registros de estado neste período.</li>';
      return;
    }

    const quem = c.lista.length > 1 ? 'Os equipamentos selecionados ficaram' : esc(c.lista[0].nome) + ' ficou';
    let frase = quem + ' ativos em ' + forte(M.formatarPct(r.utilizacaoPct)) + ' do tempo monitorado (' +
      M.formatarHoras(r.ativoH) + ' produtivas de ' + M.formatarHoras(r.monitoradoH) + ').';
    if (a.temDados) {
      const dif = r.utilizacaoPct - a.utilizacaoPct;
      frase += Math.abs(dif) < 0.05
        ? ' Igual ao período anterior.'
        : ' Isso é ' + forte(Math.abs(dif).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' p.p. ' + (dif > 0 ? 'acima' : 'abaixo')) +
          ' do período anterior (' + M.formatarPct(a.utilizacaoPct) + ').';
    } else {
      frase += ' Não há dados do período anterior para comparar.';
    }
    itens.push(frase);

    const comDados = c.metricas.filter((m) => m.temDados);
    if (comDados.length > 1) {
      const ord = [...comDados].sort((x, y) => y.pctAtivo - x.pctAtivo);
      const melhor = ord[0];
      const pior = ord[ord.length - 1];
      itens.push('Maior utilização: ' + forte(esc(melhor.equip.nome)) + ' (' + M.formatarPct(melhor.pctAtivo) + '). ' +
        'Menor utilização: ' + forte(esc(pior.equip.nome)) + ' (' + M.formatarPct(pior.pctAtivo) + ').');
    }

    if (c.paradas > 0) {
      const maisParadas = [...comDados].sort((x, y) => y.paradas - x.paradas)[0];
      itens.push((c.paradas === 1 ? 'Foi ' : 'Foram ') + forte(c.paradas + (c.paradas === 1 ? ' parada' : ' paradas')) + ' no período.' +
        (comDados.length > 1 ? ' A máquina com mais paradas foi ' + forte(esc(maisParadas.equip.nome)) + ' (' + maisParadas.paradas + ').' : ''));
    } else {
      itens.push('Nenhuma parada (estado inativo) foi registrada no período.');
    }

    const sem = maiorSemProduzir(c);
    if (sem && sem.maiorParadaMs > 0) {
      itens.push('Maior período contínuo sem produzir: ' + forte(M.formatarDuracao(sem.maiorParadaMs)) + ' em ' + esc(sem.equip.nome) +
        '. Noites e fins de semana entram nessa conta.');
    }

    const { tipo, linhas } = c.partes;
    if (tipo !== 'hora') {
      // só compara partes que tiveram dados em pelo menos metade da duração (evita distorção nos dias parciais)
      const validas = linhas.filter((l) => l.temDados && l.monitorado >= 0.5 * l.duracaoParte * Math.max(c.lista.length, 1));
      const melhorParte = validas.length > 1 ? [...validas].sort((x, y) => y.pctAtivo - x.pctAtivo)[0] : null;
      if (melhorParte && melhorParte.pctAtivo > 0) {
        itens.push((tipo === 'dia' ? 'Dia mais produtivo: ' : 'Semana mais produtiva: ') + forte(esc(melhorParte.longo)) +
          ' (' + M.formatarPct(melhorParte.pctAtivo) + ' de utilização).');
      }
    }

    if (c.impactoTotal !== null) {
      itens.push('Com os valores informados, o impacto estimado da ociosidade e das paradas foi de ' + forte(M.formatarMoeda(c.impactoTotal)) + '.');
    } else {
      itens.push('Para ver o impacto financeiro estimado, use o botão <em>Configurar valores (R$)</em> na tabela por equipamento.');
    }

    const semDados = c.metricas.filter((m) => !m.temDados).map((m) => esc(m.equip.nome));
    if (semDados.length) itens.push('Sem nenhum registro no período: ' + semDados.join(', ') + '.');

    if (c.cobertura < 90) {
      itens.push('Atenção: só ' + forte(M.formatarPct(c.cobertura, 0)) + ' do período tem registro do CLP. Os números valem apenas para esse tempo.');
    }

    $('conclusoes').innerHTML = itens.map((t) => '<li>' + t + '</li>').join('');
  }

  /* ---------- Gráfico ---------- */

  function renderGrafico(c) {
    const { tipo, linhas } = c.partes;
    $('tituloGrafico').textContent = 'Evolução ' + (tipo === 'hora' ? 'por hora' : tipo === 'dia' ? 'por dia' : 'por semana');
    const caixa = $('graficoPeriodo').parentElement;
    caixa.classList.toggle('sem-dados', !c.resumo.temDados);

    if (typeof Chart === 'undefined') {
      caixa.classList.add('sem-dados');
      caixa.querySelector('.vazio').textContent = 'Não foi possível carregar a biblioteca de gráficos (verifique a internet).';
      return;
    }
    if (!c.resumo.temDados) return;

    Chart.defaults.animation = false;
    Chart.defaults.color = '#95a0aa';
    Chart.defaults.borderColor = 'rgba(128, 138, 148, 0.25)';
    Chart.defaults.font.family = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.tooltip.backgroundColor = '#19212a';
    Chart.defaults.plugins.tooltip.borderColor = '#2b343d';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;

    if (!grafico) {
      grafico = new Chart($('graficoPeriodo'), {
        type: 'bar',
        data: {
          labels: [],
          datasets: [
            { label: 'Ativo', data: [], backgroundColor: COR.ativo, borderWidth: 0 },
            { label: 'Espera', data: [], backgroundColor: COR.espera, borderWidth: 0 },
            { label: 'Inativo', data: [], backgroundColor: COR.inativo, borderWidth: 0 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 60, autoSkip: true } },
            y: { stacked: true, min: 0, max: 100, ticks: { callback: (v) => v + '%' }, grid: { color: 'rgba(128, 138, 148, 0.25)' } },
          },
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                title: (itens) => (estado.ultimo ? estado.ultimo.partes.linhas[itens[0].dataIndex].longo : ''),
                label: (i) => {
                  const l = estado.ultimo.partes.linhas[i.dataIndex];
                  const ms = i.datasetIndex === 0 ? l.ativo : i.datasetIndex === 1 ? l.espera : l.inativo;
                  return ' ' + i.dataset.label + ': ' + (i.parsed.y || 0).toLocaleString('pt-BR') + '% (' + M.formatarHoras(ms / M.HORA) + ')';
                },
              },
            },
          },
        },
      });
    }
    const arred = (v) => (v === null ? null : +v.toFixed(1));
    grafico.data.labels = linhas.map((l) => l.curto);
    grafico.data.datasets[0].data = linhas.map((l) => arred(l.pctAtivo));
    grafico.data.datasets[1].data = linhas.map((l) => arred(l.pctEspera));
    grafico.data.datasets[2].data = linhas.map((l) => arred(l.pctInativo));
    grafico.update('none');
  }

  /* ---------- Tabelas ---------- */

  const traco = '<span class="cor-suave">—</span>';

  function celulaUtilizacao(pct) {
    return '<div class="util-celula"><div class="trilho"><i class="b-ativo" style="width:' + Math.min(pct, 100) +
      '%"></i></div><span class="num">' + M.formatarPct(pct) + '</span></div>';
  }

  function renderTabelaEquip(c) {
    const r = c.resumo;
    const linhas = c.metricas.map((m, i) => {
      const t = m.temDados;
      const impacto = c.impactos[i];
      return '<tr><td><p style="font-weight:500">' + esc(m.equip.nome) + '</p><p class="sub">' + esc(m.equip.modelo || '') + '</p></td>' +
        '<td class="num">' + (t ? M.formatarHoras(m.monitoradoMs / M.HORA) : traco) + '</td>' +
        '<td class="num cor-ativo">' + (t ? M.formatarHoras(m.ativoMs / M.HORA) : traco) + '</td>' +
        '<td class="num cor-espera">' + (t ? M.formatarHoras(m.esperaMs / M.HORA) : traco) + '</td>' +
        '<td class="num cor-inativo">' + (t ? M.formatarHoras(m.inativoMs / M.HORA) : traco) + '</td>' +
        '<td>' + (t ? celulaUtilizacao(m.pctAtivo) : traco) + '</td>' +
        '<td class="num">' + (t ? M.formatarPct(m.pctAtivo + m.pctEspera) : traco) + '</td>' +
        '<td class="num">' + (t ? m.paradas : traco) + '</td>' +
        '<td class="num">' + (t ? M.formatarDuracao(m.maiorParadaMs) : traco) + '</td>' +
        '<td class="num">' + (impacto === null ? '<button type="button" class="link-btn" data-abrir-parametros>informar valores</button>' : M.formatarMoeda(impacto)) + '</td></tr>';
    }).join('');

    const total = c.metricas.length > 1
      ? '<tr class="linha-total"><td><strong>Total da seleção</strong></td>' +
        '<td class="num">' + M.formatarHoras(r.monitoradoH) + '</td>' +
        '<td class="num cor-ativo">' + M.formatarHoras(r.ativoH) + '</td>' +
        '<td class="num cor-espera">' + M.formatarHoras(r.esperaH) + '</td>' +
        '<td class="num cor-inativo">' + M.formatarHoras(r.inativoH) + '</td>' +
        '<td>' + (r.temDados ? celulaUtilizacao(r.utilizacaoPct) : traco) + '</td>' +
        '<td class="num">' + (r.temDados ? M.formatarPct(r.disponibilidadePct) : traco) + '</td>' +
        '<td class="num">' + c.paradas + '</td>' +
        '<td class="num">' + (maiorSemProduzir(c) ? M.formatarDuracao(maiorSemProduzir(c).maiorParadaMs) : traco) + '</td>' +
        '<td class="num">' + (c.impactoTotal === null ? traco : M.formatarMoeda(c.impactoTotal)) + '</td></tr>'
      : '';

    $('tabelaEquip').innerHTML =
      '<table><thead><tr><th>Equipamento</th><th>Monitorado</th><th>Ativo</th><th>Espera</th><th>Inativo</th>' +
      '<th>Utilização</th><th>Disponibilidade</th><th>Paradas</th><th>Maior período sem produzir</th><th>Impacto estimado</th></tr></thead>' +
      '<tbody>' + linhas + total + '</tbody></table>';
  }

  function renderTabelaPartes(c) {
    const { tipo, linhas } = c.partes;
    const nome = tipo === 'hora' ? 'hora' : tipo === 'dia' ? 'dia' : 'semana';
    $('tituloTabelaPeriodo').textContent = 'Detalhamento por ' + nome;

    const r = c.resumo;
    const corpo = linhas.map((l) => {
      const t = l.temDados;
      return '<tr><td>' + esc(l.longo) + '</td>' +
        '<td class="num">' + (t ? M.formatarHoras(l.monitorado / M.HORA) : traco) + '</td>' +
        '<td class="num cor-ativo">' + (t ? M.formatarHoras(l.ativo / M.HORA) : traco) + '</td>' +
        '<td class="num cor-espera">' + (t ? M.formatarHoras(l.espera / M.HORA) : traco) + '</td>' +
        '<td class="num cor-inativo">' + (t ? M.formatarHoras(l.inativo / M.HORA) : traco) + '</td>' +
        '<td>' + (t ? celulaUtilizacao(l.pctAtivo) : '<span class="cor-suave">sem registros</span>') + '</td>' +
        '<td class="num">' + (t ? l.paradas : traco) + '</td></tr>';
    }).join('');

    const total = '<tr class="linha-total"><td><strong>Total</strong></td>' +
      '<td class="num">' + M.formatarHoras(r.monitoradoH) + '</td>' +
      '<td class="num cor-ativo">' + M.formatarHoras(r.ativoH) + '</td>' +
      '<td class="num cor-espera">' + M.formatarHoras(r.esperaH) + '</td>' +
      '<td class="num cor-inativo">' + M.formatarHoras(r.inativoH) + '</td>' +
      '<td>' + (r.temDados ? celulaUtilizacao(r.utilizacaoPct) : traco) + '</td>' +
      '<td class="num">' + c.paradas + '</td></tr>';

    $('tabelaPeriodo').innerHTML =
      '<table class="tabela-estreita"><thead><tr><th>' + (nome.charAt(0).toUpperCase() + nome.slice(1)) +
      '</th><th>Monitorado</th><th>Ativo</th><th>Espera</th><th>Inativo</th><th>Utilização</th><th>Paradas</th></tr></thead>' +
      '<tbody>' + corpo + total + '</tbody></table>';
  }

  /* ------------------------------------------------------------
     EXPORTAR CSV (abre direto no Excel em português)
     ------------------------------------------------------------ */
  function campoCsv(v) {
    const s = String(v == null ? '' : v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  const numCsv = (n, casas) => n.toFixed(casas === undefined ? 2 : casas).replace('.', ',');

  function baixarCsv(nomeArquivo, linhas) {
    // \uFEFF faz o Excel entender os acentos; ";" e vírgula decimal = padrão brasileiro
    const conteudo = '\uFEFF' + linhas.map((l) => l.map(campoCsv).join(';')).join('\r\n');
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function sufixoArquivo(c) {
    return paraInputData(c.p.de) + '_a_' + paraInputData(c.p.ate);
  }

  function exportarCsvEquip() {
    const c = estado.ultimo;
    if (!c) return;
    const periodo = dataBr(c.p.de) + ' a ' + dataBr(c.p.ate);
    const linhas = [[
      'Período', 'Equipamento', 'Modelo', 'Horas monitoradas', 'Horas ativas', 'Horas em espera', 'Horas inativas',
      'Utilização (%)', 'Disponibilidade (%)', 'Paradas', 'Maior período sem produzir (h)', 'Impacto estimado (R$)',
    ]];
    c.metricas.forEach((m, i) => {
      const t = m.temDados;
      linhas.push([
        periodo, m.equip.nome, m.equip.modelo || '',
        numCsv(m.monitoradoMs / M.HORA), numCsv(m.ativoMs / M.HORA), numCsv(m.esperaMs / M.HORA), numCsv(m.inativoMs / M.HORA),
        t ? numCsv(m.pctAtivo) : '', t ? numCsv(m.pctAtivo + m.pctEspera) : '', m.paradas,
        numCsv(m.maiorParadaMs / M.HORA), c.impactos[i] === null ? 'não calculado' : numCsv(c.impactos[i]),
      ]);
    });
    baixarCsv('carrissimi-por-equipamento_' + sufixoArquivo(c) + '.csv', linhas);
  }

  function exportarCsvPartes() {
    const c = estado.ultimo;
    if (!c) return;
    const nome = c.partes.tipo;
    const linhas = [[nome.charAt(0).toUpperCase() + nome.slice(1), 'Horas monitoradas', 'Horas ativas', 'Horas em espera', 'Horas inativas', 'Utilização (%)', 'Paradas']];
    c.partes.linhas.forEach((l) => {
      linhas.push([
        l.longo, numCsv(l.monitorado / M.HORA), numCsv(l.ativo / M.HORA), numCsv(l.espera / M.HORA), numCsv(l.inativo / M.HORA),
        l.temDados ? numCsv(l.pctAtivo) : '', l.paradas,
      ]);
    });
    baixarCsv('carrissimi-por-' + nome + '_' + sufixoArquivo(c) + '.csv', linhas);
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
     EVENTOS
     ------------------------------------------------------------ */
  function ligarEventos() {
    document.addEventListener('click', (ev) => {
      const alvo = ev.target.closest('button, a');
      if (!alvo) return;

      if (alvo.dataset.periodo) {
        estado.periodo = alvo.dataset.periodo;
        if (estado.periodo === 'custom' && !estado.custom.de) {
          estado.custom.de = deInputData(paraInputData(Date.now() - 29 * M.DIA), false);
          estado.custom.ate = deInputData(paraInputData(Date.now()), true);
        }
        renderPeriodos();
        sincronizarDatas();
        carregar();
      } else if (alvo.hasAttribute('data-recarregar')) {
        carregar();
      } else if (alvo.hasAttribute('data-abrir-parametros') || alvo.id === 'btnParametros') {
        abrirParametros();
      } else if (alvo.id === 'btnCsvEquip') {
        exportarCsvEquip();
      } else if (alvo.id === 'btnCsvPeriodo') {
        exportarCsvPartes();
      } else if (alvo.id === 'btnImprimir') {
        window.print();
      }
    });

    $('filtroEquip').addEventListener('change', (ev) => {
      estado.equipFiltro = ev.target.value;
      renderizar();
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
      if (!document.hidden && estado.ultimaCarga && Date.now() - estado.ultimaCarga > 5 * 60 * 1000) carregar(true);
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
    carregar();
  }

  iniciar();
})();
