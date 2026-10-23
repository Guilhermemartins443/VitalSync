/* =========================================================
   MEU HISTÓRICO — aba do paciente
   Lê do VitalSyncStore (mesma fonte da fila e do painel) todos os
   atendimentos do paciente identificado em entrar.html/paciente.html.
   Não mostra "evolucoes": são anotações internas do profissional.
========================================================= */
const PRIORITY = VitalSyncStore.PRIORITY;
const SINTOMAS = VitalSyncStore.SINTOMAS_CATALOGO;
const TEMPO_LABEL = VitalSyncStore.TEMPO_INICIO_LABEL;

const semLogin = document.getElementById('semLogin');
const semAtendimentos = document.getElementById('semAtendimentos');
const conteudo = document.getElementById('conteudo');
const lista = document.getElementById('histLista');
const filtroVazio = document.getElementById('filtroVazio');

let filtro = 'todos';
const abertos = new Set(); // ids de atendimentos expandidos

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDateTime(ts) {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} às ${hh}:${mi}`;
}
function formatDate(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function statusInfo(s) {
  if (s === 'finalizado') return { text: 'Finalizado', cls: 'hist-st-fim' };
  if (s === 'atendimento') return { text: 'Em atendimento', cls: 'hist-st-ativo' };
  if (s === 'chamando') return { text: 'Chamando', cls: 'hist-st-ativo' };
  return { text: 'Aguardando', cls: 'hist-st-esp' };
}

function meusAtendimentos() {
  const p = VitalSyncStore.getPacienteAtual();
  if (!p) return [];
  return VitalSyncStore.getFila()
    .filter((f) => f.pacienteId === p.id)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- blocos de conduta (receitas + orientações) ----------
function medicamentosHtml(a) {
  const meds = (a.receitas || []).flatMap((r) => r.medicamentos || []);
  if (!meds.length) return '';
  return `<div class="med-list">` + meds.map((m) => `
    <div class="med-item" data-atendimento="${escapeHtml(a.id)}" data-med="${escapeHtml(m.id)}">
      <div class="med-info">
        <strong>${escapeHtml(m.nome)}</strong>
        <span>${escapeHtml(m.dosagem)} · ${escapeHtml(m.posologia)} · ${escapeHtml(m.duracao)}</span>
      </div>
      ${m.comprado
        ? '<span class="badge-confirmado">Compra/adesão confirmada</span>'
        : '<button type="button" class="btn-confirm-compra">Confirmar compra/adesão</button>'}
    </div>`).join('') + `</div>`;
}

function orientacoesHtml(a) {
  const itens = a.orientacoes || [];
  if (!itens.length) return '';
  return `<div class="orientacao-list">` + itens.map((o) => `
    <div class="orientacao-item">
      <p>${escapeHtml(o.texto)}</p>
      ${o.atestado ? `<span class="atestado-tag">Atestado médico · ${Number(o.diasAfastamento) || 0} dia(s) de afastamento</span>` : ''}
    </div>`).join('') + `</div>`;
}

function detalheHtml(a) {
  const sint = (a.sintomas || []).map((k) => (SINTOMAS[k] ? SINTOMAS[k].label : null)).filter(Boolean);
  const conduta = medicamentosHtml(a) + orientacoesHtml(a);
  return `
    <dl class="hist-dados">
      <div><dt>Sintomas marcados</dt><dd>${sint.length ? sint.map((s) => `<span class="hist-tag">${escapeHtml(s)}</span>`).join('') : 'Nenhum da lista'}</dd></div>
      <div><dt>Quando começou</dt><dd>${escapeHtml(TEMPO_LABEL[a.tempo_inicio] || '—')}</dd></div>
      <div><dt>Intensidade</dt><dd>${Number(a.intensidade) || 0} / 10</dd></div>
      <div><dt>Alergias / medicamentos em uso</dt><dd>${escapeHtml(a.alergias_medicamentos || '—')}</dd></div>
      <div><dt>Unidade</dt><dd>${escapeHtml(a.unidade_referencia || '—')}</dd></div>
    </dl>
    <h3 class="hist-sub">Receitas e orientações</h3>
    ${conduta || '<p class="evolucao-empty">Nenhuma receita ou orientação registrada neste atendimento.</p>'}
  `;
}

function filtrar(itens) {
  if (filtro === 'finalizado') return itens.filter((a) => a.status === 'finalizado');
  if (filtro === 'andamento') return itens.filter((a) => a.status !== 'finalizado');
  return itens;
}

// ---------- render ----------
function render() {
  const paciente = VitalSyncStore.getPacienteAtual();
  if (!paciente) {
    semLogin.hidden = false; semAtendimentos.hidden = true; conteudo.hidden = true;
    return;
  }
  semLogin.hidden = true;

  const todos = meusAtendimentos();
  if (!todos.length) {
    semAtendimentos.hidden = false; conteudo.hidden = true;
    return;
  }
  semAtendimentos.hidden = true; conteudo.hidden = false;

  document.getElementById('statTotal').textContent = todos.length;
  document.getElementById('statUltimo').textContent = formatDate(todos[0].createdAt);
  document.getElementById('statReceitas').textContent = todos
    .flatMap((a) => (a.receitas || []).flatMap((r) => r.medicamentos || [])).length;

  const itens = filtrar(todos);
  filtroVazio.hidden = itens.length > 0;

  lista.innerHTML = itens.map((a) => {
    const meta = PRIORITY[a.level] || PRIORITY[3];
    const st = statusInfo(a.status);
    const aberto = abertos.has(a.id);
    return `
      <article class="historico-item hist-item">
        <button type="button" class="historico-toggle hist-toggle" data-id="${escapeHtml(a.id)}" aria-expanded="${aberto}">
          <span class="hist-toggle-main">
            <span class="hist-data">${escapeHtml(formatDateTime(a.createdAt))}</span>
            <span class="hist-senha">Senha ${escapeHtml(a.senha)} · <span class="dot ${escapeHtml(meta.dot)}"></span>${escapeHtml(meta.label)}</span>
          </span>
          <span class="hist-status ${st.cls}">${escapeHtml(st.text)}</span>
        </button>
        <p class="historico-desc">${escapeHtml(a.descricao || '—')}</p>
        ${aberto ? `<div class="historico-conduta">${detalheHtml(a)}</div>` : ''}
      </article>`;
  }).join('');
}

// ---------- eventos ----------
lista.addEventListener('click', (e) => {
  const toggle = e.target.closest('.hist-toggle');
  if (toggle) {
    const id = toggle.dataset.id;
    if (abertos.has(id)) abertos.delete(id); else abertos.add(id);
    render();
    return;
  }
  const btn = e.target.closest('.btn-confirm-compra');
  if (btn) {
    const row = btn.closest('.med-item');
    const f = VitalSyncStore.getFilaEntry(row.dataset.atendimento);
    if (!f) return;
    const receitas = f.receitas || [];
    receitas.forEach((r) => {
      const med = (r.medicamentos || []).find((m) => m.id === row.dataset.med);
      if (med) { med.comprado = true; med.compradoEm = Date.now(); }
    });
    VitalSyncStore.updateFilaEntry(f.id, { receitas }); // dispara onChange -> render
  }
});

document.querySelectorAll('.hist-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    filtro = chip.dataset.filtro;
    document.querySelectorAll('.hist-chip').forEach((c) => c.classList.toggle('active', c === chip));
    render();
  });
});

// topbar com nome/unidade reais
(function topbar() {
  const p = VitalSyncStore.getPacienteAtual();
  if (!p) return;
  const primeiro = String(p.nome_completo || '').trim().split(/\s+/)[0];
  if (primeiro) document.getElementById('userName').textContent = `Olá, ${primeiro}`;
  if (p.unidade_referencia) document.getElementById('unitPill').textContent = p.unidade_referencia;
})();

// atualiza sozinho quando o profissional receita/finaliza (outra aba ou esta)
VitalSyncStore.onChange((key) => {
  if (key === VitalSyncStore.KEYS.FILA) render();
});

render();
