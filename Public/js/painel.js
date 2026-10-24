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

function formatDateTime(ts) {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

function currentProfissionalName() {
  const prof = window.Auth && Auth.getProfissional();
  return (prof && prof.nome) || 'Profissional';
}

function uidLocal() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
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

// ---------- ELEMENTOS: RECLASSIFICAÇÃO DE RISCO ----------
const btnReclassToggle = document.getElementById('btnReclassToggle');
const reclassPanel = document.getElementById('reclassPanel');
const reclassSelect = document.getElementById('reclassSelect');
const reclassMotivo = document.getElementById('reclassMotivo');
const btnReclassSalvar = document.getElementById('btnReclassSalvar');
const btnReclassCancelar = document.getElementById('btnReclassCancelar');
const pdReclassHistory = document.getElementById('pdReclassHistory');
const pdReclassList = document.getElementById('pdReclassList');

// ---------- ELEMENTOS: PRONTUÁRIO RÁPIDO / EVOLUÇÃO ----------
const pdEvolucoes = document.getElementById('pdEvolucoes');
const evolucaoForm = document.getElementById('evolucaoForm');
const evolucaoTexto = document.getElementById('evolucaoTexto');
const evolucaoAutor = document.getElementById('evolucaoAutor');

// ---------- ELEMENTOS: PRESCRIÇÃO DIGITAL ----------
const pdReceitas = document.getElementById('pdReceitas');
const receitaForm = document.getElementById('receitaForm');
const medNome = document.getElementById('medNome');
const medDosagem = document.getElementById('medDosagem');
const medPosologia = document.getElementById('medPosologia');
const medDuracao = document.getElementById('medDuracao');

// ---------- ELEMENTOS: ORIENTAÇÕES PÓS-CONSULTA E ATESTADO ----------
const pdOrientacoes = document.getElementById('pdOrientacoes');
const orientacaoForm = document.getElementById('orientacaoForm');
const orientacaoTexto = document.getElementById('orientacaoTexto');
const orientacaoAutor = document.getElementById('orientacaoAutor');
const atestadoCheck = document.getElementById('atestadoCheck');
const atestadoDiasWrap = document.getElementById('atestadoDiasWrap');
const atestadoDias = document.getElementById('atestadoDias');

function buildReclassOptions() {
  reclassSelect.innerHTML = PRIORITY.map(p => `<option value="${p.level}">${p.label}</option>`).join('');
}
buildReclassOptions();

// ---------- TOPBAR: nome do profissional logado ----------
(function loadProfissional() {
  const prof = Auth.getProfissional();
  if (!prof) return;
  userName.textContent = `Olá, ${prof.nome}`;
  if (prof.unidade_nome) unitPill.textContent = prof.unidade_nome;
  // só administrador vê o atalho para gerenciar a equipe (cadastro de profissionais)
  const linkEquipe = document.getElementById('linkEquipe');
  if (linkEquipe && prof.cargo === 'admin') linkEquipe.hidden = false;
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
    row.dataset.id = String(f.id);
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');

    row.innerHTML = `
      <div class="p-ticket">${escapeHtml(f.senha)}</div>
      <div class="p-name">${escapeHtml(f.paciente.nome_completo || 'Paciente não identificado')}</div>
      <div class="p-priority"><span class="dot ${meta.dot}"></span>${meta.label}</div>
      <div class="p-wait">${formatWait(waitSeconds(f))}</div>
      <div class="p-status ${escapeHtml(st.cls)}">${escapeHtml(st.text)}</div>
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
  renderReclass(f);
  renderEvolucoes(f);
  renderReceitas(f);
  renderOrientacoes(f);
}

// ---------- RECLASSIFICAÇÃO MANUAL DE RISCO ----------
function renderReclass(f) {
  reclassPanel.hidden = true;
  reclassSelect.value = String(f.level);
  reclassMotivo.value = '';

  const historico = f.reclassificacoes || [];
  if (!historico.length) {
    pdReclassHistory.hidden = true;
    return;
  }
  pdReclassHistory.hidden = false;
  pdReclassList.innerHTML = [...historico].reverse().map(h => {
    const de = PRIORITY[h.de] ? PRIORITY[h.de].label : '—';
    const para = PRIORITY[h.para] ? PRIORITY[h.para].label : '—';
    return `
      <div class="reclass-history-item">
        De <strong>${de}</strong> para <strong>${para}</strong> · ${formatDateTime(h.em)} · ${escapeHtml(h.por || 'Profissional')}
        ${h.motivo ? `<span class="rh-motivo">${escapeHtml(h.motivo)}</span>` : ''}
      </div>
    `;
  }).join('');
}

btnReclassToggle.addEventListener('click', () => {
  const f = VitalSyncStore.getFilaEntry(selectedId);
  if (!f) return;
  reclassSelect.value = String(f.level);
  reclassMotivo.value = '';
  reclassPanel.hidden = !reclassPanel.hidden;
});

btnReclassCancelar.addEventListener('click', () => {
  reclassPanel.hidden = true;
  reclassMotivo.value = '';
});

btnReclassSalvar.addEventListener('click', () => {
  const f = VitalSyncStore.getFilaEntry(selectedId);
  if (!f) return;

  const novoLevel = Number(reclassSelect.value);
  const motivo = reclassMotivo.value.trim();

  if (novoLevel === f.level) {
    reclassPanel.hidden = true;
    return;
  }

  const historico = (f.reclassificacoes || []).concat([{
    de: f.level,
    para: novoLevel,
    motivo,
    em: Date.now(),
    por: currentProfissionalName(),
  }]);

  VitalSyncStore.updateFilaEntry(f.id, { level: novoLevel, reclassificacoes: historico });
});

// ---------- PRONTUÁRIO RÁPIDO · EVOLUÇÃO MÉDICA ----------
function renderEvolucoes(f) {
  evolucaoAutor.textContent = currentProfissionalName();

  const lista = f.evolucoes || [];
  if (!lista.length) {
    pdEvolucoes.innerHTML = '<p class="evolucao-empty">Nenhuma evolução registrada ainda. Use o campo abaixo para adicionar a primeira anotação deste atendimento.</p>';
    return;
  }

  pdEvolucoes.innerHTML = [...lista].reverse().map(ev => `
    <div class="evolucao-item">
      <div class="evolucao-item-head">
        <span>${escapeHtml(ev.autor)}</span>
        <time>${formatDateTime(ev.criadoEm)}</time>
      </div>
      <p>${escapeHtml(ev.texto)}</p>
    </div>
  `).join('');
}

evolucaoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = VitalSyncStore.getFilaEntry(selectedId);
  if (!f) return;

  const texto = evolucaoTexto.value.trim();
  if (!texto) return;

  const nova = {
    id: uidLocal(),
    autor: currentProfissionalName(),
    texto,
    criadoEm: Date.now(),
  };
  const lista = (f.evolucoes || []).concat([nova]);

  VitalSyncStore.updateFilaEntry(f.id, { evolucoes: lista });
  evolucaoTexto.value = '';
});

// ---------- PRESCRIÇÃO DIGITAL DE MEDICAMENTOS ----------
function onlyDigits(str) {
  return String(str || '').replace(/\D/g, '');
}

function lembreteMensagem(paciente, med) {
  return `Olá, ${paciente.nome_completo || ''}! Lembrete do VitalSync: está na hora de tomar ${med.nome} — ${med.dosagem}, ${med.posologia}. Tratamento por ${med.duracao}.`;
}

function renderReceitas(f) {
  const paciente = f.paciente;
  const receitas = f.receitas || [];

  if (!receitas.length) {
    pdReceitas.innerHTML = '<p class="evolucao-empty">Nenhum medicamento prescrito neste atendimento ainda. Use o formulário abaixo para adicionar.</p>';
    return;
  }

  pdReceitas.innerHTML = [...receitas].reverse().map(r => `
    <div class="receita-item">
      <div class="evolucao-item-head"><span>Prescrito por ${escapeHtml(r.por)}</span><time>${formatDateTime(r.criadoEm)}</time></div>
      ${r.medicamentos.map(med => `
        <div class="med-row" data-receita="${escapeHtml(r.id)}" data-med="${escapeHtml(med.id)}">
          <div class="med-info">
            <strong>${escapeHtml(med.nome)}</strong>
            <span>${escapeHtml(med.dosagem)} · ${escapeHtml(med.posologia)} · ${escapeHtml(med.duracao)}</span>
            ${med.comprado ? '<span class="badge-confirmado">Compra/adesão confirmada pelo paciente</span>' : '<span class="badge-pendente">Aguardando confirmação do paciente</span>'}
          </div>
          <div class="med-actions">
            <button type="button" class="btn-mini btn-lembrete-zap" data-canal="whatsapp">Lembrete WhatsApp</button>
            <button type="button" class="btn-mini btn-lembrete-sms" data-canal="sms">Lembrete SMS</button>
          </div>
          ${(med.lembretes || []).length ? `<div class="lembrete-log">Último lembrete: ${escapeHtml(String(med.lembretes[med.lembretes.length - 1].canal).toUpperCase())} em ${formatDateTime(med.lembretes[med.lembretes.length - 1].enviadoEm)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `).join('');

  pdReceitas.querySelectorAll('.med-row').forEach(row => {
    row.querySelectorAll('.btn-mini[data-canal]').forEach(btn => {
      btn.addEventListener('click', () => enviarLembrete(row.dataset.receita, row.dataset.med, btn.dataset.canal));
    });
  });
}

function enviarLembrete(receitaId, medId, canal) {
  const f = VitalSyncStore.getFilaEntry(selectedId);
  if (!f) return;
  const paciente = VitalSyncStore.getPaciente(f.pacienteId);
  const receitas = f.receitas || [];
  const receita = receitas.find(r => r.id === receitaId);
  if (!receita) return;
  const med = receita.medicamentos.find(m => m.id === medId);
  if (!med) return;

  const telefoneDigits = onlyDigits(paciente && paciente.telefone);
  const texto = encodeURIComponent(lembreteMensagem(paciente || {}, med));

  if (canal === 'whatsapp') {
    window.open(`https://wa.me/55${telefoneDigits}?text=${texto}`, '_blank');
  } else {
    window.open(`sms:+55${telefoneDigits}?body=${texto}`, '_blank');
  }

  med.lembretes = (med.lembretes || []).concat([{ id: uidLocal(), canal, enviadoEm: Date.now() }]);
  VitalSyncStore.updateFilaEntry(f.id, { receitas });
}

receitaForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = VitalSyncStore.getFilaEntry(selectedId);
  if (!f) return;

  const nome = medNome.value.trim();
  const dosagem = medDosagem.value.trim();
  const posologia = medPosologia.value.trim();
  const duracao = medDuracao.value.trim();
  if (!nome || !dosagem || !posologia || !duracao) return;

  const novoMed = { id: uidLocal(), nome, dosagem, posologia, duracao, comprado: false, lembretes: [] };
  const receitas = f.receitas || [];
  let atual = receitas[receitas.length - 1];

  if (!atual || atual.por !== currentProfissionalName()) {
    atual = { id: uidLocal(), criadoEm: Date.now(), por: currentProfissionalName(), medicamentos: [] };
    receitas.push(atual);
  }
  atual.medicamentos.push(novoMed);

  VitalSyncStore.updateFilaEntry(f.id, { receitas });
  receitaForm.reset();
});

// ---------- ORIENTAÇÕES PÓS-CONSULTA E ATESTADO ----------
function renderOrientacoes(f) {
  orientacaoAutor.textContent = currentProfissionalName();
  const lista = f.orientacoes || [];

  if (!lista.length) {
    pdOrientacoes.innerHTML = '<p class="evolucao-empty">Nenhuma orientação registrada ainda.</p>';
    return;
  }

  pdOrientacoes.innerHTML = [...lista].reverse().map(o => `
    <div class="orientacao-item">
      <div class="evolucao-item-head">
        <span>${escapeHtml(o.por)}${o.atestado ? ' · <span class="atestado-tag">Atestado emitido</span>' : ''}</span>
        <time>${formatDateTime(o.criadoEm)}</time>
      </div>
      <p>${escapeHtml(o.texto)}</p>
      ${o.atestado ? `<p class="orientacao-atestado-dias">Afastamento: ${Number(o.diasAfastamento) || 0} dia(s)</p>` : ''}
    </div>
  `).join('');
}

atestadoCheck.addEventListener('change', () => {
  atestadoDiasWrap.hidden = !atestadoCheck.checked;
});

orientacaoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = VitalSyncStore.getFilaEntry(selectedId);
  if (!f) return;

  const texto = orientacaoTexto.value.trim();
  if (!texto) return;

  const nova = {
    id: uidLocal(),
    por: currentProfissionalName(),
    texto,
    atestado: atestadoCheck.checked,
    diasAfastamento: atestadoCheck.checked ? (Number(atestadoDias.value) || 1) : null,
    criadoEm: Date.now(),
  };
  const lista = (f.orientacoes || []).concat([nova]);

  VitalSyncStore.updateFilaEntry(f.id, { orientacoes: lista });
  orientacaoForm.reset();
  atestadoDiasWrap.hidden = true;
});

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
