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

form.addEventListener('submit', (e) => {
  e.preventDefault();
  let valid = true;

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value);
  if (!emailOk) {
    emailShell.classList.add('invalid');
    emailErr.classList.add('show');
    valid = false;
  } else {
    emailShell.classList.remove('invalid');
    emailErr.classList.remove('show');
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

  if (valid) {
    // Placeholder: conectar ao endpoint real de cadastro do VitalSync
    console.log('Cadastro enviado:', {
      firstName: document.getElementById('firstName').value,
      lastName: document.getElementById('lastName').value,
      email: email.value,
      role: document.getElementById('role').value
    });
  }
});
