/* =========================================================
   VITALSYNC VERDE — saúde e sustentabilidade (visão do profissional)
   -----------------------------------------------------------
   Dados ambientais demonstrativos, ícones e utilitários ficam em
   js/verdeDados.js (compartilhado com verde-paciente.html).
   O único dado real usado aqui é a fila do VitalSyncStore
   (js/store.js), lida SOMENTE para leitura.
========================================================= */

// ---------- TOPBAR: reaproveita sessão do profissional, se existir ----------
(function topbar() {
  const prof = Auth.getProfissional();
  const userName = document.getElementById('userName');
  if (prof && prof.nome) userName.textContent = `Olá, ${prof.nome}`;
  else userName.style.display = 'none';
  if (prof && prof.unidade_nome) document.getElementById('unitPill').textContent = prof.unidade_nome;
  // volta para a tela de onde o usuário veio (fila do paciente ou painel do profissional)
  if (document.referrer.indexOf('fila.html') !== -1) {
    const back = document.getElementById('backLink');
    back.setAttribute('href', 'fila.html');
  }
})();

// ---------- ABAS ----------
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
function goToTab(tab) {
  tabButtons.forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  tabPanels.forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
  if (tab === 'sustentabilidade') animateSustentabilidade();
  if (tab === 'ambiental') animateDemanda();
}
tabButtons.forEach(b => b.addEventListener('click', () => goToTab(b.dataset.tab)));

// ---------- 1. PAINEL AMBIENTAL ----------
function renderIndicadores(list) {
  document.getElementById('indicadores').innerHTML = list.map(i => `
    <article class="v-card">
      <div class="v-ind-head">
        <div class="v-ico ${i.cls}">${icon(i.icon, 20)}</div>
        <span class="v-chip ${i.level === 'ok' ? '' : i.level}"><span class="v-lv" aria-hidden="true">${i.level === 'bad' ? '▲' : i.level === 'warn' ? '●' : '✓'}</span> ${esc(i.chip)}</span>
      </div>
      <p class="v-ind-label">${esc(i.label)}</p>
      <div class="v-ind-value">${esc(i.value)}<small>${esc(i.unit)}</small></div>
      <div class="v-meter" role="img" aria-label="${esc(i.label)}: ${i.pct}% da escala"><span class="${i.level === 'ok' ? '' : i.level}" style="width:${i.pct}%"></span></div>
      ${(DEMO.series[i.id] ? `<div class="v-trend ${i.level}">${spark(DEMO.series[i.id])}<small>Tendência · 7 dias (simulada)</small></div>` : '<p class="v-ind-desc">Sem dados de tendência.</p>')}
      ${DEMO.guia[i.id] ? `<p class="v-ind-desc"><strong>Impacto na saúde:</strong> ${esc(DEMO.guia[i.id].impacto)}</p><p class="v-ind-rec"><strong>Prevenção:</strong> ${esc(DEMO.guia[i.id].rec)}</p>` : `<p class="v-ind-desc">${esc(i.desc)}</p>`}
    </article>`).join('');
}

function renderDemanda() {
  const max = Math.max(...DEMO.demanda.map(d => d.pct));
  document.getElementById('demandaBars').innerHTML = DEMO.demanda.map(d => `
    <div class="v-bar-row">
      <span class="v-bar-name">${esc(d.nome)}</span>
      <div class="v-bar-track"><span data-w="${(d.pct / max) * 100}" style="width:0"></span></div>
      <span class="v-bar-val">+${d.pct}%</span>
    </div>`).join('');
}
function animateDemanda() {
  requestAnimationFrame(() => document.querySelectorAll('#demandaBars .v-bar-track > span')
    .forEach(s => { s.style.width = s.dataset.w + '%'; }));
}

// Conexão REAL com o VitalSync: lê a fila (somente leitura) e conta sintomas sensíveis ao ambiente
function renderFilaStats() {
  const box = document.getElementById('filaStats');
  const foot = document.getElementById('filaFoot');
  let fila = [];
  try {
    if (typeof VitalSyncStore !== 'undefined') {
      fila = VitalSyncStore.getFila().filter(f => f.status !== 'finalizado');
    }
  } catch (e) { fila = []; }

  const conta = (...chaves) => fila.filter(f => (f.sintomas || []).some(s => chaves.includes(s))).length;
  const stats = [
    { n: fila.length, t: 'pacientes na fila' },
    { n: conta('febre'), t: 'com febre (dengue/calor)' },
    { n: conta('falta_ar'), t: 'com falta de ar (poluição)' },
    { n: conta('desmaio', 'dor_cabeca'), t: 'tontura ou cefaleia (calor)' },
  ];
  box.innerHTML = stats.map(s => `<div class="v-stat"><b>${s.n}</b><span>${s.t}</span></div>`).join('');
  foot.textContent = fila.length
    ? 'Fila lida do VitalSync neste navegador. Atualiza sozinha quando a fila muda.'
    : 'Nenhum paciente na fila neste navegador. Abra o painel do profissional para carregar exemplos da fila.';
}
try { if (typeof VitalSyncStore !== 'undefined') VitalSyncStore.onChange(renderFilaStats); } catch (e) { /* segue */ }

// ---------- 2. MAPA DE ALERTAS ----------
let filtroAtual = 'todos', nivelAtual = 'todos', alertaSel = null, zonaSel = null;
const ALERTAS = DEMO.alertas;

function chips(boxId, itens, atual, onPick) {
  const box = document.getElementById(boxId);
  box.innerHTML = itens.map(i => `<button type="button" class="v-filter ${i.k === atual ? 'active' : ''}" data-f="${esc(i.k)}" aria-pressed="${i.k === atual}">${i.cor ? `<i style="background:${i.cor}"></i>` : ''}${esc(i.label)}</button>`).join('');
  box.querySelectorAll('.v-filter').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.f; onPick(k);
    const nb = document.getElementById(boxId).querySelector(`[data-f="${k.replace(/"/g, '')}"]`); if (nb) nb.focus();
  }));
}
function renderFiltros() {
  chips('filtros', [{ k: 'todos', label: 'Todos os riscos', cor: 'var(--g-500)' }, ...Object.entries(DEMO.tipos).map(([k, t]) => ({ k, label: t.label, cor: t.cor }))], filtroAtual, k => { filtroAtual = k; alertaSel = null; refreshMapa(); });
  chips('filtrosNivel', [{ k: 'todos', label: 'Todos os níveis' }, { k: 'Alto', label: 'Risco alto' }, { k: 'Médio', label: 'Risco médio' }], nivelAtual, k => { nivelAtual = k; alertaSel = null; refreshMapa(); });
}
function refreshMapa() { renderFiltros(); renderMapa(); renderAlertas(); renderRegiao(); }
function visiveis() { return ALERTAS.filter(a => (filtroAtual === 'todos' || a.tipo === filtroAtual) && (nivelAtual === 'todos' || a.nivel === nivelAtual)); }

function renderMapa() {
  const svg = document.getElementById('mapSvg');
  const vis = visiveis().map(a => a.id);
  const zonas = DEMO.zonas.map(z => `
    <g data-zona="${z.id}" tabindex="0" role="button" aria-label="Região ${esc(z.nome)}">
      <polygon class="v-zone ${zonaSel === z.id ? 'sel' : ''}" points="${z.pts}"></polygon>
      <text class="v-zone-name" x="${z.lx}" y="${z.ly}" text-anchor="middle">${esc(z.nome)}</text>
    </g>`).join('');
  const pins = ALERTAS.map(a => {
    const t = DEMO.tipos[a.tipo], dim = !vis.includes(a.id), r = a.nivel === 'Alto' ? 11 : 7;
    return `<g class="v-pin ${dim ? 'dim' : ''}" data-id="${a.id}" tabindex="${dim ? -1 : 0}" role="button" aria-label="${esc(t.label)}, risco ${esc(a.nivel.toLowerCase())}: ${esc(a.titulo)}">
      <circle class="halo" cx="${a.x}" cy="${a.y}" r="${r + 8}" fill="${t.cor}" opacity=".3"></circle>
      <circle cx="${a.x}" cy="${a.y}" r="${r}" fill="${t.cor}" stroke="#fff" stroke-width="2.5"></circle>
    </g>`;
  }).join('');
  svg.innerHTML = `<path class="v-river" d="M 20 168 C 150 150, 250 190, 360 165 S 520 160, 585 178"></path>${zonas}${pins}`;
  const key = fn => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
  svg.querySelectorAll('.v-pin').forEach(p => { const f = () => selecionar(Number(p.dataset.id), true); p.addEventListener('click', f); p.addEventListener('keydown', key(f)); });
  svg.querySelectorAll('[data-zona]').forEach(g => { const f = () => selZona(g.dataset.zona); g.addEventListener('click', f); g.addEventListener('keydown', key(f)); });
}

function renderAlertas() {
  const lista = visiveis(), box = document.getElementById('alertList');
  if (!lista.length) { box.innerHTML = '<div class="v-card v-state">Nenhum alerta para esta combinação de filtros.</div>'; return; }
  box.innerHTML = lista.map(a => {
    const t = DEMO.tipos[a.tipo], z = DEMO.zonas.find(z => z.id === a.zona);
    return `<button type="button" class="v-alert ${t.cls} ${alertaSel === a.id ? 'sel' : ''}" data-id="${a.id}" aria-pressed="${alertaSel === a.id}">
      <div class="v-alert-top"><span class="v-alert-region">${esc(z.nome)}</span><span class="v-alert-type ${t.tag}">${t.label} · ${a.nivel}</span></div>
      <p><strong>${esc(a.titulo)}.</strong> ${esc(a.desc)}</p>
      <div class="v-alert-meta"><span>${esc(z.unidade)}</span><span>· ${esc(a.atualizado)} (simulado)</span></div>
    </button>`;
  }).join('');
  box.querySelectorAll('.v-alert').forEach(el => el.addEventListener('click', () => selecionar(Number(el.dataset.id), false)));
}

function renderRegiao() {
  const box = document.getElementById('regionPanel'), z = DEMO.zonas.find(x => x.id === zonaSel);
  if (!z) { box.innerHTML = '<p class="v-empty">Selecione uma região no mapa ou um alerta da lista para ver os detalhes.</p>'; return; }
  const als = ALERTAS.filter(a => a.zona === z.id), temUn = !/^Sem /.test(z.unidade);
  box.innerHTML = `<h3>${esc(z.nome)}</h3>
    <p class="v-region-un">${temUn ? `<strong>Unidade de saúde próxima:</strong> ${esc(z.unidade)}` : 'Nenhuma unidade de saúde cadastrada nesta região. Distâncias e localização ainda não estão disponíveis.'}</p>
    ${als.length ? als.map(a => { const t = DEMO.tipos[a.tipo]; return `<div class="v-region-al ${t.cls}"><span class="v-alert-type ${t.tag}">${t.label} · ${a.nivel}</span><p>${esc(a.titulo)}. ${esc(a.desc)}</p></div>`; }).join('') : '<p class="v-empty">Nenhum alerta demonstrativo nesta região.</p>'}
    <p class="v-meta-line">Dados demonstrativos · mapa esquemático</p>`;
}

function selecionar(id, scroll) {
  alertaSel = alertaSel === id ? null : id;
  if (alertaSel) zonaSel = ALERTAS.find(x => x.id === id).zona;
  renderMapa(); renderAlertas(); renderRegiao();
  if (alertaSel && scroll) { const el = document.querySelector(`.v-alert[data-id="${id}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}
function selZona(id) { zonaSel = id; alertaSel = null; renderMapa(); renderAlertas(); renderRegiao(); }

document.getElementById('integracaoNote').innerHTML =
  'Fonte atual: <code>AmbientDataSource.provider = "demo"</code>. Para integrar dados oficiais, implemente ' +
  '<code>getIndicadores()</code> e <code>getAlertas()</code> em <code>js/verde.js</code> usando <code>fetch()</code>; a interface permanece a mesma.';

// ---------- 3. PREVENÇÃO ----------
let catPrev = 'Todas';
function renderPrevencao() {
  chips('prevFiltros', ['Todas', ...new Set(Object.values(DEMO.catPrev))].map(c => ({ k: c, label: c })), catPrev, k => { catPrev = k; renderPrevencao(); });
  const feitos = VStore.get('check', {});
  const lista = DEMO.prevencao.filter(p => catPrev === 'Todas' || DEMO.catPrev[p.titulo] === catPrev);
  document.getElementById('prevGrid').innerHTML = lista.map(p => {
    const n = p.dicas.filter((d, i) => feitos[p.titulo + '|' + i]).length;
    return `<article class="v-card v-prev">
      <div class="v-ico ${p.cor}">${icon(p.icon, 20)}</div>
      <h3>${esc(p.titulo)}</h3>
      <p class="v-lead">${esc(p.lead)}</p>
      <ul class="v-tips v-checks">${p.dicas.map((d, i) => `<li><label><input type="checkbox" data-k="${esc(p.titulo)}|${i}" ${feitos[p.titulo + '|' + i] ? 'checked' : ''}><span>${esc(d)}</span></label></li>`).join('')}</ul>
      <p class="v-meta-line">${n} de ${p.dicas.length} itens do checklist feitos</p>
      ${p.alerta ? `<div class="v-alert-box"><strong>Atenção:</strong> ${esc(p.alerta)}</div>` : ''}
      <button type="button" class="btn-action-ghost v-share" data-t="${esc(p.titulo)}" aria-label="Compartilhar dicas sobre ${esc(p.titulo)}">Compartilhar</button>
    </article>`;
  }).join('') || '<div class="v-card v-state">Nenhum conteúdo nesta categoria.</div>';
  renderDesafios();
}
document.getElementById('prevGrid').addEventListener('change', e => {
  if (!e.target.matches('input[type=checkbox]')) return;
  const f = VStore.get('check', {}); f[e.target.dataset.k] = e.target.checked;
  if (!VStore.set('check', f)) toast('Não foi possível salvar neste navegador.', true);
  renderPrevencao();
});
document.getElementById('prevGrid').addEventListener('click', async e => {
  const b = e.target.closest('.v-share'); if (!b) return;
  const p = DEMO.prevencao.find(x => x.titulo === b.dataset.t);
  const texto = `${p.titulo} — VitalSync Verde\n${p.lead}\n• ${p.dicas.join('\n• ')}${p.alerta ? '\nAtenção: ' + p.alerta : ''}`;
  try {
    if (navigator.share) await navigator.share({ title: p.titulo, text: texto });
    else { await navigator.clipboard.writeText(texto); toast('Conteúdo copiado. Cole onde quiser compartilhar.'); }
  } catch (err) { if (err && err.name !== 'AbortError') toast('Não foi possível compartilhar. Tente copiar o texto manualmente.', true); }
});
function semanaId() { const d = new Date(); return d.getFullYear() + '_' + Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 6048e5); }
function renderDesafios() {
  const k = 'desafio_' + semanaId(), f = VStore.get(k, {}), n = DEMO.desafios.filter((x, i) => f[i]).length;
  document.getElementById('desafios').innerHTML = `<div class="v-chart-head"><div><h3>Desafios da semana</h3><p>Pequenas atitudes que cuidam da saúde e do ambiente. Marque o que você fez.</p></div><span class="v-chip">${n}/${DEMO.desafios.length}</span></div>
    <div class="v-meter" role="img" aria-label="${n} de ${DEMO.desafios.length} desafios concluídos"><span style="width:${n / DEMO.desafios.length * 100}%"></span></div>
    <ul class="v-tips v-checks">${DEMO.desafios.map((d, i) => `<li><label><input type="checkbox" data-i="${i}" ${f[i] ? 'checked' : ''}><span>${esc(d)}</span></label></li>`).join('')}</ul>${n === DEMO.desafios.length ? '<p class="v-ok">Desafios da semana concluídos. Obrigado por cuidar do ambiente!</p>' : ''}`;
  document.querySelectorAll('#desafios input').forEach(c => c.addEventListener('change', () => {
    f[c.dataset.i] = c.checked; if (!VStore.set(k, f)) toast('Não foi possível salvar neste navegador.', true); renderDesafios();
  }));
}

// ---------- 4. SUSTENTABILIDADE ----------
function renderSustentabilidade() {
  document.getElementById('kpiGrid').innerHTML = DEMO.kpis.map(k => `
    <article class="v-card v-kpi">
      <div class="v-ring" style="--p:0;--c:${k.cor}" data-p="${k.pct}"><b>${esc(k.txt)}</b></div>
      <div>
        <p class="v-kpi-label">${esc(k.label)}</p>
        <p class="v-kpi-title">${esc(k.titulo)}</p>
        <p class="v-kpi-desc">${esc(k.desc)}</p>
      </div>
    </article>`).join('');

  const max = Math.max(...DEMO.agua.valores);
  document.getElementById('aguaCols').innerHTML = DEMO.agua.valores.map((v, i) => {
    const now = i === DEMO.agua.valores.length - 1;
    return `<div class="v-col ${now ? 'now' : ''}"><em>${v}</em><span class="v-colbar" data-h="${(v / max) * 100}" style="height:0"></span></div>`;
  }).join('');
  document.getElementById('aguaLabels').innerHTML = DEMO.agua.meses.map(m => `<span>${m}</span>`).join('');
}
function animateSustentabilidade() {
  requestAnimationFrame(() => {
    document.querySelectorAll('.v-ring').forEach(r => r.style.setProperty('--p', r.dataset.p));
    document.querySelectorAll('.v-colbar').forEach(b => { b.style.height = (Number(b.dataset.h) * 0.82) + '%'; });
  });
}

// ---------- 4b. ACOMPANHAMENTO DA UNIDADE (dados digitados pelo usuário) ----------
const SUST = [{ k: 'agua', nome: 'Água', un: 'm³', ic: 'drop' }, { k: 'energia', nome: 'Energia', un: 'kWh', ic: 'sun' }, { k: 'residuos', nome: 'Resíduos', un: 'kg', ic: 'recycle' }];
const DICAS = {
  agua: 'Revise vazamentos em torneiras e descargas, instale arejadores e reutilize água na limpeza externa.',
  energia: 'Troque lâmpadas por LED, desligue equipamentos fora do expediente e aproveite a luz natural.',
  residuos: 'Reforce a separação na origem, reduza descartáveis e revise o estoque para evitar vencimentos.',
};
function renderSust() {
  const regs = VStore.get('sust', []).slice().sort((a, b) => a.mes.localeCompare(b.mes)), metas = VStore.get('metas', {});
  const box = document.getElementById('sustPainel');
  if (!regs.length) { box.innerHTML = '<div class="v-card v-state">Nenhum registro ainda. Informe o consumo do mês no formulário acima para ver gráficos, metas e sugestões.</div>'; return; }
  const last = regs[regs.length - 1], prev = regs[regs.length - 2];
  box.innerHTML = '<div class="v-grid v-grid-3">' + SUST.map(s => {
    const vals = regs.slice(-6), mx = Math.max(...vals.map(r => +r[s.k] || 0), 1);
    const v = +last[s.k] || 0, meta = +metas[s.k] || 0, pct = meta ? Math.min(100, Math.round(v / meta * 100)) : 0, over = meta && v > meta;
    const delta = prev && +prev[s.k] ? Math.round((v - prev[s.k]) / prev[s.k] * 100) : null;
    return `<article class="v-card"><div class="v-ind-head"><div class="v-ico">${icon(s.ic, 20)}</div><span class="v-chip ${meta ? (over ? 'bad' : '') : 'warn'}">${meta ? (over ? 'Acima da meta' : 'Dentro da meta') : 'Sem meta'}</span></div>
      <p class="v-ind-label">${s.nome} · ${mesLabel(last.mes)}</p>
      <div class="v-ind-value">${v}<small>${s.un}</small></div>
      <div class="v-meter" role="img" aria-label="${s.nome}: ${meta ? pct + '% da meta mensal' : 'sem meta definida'}"><span class="${over ? 'bad' : ''}" style="width:${pct}%"></span></div>
      <p class="v-ind-desc">${meta ? `${pct}% da meta de ${meta} ${s.un}` : 'Defina uma meta mensal para acompanhar o progresso.'}${delta !== null ? ` · ${delta > 0 ? '+' : ''}${delta}% vs. mês anterior` : ''}</p>
      <div class="v-columns v-mini" role="img" aria-label="Evolução mensal de ${s.nome.toLowerCase()}">${vals.map(r => `<div class="v-col"><span class="v-colbar" style="height:${(+r[s.k] || 0) / mx * 90}%"></span></div>`).join('')}</div>
      <div class="v-col-labels">${vals.map(r => `<span>${mesLabel(r.mes)}</span>`).join('')}</div>
      ${over ? `<div class="v-alert-box"><strong>Meta ultrapassada.</strong> ${DICAS[s.k]}</div>` : ''}</article>`;
  }).join('') + `</div>
  <div class="v-grid v-grid-2" style="margin-top:14px">
    <div class="v-card"><h3>Como reduzir desperdícios</h3><ul class="v-tips">${SUST.map(s => `<li><span><strong>${s.nome}:</strong> ${DICAS[s.k]}</span></li>`).join('')}</ul></div>
    <div class="v-card"><h3>Registros salvos</h3><ul class="v-reg">${regs.slice().reverse().map(r => `<li><span>${mesLabel(r.mes)}: ${r.agua} m³ · ${r.energia} kWh · ${r.residuos} kg</span><button type="button" class="btn-action-ghost v-del" data-mes="${esc(r.mes)}" aria-label="Excluir registro de ${mesLabel(r.mes)}">Excluir</button></li>`).join('')}</ul></div>
  </div>`;
}
document.getElementById('sustForm').addEventListener('submit', e => {
  e.preventDefault();
  const r = { mes: sMes.value, agua: +sAgua.value, energia: +sEnergia.value, residuos: +sRes.value };
  if (!r.mes || [r.agua, r.energia, r.residuos].some(x => isNaN(x) || x < 0)) { toast('Preencha o mês e valores iguais ou maiores que zero.', true); return; }
  const l = VStore.get('sust', []).filter(x => x.mes !== r.mes); l.push(r);
  if (!VStore.set('sust', l)) { toast('Não foi possível salvar neste navegador.', true); return; }
  e.target.reset(); renderSust(); toast('Registro salvo.');
});
document.getElementById('metaForm').addEventListener('submit', e => {
  e.preventDefault();
  const m = { agua: +mAgua.value || 0, energia: +mEnergia.value || 0, residuos: +mRes.value || 0 };
  if (!VStore.set('metas', m)) { toast('Não foi possível salvar neste navegador.', true); return; }
  renderSust(); toast('Metas salvas.');
});
document.getElementById('sustPainel').addEventListener('click', e => {
  const b = e.target.closest('.v-del'); if (!b) return;
  if (!confirm('Excluir o registro deste mês?')) return;
  VStore.set('sust', VStore.get('sust', []).filter(x => x.mes !== b.dataset.mes)); renderSust(); toast('Registro excluído.');
});
(function () { const m = VStore.get('metas', {}); mAgua.value = m.agua || ''; mEnergia.value = m.energia || ''; mRes.value = m.residuos || ''; })();

// ---------- 5. CENTRAL DE AÇÕES AMBIENTAIS ----------
const ACAO_CATS = ['Dengue', 'Calor intenso', 'Qualidade do ar', 'Água', 'Resíduos'];
const ACAO_PRIO = ['Alta', 'Média', 'Baixa'];
const ACAO_ST = ['Pendente', 'Em andamento', 'Concluída'];
const acoes = () => VStore.get('acoes', []);
function saveAcoes(l, msg) {
  if (!VStore.set('acoes', l)) { toast('Não foi possível salvar neste navegador.', true); return false; }
  renderBoard(); if (msg) toast(msg); return true;
}
function renderBoard() {
  const l = acoes(), hoje = new Date().toISOString().slice(0, 10);
  document.getElementById('acoesVazio').hidden = l.length > 0;
  document.getElementById('board').innerHTML = !l.length ? '' : ACAO_ST.map(st => {
    const it = l.filter(a => a.status === st);
    return `<section class="v-bcol" aria-label="${st}"><h3>${st} <span class="v-chip">${it.length}</span></h3>${it.length ? it.map(a => {
      const atraso = a.prazo && a.prazo < hoje && a.status !== 'Concluída';
      return `<article class="v-task"><div class="v-task-top"><span class="v-chip">${esc(a.categoria)}</span><span class="v-chip ${a.prioridade === 'Alta' ? 'bad' : a.prioridade === 'Média' ? 'warn' : ''}">Prioridade ${a.prioridade.toLowerCase()}</span>${a.publica ? '<span class="v-chip">Divulgada aos pacientes</span>' : ''}</div>
        <h4>${esc(a.titulo)}</h4>${a.descricao ? `<p>${esc(a.descricao)}</p>` : ''}
        <dl class="v-task-meta"><div><dt>Responsável</dt><dd>${a.responsavel ? esc(a.responsavel) : 'Não definido'}</dd></div><div><dt>Criada em</dt><dd>${fmtD(a.criadaEm)}</dd></div><div><dt>Prazo</dt><dd class="${atraso ? 'late' : ''}">${a.prazo ? fmtD(a.prazo) : 'Sem prazo'}${atraso ? ' · atrasada' : ''}</dd></div></dl>
        <div class="v-task-actions"><select data-st="${a.id}" aria-label="Status da ação ${esc(a.titulo)}">${ACAO_ST.map(s => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <button type="button" class="btn-action-ghost" data-ed="${a.id}" aria-label="Editar ${esc(a.titulo)}">Editar</button><button type="button" class="btn-action-ghost" data-del="${a.id}" aria-label="Excluir ${esc(a.titulo)}">Excluir</button></div></article>`;
    }).join('') : '<p class="v-empty">Nenhuma ação.</p>'}</section>`;
  }).join('');
}
function abrirAcao(a) {
  acaoDlgTitle.textContent = a ? 'Editar ação' : 'Nova ação';
  acId.value = a ? a.id : ''; acTitulo.value = a ? a.titulo : ''; acDesc.value = a ? a.descricao : '';
  acCat.value = a ? a.categoria : ACAO_CATS[0]; acPrio.value = a ? a.prioridade : 'Média';
  acResp.value = a ? a.responsavel : ''; acPrazo.value = a ? a.prazo : ''; acStatus.value = a ? a.status : 'Pendente';
  acPublica.checked = a ? !!a.publica : false;
  document.getElementById('acaoDialog').showModal(); acTitulo.focus();
}
fillSel('acCat', ACAO_CATS); fillSel('acPrio', ACAO_PRIO); fillSel('acStatus', ACAO_ST);
document.getElementById('novaAcao').addEventListener('click', () => abrirAcao(null));
document.getElementById('acCancel').addEventListener('click', () => document.getElementById('acaoDialog').close());
document.getElementById('acaoForm').addEventListener('submit', e => {
  e.preventDefault();
  const titulo = acTitulo.value.trim(); if (!titulo) { toast('Informe o título da ação.', true); return; }
  const l = acoes(), dados = { titulo, descricao: acDesc.value.trim(), categoria: acCat.value, prioridade: acPrio.value, responsavel: acResp.value.trim(), prazo: acPrazo.value, status: acStatus.value, publica: acPublica.checked };
  const i = l.findIndex(x => x.id === acId.value);
  if (i >= 0) l[i] = { ...l[i], ...dados }; else l.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), criadaEm: new Date().toISOString(), ...dados });
  if (saveAcoes(l, i >= 0 ? 'Ação atualizada.' : 'Ação criada.')) document.getElementById('acaoDialog').close();
});
document.getElementById('board').addEventListener('click', e => {
  const ed = e.target.closest('[data-ed]'), del = e.target.closest('[data-del]');
  if (ed) abrirAcao(acoes().find(a => a.id === ed.dataset.ed));
  if (del && confirm('Excluir esta ação?')) saveAcoes(acoes().filter(a => a.id !== del.dataset.del), 'Ação excluída.');
});
document.getElementById('board').addEventListener('change', e => {
  const s = e.target.closest('[data-st]'); if (!s) return;
  saveAcoes(acoes().map(a => a.id === s.dataset.st ? { ...a, status: s.value } : a), 'Status atualizado.');
});

// ---------- INICIALIZAÇÃO ----------
function renderMeta() {
  const s = AmbientDataSource;
  document.getElementById('envMeta').innerHTML = `<span class="v-chip ${s.isDemo ? 'warn' : ''}">${s.isDemo ? 'Dados simulados' : 'Dados reais'}</span><span>Fonte: ${esc(s.fonte)}</span><span>${s.atualizadoEm ? 'Última atualização: ' + fmtDT(s.atualizadoEm) : 'Sem atualização automática · exibido em ' + fmtDT(new Date())}</span>`;
}
function carregarIndicadores() {
  const box = document.getElementById('indicadores');
  box.innerHTML = '<div class="v-card v-state" role="status">Carregando indicadores…</div>';
  AmbientDataSource.getIndicadores().then(l => {
    if (!l || !l.length) { box.innerHTML = '<div class="v-card v-state">Sem dados ambientais disponíveis no momento.</div>'; return; }
    renderIndicadores(l);
  }).catch(() => {
    box.innerHTML = '<div class="v-card v-state v-err" role="alert">Não foi possível carregar os indicadores. <button type="button" class="btn-action-ghost" id="retryInd">Tentar novamente</button></div>';
    document.getElementById('retryInd').addEventListener('click', carregarIndicadores);
  });
  renderMeta();
}
carregarIndicadores();
renderDemanda();
animateDemanda();
renderFilaStats();
refreshMapa();
renderPrevencao();
renderSustentabilidade();
renderSust();
renderBoard();
