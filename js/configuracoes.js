/* ============================================================
   configuracoes.js — TELA DE CONFIGURAÇÕES (ESPEC 04)
   Edita: fuso horário, horário de funcionamento (turno) e os
   valores em R$/hora da empresa. Tudo é lido e gravado pelo
   ConfigEmpresa (js/configEmpresa.js) — aqui só tem tela.

   Cada cartão salva separadamente. Depois de salvar, a tela
   relê do banco para mostrar exatamente o que ficou gravado.
   ============================================================ */
(function () {
  'use strict';

  const C = window.ConfigEmpresa;
  const M = window.Metrics || window.Metricas;
  const $ = (id) => document.getElementById(id);

  const NOMES_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]; // semana começando na segunda
  const DIAS_UTEIS = [1, 2, 3, 4, 5];

  const estado = {
    empresa: null,
    config: null,
    demo: false,
    podeSalvar: false, // falso no modo demonstração ou se a configuração não carregou
    dias: {},          // diaSemana -> [{ inicio: 'HH:MM', fim: 'HH:MM' }]
    avisoFuso: null,
    falhaCarga: null,
  };

  const temporizadores = {};

  /* ---------- Utilidades de tela ---------- */

  const ICONE_AVISO = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>';

  function mostrarAvisos() {
    const caixa = $('faixaAviso');
    caixa.textContent = '';
    const itens = [];
    if (estado.demo) itens.push({ tipo: 'demo', texto: 'Modo demonstração: nada é salvo nesta tela.' });
    if (estado.falhaCarga) itens.push({ tipo: 'erro', texto: 'Não foi possível carregar a configuração (usando padrão). ' + estado.falhaCarga });
    if (estado.avisoFuso) itens.push({ tipo: '', texto: estado.avisoFuso });
    for (const i of itens) {
      const div = document.createElement('div');
      div.className = 'aviso' + (i.tipo ? ' ' + i.tipo : '');
      div.innerHTML = ICONE_AVISO; // ícone fixo, sem dado do banco
      const span = document.createElement('span');
      span.textContent = i.texto;
      div.appendChild(span);
      caixa.appendChild(div);
    }
  }

  function definirPilula(tipo, texto) {
    const p = $('pilulaConexao');
    p.className = 'pilula-conexao ' + tipo;
    $('pilulaLed').className = 'led ' + (tipo === 'ok' ? 'led-ativo' : tipo === 'erro' ? 'led-inativo' : tipo === 'aviso' ? 'led-espera' : '');
    $('pilulaTexto').textContent = texto;
  }

  // mensagem verde que some em 4 s (erro fica até a próxima ação)
  function mensagem(idElemento, tipo, texto) {
    const el = $(idElemento);
    clearTimeout(temporizadores[idElemento]);
    el.textContent = texto || '';
    el.className = 'cfg-mensagem' + (tipo ? ' ' + tipo : '');
    if (tipo === 'ok') temporizadores[idElemento] = setTimeout(() => { el.textContent = ''; el.className = 'cfg-mensagem'; }, 4000);
  }

  function duracaoTexto(minutos) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return h + ' h ' + String(m).padStart(2, '0') + ' min';
  }

  function minutosDe(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  function moedaCampo(n) {
    return n === null || n === undefined ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function desabilitarSalvar() {
    ['btnSalvarFuso', 'btnSalvarHorario', 'btnSalvarValores', 'btnLimparValores'].forEach((id) => { $(id).disabled = true; });
  }

  /* ---------- Cartão 1: empresa e fuso ---------- */

  function preencherEmpresa() {
    const e = estado.empresa;
    $('cfgRazao').textContent = (e && e.razao_social) || '—';
    $('cfgFantasia').textContent = (e && e.nome_fantasia) || '—';
    $('cfgCnpj').textContent = (e && e.cnpj) || '—';
    $('empresaNome').textContent = (e && (e.nome_fantasia || e.razao_social)) || '—';
    $('empresaCnpj').textContent = (e && e.cnpj) || '';
    $('subtitulo').textContent = e ? 'Empresa: ' + (e.nome_fantasia || e.razao_social) : 'Fuso horário, horário de funcionamento e valores da empresa';
  }

  function preencherFuso() {
    const sel = $('selFuso');
    sel.textContent = '';
    const lista = C.FUSOS_BRASIL.slice();
    if (!lista.some((f) => f.valor === estado.config.fuso)) lista.push({ valor: estado.config.fuso, rotulo: estado.config.fuso });
    for (const f of lista) {
      const o = document.createElement('option');
      o.value = f.valor;
      o.textContent = f.rotulo;
      sel.appendChild(o);
    }
    sel.value = estado.config.fuso;
  }

  async function salvarFuso() {
    mensagem('msgFuso', '', '');
    const r = await C.salvarFuso(window.supabaseClient, estado.empresa.id, $('selFuso').value);
    if (!r.ok) return mensagem('msgFuso', 'erro', r.erro);
    await recarregar();
    preencherFuso();
    mensagem('msgFuso', 'ok', 'Salvo.');
  }

  /* ---------- Cartão 2: horário de funcionamento ---------- */

  function diasDaConfig(horarios) {
    const d = {};
    for (let i = 0; i < 7; i++) d[i] = [];
    for (const h of horarios || []) d[h.diaSemana].push({ inicio: h.inicio, fim: h.fim });
    return d;
  }

  function listaDeFaixas() {
    const lista = [];
    for (const dia of ORDEM_DIAS) for (const f of estado.dias[dia]) lista.push({ diaSemana: dia, inicio: f.inicio, fim: f.fim });
    return lista;
  }

  function mascaraHora(v) {
    let s = String(v).replace(/[^0-9:]/g, '');
    if (s.indexOf(':') < 0 && s.length > 2) s = s.slice(0, 2) + ':' + s.slice(2);
    return s.slice(0, 5);
  }

  function renderDias() {
    const caixa = $('semana');
    caixa.textContent = '';
    for (const dia of ORDEM_DIAS) {
      const linha = document.createElement('div');
      linha.className = 'cfg-dia';
      linha.dataset.dia = String(dia);

      const nome = document.createElement('div');
      nome.className = 'cfg-dia-nome';
      nome.textContent = NOMES_DIA[dia];
      linha.appendChild(nome);

      const faixas = document.createElement('div');
      faixas.className = 'cfg-faixas';
      const lista = estado.dias[dia];
      if (!lista.length) {
        const f = document.createElement('div');
        f.className = 'cfg-fechado';
        f.textContent = 'Fechado';
        faixas.appendChild(f);
      }
      lista.forEach((faixa, idx) => {
        const l = document.createElement('div');
        l.className = 'cfg-faixa';
        [['inicio', 'Início'], ['fim', 'Fim']].forEach(([campo, rotulo], k) => {
          if (k === 1) { const sep = document.createElement('span'); sep.className = 'cfg-sep'; sep.textContent = 'até'; l.appendChild(sep); }
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'cfg-hora';
          inp.inputMode = 'numeric';
          inp.maxLength = 5;
          inp.placeholder = 'HH:MM';
          inp.value = faixa[campo];
          inp.dataset.dia = String(dia);
          inp.dataset.idx = String(idx);
          inp.dataset.campo = campo;
          inp.setAttribute('aria-label', NOMES_DIA[dia] + ', faixa ' + (idx + 1) + ': ' + rotulo);
          inp.setAttribute('aria-describedby', 'cfgErrosHorario');
          l.appendChild(inp);
        });
        const rem = document.createElement('button');
        rem.type = 'button';
        rem.className = 'botao botao-perigo cfg-mini';
        rem.dataset.acao = 'remover';
        rem.dataset.dia = String(dia);
        rem.dataset.idx = String(idx);
        rem.textContent = 'Remover';
        rem.setAttribute('aria-label', 'Remover a faixa ' + (idx + 1) + ' de ' + NOMES_DIA[dia]);
        l.appendChild(rem);
        faixas.appendChild(l);
      });
      linha.appendChild(faixas);

      const lado = document.createElement('div');
      lado.className = 'cfg-dia-lado';
      const total = document.createElement('span');
      total.className = 'cfg-dia-total';
      total.dataset.total = String(dia);
      lado.appendChild(total);
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'botao cfg-mini';
      add.dataset.acao = 'adicionar';
      add.dataset.dia = String(dia);
      add.textContent = '+ faixa';
      add.setAttribute('aria-label', 'Adicionar faixa em ' + NOMES_DIA[dia]);
      lado.appendChild(add);
      linha.appendChild(lado);

      caixa.appendChild(linha);
    }
    atualizarHorarioUI();
  }

  function novaFaixa(dia) {
    const lista = estado.dias[dia];
    if (!lista.length) return { inicio: '07:00', fim: '12:00' };
    const ultimo = lista[lista.length - 1];
    const fimUlt = /^\d{1,2}:\d{2}$/.test(ultimo.fim) ? minutosDe(ultimo.fim) : 12 * 60;
    const ini = Math.min(fimUlt + 60, 23 * 60);
    const fim = Math.min(ini + 4 * 60, 24 * 60);
    const t = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    return { inicio: t(ini), fim: t(fim) };
  }

  function atualizarHorarioUI() {
    const lista = listaDeFaixas();
    const v = C.validarHorarios(lista);

    // marcar dias com erro
    const comErro = new Set();
    for (const e of v.erros) NOMES_DIA.forEach((n, i) => { if (e.indexOf(n + ':') === 0) comErro.add(i); });
    document.querySelectorAll('.cfg-dia').forEach((el) => el.classList.toggle('com-erro', comErro.has(Number(el.dataset.dia))));
    document.querySelectorAll('.cfg-hora').forEach((inp) => {
      const dia = Number(inp.dataset.dia);
      const bruto = estado.dias[dia][Number(inp.dataset.idx)];
      const ruim = bruto && !v.horariosNormalizados.some((h) => h.diaSemana === dia && h.inicio === normaliza(bruto.inicio) && h.fim === normaliza(bruto.fim));
      inp.setAttribute('aria-invalid', ruim ? 'true' : 'false');
    });

    // totais
    const porDia = {};
    let semana = 0;
    for (const h of v.horariosNormalizados) {
      const m = minutosDe(h.fim) - minutosDe(h.inicio);
      porDia[h.diaSemana] = (porDia[h.diaSemana] || 0) + m;
      semana += m;
    }
    document.querySelectorAll('[data-total]').forEach((el) => {
      const m = porDia[Number(el.dataset.total)] || 0;
      el.textContent = m ? duracaoTexto(m) : '';
    });
    $('cfgResumoSemana').textContent = 'Total semanal programado: ' + duracaoTexto(semana);

    // avisos
    $('cfgAvisoSemHorario').hidden = lista.length > 0;
    const ul = $('cfgErrosHorario');
    ul.textContent = '';
    for (const e of v.erros) { const li = document.createElement('li'); li.textContent = e; ul.appendChild(li); }
    ul.hidden = v.erros.length === 0;

    $('btnSalvarHorario').disabled = !estado.podeSalvar || !v.ok;
  }

  function normaliza(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    return m ? String(+m[1]).padStart(2, '0') + ':' + m[2] : null;
  }

  function preencherHorarios() {
    estado.dias = diasDaConfig(estado.config.horarios);
    renderDias();
  }

  function aplicarAtalho(tipo) {
    const d = {};
    for (let i = 0; i < 7; i++) d[i] = [];
    if (tipo === 'uteis') DIAS_UTEIS.forEach((i) => { d[i] = [{ inicio: '07:00', fim: '17:00' }]; });
    if (tipo === 'almoco') DIAS_UTEIS.forEach((i) => { d[i] = [{ inicio: '07:00', fim: '12:00' }, { inicio: '13:00', fim: '17:00' }]; });
    if (tipo === 'copiar') {
      const seg = estado.dias[1].map((f) => ({ ...f }));
      for (let i = 0; i < 7; i++) d[i] = DIAS_UTEIS.indexOf(i) >= 0 ? seg.map((f) => ({ ...f })) : estado.dias[i];
    }
    estado.dias = d;
    renderDias();
  }

  async function salvarHorario() {
    mensagem('msgHorario', '', '');
    const r = await C.salvarHorarios(window.supabaseClient, estado.empresa.id, listaDeFaixas());
    if (!r.ok) return mensagem('msgHorario', 'erro', r.erro);
    await recarregar();
    preencherHorarios();
    mensagem('msgHorario', 'ok', 'Salvo.');
  }

  /* ---------- Cartão 3: valores em R$/hora ---------- */

  function camposValores() {
    return Array.from(document.querySelectorAll('input[data-chave]'));
  }

  function preencherValores() {
    for (const inp of camposValores()) inp.value = moedaCampo(estado.config.financeiro[inp.dataset.chave]);
    atualizarValoresUI();
  }

  // As peças por execução não têm tela, mas precisam ser preservadas ao salvar.
  function valoresDaTela() {
    const f = { pecasPorExecucao: estado.config ? estado.config.financeiro.pecasPorExecucao : 1 };
    for (const inp of camposValores()) f[inp.dataset.chave] = inp.value;
    return f;
  }

  function atualizarValoresUI() {
    const v = C.validarFinanceiro(valoresDaTela());
    const ul = $('cfgErrosValores');
    ul.textContent = '';
    for (const e of v.erros) { const li = document.createElement('li'); li.textContent = e; ul.appendChild(li); }
    ul.hidden = v.erros.length === 0;
    $('btnSalvarValores').disabled = !estado.podeSalvar || !v.ok;
    $('btnLimparValores').disabled = !estado.podeSalvar;
  }

  async function salvarValores(vazios) {
    mensagem('msgValores', '', '');
    const f = valoresDaTela();
    if (vazios) for (const c of C.CAMPOS_FINANCEIROS) f[c.chave] = null;
    const r = await C.salvarFinanceiro(window.supabaseClient, estado.empresa.id, f);
    if (!r.ok) return mensagem('msgValores', 'erro', r.erro);
    await recarregar();
    preencherValores();
    mensagem('msgValores', 'ok', vazios ? 'Valores apagados.' : 'Salvo.');
  }

  function abrirDialogo(dlg) {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  function fecharDialogo(dlg) {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  /* ---------- Cartão 4: parâmetros do sistema ---------- */

  function preencherParametros() {
    const corpo = $('paramCorpo');
    corpo.textContent = '';
    const cfg = (M && M.CONFIG_METRICAS) || null;
    const dur = (ms) => (M && M.formatarDuracao ? M.formatarDuracao(ms) : Math.round(ms / 60000) + ' min');
    const linhas = cfg ? [
      ['Hora extra mínima', dur(cfg.MIN_HORA_EXTRA_MS), 'ATIVO fora do turno só conta como hora extra produtiva a partir desse tempo contínuo.'],
      ['Execução mínima', cfg.MIN_EXECUCAO_S + ' s', 'Uma passagem para ATIVO mais curta que isso não conta como execução.'],
      ['Tolerância sem sinal', dur(cfg.TOLERANCIA_SEM_SINAL_MS), 'Sem sinal do equipamento por mais tempo que isso, ele passa a SEM SINAL e sai dos cálculos.'],
    ] : [['—', '—', 'Parâmetros indisponíveis (metrics.js não carregou).']];
    for (const l of linhas) {
      const tr = document.createElement('tr');
      l.forEach((t, i) => { const td = document.createElement('td'); if (i === 1) td.className = 'num'; td.textContent = t; tr.appendChild(td); });
      corpo.appendChild(tr);
    }
    const min = cfg ? dur(cfg.MIN_HORA_EXTRA_MS) : '5 min';
    $('cfgNotaHoraExtra').textContent = 'Horas extras não precisam ser cadastradas: ATIVO fora do horário (a partir de ' + min + ' contínuos) é reconhecido automaticamente como hora extra produtiva. Feriados em dias úteis são detectados sozinhos quando nenhuma máquina liga no dia.';
  }

  /* ---------- Carregamento ---------- */

  async function recarregar() {
    const r = await C.carregarConfig(window.supabaseClient, estado.empresa.id, { forcar: true });
    if (r.ok) estado.config = r.dados;
    return r;
  }

  function estaSujo() {
    if (!estado.config || !estado.podeSalvar) return false;
    if ($('selFuso').value !== estado.config.fuso) return true;
    const atual = C.validarHorarios(listaDeFaixas()).horariosNormalizados;
    const salvo = C.validarHorarios(estado.config.horarios).horariosNormalizados;
    if (JSON.stringify(atual) !== JSON.stringify(salvo)) return true;
    const v = C.validarFinanceiro(valoresDaTela()).financeiroNormalizado;
    for (const c of C.CAMPOS_FINANCEIROS) if (v[c.chave] !== estado.config.financeiro[c.chave]) return true;
    return false;
  }

  async function iniciar() {
    estado.demo = C.modoDemo();
    preencherParametros();
    const re = await C.obterEmpresaAtual(window.supabaseClient);
    estado.empresa = re.dados;

    if (!re.ok || !estado.empresa) {
      estado.config = C.configPadrao(null);
      estado.falhaCarga = re.ok ? 'Nenhuma empresa cadastrada.' : re.erro;
    } else {
      const rc = await C.carregarConfig(window.supabaseClient, estado.empresa.id);
      estado.config = rc.dados;
      if (!rc.ok) estado.falhaCarga = rc.erro;
      if (rc.aviso) estado.avisoFuso = rc.aviso;
    }

    estado.podeSalvar = !estado.demo && !estado.falhaCarga;
    preencherEmpresa();
    preencherFuso();
    preencherHorarios();
    preencherValores();
    mostrarAvisos();

    if (estado.demo) definirPilula('demo', 'Demonstração');
    else if (estado.falhaCarga) definirPilula('erro', 'Falha na conexão');
    else definirPilula('ok', 'Banco conectado');

    if (!estado.podeSalvar) desabilitarSalvar();
    $('selFuso').disabled = !estado.podeSalvar;

    const hora = M && M.formatarHoraFuso ? M.formatarHoraFuso(Date.now(), estado.config.fuso) : '';
    $('rodapeSync').textContent = hora ? 'Carregado às ' + hora : '—';
    $('principal').classList.remove('carregando');
  }

  /* ---------- Ligações dos botões e campos ---------- */

  function ligar() {
    $('btnSalvarFuso').addEventListener('click', salvarFuso);
    $('btnSalvarHorario').addEventListener('click', salvarHorario);
    $('btnSalvarValores').addEventListener('click', () => salvarValores(false));
    $('btnLimparValores').addEventListener('click', () => abrirDialogo($('dlgLimpar')));
    $('btnCancelarLimpar').addEventListener('click', () => fecharDialogo($('dlgLimpar')));
    $('btnConfirmarLimpar').addEventListener('click', async () => { fecharDialogo($('dlgLimpar')); await salvarValores(true); });

    $('btnAtalhoUteis').addEventListener('click', () => aplicarAtalho('uteis'));
    $('btnAtalhoAlmoco').addEventListener('click', () => aplicarAtalho('almoco'));
    $('btnCopiarSegunda').addEventListener('click', () => aplicarAtalho('copiar'));
    $('btnLimparHorario').addEventListener('click', () => aplicarAtalho('limpar'));

    // um único ouvinte para todos os botões e campos de horário (as linhas são recriadas)
    const semana = $('semana');
    semana.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-acao]');
      if (!b) return;
      const dia = Number(b.dataset.dia);
      if (b.dataset.acao === 'adicionar') estado.dias[dia].push(novaFaixa(dia));
      if (b.dataset.acao === 'remover') estado.dias[dia].splice(Number(b.dataset.idx), 1);
      renderDias();
    });
    semana.addEventListener('input', (ev) => {
      const inp = ev.target;
      if (!inp.classList || !inp.classList.contains('cfg-hora')) return;
      const v = mascaraHora(inp.value);
      if (v !== inp.value) inp.value = v;
      estado.dias[Number(inp.dataset.dia)][Number(inp.dataset.idx)][inp.dataset.campo] = v;
      atualizarHorarioUI();
    });

    camposValores().forEach((inp) => {
      inp.addEventListener('input', atualizarValoresUI);
      inp.addEventListener('blur', () => {
        const n = C.paraNumero(inp.value);
        if (n !== null && n >= 0) inp.value = moedaCampo(Math.round(n * 100) / 100);
        atualizarValoresUI();
      });
    });

    window.addEventListener('beforeunload', (ev) => {
      if (estaSujo()) { ev.preventDefault(); ev.returnValue = ''; }
    });
  }

  ligar();
  iniciar().catch((e) => {
    estado.falhaCarga = 'Erro inesperado: ' + (e && e.message ? e.message : e);
    estado.podeSalvar = false;
    mostrarAvisos();
    definirPilula('erro', 'Falha na conexão');
    desabilitarSalvar();
    $('principal').classList.remove('carregando');
  });

  // usado só pelos testes automáticos
  window._ConfiguracoesTeste = { estado, estaSujo, listaDeFaixas };
})();
