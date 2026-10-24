const pwInput = document.getElementById('password');
const confirmInput = document.getElementById('confirmPassword');
const toggleBtn = document.getElementById('togglePw');
const eyeIcon = document.getElementById('eyeIcon');
const strengthBar = document.getElementById('pwStrength');

toggleBtn.addEventListener('click', () => {
  const show = pwInput.type === 'password';
  pwInput.type = show ? 'text' : 'password';
  toggleBtn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  eyeIcon.innerHTML = show
    ? '<path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-7-11-7a21.8 21.8 0 015.06-6.06M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 7 11 7a21.8 21.8 0 01-3.22 4.35M14.12 14.12a3 3 0 11-4.24-4.24"/><path d="M1 1l22 22"/>'
    : '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>';
});

function strengthScore(value) {
  let score = 0;
  if (value.length >= 8) score++;
  if (/[0-9]/.test(value) && /[a-zA-Z]/.test(value)) score++;
  if (/[^a-zA-Z0-9]/.test(value) || value.length >= 12) score++;
  return score;
}

pwInput.addEventListener('input', () => {
  const score = strengthScore(pwInput.value);
  strengthBar.className = 'pw-strength' + (score > 0 ? ' s' + score : '');
});

const form = document.getElementById('signupForm');
const email = document.getElementById('email');
const emailShell = email.closest('.input-shell');
const emailErr = document.getElementById('emailErr');
const pwShell = pwInput.closest('.input-shell');
const pwErr = document.getElementById('pwErr');
const confirmShell = confirmInput.closest('.input-shell');
const confirmErr = document.getElementById('confirmErr');

const roleSelect = document.getElementById('role');
const roleErr = document.getElementById('roleErr');
const formErr = document.getElementById('formErr');
const formOk = document.getElementById('formOk');
const cadBtn = document.getElementById('cadBtn');

// mostra a unidade onde o profissional será cadastrado (a do admin logado)
(function mostrarUnidade() {
  const prof = Auth.getProfissional();
  if (prof && prof.unidade_nome) {
    document.getElementById('cadSub').textContent =
      `Cadastre o acesso de um membro da sua equipe. O profissional entra na unidade ${prof.unidade_nome}.`;
  }
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  let valid = true;
  formErr.classList.remove('show');
  formOk.classList.remove('show');

  const nome = [document.getElementById('firstName').value, document.getElementById('lastName').value]
    .map((p) => p.trim()).filter(Boolean).join(' ');
  if (!nome) valid = false;

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value);
  if (!emailOk) {
    emailShell.classList.add('invalid');
    emailErr.classList.add('show');
    valid = false;
  } else {
    emailShell.classList.remove('invalid');
    emailErr.classList.remove('show');
  }

  if (!roleSelect.value) {
    roleErr.classList.add('show');
    valid = false;
  } else {
    roleErr.classList.remove('show');
  }

  if (pwInput.value.length < 8) {
    pwShell.classList.add('invalid');
    pwErr.classList.add('show');
    valid = false;
  } else {
    pwShell.classList.remove('invalid');
    pwErr.classList.remove('show');
  }

  if (confirmInput.value !== pwInput.value || !confirmInput.value) {
    confirmShell.classList.add('invalid');
    confirmErr.classList.add('show');
    valid = false;
  } else {
    confirmShell.classList.remove('invalid');
    confirmErr.classList.remove('show');
  }

  if (!valid) return;

  cadBtn.disabled = true;
  cadBtn.textContent = 'Cadastrando…';
  try {
    const data = await Auth.cadastrarProfissional({
      nome,
      email: email.value.trim(),
      senha: pwInput.value,
      cargo: roleSelect.value,
    });

    formOk.textContent = `${data.nome} cadastrado(a) com sucesso. Já pode entrar com o e-mail ${data.email}.`;
    formOk.classList.add('show');
    form.reset();
    strengthBar.className = 'pw-strength';
  } catch (err) {
    formErr.textContent = err.message === 'Failed to fetch'
      ? 'Não foi possível conectar ao servidor. Tente novamente.'
      : err.message;
    formErr.classList.add('show');
  } finally {
    cadBtn.disabled = false;
    cadBtn.textContent = 'Cadastrar profissional';
  }
});
