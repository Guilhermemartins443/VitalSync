// ---------- máscara de CPF ----------
const cpfInput = document.getElementById('cpf');
cpfInput.addEventListener('input', () => {
  let v = cpfInput.value.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  cpfInput.value = v;
});

// ---------- navegação ----------
const panes = document.querySelectorAll('.step-pane');
const dots = document.querySelectorAll('.steps .dot');
const bars = document.querySelectorAll('.steps .bar');
const form = document.getElementById('loginForm');
const successPane = document.getElementById('successPane');
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

// ---------- STEP 1: CPF ----------
const cpfErr = document.getElementById('cpfErr');
const lookupStatus = document.getElementById('lookupStatus');
let cpfEncontrado = null; // id do paciente no store real, se existir

const cpfErrOriginal = cpfErr.innerHTML; // "Não encontramos esse CPF. Criar cadastro."
let pacienteApiId = null;    // id do paciente no banco (modo api)
const sendBtn = document.getElementById('sendCode');

function erroCpf(mensagem) {
  // mensagem = null -> volta ao texto padrão ("não encontramos esse CPF")
  if (mensagem) cpfErr.textContent = mensagem; else cpfErr.innerHTML = cpfErrOriginal;
  cpfErr.classList.add('show');
}

function irParaCodigo(telefoneTexto) {
  lookupStatus.textContent = 'CPF encontrado.';
  lookupStatus.classList.add('found');
  document.getElementById('phoneDisplay').textContent = telefoneTexto;
  goToStep(2);
  startResendTimer();
  otpBoxes[0].focus();
}

sendBtn.addEventListener('click', async () => {
  const cpfDigits = cpfInput.value.replace(/\D/g, '');
  const shell = cpfInput.closest('.input-shell');

  if (cpfDigits.length !== 11) {
    shell.classList.add('invalid');
    erroCpf(null);
    cpfErr.textContent = 'Informe um CPF com 11 dígitos.';
    return;
  }

  shell.classList.remove('invalid');
  cpfErr.classList.remove('show');
  lookupStatus.innerHTML = '<span class="spinner"></span> Verificando CPF...';
  lookupStatus.classList.remove('found');

  // ---- MODO API: busca o paciente no banco e envia o código de verdade ----
  if (PacienteAPI.ativo) {
    sendBtn.disabled = true;
    try {
      const pac = await PacienteAPI.buscarPorCpf(cpfDigits);
      if (!pac) {
        lookupStatus.textContent = '';
        shell.classList.add('invalid');
        erroCpf(null);
        return;
      }
      pacienteApiId = pac.id;
      const env = await PacienteAPI.solicitarCodigo(pac.id, 'whatsapp');
      irParaCodigo(pac.telefone_mascarado + (env.canal === 'sms' ? ' (por SMS)' : ' (por WhatsApp)'));
    } catch (err) {
      lookupStatus.textContent = '';
      erroCpf(err.message);
    } finally {
      sendBtn.disabled = false;
    }
    return;
  }

  // ---- MODO LOCAL (demonstração): simulação antiga, sem envio ----
  setTimeout(() => {
    // Primeiro procura no store real (paciente cadastrado nesta tela/navegador).
    // Se não achar, cai na simulação fictícia (dígito final par "existe" na base),
    // só para o protótipo continuar navegável sem cadastro prévio.
    const pacienteReal = VitalSyncStore.findPacienteByCpf(cpfDigits);
    const lastDigit = Number(cpfDigits[cpfDigits.length - 1]);
    const found = pacienteReal || lastDigit % 2 === 0;

    if (!found) {
      lookupStatus.textContent = '';
      shell.classList.add('invalid');
      erroCpf(null);
      return;
    }

    cpfEncontrado = pacienteReal ? pacienteReal.id : null;
    irParaCodigo(pacienteReal ? pacienteReal.telefone : '(11) 9****-4321');
  }, 800);
});

// ---------- STEP 2: OTP ----------
const otpBoxes = Array.from(document.querySelectorAll('.otp-box'));
const otpErr = document.getElementById('otpErr');
const resendBtn = document.getElementById('resendBtn');
const resendTimer = document.getElementById('resendTimer');
let timerInterval;

otpBoxes.forEach((box, i) => {
  box.addEventListener('input', () => {
    box.value = box.value.replace(/\D/g, '');
    if (box.value && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !box.value && i > 0) otpBoxes[i - 1].focus();
  });
});

function startResendTimer() {
  let seconds = 30;
  resendBtn.disabled = true;
  resendTimer.style.display = 'inline';
  resendTimer.textContent = `Reenviar em 0:${String(seconds).padStart(2, '0')}`;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(timerInterval);
      resendTimer.style.display = 'none';
      resendBtn.disabled = false;
    } else {
      resendTimer.textContent = `Reenviar em 0:${String(seconds).padStart(2, '0')}`;
    }
  }, 1000);
}

const otpErrOriginal = otpErr.textContent;
function erroCodigo(mensagem) {
  otpErr.textContent = mensagem || otpErrOriginal;
  otpErr.classList.add('show');
}

resendBtn.addEventListener('click', async () => {
  otpBoxes.forEach(b => (b.value = ''));
  otpErr.classList.remove('show');

  if (PacienteAPI.ativo) {
    resendBtn.disabled = true;
    try {
      await PacienteAPI.solicitarCodigo(pacienteApiId, 'whatsapp');
      startResendTimer();
    } catch (err) {
      erroCodigo(err.message);
      resendBtn.disabled = false;
    }
    otpBoxes[0].focus();
    return;
  }

  startResendTimer();
  otpBoxes[0].focus();
});

document.getElementById('backTo1').addEventListener('click', () => {
  clearInterval(timerInterval);
  goToStep(1);
});

// ---------- envio final ----------
function concluirLogin() {
  clearInterval(timerInterval);
  form.style.display = 'none';
  document.querySelector('.steps').style.display = 'none';
  footNote.style.display = 'none';
  successPane.classList.add('active');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = otpBoxes.map(b => b.value).join('');

  if (code.length !== 6) {
    erroCodigo('Digite os 6 dígitos do código.');
    return;
  }

  // ---- MODO API: o servidor confere o código ----
  if (PacienteAPI.ativo) {
    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      const r = await PacienteAPI.verificarCodigo(pacienteApiId, code);
      otpErr.classList.remove('show');
      PacienteAPI.entrarNoStore(r.paciente);
      concluirLogin();
    } catch (err) {
      erroCodigo(err.message);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
    return;
  }

  // ---- MODO LOCAL: simulação, o código correto é sempre "123456" ----
  if (code !== '123456') {
    erroCodigo(null);
    return;
  }
  otpErr.classList.remove('show');

  if (cpfEncontrado) {
    VitalSyncStore.setPacienteAtual(cpfEncontrado);
  }
  concluirLogin();
});
