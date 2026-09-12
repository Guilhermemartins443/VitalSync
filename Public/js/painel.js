/* =========================================================
   PAINEL DO PROFISSIONAL — FILA + DETALHES DO PACIENTE
   Lê e escreve na mesma fila compartilhada do VitalSyncStore
   (js/store.js) usada pela tela do paciente (js/fila.js).
   Quando o profissional chama/atende/finaliza um paciente,
   a mudança aparece sozinha na tela desse paciente (outra aba
   do mesmo navegador) — e vice-versa, quando um paciente novo
   envia sintomas, ele aparece aqui sem precisar recarregar.
========================================================= */

const PRIORITY = VitalSyncStore.PRIORITY;
const SINTOMAS_CATALOGO = VitalSyncStore.SINTOMAS_CATALOGO;
const TEMPO_INICIO_LABEL = VitalSyncStore.TEMPO_INICIO_LABEL;

VitalSyncStore.seedIfEmpty();

let selectedId = null;
let secondsSinceUpdate = 0;

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

function formatCpf(cpf) {
  if (!cpf || cpf.length !== 11) return cpf || '—';
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function calcAge(iso) {
  if (!iso) return null;
  const birth = new Date(iso);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function statusLabel(status) {
  if (status === 'chamando') return { text: 'Chamando', cls: 'status-chamando' };
  if (status === 'atendimento') return { text: 'Em atendimento', cls: 'status-atendimento' };
  if (status === 'finalizado') return { text: 'Finalizado', cls: 'status-aguardando' };
  return { text: 'Aguardando', cls: 'status-aguardando' };
}

function sortFila(fila) {
  return [...fila].sort((a, b) => a.level - b.level || a.createdAt - b.createdAt);
}

// junta cada entrada da fila com os dados do paciente correspondente
function filaComPacientes() {
  return VitalSyncStore.getFila().map(f => ({
    ...f,
    paciente: VitalSyncStore.getPaciente(f.pacienteId) || {},
  }));
}

// ---------- ELEMENTOS ----------
const summaryGrid = document.getElementById('summaryGrid');
const queueList = document.getElementById('queueList');
const queueCount = document.getElementById('queueCount');
const liveUpdated = document.getElementById('liveUpdated');
const userName = document.getElementById('userName');
const unitPill = document.getElementById('unitPill');
const tabDetalhesBadge = document.getElementById('tabDetalhesBadge');

const detalhesEmpty = document.getElementById('detalhesEmpty');
const detalhesContent = document.getElementById('detalhesContent');

// ---------- TOPBAR: nome do profissional logado ----------
(function loadProfissional() {
  try {
    const nome = localStorage.getItem('vitalsync_profissional_nome');
    const unidade = localStorage.getItem('vitalsync_profissional_unidade');
    if (nome) userName.textContent = `Olá, ${nome}`;
    if (unidade) unitPill.textContent = unidade;
  } catch (err) {
    // localStorage indisponível — segue com os valores padrão do HTML
  }
})();

// ---------- ABAS ----------
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

function goToTab(tab) {
  tabButtons.forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  tabPanels.forEach(panel => panel.classList.toggle('active', panel.dataset.panel === tab));
}

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => goToTab(btn.dataset.tab));
});

// ---------- RENDER: RESUMO ----------
function renderSummary(fila) {
  PRIORITY.forEach(p => {
    const el = summaryGrid.querySelector(`[data-count="${p.level}"]`);
    const n = fila.filter(f => f.level === p.level && f.status !== 'finalizado').length;
    if (el) el.textContent = n;
  });
}

// ---------- RENDER: FILA ----------
function renderQueue() {
  const fila = filaComPacientes();
  const visiveis = sortFila(fila.filter(f => f.status !== 'finalizado'));

  queueList.innerHTML = '';

  visiveis.forEach(f => {
    const meta = PRIORITY[f.level];
    const st = statusLabel(f.status);
    const row = document.createElement('div');
    row.className = `painel-row${f.id === selectedId ? ' is-selected' : ''}`;
    row.dataset.id = f.id;
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');

    row.innerHTML = `
      <div class="p-ticket">${f.senha}</div>
      <div class="p-name">${f.paciente.nome_completo || 'Paciente não identificado'}</div>
      <div class="p-priority"><span class="dot ${meta.dot}"></span>${meta.label}</div>
      <div class="p-wait">${formatWait(waitSeconds(f))}</div>
      <div class="p-status ${st.cls}">${st.text}</div>
      <div class="p-action">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    `;

    row.addEventListener('click', () => selectPatient(f.id, true));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectPatient(f.id, true);
      }
    });

    queueList.appendChild(row);
  });

  queueCount.textContent = `${visiveis.length} ${visiveis.length === 1 ? 'paciente' : 'pacientes'} na fila`;
  renderSummary(fila);
}

// ---------- RENDER: DETALHES DO PACIENTE ----------
function selectPatient(id, switchTab) {
  selectedId = id;
  renderQueue();
  renderDetails();
  if (switchTab) goToTab('detalhes');
}

function renderDetails() {
  const f = filaComPacientes().find(q => q.id === selectedId);

  if (!f) {
    detalhesEmpty.hidden = false;
    detalhesContent.hidden = true;
    tabDetalhesBadge.hidden = true;
    return;
  }

  const p = f.paciente;
  detalhesEmpty.hidden = true;
  detalhesContent.hidden = false;
  tabDetalhesBadge.hidden = false;
  tabDetalhesBadge.textContent = f.senha;

  const meta = PRIORITY[f.level];
  const idade = calcAge(p.data_nascimento);

  document.getElementById('pdNome').textContent = p.nome_completo || 'Paciente não identificado';
  document.getElementById('pdMeta').textContent = `${idade !== null ? idade + ' anos · ' : ''}Senha ${f.senha}`;
  document.getElementById('pdPriority').innerHTML = `<span class="dot ${meta.dot}"></span> ${meta.label}`;

  document.getElementById('pdCpf').textContent = formatCpf(p.cpf);
  document.getElementById('pdNasc').textContent = formatDate(p.data_nascimento);
  document.getElementById('pdCns').textContent = p.cns || '—';
  document.getElementById('pdTel').textContent = p.telefone || '—';
  document.getElementById('pdEmail').textContent = p.email || '—';
  document.getElementById('pdUnidade').textContent = f.unidade_referencia || p.unidade_referencia || '—';

  document.getElementById('pdDescricao').textContent = f.descricao || '—';
  document.getElementById('pdInicio').textContent = TEMPO_INICIO_LABEL[f.tempo_inicio] || '—';
  document.getElementById('pdIntensidade').textContent = `${f.intensidade}/10`;
  document.getElementById('pdAlergias').textContent = f.alergias_medicamentos || 'Nenhuma relatada.';

  const chipRow = document.getElementById('pdSintomas');
  chipRow.innerHTML = (f.sintomas || []).map(chave => {
    const s = SINTOMAS_CATALOGO[chave];
    if (!s) return '';
    return `<span class="chip${s.redFlag ? ' red-flag' : ''}">${s.label}</span>`;
  }).join('');

  document.getElementById('pdSenha').textContent = f.senha;
  const st = statusLabel(f.status);
  document.getElementById('pdStatus').textContent = st.text;
  document.getElementById('pdEspera').textContent = formatWait(waitSeconds(f));
  document.getElementById('pdGuiche').textContent = f.guiche || '—';

  renderActions(f);
}

function renderActions(f) {
  const btnAvancar = document.getElementById('btnAvancar');
  const btnVoltar = document.getElementById('btnVoltarFila');
  const finishedMsg = document.getElementById('pdFinalizado');

  finishedMsg.hidden = f.status !== 'finalizado';
  btnVoltar.hidden = f.status === 'finalizado';

  if (f.status === 'finalizado') {
    btnAvancar.hidden = true;
    return;
  }

  btnAvancar.hidden = false;
  btnAvancar.disabled = false;

  if (f.status === 'aguardando') {
    btnAvancar.textContent = 'Chamar paciente';
  } else if (f.status === 'chamando') {
    btnAvancar.textContent = 'Iniciar atendimento';
  } else if (f.status === 'atendimento') {
    btnAvancar.textContent = 'Finalizar atendimento';
  }
}

document.getElementById('btnAvancar').addEventListener('click', () => {
  const f = VitalSyncStore.getFilaEntry(selectedId);
  if (!f) return;

  if (f.status === 'aguardando') {
    VitalSyncStore.updateFilaEntry(f.id, { status: 'chamando', guiche: `Guichê ${1 + Math.floor(Math.random() * 4)}` });
  } else if (f.status === 'chamando') {
    VitalSyncStore.updateFilaEntry(f.id, { status: 'atendimento' });
  } else if (f.status === 'atendimento') {
    VitalSyncStore.updateFilaEntry(f.id, { status: 'finalizado' });
  }
});

document.getElementById('btnVoltarFila').addEventListener('click', () => {
  const f = VitalSyncStore.getFilaEntry(selectedId);
  if (!f) return;
  VitalSyncStore.updateFilaEntry(f.id, { status: 'aguardando', guiche: null });
});

// ---------- REATIVIDADE: qualquer mudança na fila (nesta aba ou em outra) ----------
VitalSyncStore.onChange((key) => {
  if (key !== VitalSyncStore.KEYS.FILA) return;
  renderQueue();
  renderDetails();
});

// ---------- TEMPO REAL (só atualiza os tempos de espera exibidos) ----------
function tick() {
  secondsSinceUpdate += 1;
  liveUpdated.textContent = secondsSinceUpdate <= 1 ? 'atualizado agora' : `atualizado há ${secondsSinceUpdate}s`;

  const selected = VitalSyncStore.getFilaEntry(selectedId);
  if (selected) {
    document.getElementById('pdEspera').textContent = formatWait(waitSeconds(selected));
  }
  queueList.querySelectorAll('.painel-row').forEach(row => {
    const f = VitalSyncStore.getFilaEntry(row.dataset.id);
    if (f) {
      const waitEl = row.querySelector('.p-wait');
      if (waitEl) waitEl.textContent = formatWait(waitSeconds(f));
    }
  });
}

// ---------- INIT ----------
renderQueue();
renderDetails();
setInterval(tick, 1000);
