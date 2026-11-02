/* =========================================================
   PAINEL DO PROFISSIONAL — FILA + DETALHES DO PACIENTE
   Modo 'api' (padrão, js/config.js): a fila é a REAL — vem do back-end
   (js/fila-api.js) e atualiza sozinha a cada poucos segundos, então o
   que o profissional faz aqui aparece na tela do paciente em outro
   aparelho, e vice-versa.
   Modo 'local' (demonstração): usa o VitalSyncStore (localStorage),
   que só sincroniza abas do MESMO navegador.
========================================================= */

const PRIORITY = VitalSyncStore.PRIORITY;
const SINTOMAS_CATALOGO = VitalSyncStore.SINTOMAS_CATALOGO;
const TEMPO_INICIO_LABEL = VitalSyncStore.TEMPO_INICIO_LABEL;

// Fila real (API) ou simulada (localStorage), conforme js/config.js
const Dados = FilaAPI.ativo ? FilaAPI : VitalSyncStore;

const MAX_CHAMADAS = 3;            // 1ª chamada + 2 rechamadas (igual ao back-end)
const ALERTA_CHAMADA_SEG = 5 * 60; // chamando há 5 min sem resposta -> alerta no painel

Dados.seedIfEmpty();

// ---------- MEU GUICHÊ / SALA ----------
// Quem chama diz onde está atendendo; o paciente vê esse local (e recebe por mensagem).
// Fica salvo neste navegador, por profissional, para não digitar todo dia.
const meuGuicheInput = document.getElementById('meuGuiche');
const chaveGuiche = `vitalsync_guiche_${((window.Auth && Auth.getProfissional()) || {}).id || 'anon'}`;
try { meuGuicheInput.value = localStorage.getItem(chaveGuiche) || ''; } catch (e) { /* segue vazio */ }

function lerGuiche() {
  return (meuGuicheInput.value || '').trim();
}

meuGuicheInput.addEventListener('input', () => {
  meuGuicheInput.classList.remove('is-invalid');
  try { localStorage.setItem(chaveGuiche, lerGuiche()); } catch (e) { /* sem storage: segue */ }
});

// devolve o guichê, ou avisa e leva o foco para o campo se estiver vazio
function exigirGuiche() {
  const g = lerGuiche();
  if (g) return g;
  meuGuicheInput.classList.add('is-invalid');
  meuGuicheInput.focus();
  window.dispatchEvent(new CustomEvent('vitalsync:aviso', {
    detail: { tipo: 'erro', mensagem: 'Informe o seu guichê ou sala antes de chamar o paciente.' },
  }));
  return null;
}

let selectedId = null;
let carregou = !FilaAPI.ativo; // no modo API, só "carregou" depois da 1ª resposta do servidor
let secondsSinceUpdate = 0;

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
  if (status === 'desistencia') return { text: 'Não compareceu', cls: 'status-aguardando' };
  return { text: 'Aguardando', cls: 'status-aguardando' };
}

// há quantos segundos foi feita a chamada mais recente (modo API: chamandoDesde; local: ultimaChamadaEm)
function chamandoHaSegundos(f) {
  const desde = f.chamandoDesde || f.ultimaChamadaEm || f.chamadoEm;
  return desde ? Math.max(0, Math.floor((Date.now() - desde) / 1000)) : 0;
}

function chamadaEmAlerta(f) {
  return f.status === 'chamando' && chamandoHaSegundos(f) >= ALERTA_CHAMADA_SEG;
}

// texto/classe da coluna "Status": para quem está sendo chamado mostra guichê, há quanto
// tempo e qual chamada é; passa a vermelho quando demora demais
function statusCelula(f) {
  const st = statusLabel(f.status);
  if (f.status !== 'chamando') {
    return { text: f.status === 'atendimento' && f.guiche ? `${st.text} · ${f.guiche}` : st.text, cls: st.cls };
  }
  const partes = [st.text];
  if (f.guiche) partes.push(f.guiche);
  const min = Math.floor(chamandoHaSegundos(f) / 60);
  if (min >= 1) partes.push(`há ${min} min`);
  if ((f.chamadas || 1) > 1) partes.push(`${f.chamadas}ª chamada`);
  return { text: partes.join(' · '), cls: st.cls + (chamadaEmAlerta(f) ? ' status-alerta' : '') };
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

// Quem pode o quê no prontuário. ESPELHO de Backend/src/utils/permissoes.js: o servidor é quem
// decide (devolve 403); aqui só escondemos o que o cargo não pode usar.
const PERMISSOES = {
  lerProntuario: ['medico', 'enfermeiro', 'tecnico', 'admin'],
  evoluir: ['medico', 'enfermeiro', 'admin'],
  prescrever: ['medico', 'admin'],
  lembrete: ['medico', 'enfermeiro', 'admin'],
  reclassificar: ['medico', 'enfermeiro', 'admin'],
};
const cargoAtual = ((window.Auth && Auth.getProfissional()) || {}).cargo;
function pode(acao) {
  return (PERMISSOES[acao] || []).includes(cargoAtual);
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
  return Dados.getFila().map(f => ({
    ...f,
    paciente: Dados.getPaciente(f.pacienteId) || {},
  }));
}

// ---------- ELEMENTOS ----------
const summaryGrid = document.getElementById('summaryGrid');
const queueList = document.getElementById('queueList');
const activeList = document.getElementById('activeList');
const activeCard = document.getElementById('activeCard');
const activeCount = document.getElementById('activeCount');
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
    const n = fila.filter(f => f.level === p.level && f.status === 'aguardando').length;
    if (el) el.textContent = n;
  });
}

// ---------- RENDER: FILA ----------
// Fila de espera = só quem está "aguardando". Quem já foi chamado ou está em
// atendimento sai da fila e aparece no bloco "Chamados e em atendimento".
function criarLinha(f) {
  const meta = PRIORITY[f.level];
  const st = statusCelula(f);
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
  return row;
}

function renderQueue() {
  const fila = filaComPacientes();
  const aguardando = sortFila(fila.filter(f => f.status === 'aguardando'));
  const emAndamento = sortFila(fila.filter(f => f.status === 'chamando' || f.status === 'atendimento'));

  queueList.innerHTML = '';
  aguardando.forEach(f => queueList.appendChild(criarLinha(f)));

  activeList.innerHTML = '';
  emAndamento.forEach(f => activeList.appendChild(criarLinha(f)));
  activeCard.hidden = emAndamento.length === 0;
  activeCount.textContent = `${emAndamento.length} ${emAndamento.length === 1 ? 'paciente' : 'pacientes'}`;

  queueCount.textContent = carregou
    ? `${aguardando.length} ${aguardando.length === 1 ? 'paciente' : 'pacientes'} na fila`
    : 'Carregando a fila...';
  renderSummary(fila);
}

// ---------- RENDER: DETALHES DO PACIENTE ----------
function selectPatient(id, switchTab) {
  selectedId = id;
  renderQueue();
  renderDetails();
  if (Dados.carregarDetalhe) Dados.carregarDetalhe(id); // modo API: busca CPF, sintomas etc.
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
  document.getElementById('pdStatus').textContent =
    f.status === 'chamando' && (f.chamadas || 1) > 1 ? `${st.text} (${f.chamadas}ª chamada)` : st.text;
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
  const f = Dados.getFilaEntry(selectedId);
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
  const f = Dados.getFilaEntry(selectedId);
  if (!f) return;

  const novoLevel = Number(reclassSelect.value);
  const motivo = reclassMotivo.value.trim();

  if (novoLevel === f.level) {
    reclassPanel.hidden = true;
    return;
  }

  // grava no servidor (com o motivo); a tela se redesenha quando a gravação termina
  Dados.reclassificar(f.id, novoLevel, motivo, currentProfissionalName());
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

evolucaoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = Dados.getFilaEntry(selectedId);
  if (!f) return;

  const texto = evolucaoTexto.value.trim();
  if (!texto) return;

  // só limpa o campo se gravou (se falhar, o texto continua lá e o aviso explica)
  if (await Dados.adicionarEvolucao(f.id, texto, currentProfissionalName())) evolucaoTexto.value = '';
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
    pdReceitas.innerHTML = `<p class="evolucao-empty">Nenhum medicamento prescrito neste atendimento ainda.${pode('prescrever') ? ' Use o formulário abaixo para adicionar.' : ''}</p>`;
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
          <div class="med-actions"${pode('lembrete') ? '' : ' hidden'}>
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
  const f = Dados.getFilaEntry(selectedId);
  if (!f) return;
  const paciente = Dados.getPaciente(f.pacienteId);
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

  Dados.registrarLembrete(f.id, medId, canal);
}

receitaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = Dados.getFilaEntry(selectedId);
  if (!f) return;

  const nome = medNome.value.trim();
  const dosagem = medDosagem.value.trim();
  const posologia = medPosologia.value.trim();
  const duracao = medDuracao.value.trim();
  if (!nome || !dosagem || !posologia || !duracao) return;

  // o remédio entra na receita aberta DESTE profissional neste atendimento (ou abre uma nova)
  const med = { nome, dosagem, posologia, duracao };
  if (await Dados.adicionarMedicamento(f.id, med, currentProfissionalName())) receitaForm.reset();
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

orientacaoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = Dados.getFilaEntry(selectedId);
  if (!f) return;

  const texto = orientacaoTexto.value.trim();
  if (!texto) return;

  const atestado = atestadoCheck.checked;
  const dias = Number(atestadoDias.value);
  if (atestado && !(Number.isInteger(dias) && dias >= 1 && dias <= 365)) {
    window.dispatchEvent(new CustomEvent('vitalsync:aviso', {
      detail: { tipo: 'erro', mensagem: 'Informe os dias de afastamento do atestado (1 a 365).' },
    }));
    return;
  }

  const dados = { texto, atestado, diasAfastamento: atestado ? dias : null };
  if (await Dados.adicionarOrientacao(f.id, dados, currentProfissionalName())) {
    orientacaoForm.reset();
    atestadoDiasWrap.hidden = true;
  }
});

function renderAlertaChamada(f) {
  const el = document.getElementById('pdAlertaChamada');
  if (!f || f.status !== 'chamando') { el.hidden = true; return; }

  const chamadas = f.chamadas || 1;
  if (chamadas >= MAX_CHAMADAS) {
    el.textContent = `Já foi chamado ${chamadas} vezes e não respondeu. Marque "Não compareceu" ou volte o paciente para a fila.`;
    el.hidden = false;
  } else if (chamadaEmAlerta(f)) {
    const min = Math.floor(chamandoHaSegundos(f) / 60);
    el.textContent = `Chamando há ${min} min sem resposta. Rechame ou marque "Não compareceu".`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function renderActions(f) {
  const btnAvancar = document.getElementById('btnAvancar');
  const btnVoltar = document.getElementById('btnVoltarFila');
  const btnRechamar = document.getElementById('btnRechamar');
  const btnNaoCompareceu = document.getElementById('btnNaoCompareceu');
  const encerradoMsg = document.getElementById('pdFinalizado');

  const encerrado = f.status === 'finalizado' || f.status === 'desistencia';

  encerradoMsg.hidden = !encerrado;
  if (encerrado) {
    encerradoMsg.textContent = f.status === 'desistencia'
      ? 'Paciente não compareceu à chamada. Ele saiu da fila.'
      : 'Atendimento finalizado. Este paciente saiu da fila.';
  }
  btnVoltar.hidden = encerrado;
  btnRechamar.hidden = f.status !== 'chamando';
  btnNaoCompareceu.hidden = f.status !== 'chamando';
  renderAlertaChamada(f);

  if (encerrado) {
    btnAvancar.hidden = true;
    return;
  }

  btnAvancar.hidden = false;
  btnAvancar.disabled = false;

  if (f.status === 'aguardando') {
    btnAvancar.textContent = 'Chamar paciente';
  } else if (f.status === 'chamando') {
    btnAvancar.textContent = 'Iniciar atendimento';
    const chamadas = f.chamadas || 1;
    btnRechamar.textContent = `Rechamar (${chamadas}/${MAX_CHAMADAS})`;
    btnRechamar.disabled = chamadas >= MAX_CHAMADAS;
  } else if (f.status === 'atendimento') {
    btnAvancar.textContent = 'Finalizar atendimento';
  }
}

document.getElementById('btnAvancar').addEventListener('click', () => {
  const f = Dados.getFilaEntry(selectedId);
  if (!f) return;

  if (f.status === 'aguardando') {
    const guiche = exigirGuiche();
    if (!guiche) return;
    const agora = Date.now();
    // chamadoEm: congela o tempo de espera na 1ª chamada (modo local; na API o servidor calcula)
    Dados.updateFilaEntry(f.id, {
      status: 'chamando', chamadoEm: agora, chamadas: 1, ultimaChamadaEm: agora, guiche,
    });
  } else if (f.status === 'chamando') {
    Dados.updateFilaEntry(f.id, { status: 'atendimento' });
  } else if (f.status === 'atendimento') {
    Dados.updateFilaEntry(f.id, { status: 'finalizado' });
  }
});

// Rechamar: mesmo paciente, nova chamada (até MAX_CHAMADAS). A espera segue congelada na 1ª.
let ultimaRechamadaEm = 0;
document.getElementById('btnRechamar').addEventListener('click', () => {
  const f = Dados.getFilaEntry(selectedId);
  if (!f || f.status !== 'chamando') return;
  if (Date.now() - ultimaRechamadaEm < 2000) return; // clique duplo não gasta duas chamadas
  ultimaRechamadaEm = Date.now();
  const chamadas = f.chamadas || 1;
  if (chamadas >= MAX_CHAMADAS) return;
  // se o profissional trocou de guichê/sala desde a 1ª chamada, a rechamada já leva o novo local
  Dados.updateFilaEntry(f.id, {
    status: 'chamando', chamadas: chamadas + 1, ultimaChamadaEm: Date.now(),
    ...(lerGuiche() ? { guiche: lerGuiche() } : {}),
  });
});

// Não compareceu: o paciente sai da fila. Para voltar, precisa de uma nova avaliação (nova senha).
document.getElementById('btnNaoCompareceu').addEventListener('click', () => {
  const f = Dados.getFilaEntry(selectedId);
  if (!f || f.status !== 'chamando') return;
  const nome = (Dados.getPaciente(f.pacienteId) || {}).nome_completo || f.senha;
  if (!window.confirm(`Marcar ${nome} como "não compareceu"? Ele sairá da fila e precisará de uma nova senha.`)) return;
  Dados.updateFilaEntry(f.id, { status: 'desistencia', desistenciaEm: Date.now() });
});

document.getElementById('btnVoltarFila').addEventListener('click', () => {
  const f = Dados.getFilaEntry(selectedId);
  if (!f) return;
  // volta a contar a espera desde a entrada original e zera as chamadas
  Dados.updateFilaEntry(f.id, { status: 'aguardando', guiche: null, chamadoEm: null, chamadas: 0, ultimaChamadaEm: null });
});

// ---------- REATIVIDADE: qualquer mudança na fila (nesta aba ou em outra) ----------
Dados.onChange((key) => {
  if (key !== VitalSyncStore.KEYS.FILA) return;
  renderQueue();
  renderDetails();
});

// ---------- AVISOS (erro do servidor / sem conexão) E SINCRONIZAÇÃO ----------
const avisoSync = document.getElementById('avisoSync');
let avisoErroAte = 0; // um erro fica na tela por alguns segundos, mesmo que a próxima atualização dê certo

window.addEventListener('vitalsync:aviso', (e) => {
  const { tipo, mensagem } = e.detail;
  if (tipo === 'ok') {
    if (Date.now() >= avisoErroAte) avisoSync.hidden = true;
    return;
  }
  avisoSync.textContent = mensagem;
  avisoSync.classList.toggle('is-rede', tipo === 'rede');
  avisoSync.hidden = false;
  if (tipo === 'erro') avisoErroAte = Date.now() + 8000;
});

window.addEventListener('vitalsync:sync', () => {
  secondsSinceUpdate = 0;
  if (!carregou) { carregou = true; renderQueue(); }
});

// ---------- TEMPO REAL (atualiza espera e "chamando há X min" a cada segundo) ----------
function tick() {
  secondsSinceUpdate += 1;
  liveUpdated.textContent = secondsSinceUpdate <= 1 ? 'atualizado agora' : `atualizado há ${secondsSinceUpdate}s`;

  const selected = Dados.getFilaEntry(selectedId);
  if (selected) {
    document.getElementById('pdEspera').textContent = formatWait(waitSeconds(selected));
    renderAlertaChamada(selected);
  }
  document.querySelectorAll('#queueList .painel-row, #activeList .painel-row').forEach(row => {
    const f = Dados.getFilaEntry(row.dataset.id);
    if (!f) return;
    const waitEl = row.querySelector('.p-wait');
    if (waitEl) waitEl.textContent = formatWait(waitSeconds(f));
    const stEl = row.querySelector('.p-status');
    if (stEl) {
      const st = statusCelula(f);
      stEl.textContent = st.text;
      stEl.className = `p-status ${st.cls}`;
    }
  });
}

// ---------- PERMISSÕES POR CARGO ----------
// Recepção só mexe na fila: não vê nem escreve nada clínico. Técnico lê, mas não escreve.
// Só médico prescreve e emite atestado. (O servidor também confere; isto só esconde.)
(function aplicarPermissoes() {
  const ler = pode('lerProntuario');
  document.getElementById('cardEvolucao').hidden = !ler;
  document.getElementById('cardReceitas').hidden = !ler;
  document.getElementById('cardOrientacoes').hidden = !ler;
  evolucaoForm.hidden = !pode('evoluir');
  orientacaoForm.hidden = !pode('evoluir');
  receitaForm.hidden = !pode('prescrever');
  const rotuloAtestado = atestadoCheck.closest('label');
  if (rotuloAtestado) rotuloAtestado.hidden = !pode('prescrever');
  if (!pode('prescrever')) { atestadoCheck.checked = false; atestadoDiasWrap.hidden = true; }
  document.getElementById('btnReclassToggle').hidden = !pode('reclassificar');
})();

// ---------- INIT ----------
renderQueue();
renderDetails();
setInterval(tick, 1000);
if (Dados.iniciarPainel) Dados.iniciarPainel(); // modo API: começa a atualizar sozinho
