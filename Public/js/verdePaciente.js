/* =========================================================
   VITALSYNC VERDE — visão do PACIENTE (somente leitura)
   -----------------------------------------------------------
   Usa os mesmos dados e componentes de verde.html:
     · dados ambientais, ícones e utilitários -> js/verdeDados.js
     · campanhas -> as "Ações ambientais" que o profissional marcou
       com "Divulgar aos pacientes" em verde.html (VStore 'acoes').
   Nada aqui altera dados da equipe. Os únicos registros gravados
   são as marcações pessoais do paciente (checklists), no navegador.
   Mesmo limite do resto do protótipo: localStorage é por navegador;
   com back-end, trocar acoesPublicas() por um fetch().
========================================================= */

// ---------- TOPBAR: paciente identificado (se houver) ----------
(function topbar() {
  let p = null;
  try { p = VitalSyncStore.getPacienteAtual(); } catch (e) { p = null; }
  const userName = document.getElementById('userName');
  const primeiro = p && p.nome ? String(p.nome).trim().split(/\s+/)[0] : '';
  if (primeiro) userName.textContent = `Olá, ${primeiro}`; else userName.style.display = 'none';
  if (p && p.unidade_referencia) document.getElementById('unitPill').textContent = p.unidade_referencia;
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
}
tabButtons.forEach(b => b.addEventListener('click', () => goToTab(b.dataset.tab)));

// ---------- 1. COMO ESTÁ HOJE ----------
function renderIndicadores(list) {
  // umidade primeiro: é o que o paciente mais costuma procurar
  const ordem = [...list].sort((a, b) => (b.id === 'umid') - (a.id === 'umid'));
  document.getElementById('indicadores').innerHTML = ordem.map(i => `
    <article class="v-card">
      <div class="v-ind-head">
        <div class="v-ico ${i.cls}">${icon(i.icon, 20)}</div>
        <span class="v-chip ${i.level === 'ok' ? '' : i.level}"><span class="v-lv" aria-hidden="true">${i.level === 'bad' ? '▲' : i.level === 'warn' ? '●' : '✓'}</span> ${esc(i.chip)}</span>
      </div>
      <p class="v-ind-label">${esc(i.label)}</p>
      <div class="v-ind-value">${esc(i.value)}<small>${esc(i.unit)}</small></div>
      <div class="v-meter" role="img" aria-label="${esc(i.label)}: ${i.pct}% da escala"><span class="${i.level === 'ok' ? '' : i.level}" style="width:${i.pct}%"></span></div>
      ${DEMO.series[i.id] ? `<div class="v-trend ${i.level}">${spark(DEMO.series[i.id])}<small>Tendência · 7 dias (simulada)</small></div>` : '<p class="v-ind-desc">Sem dados de tendência.</p>'}
      ${DEMO.guia[i.id] ? `<p class="v-ind-desc"><strong>Impacto na saúde:</strong> ${esc(DEMO.guia[i.id].impacto)}</p><p class="v-ind-rec"><strong>Prevenção:</strong> ${esc(DEMO.guia[i.id].rec)}</p>` : `<p class="v-ind-desc">${esc(i.desc)}</p>`}
    </article>`).join('');
}
function renderMeta() {
  const s = AmbientDataSource;
  document.getElementById('envMeta').innerHTML = `<span class="v-chip ${s.isDemo ? 'warn' : ''}">${s.isDemo ? 'Dados simulados' : 'Dados reais'}</span><span>Fonte: ${esc(s.fonte)}</span><span>${s.atualizadoEm ? 'Última atualização: ' + fmtDT(s.atualizadoEm) : 'Exibido em ' + fmtDT(new Date())}</span>`;
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

// ---------- 2. CAMPANHAS DA EQUIPE ----------
const ACAO_ORDEM = { 'Em andamento': 0, 'Pendente': 1, 'Concluída': 2 };
const ACAO_ROTULO = { 'Em andamento': 'Em andamento', 'Pendente': 'Em breve', 'Concluída': 'Encerrada' };
let campCat = 'Todas';

// só o que o profissional marcou como "Divulgar aos pacientes"
function acoesPublicas() {
  return VStore.get('acoes', [])
    .filter(a => a && a.publica)
    .sort((a, b) => (ACAO_ORDEM[a.status] ?? 9) - (ACAO_ORDEM[b.status] ?? 9) || String(b.criadaEm).localeCompare(String(a.criadaEm)));
}
function renderCampanhas() {
  const todas = acoesPublicas();
  const badge = document.getElementById('campCount');
  const ativas = todas.filter(a => a.status !== 'Concluída').length;
  badge.textContent = ativas; badge.hidden = !ativas;

  const cats = ['Todas', ...new Set(todas.map(a => a.categoria))];
  if (!cats.includes(campCat)) campCat = 'Todas';
  chips('campFiltros', cats.map(c => ({ k: c, label: c })), campCat, k => { campCat = k; renderCampanhas(); });
  document.getElementById('campFiltros').hidden = todas.length < 2;

  const lista = todas.filter(a => campCat === 'Todas' || a.categoria === campCat);
  const vazio = document.getElementById('campVazio');
  vazio.hidden = lista.length > 0;
  if (!todas.length) vazio.textContent = 'A equipe ainda não divulgou campanhas. Quando houver uma campanha ou orientação nova (dengue, calor, qualidade do ar…), ela aparece aqui.';
  else if (!lista.length) vazio.textContent = 'Nenhuma campanha nesta categoria.';

  const hoje = new Date().toISOString().slice(0, 10);
  document.getElementById('campGrid').innerHTML = lista.map(a => {
    const enc = a.status === 'Concluída', atraso = a.prazo && a.prazo < hoje && !enc;
    const cls = a.status === 'Em andamento' ? '' : enc ? 'warn' : 'warn';
    return `<article class="v-task">
      <div class="v-task-top"><span class="v-chip">${esc(a.categoria)}</span><span class="v-chip ${cls}">${esc(ACAO_ROTULO[a.status] || a.status)}</span>${a.prioridade === 'Alta' && !enc ? '<span class="v-chip bad">Importante</span>' : ''}</div>
      <h4>${esc(a.titulo)}</h4>${a.descricao ? `<p>${esc(a.descricao)}</p>` : ''}
      <dl class="v-task-meta">
        <div><dt>Divulgada por</dt><dd>${a.responsavel ? esc(a.responsavel) : 'Equipe de saúde'}</dd></div>
        <div><dt>Publicada em</dt><dd>${fmtD(a.criadaEm)}</dd></div>
        ${a.prazo ? `<div><dt>${enc ? 'Encerrou em' : atraso ? 'Prevista até' : 'Até'}</dt><dd>${fmtD(a.prazo)}</dd></div>` : ''}
      </dl>
      <div class="v-task-actions"><button type="button" class="btn-action-ghost v-share" data-id="${esc(a.id)}" aria-label="Compartilhar a campanha ${esc(a.titulo)}">Compartilhar</button></div>
    </article>`;
  }).join('');
}
document.getElementById('campGrid').addEventListener('click', async e => {
  const b = e.target.closest('.v-share'); if (!b) return;
  const a = acoesPublicas().find(x => x.id === b.dataset.id); if (!a) return;
  const texto = `${a.titulo} — VitalSync Verde\n${a.descricao || ''}${a.prazo ? `\nAté ${fmtD(a.prazo)}` : ''}`.trim();
  try {
    if (navigator.share) await navigator.share({ title: a.titulo, text: texto });
    else { await navigator.clipboard.writeText(texto); toast('Campanha copiada. Cole onde quiser compartilhar.'); }
  } catch (err) { if (err && err.name !== 'AbortError') toast('Não foi possível compartilhar. Tente copiar o texto manualmente.', true); }
});
// atualiza sozinha quando a equipe publica/edita (outra aba do mesmo navegador)
window.addEventListener('storage', e => { if (!e.key || e.key === 'vitalsync_verde_acoes') renderCampanhas(); });

// ---------- 3. MAPA DE ALERTAS (somente leitura, igual ao do profissional) ----------
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

// ---------- 4. PREVENÇÃO (mesmo conteúdo e checklists pessoais do verde.html) ----------
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

// ---------- INICIALIZAÇÃO ----------
carregarIndicadores();
renderCampanhas();
refreshMapa();
renderPrevencao();
