/* ============================================================
   demoData.js — DADOS FICTÍCIOS só para demonstração.
   Só é usado quando a página é aberta com  ?demo=1
   Ex.: http://127.0.0.1:5500/index.html?demo=1
   Nada aqui vai para o Supabase.
   ============================================================ */
(function () {
  'use strict';

  const MIN = 60000;
  const DIA = 86400000;

  const MAQUINAS = [
    { nome: 'Torno CNC 01', modelo: 'Romi GL 240', turno: [0, 24], ritmo: 0.9 },
    { nome: 'Torno CNC 02', modelo: 'Romi GL 280', turno: [5, 23], ritmo: 0.8 },
    { nome: 'Torno CNC 03', modelo: 'Mazak QT-200', turno: [6, 22], ritmo: 0.85 },
    { nome: 'Torno Universal 04', modelo: 'Nardini MS-205', turno: [7, 18], ritmo: 0.55 },
    { nome: 'Torno CNC 05', modelo: 'Haas ST-20', turno: [6, 22], ritmo: 0.7 },
    { nome: 'Torno CNC 06', modelo: 'Doosan Lynx 220', turno: [8, 17], ritmo: 0.4 },
  ];

  // gerador de números "aleatórios" repetível (sempre o mesmo resultado)
  function sementeAleatoria(semente) {
    let a = semente >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gerar(agora) {
    const empresa = {
      id: 'demo-empresa',
      razao_social: 'Casa do Mecânico Ltda',
      nome_fantasia: 'Carissimi Controle e Automação',
      cnpj: '94038874000181',
    };
    const equipamentos = [];
    const eventos = [];
    let contador = 1;
    const inicio = new Date(agora - 100 * DIA);
    inicio.setHours(0, 0, 0, 0);

    MAQUINAS.forEach((m, idx) => {
      const id = 'demo-eq-' + (idx + 1);
      const rnd = sementeAleatoria(1000 + idx * 77);
      let ultimo = null;
      let ultimoT = 0;

      const emitir = (t, status) => {
        if (t > agora) return false;
        if (ultimo === status) return true;
        ultimo = status;
        ultimoT = t;
        eventos.push({
          id: contador++,
          equipamento_id: id,
          empresa_id: empresa.id,
          status,
          registrado_em: new Date(t).toISOString(),
        });
        return true;
      };

      for (let dia = new Date(inicio); dia.getTime() < agora; dia.setDate(dia.getDate() + 1)) {
        const semana = dia.getDay(); // 0 = domingo
        const trabalha = semana >= 1 && semana <= 5 || (semana === 6 && idx < 3 && rnd() < 0.7);
        const base = dia.getTime();
        emitir(base, 'inativo');
        if (!trabalha) continue;

        let t = base + m.turno[0] * 60 * MIN + Math.floor(rnd() * 20) * MIN;
        const fimTurno = base + m.turno[1] * 60 * MIN;
        while (t < fimTurno) {
          // bloco produtivo
          if (!emitir(t, 'ativo')) break;
          t += (25 + rnd() * 95 * m.ritmo) * MIN;
          if (t >= fimTurno) break;
          // pausa curta (espera) ou parada
          const sorte = rnd();
          if (sorte < 0.16 * (1.3 - m.ritmo)) {
            if (!emitir(t, 'inativo')) break;
            t += (20 + rnd() * 70) * MIN;
          } else {
            if (!emitir(t, 'espera')) break;
            t += (4 + rnd() * 26 * (1.4 - m.ritmo)) * MIN;
          }
          // almoço
          const hora = new Date(t).getHours();
          if (hora === 12 && rnd() < 0.7) {
            if (!emitir(t, 'inativo')) break;
            t += 55 * MIN;
          }
        }
        emitir(Math.min(t, fimTurno), 'inativo');
      }

      // Para a demonstração ficar viva a qualquer hora (mesmo de madrugada ou no
      // fim de semana), forçamos o estado de "agora" de cada máquina.
      const alvo = ['ativo', 'ativo', 'espera', 'inativo', 'ativo', 'inativo'][idx];
      const quando = Math.max(ultimoT + MIN, agora - (8 + rnd() * 70) * MIN);
      if (ultimo !== alvo) emitir(quando, alvo);

      equipamentos.push({
        id,
        empresa_id: empresa.id,
        nome: m.nome,
        modelo: m.modelo,
        status_atual: ultimo || 'inativo',
        atualizado_em: eventos.length ? eventos[eventos.length - 1].registrado_em : new Date(agora).toISOString(),
      });
    });

    // atualizado_em de cada máquina = data do último evento dela
    equipamentos.forEach((e) => {
      const seus = eventos.filter((ev) => ev.equipamento_id === e.id);
      if (seus.length) e.atualizado_em = seus[seus.length - 1].registrado_em;
    });
    eventos.sort((a, b) => Date.parse(a.registrado_em) - Date.parse(b.registrado_em));

    return { empresa, equipamentos, eventos, proximoId: contador };
  }

  // Sorteia uma mudança de estado para simular o CLP em tempo real na demonstração
  function novoEventoAleatorio(equipamentos, proximoId) {
    const eq = equipamentos[Math.floor(Math.random() * equipamentos.length)];
    const opcoes = ['ativo', 'espera', 'inativo'].filter((s) => s !== eq.status_atual);
    const status = opcoes[Math.floor(Math.random() * opcoes.length)];
    return {
      id: proximoId,
      equipamento_id: eq.id,
      empresa_id: eq.empresa_id,
      status,
      registrado_em: new Date().toISOString(),
    };
  }

  window.DemoData = { gerar, novoEventoAleatorio };
})();
