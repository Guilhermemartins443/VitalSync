/* =========================================================
   FILA DE ESPERA EM TEMPO REAL — visão do paciente
   Lê a fila real do VitalSyncStore (js/store.js), compartilhada
   com o painel do profissional (js/painel.js) via localStorage.
   Sincroniza entre abas do mesmo navegador: quando o profissional
   chama/atende/finaliza, esta tela reage sozinha.
========================================================= */

const PRIORITY = VitalSyncStore.PRIORITY;

VitalSyncStore.seedIfEmpty();

// ---------- ELEMENTOS ----------
const noTicketState = document.getElementById('noTicketState');
const noTicketTitle = document.getElementById('noTicketTitle');
const noTicketText = document.getElementById('noTicketText');
const noTicketBtn = document.getElementById('noTicketBtn');
const heroCard = document.getElementById('heroCard');
const heroTicket = document.getElementById('heroTicket');
const heroPriority = document.getElementById('heroPriority');
const heroPosition = document.getElementById('heroPosition');
const heroWait = document.getElementById('heroWait');
const heroAhead = document.getElementById('heroAhead');
const heroStatus = document.getElementById('heroStatus');
const summaryGrid = document.getElementById('summaryGrid');
const queueList = document.getElementById('queueList');
const queueCount = document.getElementById('queueCount');
const liveUpdated = document.getElementById('liveUpdated');
const toast = document.getElementById('calledToast');
const toastBody = document.getElementById('toastBody');
const receitasCard = document.getElementById('receitasCard');
const receitasContent = document.getElementById('receitasContent');
const historicoCard = document.getElementById('historicoCard');
const historicoContent = document.getElementById('historicoContent');

let historicoAbertoId = null;

let secondsSinceUpdate = 0;
let lastKnownStatus = null; // pra detectar a transição "virou minha vez"

// ---------- HELPERS ----------
function waitSeconds(entry) {
  return Math.max(0, Math.floor((Date.now() - entry.createdAt) / 1000));
}

function formatWait(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m} min`;
}

function statusLabel(status) {
  if (status === 'chamando') return { text: 'Chamando', cls: 'status-chamando' };
  if (status === 'atendimento') return { text: 'Em atendimento', cls: 'status-atendimento' };
  return { text: 'Aguardando', cls: 'status-aguardando' };
}

function ativos(fila) {
  return fila.filter(f => f.status !== 'finalizado');
}

function sortFila(fila) {
  return [...fila].sort((a, b) => a.level - b.level || a.createdAt - b.createdAt);
}

function countAhead(fila, entry) {
  return fila.filter(f => f !== entry && (
    f.level < entry.level || (f.level === entry.level && f.createdAt < entry.createdAt)
  )).length;
}

const AVG_MIN_BY_LEVEL = { 0: 5, 1: 12, 2: 18, 3: 24 };

function estimateWaitMinutes(fila, entry) {
  const ahead = fila.filter(f => f !== entry && (
    f.level < entry.level || (f.level === entry.level && f.createdAt < entry.createdAt)
  ));
  const minutes = ahead.reduce((sum, f) => sum + (AVG_MIN_BY_LEVEL[f.level] || 15), 0);
  return Math.max(1, Math.round(minutes));
}

function showToast(msg) {
  toastBody.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 6000);
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDateTime(ts) {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

// ---------- MEUS ATENDIMENTOS (histórico completo do paciente logado) ----------
function meusAtendimentos() {
  const paciente = VitalSyncStore.getPacienteAtual();
  if (!paciente) return [];
  return VitalSyncStore.getFila()
    .filter(f => f.pacienteId === paciente.id)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- RECEITAS, CONDUTAS E CONFIRMAÇÃO DE COMPRA/ADESÃO ----------
function medicamentosHtml(atendimento) {
  const meds = (atendimento.receitas || []).flatMap(r => r.medicamentos);
  if (!meds.length) return '';
  return meds.map(med => `
    <div class="med-item" data-atendimento="${escapeHtml(atendimento.id)}" data-med="${escapeHtml(med.id)}">
      <div class="med-info">
        <strong>${escapeHtml(med.nome)}</strong>
        <span>${escapeHtml(med.dosagem)} · ${escapeHtml(med.posologia)} · ${escapeHtml(med.duracao)}</span>
      </div>
      ${med.comprado
        ? '<span class="badge-confirmado">Compra/adesão confirmada</span>'
        : '<button type="button" class="btn-confirm-compra">Confirmar compra/adesão</button>'}
    </div>
  `).join('');
}

function orientacoesHtml(atendimento) {
  const lista = atendimento.orientacoes || [];
  if (!lista.length) return '';
  return lista.map(o => `
    <div class="orientacao-item">
      <p>${escapeHtml(o.texto)}</p>
      ${o.atestado ? `<span class="atestado-tag">Atestado médico · ${Number(o.diasAfastamento) || 0} dia(s) de afastamento</span>` : ''}
    </div>
  `).join('');
}

function condutaBlocoHtml(atendimento) {
  const meds = medicamentosHtml(atendimento);
  const orientacoes = orientacoesHtml(atendimento);
  if (!meds && !orientacoes) return '<p class="evolucao-empty">Nenhuma receita ou orientação registrada neste atendimento.</p>';
  return `
    ${meds ? `<div class="med-list">${meds}</div>` : ''}
    ${orientacoes ? `<div class="orientacao-list">${orientacoes}</div>` : ''}
  `;
}

function renderReceitasCard() {
  const atendimentos = meusAtendimentos();
  const comConduta = atendimentos.filter(a => (a.receitas && a.receitas.length) || (a.orientacoes && a.orientacoes.length));

  if (!comConduta.length) {
    receitasCard.hidden = true;
    return;
  }
  receitasCard.hidden = false;

  const maisRecente = comConduta[0];
  receitasContent.innerHTML = `
    <p class="profile-subnote">Referente ao atendimento de ${formatDateTime(maisRecente.createdAt)} · senha ${escapeHtml(maisRecente.senha)}</p>
    ${condutaBlocoHtml(maisRecente)}
  `;

  receitasContent.querySelectorAll('.btn-confirm-compra').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('.med-item');
      confirmarCompra(row.dataset.atendimento, row.dataset.med);
    });
  });
}

function confirmarCompra(atendimentoId, medId) {
  const f = VitalSyncStore.getFilaEntry(atendimentoId);
  if (!f) return;
  const receitas = f.receitas || [];
  receitas.forEach(r => {
    const med = r.medicamentos.find(m => m.id === medId);
    if (med) { med.comprado = true; med.compradoEm = Date.now(); }
  });
  VitalSyncStore.updateFilaEntry(f.id, { receitas });
}

// ---------- HISTÓRICO DE CONSULTAS ANTERIORES ----------
function renderHistoricoCard() {
  const atendimentos = meusAtendimentos();

  if (atendimentos.length < 2) {
    historicoCard.hidden = true;
    return;
  }
  historicoCard.hidden = false;

  historicoContent.innerHTML = atendimentos.map(a => {
    const st = statusLabel(a.status);
    const aberto = historicoAbertoId === a.id;
    return `
      <div class="historico-item">
        <button type="button" class="historico-toggle" data-id="${escapeHtml(a.id)}">
          <span>${formatDateTime(a.createdAt)} · Senha ${escapeHtml(a.senha)}</span>
          <span class="q-status ${a.status === 'finalizado' ? 'status-aguardando' : escapeHtml(st.cls)}">${a.status === 'finalizado' ? 'Finalizado' : escapeHtml(st.text)}</span>
        </button>
        <p class="historico-desc">${escapeHtml(a.descricao || '—')}</p>
        <div class="historico-conduta" ${aberto ? '' : 'hidden'}>${aberto ? condutaBlocoHtml(a) : ''}</div>
      </div>
    `;
  }).join('');

  historicoContent.querySelectorAll('.historico-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      historicoAbertoId = historicoAbertoId === btn.dataset.id ? null : btn.dataset.id;
      renderHistoricoCard();
    });
  });
}

// ---------- RENDER ----------
function render() {
  const filaTodos = VitalSyncStore.getFila();
  const fila = sortFila(ativos(filaTodos));
  const minhaId = VitalSyncStore.getMinhaSenhaId();
  const minha = fila.find(f => f.id === minhaId);
  const minhaBruta = filaTodos.find(f => f.id === minhaId); // inclui finalizados

  // ---------- resumo por prioridade ----------
  PRIORITY.forEach(p => {
    const el = summaryGrid.querySelector(`[data-count="${p.level}"]`);
    const n = fila.filter(f => f.level === p.level).length;
    if (el) el.textContent = n;
  });

  // ---------- lista da fila (só senha + prioridade + espera + status, por privacidade) ----------
  queueList.innerHTML = '';
  fila.forEach(f => {
    const meta = PRIORITY[f.level];
    const st = statusLabel(f.status);
    const row = document.createElement('div');
    row.className = `queue-row${f.id === minhaId ? ' is-you' : ''}`;

    row.innerHTML = `
      <div class="q-ticket">${escapeHtml(f.senha)}${f.id === minhaId ? '<span class="you-tag">VOCÊ</span>' : ''}</div>
      <div class="q-priority"><span class="dot ${meta.dot}"></span>${meta.label}</div>
      <div class="q-wait">${formatWait(waitSeconds(f))}</div>
      <div class="q-status ${escapeHtml(st.cls)}">${escapeHtml(st.text)}</div>
    `;
    queueList.appendChild(row);
  });
  queueCount.textContent = `${fila.length} ${fila.length === 1 ? 'pessoa' : 'pessoas'} na fila`;

  // ---------- hero: minha posição ----------
  if (!minha) {
    heroCard.hidden = true;
    noTicketState.hidden = false;

    if (minhaBruta && minhaBruta.status === 'finalizado') {
      noTicketTitle.textContent = 'Atendimento finalizado';
      noTicketText.textContent = 'Seu atendimento foi concluído. Obrigado por usar o VitalSync.';
      noTicketBtn.textContent = 'Fazer uma nova avaliação';
    } else {
      noTicketTitle.textContent = 'Você ainda não tem uma senha nesta fila';
      noTicketText.textContent = 'Descreva seus sintomas para entrar na fila de atendimento da unidade.';
      noTicketBtn.textContent = 'Descrever sintomas';
    }

    lastKnownStatus = null;
    return;
  }

  noTicketState.hidden = true;
  heroCard.hidden = false;

  const meta = PRIORITY[minha.level];
  const position = countAhead(fila, minha) + 1;
  const waitMin = estimateWaitMinutes(fila, minha);

  heroTicket.textContent = minha.senha;
  heroPriority.innerHTML = `<span class="dot ${meta.dot}"></span> ${meta.label}`;
  heroPosition.textContent = `${position}º`;
  heroWait.textContent = position === 1 && minha.status !== 'aguardando' ? '—' : `~${waitMin} min`;
  heroAhead.textContent = countAhead(fila, minha);

  if (minha.status === 'chamando') {
    heroStatus.textContent = 'Você foi chamado(a)!';
    heroStatus.classList.add('calling');
  } else if (minha.status === 'atendimento') {
    heroStatus.textContent = 'Em atendimento';
    heroStatus.classList.add('calling');
  } else {
    heroStatus.textContent = 'Aguardando chamada';
    heroStatus.classList.remove('calling');
  }

  // ---------- toast: avisa quando o profissional acabou de chamar ----------
  if (minha.status === 'chamando' && lastKnownStatus !== 'chamando') {
    showToast(minha.guiche ? `Dirija-se ao ${minha.guiche} para ser atendido(a).` : 'Dirija-se à recepção para ser atendido(a).');
  }
  lastKnownStatus = minha.status;
}

function renderPerfil() {
  renderReceitasCard();
  renderHistoricoCard();
}

// ---------- TEMPO REAL ----------
function tick() {
  secondsSinceUpdate += 1;
  liveUpdated.textContent = secondsSinceUpdate <= 1 ? 'atualizado agora' : `atualizado há ${secondsSinceUpdate}s`;
  render();
}

// re-renderiza assim que algo mudar no store (em outra aba ou nesta mesma)
VitalSyncStore.onChange((key) => {
  if (key === VitalSyncStore.KEYS.FILA) { render(); renderPerfil(); }
});

// ---------- TOPBAR: nome e unidade do paciente logado ----------
(function preencherTopbar() {
  const p = VitalSyncStore.getPacienteAtual();
  if (!p) return;
  const primeiro = String(p.nome_completo || '').trim().split(/\s+/)[0];
  if (primeiro) document.getElementById('userName').textContent = `Olá, ${primeiro}`;
  if (p.unidade_referencia) document.getElementById('unitPill').textContent = p.unidade_referencia;
})();

// ---------- INIT ----------
render();
renderPerfil();
setInterval(tick, 1000);
