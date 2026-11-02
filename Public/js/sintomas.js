/* =========================================================
   DESCREVER SINTOMAS — formulário + classificação de prioridade
   Protótipo front-end: a "análise" é uma simulação por regras
   simples. Em produção, isso seria feito por um profissional
   de triagem (ou apoio de IA supervisionado), nunca só pelo
   front-end.
========================================================= */

// ---------- NAVEGAÇÃO ENTRE ETAPAS ----------
const panes = document.querySelectorAll('.step-pane');
const dots = document.querySelectorAll('.steps .dot');
const bars = document.querySelectorAll('.steps .bar');
const form = document.getElementById('symptomForm');
const stepsWrap = document.querySelector('.steps');
const footNote = document.getElementById('footNote');

function goToStep(step) {
  panes.forEach(p => p.classList.toggle('active', p.dataset.step === String(step)));
  dots.forEach(d => {
    const n = Number(d.dataset.dot);
    d.classList.toggle('active', n === step);
    d.classList.toggle('done', n < step);
  });
  bars.forEach(b => {
    const n = Number(b.dataset.bar);
    b.classList.toggle('active', n < step);
  });
}

// ---------- STEP 1 ----------
const description = document.getElementById('description');
const descErr = document.getElementById('descErr');
const since = document.getElementById('since');

document.getElementById('toStep2').addEventListener('click', () => {
  const shell = description.closest('.input-shell');
  const text = description.value.trim();

  if (text.length < 5) {
    shell.classList.add('invalid');
    descErr.classList.add('show');
    return;
  }
  if (!since.value) {
    since.closest('.input-shell').classList.add('invalid');
    return;
  }

  shell.classList.remove('invalid');
  descErr.classList.remove('show');
  since.closest('.input-shell').classList.remove('invalid');
  goToStep(2);
});

document.getElementById('backTo1').addEventListener('click', () => {
  goToStep(1);
});

// ---------- STEP 2: intensidade ----------
const intensity = document.getElementById('intensity');
const intensityValue = document.getElementById('intensityValue');
intensity.addEventListener('input', () => {
  intensityValue.textContent = intensity.value;
});

// ---------- CLASSIFICAÇÃO DE PRIORIDADE ----------
const RED_FLAGS = ['dor_peito', 'falta_ar', 'sangramento', 'desmaio'];

const PRIORITY_META = {
  0: { label: 'Emergência',    dot: 't-emerg',  text: 'Pelo sintoma descrito, seu atendimento é prioritário. Procure a equipe da unidade imediatamente — não espere a chamada pelo painel.' },
  1: { label: 'Urgente',       dot: 't-urg',    text: 'Sua avaliação indica atendimento urgente. Você será chamado(a) com prioridade na fila.' },
  2: { label: 'Pouco urgente', dot: 't-pouco',  text: 'Já incluímos suas respostas na sua senha de atendimento. Acompanhe sua posição na fila.' },
  3: { label: 'Não urgente',   dot: 't-naourg', text: 'Já incluímos suas respostas na sua senha de atendimento. Sua espera tende a ser mais longa — fique tranquilo(a).' },
};

function classifyPriority(checkedSymptoms, intensityValueNum) {
  const hasRedFlag = checkedSymptoms.some(s => RED_FLAGS.includes(s));
  if (hasRedFlag || intensityValueNum >= 9) return 0; // Emergência

  const hasFever = checkedSymptoms.includes('febre');
  const hasVomit = checkedSymptoms.includes('vomito');
  if (intensityValueNum >= 7 || (hasFever && hasVomit)) return 1; // Urgente

  if (intensityValueNum >= 4 || hasFever || hasVomit || checkedSymptoms.includes('dor_cabeca')) return 2; // Pouco urgente

  return 3; // Não urgente
}

// ---------- ENVIO FINAL ----------
const analyzingPane = document.getElementById('analyzingPane');
const resultPane = document.getElementById('resultPane');
const resultBadge = document.getElementById('resultBadge');
const resultDot = document.getElementById('resultDot');
const resultLabel = document.getElementById('resultLabel');
const resultText = document.getElementById('resultText');
const errorPane = document.getElementById('errorPane');

function mostrarResultado(level) {
  const meta = PRIORITY_META[level];
  resultDot.className = `dot ${meta.dot}`;
  resultLabel.textContent = meta.label;
  resultText.textContent = meta.text;
  analyzingPane.classList.remove('active');
  resultPane.classList.add('active');
}

function mostrarErro(mensagem, pedirLogin) {
  document.getElementById('errorText').textContent = mensagem;
  document.getElementById('errorLogin').style.display = pedirLogin ? 'block' : 'none';
  document.getElementById('errorRetry').style.display = pedirLogin ? 'none' : 'block';
  analyzingPane.classList.remove('active');
  errorPane.classList.add('active');
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- MODO API: a senha é criada no servidor, que também classifica a prioridade ----------
async function enviarParaApi(dados) {
  const paciente = VitalSyncStore.getPacienteAtual();
  if (!paciente || !paciente.paciente_db_id) {
    mostrarErro('Para entrar na fila, entre primeiro com o seu CPF.', true);
    return;
  }
  try {
    // 1,6 s de "analisando" mesmo se o servidor responder antes (mesma sensação de sempre)
    const [unidadeId] = await Promise.all([FilaAPI.resolverUnidadeId(paciente.unidade_referencia), esperar(1600)]);
    if (!unidadeId) throw new Error('Nenhuma unidade de saúde cadastrada.');

    const r = await FilaAPI.criarAvaliacao({
      paciente_id: paciente.paciente_db_id,
      unidade_id: unidadeId,
      descricao: dados.descricao,
      tempo_inicio: dados.tempo_inicio,
      intensidade: dados.intensidade,
      alergias_medicamentos: dados.alergias_medicamentos,
      sintomas: dados.sintomas,
      avisos_mensagem: dados.avisos_mensagem,
    });

    VitalSyncStore.setMinhaSenhaId(String(r.fila.id));
    mostrarResultado(r.prioridade_calculada); // a prioridade que vale é a do servidor
  } catch (err) {
    mostrarErro(err.message || 'Não foi possível registrar sua avaliação. Tente novamente.', false);
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const checkedSymptoms = Array.from(document.querySelectorAll('input[name="symptom"]:checked'))
    .map(el => el.value)
    .filter(v => v !== 'nenhum');
  const intensityValueNum = Number(intensity.value);
  const dados = {
    descricao: description.value.trim(),
    tempo_inicio: since.value,
    intensidade: intensityValueNum,
    alergias_medicamentos: document.getElementById('allergies').value.trim() || 'Nenhuma relatada.',
    sintomas: checkedSymptoms,
    avisos_mensagem: !!(document.getElementById('avisosMsg') && document.getElementById('avisosMsg').checked),
  };

  // esconde form, mostra "analisando"
  form.style.display = 'none';
  stepsWrap.style.display = 'none';
  footNote.style.display = 'none';
  analyzingPane.classList.add('active');

  if (FilaAPI.ativo) {
    enviarParaApi(dados);
    return;
  }

  // ---------- MODO LOCAL (demonstração): fila no localStorage ----------
  setTimeout(() => {
    const level = classifyPriority(checkedSymptoms, intensityValueNum);

    // garante um paciente (usa o logado, ou cria um "convidado")
    let paciente = VitalSyncStore.getPacienteAtual();
    if (!paciente) {
      paciente = VitalSyncStore.savePaciente({
        nome_completo: 'Paciente não identificado',
        cpf: '',
        data_nascimento: '',
        cns: '',
        telefone: '',
        email: '',
        unidade_referencia: 'UBS Jardim das Flores',
      });
      VitalSyncStore.setPacienteAtual(paciente.id);
    }

    const entrada = VitalSyncStore.addToFila({
      pacienteId: paciente.id,
      senha: VitalSyncStore.nextSenha(level),
      level,
      descricao: dados.descricao,
      tempo_inicio: dados.tempo_inicio,
      intensidade: dados.intensidade,
      alergias_medicamentos: dados.alergias_medicamentos,
      sintomas: dados.sintomas,
      unidade_referencia: paciente.unidade_referencia || 'UBS Jardim das Flores',
    });
    VitalSyncStore.setMinhaSenhaId(entrada.id);
    mostrarResultado(level);
  }, 1600);
});

// ---------- aviso por mensagem (opt-in; só existe com o servidor) ----------
(function () {
  if (!FilaAPI.ativo) return; // modo local não envia mensagens
  const p = VitalSyncStore.getPacienteAtual();
  if (!p || !p.paciente_db_id) return;
  document.getElementById('avisosField').hidden = false;
  const digitos = String(p.telefone || '').replace(/\D/g, '');
  if (digitos.length >= 4) document.getElementById('avisosTel').textContent = `(telefone terminado em ${digitos.slice(-4)})`;
})();
