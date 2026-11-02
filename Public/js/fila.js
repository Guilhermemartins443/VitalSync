/* =========================================================
   FILA DE ESPERA EM TEMPO REAL — visão do paciente
   Modo 'api' (padrão, js/config.js): a fila é a REAL, vinda do back-end
   (js/fila-api.js) e atualizada sozinha a cada poucos segundos — quando
   o profissional chama/atende/finaliza em OUTRO aparelho, esta tela reage.
   Modo 'local' (demonstração): usa o VitalSyncStore (localStorage), que
   só sincroniza abas do mesmo navegador.
   O histórico e as receitas continuam vindo do VitalSyncStore (local).
========================================================= */

const PRIORITY = VitalSyncStore.PRIORITY;

// Fila real (API) ou simulada (localStorage), conforme js/config.js
const Dados = FilaAPI.ativo ? FilaAPI : VitalSyncStore;

Dados.seedIfEmpty();

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
const toastTitle = document.getElementById('toastTitle');
const receitasCard = document.getElementById('receitasCard');
const receitasContent = document.getElementById('receitasContent');
const historicoCard = document.getElementById('historicoCard');
const historicoContent = document.getElementById('historicoContent');

let historicoAbertoId = null;

let secondsSinceUpdate = 0;
let lastKnownChamadas = 0;     // pra detectar rechamada (mesmo status, nova chamada)
let lastKnownAhead = null;     // pra detectar "virei o próximo" (quantos estavam na minha frente)
let minhaAtual = null;         // minha senha ativa (para o cartão de avisos)
let carregou = !FilaAPI.ativo; // modo API: só "carregou" depois da 1ª resposta do servidor
let lastKnownStatus = null; // pra detectar a transição "virou minha vez"

// ---------- HELPERS ----------
// Espera = da ENTRADA do paciente na fila (createdAt) até ser CHAMADO (chamadoEm).
// Enquanto ainda aguarda, conta até agora; depois de chamado, o tempo congela.
function waitSeconds(entry) {
  const fim = entry.chamadoEm || Date.now();
  return Math.max(0, Math.floor((fim - entry.createdAt) / 1000));
}

function formatWait(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')} min`;
  if (m === 0) return `${s}s`;
  return `${m} min`;
}

function statusLabel(status) {
  if (status === 'chamando') return { text: 'Chamando', cls: 'status-chamando' };
  if (status === 'atendimento') return { text: 'Em atendimento', cls: 'status-atendimento' };
  if (status === 'desistencia') return { text: 'Não compareceu', cls: 'status-aguardando' };
  return { text: 'Aguardando', cls: 'status-aguardando' };
}

function ativos(fila) {
  return fila.filter(f => f.status !== 'finalizado' && f.status !== 'desistencia');
}

// só quem ainda está esperando conta como "fila" (quem foi chamado já saiu dela)
function aguardando(fila) {
  return fila.filter(f => f.status === 'aguardando');
}

function sortFila(fila) {
  return [...fila].sort((a, b) => a.level - b.level || a.createdAt - b.createdAt);
}

// Quantos que ainda aguardam estão na minha frente. `fila` já vem ordenada (prioridade, chegada).
// No modo API a posição exata vem do servidor (naFrente), sem empate de segundos.
function countAhead(fila, entry) {
  if (entry.naFrente !== undefined) return entry.naFrente;
  const i = fila.findIndex(f => f.id === entry.id);
  return i >= 0 ? i : 0;
}

const AVG_MIN_BY_LEVEL = { 0: 5, 1: 12, 2: 18, 3: 24 };

function estimateWaitMinutes(fila, entry) {
  // modo API: o servidor calcula com os atendimentos que de fato aconteceram na unidade
  if (entry.esperaEstimadaMin !== undefined) return entry.esperaEstimadaMin;
  const ahead = fila.slice(0, countAhead(fila, entry));
  const minutes = ahead.reduce((sum, f) => sum + (AVG_MIN_BY_LEVEL[f.level] || 15), 0);
  return Math.max(1, Math.round(minutes));
}

function showToast(msg, titulo = 'É a sua vez!') {
  toastTitle.textContent = titulo;
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
// modo API: vem do servidor (sessão do paciente); modo local: do localStorage
function meusAtendimentos() {
  return Dados.getMeusAtendimentos();
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
  Dados.confirmarCompra(atendimentoId, medId); // grava e a tela se redesenha sozinha
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
  const filaTodos = Dados.getFila();
  const fila = sortFila(aguardando(filaTodos));          // fila de espera
  const minhaId = Dados.getMinhaSenhaId();
  const minha = ativos(filaTodos).find(f => f.id === minhaId); // minha senha (aguardando, chamando ou em atendimento)
  const minhaBruta = filaTodos.find(f => f.id === minhaId); // inclui finalizada / não compareceu

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
  queueCount.textContent = carregou
    ? `${fila.length} ${fila.length === 1 ? 'pessoa' : 'pessoas'} na fila`
    : 'Carregando a fila...';

  // ---------- hero: minha posição ----------
  if (!minha) {
    heroCard.hidden = true;
    noTicketState.hidden = false;

    if (minhaBruta && minhaBruta.status === 'finalizado') {
      noTicketTitle.textContent = 'Atendimento finalizado';
      noTicketText.textContent = 'Seu atendimento foi concluído. Obrigado por usar o VitalSync.';
      noTicketBtn.textContent = 'Fazer uma nova avaliação';
    } else if (minhaBruta && minhaBruta.status === 'desistencia') {
      noTicketTitle.textContent = 'Você não compareceu à chamada';
      noTicketText.textContent = 'Sua senha foi encerrada porque você não respondeu quando foi chamado(a). Se ainda precisar de atendimento, faça uma nova avaliação para receber outra senha.';
      noTicketBtn.textContent = 'Fazer uma nova avaliação';
    } else {
      noTicketTitle.textContent = 'Você ainda não tem uma senha nesta fila';
      noTicketText.textContent = 'Descreva seus sintomas para entrar na fila de atendimento da unidade.';
      noTicketBtn.textContent = 'Descrever sintomas';
    }

    lastKnownStatus = null;
    lastKnownChamadas = 0;
    lastKnownAhead = null;
    minhaAtual = null;
    renderAlertas();
    return;
  }

  noTicketState.hidden = true;
  heroCard.hidden = false;

  const meta = PRIORITY[minha.level];
  // posição e estimativa só valem enquanto eu ainda aguardo; depois de chamado(a) já saí da fila
  const naFila = minha.status === 'aguardando';
  const ahead = countAhead(fila, minha);
  const chamadas = minha.chamadas || 1;

  heroTicket.textContent = minha.senha;
  heroPriority.innerHTML = `<span class="dot ${meta.dot}"></span> ${meta.label}`;
  heroPosition.textContent = naFila ? `${ahead + 1}º` : '—';
  heroWait.textContent = naFila ? `~${estimateWaitMinutes(fila, minha)} min` : '—';
  heroAhead.textContent = naFila ? ahead : 0;

  if (minha.status === 'chamando') {
    heroStatus.textContent = chamadas > 1 ? 'Você está sendo chamado(a) novamente!' : 'Você foi chamado(a)!';
    heroStatus.classList.add('calling');
  } else if (minha.status === 'atendimento') {
    heroStatus.textContent = 'Em atendimento';
    heroStatus.classList.add('calling');
  } else {
    heroStatus.textContent = 'Aguardando chamada';
    heroStatus.classList.remove('calling');
  }

  // ---------- toast: avisa quando o profissional acabou de chamar ----------
  // Chamado(a) agora, ou chamado(a) de novo: toast + som/vibração/notificação (se ativados)
  if (minha.status === 'chamando' && (lastKnownStatus !== 'chamando' || chamadas > lastKnownChamadas)) {
    const local = minha.guiche ? `Local de atendimento: ${minha.guiche}.` : 'Dirija-se à recepção.';
    showToast(chamadas > 1 ? `Você está sendo chamado(a) novamente. ${local}` : local);
    Avisos.chamado({ rechamada: chamadas > 1, senha: minha.senha, local });
  }
  // Virei o próximo da fila (só quando a posição MUDA para 1º, não ao abrir a página)
  if (naFila && ahead === 0 && lastKnownAhead !== null && lastKnownAhead > 0) {
    showToast('Fique por perto: a sua chamada deve ser em breve.', 'Você é o próximo!');
    Avisos.proximo({ senha: minha.senha });
  }
  lastKnownStatus = minha.status;
  lastKnownChamadas = minha.status === 'chamando' ? chamadas : 0;
  lastKnownAhead = naFila ? ahead : null;
  minhaAtual = minha;
  renderAlertas();
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

// ---------- CARTÃO "AVISOS NESTA TELA" ----------
const alertasCard = document.getElementById('alertasCard');
const alertasBtn = document.getElementById('alertasBtn');
const alertasStatus = document.getElementById('alertasStatus');
const alertasExtra = document.getElementById('alertasExtra');

function renderAlertas() {
  if (!minhaAtual) { alertasCard.hidden = true; return; }
  alertasCard.hidden = false;

  const s = Avisos.suporte;
  if (!s.som && !s.vibracao && !s.notificacao) {
    alertasStatus.textContent = 'Este aparelho não permite avisos nesta tela. Fique de olho nela e atento(a) à chamada.';
    alertasBtn.hidden = true;
  } else {
    const estado = Avisos.estado();
    alertasBtn.hidden = false;
    alertasBtn.classList.toggle('is-on', estado !== 'desligado');
    alertasBtn.textContent = estado === 'desligado' ? 'Ativar avisos' : 'Desativar avisos';
    alertasStatus.textContent = {
      desligado: 'Ative para ouvir um sinal e sentir a vibração quando for a sua vez.',
      toque: 'Avisos ativados. Toque em qualquer lugar da tela para liberar o som e mantenha esta página aberta.',
      ativo: 'Avisos ativados: som e vibração quando você for chamado(a). Mantenha esta página aberta.',
    }[estado];
  }

  alertasExtra.hidden = !minhaAtual.avisosAtivos;
  alertasExtra.textContent = minhaAtual.avisosAtivos
    ? 'Também vamos avisar por mensagem (WhatsApp/SMS) no telefone cadastrado.'
    : '';
}

alertasBtn.addEventListener('click', async () => {
  if (Avisos.estado() === 'desligado') await Avisos.ativar(); else Avisos.desativar();
  renderAlertas();
});

// re-renderiza assim que algo mudar no store (em outra aba ou nesta mesma)
Dados.onChange((key) => {
  if (key === VitalSyncStore.KEYS.FILA) { render(); renderPerfil(); }
});

// ---------- AVISOS (erro / sem conexão) E SINCRONIZAÇÃO ----------
const avisoSync = document.getElementById('avisoSync');
window.addEventListener('vitalsync:aviso', (e) => {
  const { tipo, mensagem } = e.detail;
  if (tipo === 'ok') { avisoSync.hidden = true; return; }
  avisoSync.textContent = mensagem;
  avisoSync.classList.toggle('is-rede', tipo === 'rede');
  avisoSync.hidden = false;
});
window.addEventListener('vitalsync:sync', () => {
  secondsSinceUpdate = 0;
  if (!carregou) { carregou = true; render(); }
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
if (Dados.iniciarPaciente) Dados.iniciarPaciente(); // modo API: começa a atualizar sozinho
