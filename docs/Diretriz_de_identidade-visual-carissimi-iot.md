# Identidade Visual — CARISSIMI IoT
### Guia de design para desenvolvimento de novas páginas

> Este documento descreve, com precisão técnica, todo o sistema visual do painel **CARISSIMI IoT** (dashboard de supervisão industrial via CLP/ESP32). Foi escrito a partir da análise de `index.html` e `style.css` do projeto, e serve como referência única para qualquer IA ou desenvolvedor criar novas páginas mantendo consistência total com o que já existe. Toda regra aqui descrita reflete código real já implementado — não são sugestões, são o padrão estabelecido.

---

## 1. Visão geral e conceito

- **Produto:** painel web de monitoramento industrial de tornos CNC, conectado via CLP/ESP32 e Supabase.
- **Contexto:** projeto acadêmico de Governança de TI (SENAI), citado no rodapé de toda página.
- **Idioma:** todo o texto de interface é em **português do Brasil**, incluindo nomes de classes CSS e IDs (`menu`, `topo`, `principal`, `maquina`, `conexao`, `periodo`, etc.). Novas páginas devem seguir a mesma convenção — não usar nomes de classe em inglês.
- **Conceito estético:** painel de controle industrial noturno — grafite escuro, grade de fundo sutil (estilo "blueprint"), acentos em ciano técnico, e luzes piloto (LEDs) coloridas indicando estado de máquinas, como em um SCADA/CLP real.
- **Tom:** técnico, denso em dados, sóbrio. Nada de cores vibrantes decorativas — cor sempre carrega significado de status.

---

## 2. Paleta de cores

Todas as cores são **variáveis CSS no `:root`**, em `style.css`. **Nunca usar valores hexadecimais fixos direto no HTML/CSS de uma nova página** — sempre referenciar a variável, para que qualquer alteração de tema mude o sistema inteiro de uma vez.

### 2.1 Cores estruturais

| Variável | Valor | Uso |
|---|---|---|
| `--fundo` | `#0e141b` | Fundo geral da página (grafite quase-preto) |
| `--texto` | `#eaeff3` | Texto principal (quase branco) |
| `--painel` | `#171f27` | Fundo base dos cartões/painéis |
| `--painel-2` | `#1b242d` | Fundo alternativo/secundário de painel |
| `--secundario` | `#242c35` | Fundo de trilhos, barras, fundos internos neutros |
| `--borda` | `#2b343d` | Cor padrão de toda borda do sistema |
| `--texto-suave` | `#95a0aa` | Texto secundário, rótulos, legendas, timestamps |

### 2.2 Cor de marca

| Variável | Valor | Uso |
|---|---|---|
| `--primaria` | `#19d1d2` | Ciano técnico — cor de marca, links, destaque, foco, botão principal, item de menu ativo |
| `--primaria-texto` | `#09131a` | Cor de texto sobre fundo `--primaria` (ex.: texto do botão principal) |

### 2.3 Cores semânticas de estado (status de máquina)

Este é o núcleo do sistema — **toda máquina/equipamento tem sempre um destes 4 estados**, e a cor é o principal veículo de significado:

| Variável | Valor | Estado | Significado |
|---|---|---|---|
| `--ativo` | `#3fcd63` | Ativo (verde) | Máquina produzindo |
| `--espera` | `#f3ba25` | Espera (amarelo) | Máquina ligada, parada/aguardando |
| `--inativo` | `#ed4042` | Inativo (vermelho) | Máquina desligada/parada não planejada |
| `--semdados` | `#7a8189` | Sem dados (cinza) | Sem telemetria recebida |

**Regra de ouro:** estes 4 estados e suas cores são **fixos e universais** no sistema. Qualquer nova página que exiba status de equipamento deve usar exatamente estas 4 cores/nomes — não inventar um 5º estado ou renomear.

### 2.4 Cores do menu lateral (tonalidade própria, mais escura)

| Variável | Valor | Uso |
|---|---|---|
| `--menu-fundo` | `#090f16` | Fundo do menu lateral (mais escuro que `--fundo`) |
| `--menu-borda` | `#212a33` | Bordas internas do menu |
| `--menu-hover` | `#1c252e` | Fundo de item de menu em hover/ativo |

### 2.5 Cores de apoio (tokens de layout)

| Variável | Valor | Uso |
|---|---|---|
| `--raio` | `10px` | Raio de borda padrão de painéis/cartões |
| `--fonte` | `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | Fonte de texto geral |
| `--mono` | `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | Fonte para dados/números/códigos |

### 2.6 Uso de transparência (RGBA) para tons derivados

O sistema usa `rgba()` sobre as cores base para criar variações suaves em vez de novas variáveis. Padrões observados e que devem ser reutilizados:

- **Fundo tênue de destaque de marca:** `rgba(25, 209, 210, 0.15)` (ex.: ícone da marca, item de menu ativo, pílula em modo "demo")
- **Fundo tênue de aviso/amarelo:** `rgba(243, 186, 37, 0.06)` a `0.08`
- **Fundo tênue de erro/vermelho:** `rgba(237, 64, 66, 0.1)` a `0.12`
- **Fundo tênue de sucesso/verde:** `rgba(63, 205, 99, 0.07)`
- **Borda tênue correspondente:** mesma cor com alpha `0.35`–`0.5`
- **Texto secundário sobre painel:** `rgba(149, 160, 170, 0.85)` (levemente mais visível que `--texto-suave` puro)
- **Fundo neutro de item/linha dentro de painel:** `rgba(36, 44, 53, 0.25)` a `0.35`

**Padrão a seguir:** para qualquer novo componente de "estado" (sucesso, alerta, erro, info, marca), usar a cor semântica correspondente em fundo `rgba(cor, 0.06–0.12)` + borda `rgba(cor, 0.4–0.5)` + texto/ícone na cor sólida.

---

## 3. Tipografia

### 3.1 Fontes carregadas (Google Fonts)

```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
```

Toda nova página **deve** incluir este mesmo `<link>` (com os mesmos `preconnect` para `fonts.googleapis.com` e `fonts.gstatic.com`).

### 3.2 Duas famílias, com papéis bem definidos

1. **Inter** (`var(--fonte)`) — fonte padrão do `<body>`. Usada para: títulos, parágrafos, nomes, textos de interface em geral.
2. **JetBrains Mono** (`var(--mono)`) — usada exclusivamente para **dados**: números, valores monetários, timestamps, rótulos técnicos em caixa alta, CNPJ, fórmulas, badges de estado. Isso reforça a estética "painel de controle" e diferencia dado de texto narrativo.

**Regra:** sempre que um novo elemento exibir um **valor numérico, hora, código, ou rótulo técnico em uppercase com letter-spacing**, usar `var(--mono)`. Texto corrido/descrições usam `var(--fonte)`.

### 3.3 Escala tipográfica observada

| Contexto | font-size | font-family | peso | outras propriedades |
|---|---|---|---|---|
| `body` (base) | `15px` | Inter | 400 | `line-height: 1.45` |
| `h1` (título de página, `.topo h1`) | `24px` | Inter | 600 | `letter-spacing: -0.01em` |
| Subtítulo de página (`.topo-sub`) | `13px` | Inter | — | cor `--texto-suave` |
| `h2` de painel (`.painel-cab h2`) | `11px` | **Mono** | 500 | `letter-spacing: 0.18em`, `text-transform: uppercase`, cor `--texto-suave` |
| Descrição de painel (`.painel-cab p`) | `13px` | Inter | — | cor `rgba(149,160,170,0.85)`, `max-width: 70ch` |
| Rótulo de KPI (`.kpi-rotulo`) | `10px` | Mono | — | `letter-spacing: 0.16em`, uppercase |
| Valor de KPI (`.kpi-valor`) | `26px` | Mono | 600 | `letter-spacing: -0.02em`, `font-variant-numeric: tabular-nums` |
| Nome de máquina (`.maquina-nome`) | `15px` | Inter | 600 | — |
| Modelo de máquina (`.maquina-modelo`) | `11px` | Mono | — | cor `--texto-suave` |
| Tempo grande em cartão de máquina | `20px` | Mono | 600 | `letter-spacing: -0.02em` |
| Selo/badge (`.selo`) | `10px` | Mono | 600 | `letter-spacing: 0.12em` |
| Cabeçalho de tabela (`th`) | `10px` | Mono | 500 | `letter-spacing: 0.14em`, uppercase |
| Célula de tabela | `14px` (herda de `table`) | Inter/Mono conforme dado | — | números usam `.num` → mono |
| Botões (`.botao`) | `12px` | Inter (herdado) | — | — |
| Rodapé (`.rodape`) | `11px` | Mono | — | cor `--texto-suave` |
| Marca — nome (`.marca-nome`) | `14px` | Inter | 600 | `letter-spacing: 0.06em` |
| Marca — subtítulo (`.marca-sub`) | `10px` | Mono | — | `letter-spacing: 0.2em`, uppercase |
| Item de menu | `14px` | Inter | 400 (500 se ativo) | — |

**Padrão de "rótulo técnico":** sempre que precisar de um cabeçalho pequeno de seção/campo, o padrão é: `font-family: var(--mono); font-size: 10–11px; letter-spacing: 0.14–0.18em; text-transform: uppercase; color: var(--texto-suave);`

---

## 4. Estrutura de layout (grid geral da aplicação)

### 4.1 Esqueleto HTML (toda página segue este mesmo shell)

```html
<div class="app">
  <aside class="menu" aria-label="Menu principal"> ... </aside>
  <div class="conteudo">
    <nav class="nav-mobile" aria-label="Menu"> ... </nav>
    <header class="topo"> ... </header>
    <main class="principal" id="principal">
      <div id="faixaAviso"></div>
      <!-- seções da página -->
      <footer class="rodape"> ... </footer>
    </main>
  </div>
</div>
```

- `.app`: `display: flex; min-height: 100vh;` — contêiner raiz que divide menu lateral + conteúdo.
- `.menu`: barra lateral fixa (sticky), largura `248px`, altura `100vh`, não encolhe (`flex: none`).
- `.conteudo`: `flex: 1; min-width: 0;` — ocupa o restante da largura, empilha verticalmente (`flex-direction: column`).
- `.principal`: área de conteúdo rolável, `padding: 24px 32px 32px`, `display: flex; flex-direction: column; gap: 20px`. Cada seção da página é um filho direto deste flex, empilhado verticalmente com gap de `20px`.

### 4.2 Menu lateral (`.menu`) — presente em toda página

Estrutura fixa, **idêntica em todas as páginas**, mudando apenas qual item tem a classe `.ativo`:

```html
<aside class="menu" aria-label="Menu principal">
  <div class="marca">
    <div class="marca-icone"><svg class="ico">...</svg></div>
    <div>
      <p class="marca-nome">CARISSIMI</p>
      <p class="marca-sub">IoT Supervisão</p>
    </div>
  </div>
  <nav class="menu-lista">
    <a class="menu-item [ativo]" href="pagina.html" data-nav [aria-current="page"]>
      <svg class="ico">...</svg> Nome da Página
    </a>
    <!-- item desabilitado (funcionalidade futura): -->
    <span class="menu-item desativado" title="Em breve">
      <svg class="ico">...</svg> Nome <em>em breve</em>
    </span>
  </nav>
  <div class="menu-rodape">
    <p class="menu-empresa" id="empresaNome">—</p>
    <p class="menu-cnpj" id="empresaCnpj"></p>
  </div>
</aside>
```

Itens de menu existentes no sistema: **Dashboard** (`index.html`, ativo), **Equipamentos** (desativado, "em breve"), **Histórico** (desativado, "em breve"), **Relatórios** (`relatorios.html`, ativo), **Indicadores** (desativado, "em breve").

Regras:
- O item correspondente à página atual recebe `class="menu-item ativo"` e `aria-current="page"`.
- Item desativado usa `<span>` (não `<a>`), classe `desativado`, `title="Em breve"`, e um `<em>em breve</em>` alinhado à direita (`margin-left: auto`).
- Todo item tem um ícone SVG `.ico` de 18×18px antes do texto.
- Rodapé do menu mostra nome e CNPJ da empresa (preenchidos via JS, `#empresaNome` / `#empresaCnpj`), inicialmente com travessão `—`.

### 4.3 Navegação mobile (`.nav-mobile`)

Menu lateral **some** em telas ≤900px (ver seção 8). Nessas telas aparece uma barra horizontal com os mesmos links principais em formato de "pílulas":

```html
<nav class="nav-mobile" aria-label="Menu">
  <a href="index.html" data-nav class="ativo" aria-current="page">Dashboard</a>
  <a href="relatorios.html" data-nav>Relatórios</a>
</nav>
```

Fica oculta (`display: none`) em telas largas, aparece (`display: flex`) só no breakpoint mobile.

### 4.4 Cabeçalho de página (`.topo`)

Sticky no topo do `.conteudo` (`position: sticky; top: 0; z-index: 20`), com fundo semi-transparente e desfoque (`backdrop-filter: blur(8px)`), para permanecer legível ao rolar o conteúdo por baixo.

```html
<header class="topo">
  <div class="topo-titulo">
    <h1>Título da Página</h1>
    <p class="topo-sub"><span id="subtitulo">...</span></p>
  </div>
  <div class="topo-acoes">
    <!-- pílula de conexão, seletor de período, botões, etc. -->
  </div>
</header>
```

- `.topo-titulo`: título `<h1>` + subtítulo dinâmico logo abaixo.
- `.topo-acoes`: agrupa controles do lado direito (status de conexão, filtros de período, botões de ação), com `flex-wrap: wrap` e `gap: 10px`.

### 4.5 Sistema de colunas para seções

- `.duas-colunas`: `display: grid; gap: 20px;`
- `.col-1-3-1`: proporção `1.35fr 1fr` (coluna esquerda um pouco maior)
- `.col-2-1`: proporção `2fr 1fr`
- Ambas colapsam para `1fr` (coluna única, empilhada) em telas ≤1180px.

Use `.col-1-3-1` quando as duas seções têm importância parecida mas a esquerda precisa de um pouco mais de espaço (ex.: capacidade + alertas, financeiro + atividade). Use `.col-2-1` quando uma seção é claramente principal (ex.: gráfico de evolução) e a outra é de apoio (ex.: gráfico de rosca).

---

## 5. Componente: Painel (`.painel`) — bloco básico de toda seção

Todo bloco de conteúdo da página (KPI, gráfico, tabela, lista) fica dentro de um `<section class="painel">`. É o componente mais fundamental do sistema.

```css
.painel {
  padding: 20px;
  border: 1px solid var(--borda);
  border-radius: var(--raio); /* 10px */
  background: linear-gradient(160deg, #182129, var(--painel));
  box-shadow: 0 1px 0 rgba(255,255,255,0.05) inset, 0 18px 40px -24px rgba(0,0,0,0.9);
  min-width: 0;
}
```

Cabeçalho padrão de painel (`.painel-cab`):

```html
<section class="painel">
  <header class="painel-cab">
    <div>
      <h2>Nome da Seção</h2>
      <p>Descrição curta do que a seção mostra.</p>
    </div>
    <!-- opcional: botão de ação, legenda -->
  </header>
  <!-- conteúdo -->
</section>
```

`.painel-cab` é `flex` com `justify-content: space-between`, permitindo colocar um botão (`.botao`) ou legenda (`.legenda`) alinhado à direita do título. `margin-bottom: 16px` separa o cabeçalho do conteúdo.

**Todo novo painel de uma nova página deve seguir exatamente esta estrutura** (title em mono uppercase + descrição em texto suave abaixo).

---

## 6. Componentes de interface

### 6.1 Pílula de conexão (`.pilula-conexao`)

Indicador de status de conectividade com o Supabase/backend, no cabeçalho:

```html
<div class="pilula-conexao [ok|aviso|erro|demo]" role="status" aria-live="polite">
  <span class="led [led-ativo|led-espera|led-inativo]"></span>
  <span>Texto do status</span>
</div>
```

- Formato de pílula (`border-radius: 999px`), fundo `--painel`, texto mono uppercase 10px.
- 4 variantes de cor: `.ok` (verde, com LED pulsante via `@keyframes pulsar`), `.aviso` (amarelo), `.erro` (vermelho), `.demo` (ciano — indica dados de demonstração, não reais).

### 6.2 Seletor de período (`.periodos`)

Grupo de botões tipo "segmented control" para escolher intervalo de tempo:

```html
<div class="periodos" role="group" aria-label="Período de análise">
  <button aria-pressed="true">Hoje</button>
  <button aria-pressed="false">7 dias</button>
  ...
</div>
```

Botão selecionado usa `aria-pressed="true"` → recebe fundo `rgba(25,209,210,0.15)`, cor `--primaria` e `box-shadow: inset 0 0 0 1px rgba(25,209,210,0.4)`. Texto sempre mono, uppercase, 11px.

Período customizado (`.periodo-custom`) mostra dois `<input type="date">` com seta `→` entre eles, só visível (`hidden` removido) quando período "personalizado" é escolhido.

### 6.3 Botões (`.botao`)

```css
.botao { padding: 7px 14px; border-radius: 8px; border: 1px solid var(--borda); background: transparent; color: var(--primaria); font-size: 12px; cursor: pointer; }
```

Variantes:
- **Padrão** (`.botao`): contorno, texto ciano, hover com fundo `rgba(25,209,210,0.1)`.
- **Principal** (`.botao.botao-principal`): fundo sólido `--primaria`, texto `--primaria-texto`, `font-weight: 600`; hover clareia para `#3fdfe0`. Usar para a ação principal de um diálogo/formulário (ex.: "Salvar").
- **Perigo** (`.botao.botao-perigo`): texto `--inativo` (vermelho), hover com fundo vermelho tênue. Usar para ações destrutivas (ex.: "Limpar tudo").

### 6.4 LEDs / luzes piloto (`.led`)

Bolinha de 10×10px, `border-radius: 50%`, cor conforme estado (ver seção 2.3). O LED de estado "ativo" ganha um leve brilho (`box-shadow`) para parecer uma luz acesa. Usado em: legenda da linha do tempo, pílula de conexão, dentro de selos de máquina (via cor de texto, não literalmente o `.led` sempre).

### 6.5 KPIs (`.grade-kpi` / `.kpi`)

Grade de indicadores numéricos no topo do dashboard:

```html
<div class="grade-kpi" id="kpisAgora">
  <div class="kpi">
    <div class="anel" style="--p: 72; --cor: var(--ativo);"></div>
    <div class="kpi-corpo">
      <p class="kpi-rotulo">Rótulo</p>
      <p class="kpi-valor cor-ativo">72%</p>
      <p class="kpi-dica">texto de apoio</p>
      <span class="delta bom">+4,2%</span>
    </div>
  </div>
  <!-- mais .kpi -->
</div>
```

- `.grade-kpi`: `display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px;` — 4 colunas em desktop.
- Duas grades podem ser empilhadas (`#kpisAgora` + `#kpisPeriodo`), com `margin-top: 12px` entre elas via `.grade-kpi + .grade-kpi`.
- `.kpi`: mesmo fundo/borda/gradiente do `.painel`, mas `padding: 16px` e layout `flex` horizontal (anel + corpo).
- **Anel de progresso** (`.anel`): construído **só com CSS**, sem SVG nem imagem — `conic-gradient` controlado por duas custom properties inline: `--p` (percentual, 0–100) e `--cor` (uma das cores semânticas). O miolo é "vazado" via `::after` com fundo igual ao do painel, criando efeito de anel.
- Cores de valor: classes utilitárias `.cor-ativo`, `.cor-espera`, `.cor-inativo`, `.cor-primaria`, `.cor-suave` aplicam a cor correspondente ao texto.
- `.delta`: pequeno indicador de variação, com 3 variantes — `.bom` (verde), `.ruim` (vermelho), `.neutro` (cinza).

### 6.6 Cartão de máquina/equipamento (`.maquina`)

```html
<div class="grade-maquinas" id="maquinas">
  <div class="maquina est-ativo [piscar]">
    <div class="maquina-cab">
      <div>
        <p class="maquina-nome">Torno 01</p>
        <p class="maquina-modelo">Modelo XYZ</p>
      </div>
      <span class="selo est-ativo"><span class="led led-ativo"></span>Ativo</span>
    </div>
    <div class="maquina-tempo">
      <strong>02:14:33</strong>
      <span>neste estado</span>
    </div>
    <div class="barra-empilhada">
      <i class="b-ativo" style="width: 70%"></i>
      <i class="b-espera" style="width: 20%"></i>
      <i class="b-inativo" style="width: 10%"></i>
    </div>
    <dl class="maquina-dados">
      <div><dt>Rótulo</dt><dd>Valor</dd></div>
      <!-- 3 colunas -->
    </dl>
    <p class="maquina-rodape">Última atualização: ...</p>
  </div>
</div>
```

- `.grade-maquinas`: `grid-template-columns: repeat(auto-fill, minmax(290px, 1fr))` — cartões fluem responsivamente, largura mínima 290px.
- Cada cartão tem uma **borda superior de 3px colorida** (`border-top-color`) conforme o estado — é o indicador visual primário do card, junto do selo.
- Classes de estado no cartão: `.est-ativo`, `.est-espera`, `.est-inativo` (sem dados usa a cor cinza padrão da borda, sem classe extra).
- `.piscar`: animação de destaque (1.6s) aplicada quando o estado muda em tempo real — pisca com fundo ciano tênue e volta ao normal. Usar ao receber atualização via WebSocket/polling.
- `.selo`: badge arredondado (pill) mostrando o estado atual por extenso, cor do texto conforme estado (`.est-ativo`, `.est-espera`, `.est-inativo`, `.est-semdados`).
- `.barra-empilhada`: barra horizontal fina (8px) mostrando a proporção do tempo em cada estado, segmentos coloridos (`.b-ativo`, `.b-espera`, `.b-inativo`).
- `.maquina-dados`: grade de 3 colunas para dados auxiliares (ex.: OEE, ciclos, peças).

### 6.7 Linha do tempo de estados (`.linha-tempo`)

```html
<div class="linha-tempo">
  <p class="lt-nome">Torno 01</p>
  <div class="lt-faixa">
    <span class="lt-seg" style="left:0%; width:40%; background:var(--ativo)" title="..."></span>
    <!-- outros segmentos -->
  </div>
</div>
<div class="linha-tempo">
  <span class="lt-espaco"></span>
  <div class="lt-eixo"><span>00:00</span><span>12:00</span><span>23:59</span></div>
</div>
```

- Grid de 2 colunas: `150px` (nome, fixo) + `1fr` (faixa).
- `.lt-faixa`: fundo com padrão de listras diagonais (`repeating-linear-gradient`, 135°) representando "sem dados/vazio" por baixo dos segmentos reais.
- `.lt-seg`: cada segmento é posicionado absolutamente (`left`/`width` em %) com a cor do estado correspondente; `hover` clareia (`filter: brightness(1.25)`) — usar `title` para tooltip nativo com detalhes.
- `.lt-eixo`: régua de horários abaixo da última linha, texto mono 10px.

### 6.8 Capacidade / barras de progresso em etapas (`.passos`, `.trilho`)

```html
<div class="passos">
  <div>
    <div class="passo-topo"><span>Rótulo</span><span>85%</span></div>
    <div class="trilho"><i style="width:85%; background:var(--ativo)"></i></div>
  </div>
</div>
```

`.trilho`: barra de fundo `--secundario`, `border-radius: 999px`, com `<i>` interno cuja largura anima (`transition: width 0.5s ease`). Usado tanto no painel de capacidade quanto em `.util-celula` (tabela) para mostrar % de utilização de forma compacta.

### 6.9 Alertas gerenciais (`.alerta`)

```html
<div class="lista-alertas">
  <div class="alerta [critico|info]">
    <svg class="ico">...</svg>
    <div>
      <p class="alerta-titulo">Título do alerta</p>
      <p class="alerta-detalhe">Detalhe explicativo.</p>
      <p class="alerta-limite">Limite de referência: X%</p>
    </div>
  </div>
</div>
<!-- ou, quando não há alertas: -->
<div class="tudo-certo"><svg class="ico">✓</svg> Tudo dentro do esperado.</div>
```

3 variantes: padrão (amarelo, aviso), `.critico` (vermelho), `.info` (neutro/cinza). Ícone à esquerda herda a cor do alerta. `.tudo-certo` é o estado positivo (verde), mostrado quando não há alertas ativos.

### 6.10 Financeiro (`.resposta`, `.fin-linha`)

- `.respostas`: grid de 2 colunas com cartões de resposta rápida (`.resposta`), cada um com rótulo pequeno, valor grande em mono e uma dica opcional.
- `.lista-fin`: lista vertical de `.fin-linha` — grid `1fr auto`, mostrando nome + fórmula (mono, uppercase, pequena) à esquerda e valor (mono) à direita.
- `.fin-faltando`: aviso alinhado à direita, cor `--espera`, indicando que dado está faltando para o cálculo — sempre visível quando aplicável, nunca esconder silenciosamente um cálculo incompleto.

### 6.11 Atividade recente / feed (`.feed`)

```html
<ul class="feed">
  <li>
    <time>14:32</time>
    <div>
      <p class="quem">Torno 01</p>
      <p class="oque">Espera <span class="seta">→</span> <b>Ativo</b></p>
    </div>
  </li>
</ul>
```

Grid de 2 colunas (`46px` para hora + `1fr` para conteúdo), separador fino entre itens, último item sem borda inferior.

### 6.12 Gráficos (Chart.js)

- Todo gráfico fica dentro de `.caixa-grafico` (altura `290px`; variante `.caixa-grafico-baixa` com `240px` para gráficos largos/baixos) contendo um `<canvas>` + um `<p class="vazio" data-vazio="idDoCanvas">`.
- Estado vazio: quando não há dados, adicionar classe `.sem-dados` ao `.caixa-grafico` — isso esconde o canvas (`visibility: hidden`) e mostra a mensagem `.vazio` centralizada, absoluta sobre a área do gráfico.
- Biblioteca: **Chart.js 4.4.7** via CDN jsdelivr — `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>`.
- Ao configurar cores de dataset em JS, usar os mesmos valores hexadecimais das variáveis CSS (Chart.js não lê `var()` diretamente sempre — ler a variável computada via `getComputedStyle` se precisar de dinamismo, ou repetir o hex).

### 6.13 Tabela (`.tabela-rolagem`, `table`)

```html
<div class="tabela-rolagem" id="tabela">
  <table>
    <thead><tr><th><button>Coluna <svg class="ico">seta</svg></button></th>...</tr></thead>
    <tbody>
      <tr>
        <td>Nome<br><span class="sub">detalhe</span></td>
        <td class="num">1.234</td>
        <td><div class="util-celula"><div class="trilho"><i style="width:60%"></i></div>60%</div></td>
        <td><button class="link-btn">Ver mais</button></td>
      </tr>
    </tbody>
  </table>
</div>
```

- `.tabela-rolagem`: `overflow-x: auto` — tabela nunca quebra o layout da página, rola horizontalmente em telas estreitas.
- `table` tem `min-width: 960px` (ou `.tabela-estreita` com `720px` para tabelas menores, como em Relatórios) — força rolagem em vez de espremer colunas.
- Cabeçalhos (`th`) são clicáveis (`<button>` dentro do `th`) para ordenação; `th[aria-sort]` destaca a coluna ativa.
- `.num`: alinhamento/fonte mono com `font-variant-numeric: tabular-nums` para números alinharem verticalmente.
- `.sub`: texto pequeno mono abaixo do valor principal de uma célula (detalhe secundário).
- `.util-celula`: célula combinando mini barra de progresso (`.trilho`, 80px) + valor percentual.
- `.link-btn`: botão estilizado como link sublinhado, cor `--espera` (usado para ações secundárias tipo "ver mais").
- Linha de totais (Relatórios): `.linha-total` — borda superior mais grossa (2px) e fundo levemente destacado.

### 6.14 Diálogo/modal (`<dialog class="dialogo">`)

```html
<dialog id="dlgX" class="dialogo">
  <form method="dialog">
    <h3>Título</h3>
    <p class="dialogo-texto">Explicação.</p>
    <div class="campo">
      <label>Rótulo</label>
      <div class="entrada"><span>R$</span><input type="number" /></div>
    </div>
    <div class="dialogo-botoes">
      <button class="botao botao-perigo">Ação destrutiva</button>
      <span class="espaco"></span>
      <button class="botao">Cancelar</button>
      <button class="botao botao-principal" type="submit">Salvar</button>
    </div>
  </form>
</dialog>
```

- Usa o elemento nativo `<dialog>` do HTML (não um `<div>` custom) — abrir com `.showModal()` em JS.
- `::backdrop` customizado com escurecimento + leve desfoque.
- Largura `min(480px, calc(100vw - 32px))` — nunca ultrapassa a viewport em mobile.
- `.campo .entrada`: input com prefixo/sufixo visual (ex.: "R$"), borda destaca (`--primaria`) em foco via `:focus-within`.
- `.dialogo-botoes`: botões alinhados à direita, exceto ação destrutiva à esquerda, separadas por `.espaco` (`flex: 1`).

### 6.15 Avisos de página / faixa de aviso (`.aviso`, `#faixaAviso`)

```html
<div class="aviso [erro|demo]">
  <svg class="ico">...</svg>
  <span>Texto do aviso. Pode conter <code>código</code>.</span>
  <button class="botao">Ação</button>
</div>
```

3 variantes: padrão (amarelo — aviso geral), `.erro` (vermelho — falha de conexão/dados), `.demo` (ciano — indicando que a página está exibindo dados fictícios de demonstração). O botão de ação, se houver, é empurrado para a direita (`margin-left: auto`).

**Padrão "só aviso":** quando não há dados suficientes para renderizar a página, adicionar `class="so-aviso"` ao `#principal` — isso esconde todas as `section`/`div`/`footer` internas exceto `#faixaAviso`, mostrando só o aviso centralizado. Usar este padrão em vez de esconder elementos manualmente um a um.

### 6.16 Estado vazio e esqueleto de carregamento

- `.estado-vazio`: texto centralizado, `color: var(--texto-suave)`, usado dentro de qualquer lista/painel sem itens.
- `.esqueleto`: placeholder de carregamento (skeleton), altura `120px`, gradiente animado (`@keyframes brilho`, 1.4s linear infinite) simulando "brilho passando". Usar enquanto dados reais ainda não chegaram, antes de decidir entre conteúdo real ou `.estado-vazio`.
- `.principal.carregando`: aplicar esta classe ao `<main>` durante carregamento geral da página — reduz opacidade para `0.55` e desativa cliques (`pointer-events: none`) em todo o conteúdo, com transição suave.

### 6.17 Rodapé de página (`.rodape`)

```html
<footer class="rodape">
  <span id="rodapeSync">Sincronizado às 14:32</span>
  <span>CARISSIMI IoT · Projeto acadêmico de Governança de TI (SENAI)</span>
</footer>
```

Presente em **toda página**, sempre com o texto institucional fixo do lado direito (ou centralizado se só houver um item). Texto mono, pequeno (11px), cor suave.

---

## 7. Ícones

- Todos os ícones são **SVG inline** no estilo *outline* (traço, sem preenchimento) — visual idêntico ao conjunto Lucide/Feather.
- Classe padrão: `.ico` → `width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;`.
- Por usar `stroke: currentColor`, o ícone **sempre herda a cor do texto do elemento pai** — nunca fixar cor diretamente no `<svg>` ou `<path>`.
- `viewBox="0 0 24 24"` padrão em todos os ícones do menu; dentro de contexto de alertas os ícones também seguem 24×24 com stroke 2.
- Ao adicionar um ícone novo, usar o mesmo estilo de traço (2px, cantos arredondados) — nunca misturar ícones preenchidos (*filled*) com os outline existentes.

---

## 8. Responsividade

Três breakpoints principais, todos `max-width`:

### 8.1 `@media (max-width: 1180px)`
- `.col-1-3-1` e `.col-2-1` colapsam para 1 coluna (`grid-template-columns: 1fr`) — seções empilham verticalmente.
- `.grade-kpi` passa de 4 para 2 colunas.
- `.itens-4` (Relatórios) passa de 4 para 2 colunas.

### 8.2 `@media (max-width: 900px)` — modo "tablet/mobile"
- `.menu` (barra lateral) **desaparece completamente** (`display: none`).
- `.nav-mobile` aparece (`display: flex`) como substituto de navegação.
- `.topo` deixa de ser sticky (`position: static`) e reduz padding (`14px 16px`); `h1` cai para `20px`.
- `.principal` reduz padding para `16px`, gap para `16px`.
- `.topo-acoes` ocupa `100%` de largura.
- `.periodos` vira rolável horizontalmente (`overflow-x: auto`, `flex-wrap: nowrap`), botões com `white-space: nowrap`.
- `.linha-tempo` vira 1 coluna (nome empilhado acima da faixa, `.lt-nome { margin-top: 8px }`), e `.lt-espaco` some.
- (Relatórios) `.seletor` ocupa 100% da largura, botão principal do topo vira `flex: 1 1 100%`.

### 8.3 `@media (max-width: 520px)` — mobile pequeno
- `#kpisAgora` cai para 2 colunas; `#kpisPeriodo` cai para 1 coluna.
- KPIs reduzem padding (`12px`) e o valor cai para `22px`.
- `.respostas` e `.itens-2` caem para 1 coluna.
- (Relatórios) `.itens-4` cai para 1 coluna.

### 8.4 Regra geral para novas páginas

Sempre construir mobile-first mentalmente nestas 3 faixas: **desktop largo (padrão) → ≤1180px (colunas colapsam) → ≤900px (menu vira nav mobile, tudo aperta) → ≤520px (grades finais viram 1–2 colunas)**. Reaproveitar exatamente estes valores de breakpoint — não criar novos pontos de quebra sem necessidade.

---

## 9. Acessibilidade e interação

- `:focus-visible` global: contorno `2px solid var(--primaria)` com `outline-offset: 2px` — nunca remover o foco de teclado sem substituir por algo equivalente.
- Uso de `aria-current="page"` no link de menu ativo.
- Uso de `role="status" aria-live="polite"` na pílula de conexão (mudanças de status são anunciadas por leitores de tela).
- Uso de `role="group" aria-label="..."` em grupos de botões tipo segmented control (períodos).
- Uso de `aria-pressed` em botões de alternância (toggle).
- Uso de `aria-sort`/botão em cabeçalhos de tabela ordenáveis.
- `@media (prefers-reduced-motion: reduce)`: desativa **todas** as animações e transições (`animation: none !important; transition: none !important;`) — obrigatório manter essa regra em qualquer novo CSS que adicione animação.

---

## 10. Impressão (`@media print`)

O sistema tem uma folha de estilos de impressão dedicada (vista em Relatórios, mas aplicável a qualquer página que precise virar PDF):

- Reescreve as variáveis de cor do `:root` para uma paleta clara (fundo branco, texto escuro `#111`, cor de marca `#08808a`, verde/amarelo/vermelho ajustados para contraste em papel).
- Esconde elementos de navegação/interação: `.menu`, `.nav-mobile`, `.topo-acoes`, `.pilula-conexao`, `.periodo-custom`, botões dentro de avisos/rodapé, e qualquer elemento marcado com a classe utilitária `.sem-impressao`.
- `.app` vira `display: block` (abandona o layout flex de duas colunas).
- Painéis, KPIs e itens ganham `break-inside: avoid` e perdem sombra/gradiente (fundo branco sólido).
- Tabelas perdem `min-width` (`0`) e reduzem `font-size` para `10.5px`; `.tabela-rolagem` vira `overflow: visible`.
- **Padrão:** se uma nova página tiver conteúdo que faça sentido imprimir/exportar como PDF, adicionar a classe `.sem-impressao` em controles interativos que não devem aparecer no papel, em vez de criar novas regras `@media print` do zero — reaproveitar o bloco existente.

---

## 11. Convenções de código e nomenclatura

1. **Classes e IDs em português**, minúsculo, sem acento, separadas por hífen quando compostas (`menu-item`, `pilula-conexao`, `grade-maquinas`). Nunca usar camelCase em classes CSS (IDs usados como "ganchos" de JS, como `kpisAgora`, seguem camelCase — esse é o único caso).
2. **Modificadores de estado como classe adicional**, não variantes de nome de componente: `maquina est-ativo`, não `maquina-ativa`. Prefixo `est-` sempre indica estado de máquina (ativo/espera/inativo/semdados) e é reutilizado em `.maquina`, `.selo` e potencialmente em novos componentes de status.
3. **Toda cor vem de variável `:root`** — nunca hardcode hex em CSS ou inline style, exceto quando o valor é genuinamente dinâmico (ex.: `width` calculado de uma barra, `--p`/`--cor` do anel).
4. **Toda medida de espaçamento é múltiplo de 2px**, geralmente entre 4px–32px (4, 6, 8, 10, 12, 14, 16, 20, 24, 32). Manter essa granularidade em novos componentes.
5. **`--raio` (10px) é o raio padrão** de painéis/cartões grandes; elementos menores (botões, selos, itens de lista) usam raios menores (6–9px) definidos localmente; pílulas/badges totalmente arredondados usam `999px`.
6. Arquivo CSS é **único e compartilhado** (`style.css`) entre todas as páginas do projeto — novas páginas **não devem criar CSS próprio**; adicionar novas classes ao mesmo `style.css`, agrupadas por seção com comentário `/* ---------- Nome da seção ---------- */`, seguindo o padrão já usado no arquivo (ver os comentários existentes: Estrutura, LED, KPIs, Cartões de máquina, Linha do tempo, Capacidade, Alertas, Financeiro, Atividade recente, Gráficos, Tabela, Avisos, Janela, Telas menores, Relatórios, Impressão).

---

## 12. Estrutura de arquivo e scripts (para toda nova página `.html`)

### 12.1 `<head>` padrão

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Nome da Página — CARISSIMI IoT | Supervisão Industrial</title>
  <meta name="description" content="..." />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="style.css" />
</head>
```

- `<title>` sempre no formato: **"Nome da Página — CARISSIMI IoT | Supervisão Industrial"**.
- `<meta name="description">` sempre presente e específico ao conteúdo da página.

### 12.2 Scripts (ordem final do `<body>`, antes de `</body>`)

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>

<script src="js/supabaseClient.js"></script>
<script src="js/metrics.js"></script>
<script src="js/demoData.js"></script>
<script src="js/dashboard.js"></script> <!-- ou o script específico da nova página -->
```

- Bibliotecas externas (CDN) sempre carregam **antes** do código próprio.
- Entre os arquivos próprios, `supabaseClient.js` e `metrics.js` são módulos compartilhados que devem carregar antes de qualquer script específico de página — **a ordem importa**, como indicado pelo comentário no `index.html` original.
- Uma nova página deve reaproveitar `supabaseClient.js`, `metrics.js` e `demoData.js`, adicionando apenas seu próprio script final (ex.: `js/relatorios.js`, `js/equipamentos.js`), sem duplicar lógica de conexão.

---

## 13. Checklist para criar uma nova página

Ao construir qualquer página nova do CARISSIMI IoT, verificar:

1. [ ] `<html lang="pt-BR">`, `<head>` com meta viewport, título no padrão, `style.css` compartilhado, fontes Google (Inter + JetBrains Mono).
2. [ ] Estrutura `.app > .menu + .conteudo`, com o item correto marcado `.ativo`/`aria-current="page"` no menu lateral **e** no `.nav-mobile`.
3. [ ] `.topo` com `<h1>` + subtítulo, e `.topo-acoes` com os controles relevantes (pílula de conexão se a página consumir dados ao vivo; seletor de período se for filtrável por data).
4. [ ] Todo bloco de conteúdo dentro de `<section class="painel">` com `.painel-cab` (h2 mono uppercase + descrição).
5. [ ] Cores sempre via variável CSS; estados de máquina sempre nas 4 cores fixas (ativo/espera/inativo/sem dados).
6. [ ] Números/dados em `var(--mono)`; texto corrido em `var(--fonte)`.
7. [ ] Estado vazio (`.estado-vazio`) e/ou esqueleto de carregamento (`.esqueleto`) previstos para toda área que depende de dados assíncronos.
8. [ ] Página testada nas 3 faixas responsivas (1180px, 900px, 520px) reaproveitando os breakpoints existentes.
9. [ ] `:focus-visible` e atributos ARIA mantidos em qualquer novo controle interativo.
10. [ ] `<footer class="rodape">` com o texto institucional padrão.
11. [ ] Nenhum CSS novo fora de `style.css`; novas classes adicionadas na seção apropriada, comentada, em português.
12. [ ] Se a página for exportável/imprimível, usar `.sem-impressao` nos controles que não devem aparecer no papel, reaproveitando o bloco `@media print` existente.

---

*Documento gerado a partir da análise direta de `index.html` e `style.css` do projeto CARISSIMI IoT (SENAI — Governança de TI).*
