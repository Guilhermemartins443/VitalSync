const pwInput = document.getElementById('password');
  const toggleBtn = document.getElementById('togglePw');
  const eyeIcon = document.getElementById('eyeIcon');

  toggleBtn.addEventListener('click', () => {
    const show = pwInput.type === 'password';
    pwInput.type = show ? 'text' : 'password';
    toggleBtn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    eyeIcon.innerHTML = show
      ? '<path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-7-11-7a21.8 21.8 0 015.06-6.06M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 7 11 7a21.8 21.8 0 01-3.22 4.35M14.12 14.12a3 3 0 11-4.24-4.24"/><path d="M1 1l22 22"/>'
      : '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>';
  });

  const form = document.getElementById('loginForm');
  const email = document.getElementById('email');
  const emailShell = email.closest('.input-shell');
  const emailErr = document.getElementById('emailErr');
  const pwShell = pwInput.closest('.input-shell');
  const pwErr = document.getElementById('pwErr');

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

    if (!pwInput.value) {
      pwShell.classList.add('invalid');
      pwErr.classList.add('show');
      valid = false;
    } else {
      pwShell.classList.remove('invalid');
      pwErr.classList.remove('show');
    }

    if (valid) {
      // Placeholder: conectar ao endpoint de autenticação real do VitalSync
      console.log('Login enviado:', { email: email.value, remember: document.getElementById('remember').checked });
    }
  });