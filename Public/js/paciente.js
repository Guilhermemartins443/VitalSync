// ---------- máscaras ----------
const cpfInput = document.getElementById('cpf');
const phoneInput = document.getElementById('phone');

cpfInput.addEventListener('input', () => {
  let v = cpfInput.value.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  cpfInput.value = v;
});

phoneInput.addEventListener('input', () => {
  let v = phoneInput.value.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/(\d{2})(\d)/, '($1) $2');
  v = v.replace(/(\d{5})(\d{1,4})$/, '$1-$2');
  phoneInput.value = v;
});

// ---------- navegação do wizard ----------
const panes = document.querySelectorAll('.step-pane');
const dots = document.querySelectorAll('.steps .dot');
const bars = document.querySelectorAll('.steps .bar');
const form = document.getElementById('patientForm');
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

// ---------- STEP 1: CPF + telefone, com lookup simulado ----------
const cpfErr = document.getElementById('cpfErr');
const phoneErr = document.getElementById('phoneErr');
const lookupStatus = document.getElementById('lookupStatus');
const foundMsg = document.getElementById('foundMsg');
let cpfFound = false;

document.getElementById('toStep2').addEventListener('click', () => {
  let valid = true;

  const cpfDigits = cpfInput.value.replace(/\D/g, '');
  if (cpfDigits.length !== 11) {
    cpfInput.closest('.input-shell').classList.add('invalid');
    cpfErr.classList.add('show');
    valid = false;
  } else {
    cpfInput.closest('.input-shell').classList.remove('invalid');
    cpfErr.classList.remove('show');
  }

  const phoneDigits = phoneInput.value.replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    phoneInput.closest('.input-shell').classList.add('invalid');
    phoneErr.classList.add('show');
    valid = false;
  } else {
    phoneInput.closest('.input-shell').classList.remove('invalid');
    phoneErr.classList.remove('show');
  }

  if (!valid) return;

  // Simula a busca no CadSUS pelo CPF
  lookupStatus.innerHTML = '<span class="spinner"></span> Buscando seu cadastro...';
  lookupStatus.classList.remove('found');

  setTimeout(() => {
    // Regra fictícia só para a demonstração: CPFs terminados em dígito par "já existem" na base
    const lastDigit = Number(cpfDigits[cpfDigits.length - 1]);
    cpfFound = lastDigit % 2 === 0;

    if (cpfFound) {
      lookupStatus.textContent = 'Encontramos seu cadastro. Confira os dados.';
      lookupStatus.classList.add('found');
      document.getElementById('fullName').value = 'Maria da Silva Oliveira';
      document.getElementById('birthDate').value = '1988-04-12';
      foundMsg.textContent = 'Encontramos seu cadastro no sistema de saúde. Confira se está tudo certo.';
    } else {
      lookupStatus.textContent = 'Não encontramos seu CPF na base. Preencha seus dados abaixo.';
      lookupStatus.classList.remove('found');
      document.getElementById('fullName').value = '';
      document.getElementById('birthDate').value = '';
      foundMsg.textContent = 'Não encontramos um cadastro anterior. Preencha seus dados para continuar.';
    }

    document.getElementById('phoneDisplay').textContent = phoneInput.value;
    goToStep(2);
  }, 900);
});

// ---------- STEP 2: confirmar dados ----------
document.getElementById('backTo1').addEventListener('click', () => goToStep(1));

document.getElementById('toStep3').addEventListener('click', () => {
  const required = ['fullName', 'birthDate', 'unit'];
  let valid = true;
  required.forEach(id => {
    const el = document.getElementById(id);
    const shell = el.closest('.input-shell');
    if (!el.value) {
      shell.classList.add('invalid');
      valid = false;
    } else {
      shell.classList.remove('invalid');
    }
  });
  if (!valid) return;

  goToStep(3);
  startResendTimer();
  otpBoxes[0].focus();
});

// ---------- STEP 3: código OTP ----------
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

resendBtn.addEventListener('click', () => {
  startResendTimer();
  otpBoxes.forEach(b => (b.value = ''));
  otpBoxes[0].focus();
});

document.getElementById('backTo2').addEventListener('click', () => {
  clearInterval(timerInterval);
  goToStep(2);
});

// ---------- envio final ----------
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const code = otpBoxes.map(b => b.value).join('');

  // Simulação: código correto é sempre "123456" neste protótipo
  if (code.length !== 6 || code !== '123456') {
    otpErr.classList.add('show');
    otpBoxes.forEach(b => b.closest('.input-shell'));
    return;
  }
  otpErr.classList.remove('show');
  clearInterval(timerInterval);

  // ---------- salva o cadastro no store compartilhado ----------
  const unitSelect = document.getElementById('unit');
  const unitLabel = unitSelect.selectedOptions[0]
    ? unitSelect.selectedOptions[0].textContent
    : (VitalSyncStore.UNIT_LABELS[unitSelect.value] || '');

  const paciente = VitalSyncStore.savePaciente({
    nome_completo: document.getElementById('fullName').value.trim(),
    cpf: cpfInput.value.replace(/\D/g, ''),
    data_nascimento: document.getElementById('birthDate').value,
    cns: document.getElementById('cns').value.trim(),
    telefone: phoneInput.value,
    email: document.getElementById('email').value.trim(),
    unidade_referencia: unitLabel,
  });
  VitalSyncStore.setPacienteAtual(paciente.id);

  form.style.display = 'none';
  document.querySelector('.steps').style.display = 'none';
  footNote.style.display = 'none';
  successPane.classList.add('active');
});
