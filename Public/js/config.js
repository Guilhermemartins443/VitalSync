// MODO DE FUNCIONAMENTO DO LOGIN DE PROFISSIONAIS
//   'api'   -> usa o back-end (Backend/ + PostgreSQL). É o padrão agora.
//   'local' -> tudo no navegador (localStorage), sem back-end. Só para demonstração:
//              contas, pedidos de acesso e aprovações ficam só neste navegador/computador.
window.VITALSYNC_MODO = window.VITALSYNC_MODO || 'api';

// URL base da API (só usada no modo 'api').
//   - Publicado (Vercel) ou aberto em http://localhost:3000 -> '/api' (mesma origem).
//   - Aberto por Live Server (outra porta) ou direto pelo arquivo -> http://localhost:3000/api
(function () {
  var host = location.hostname;
  var ehLocal = host === 'localhost' || host === '127.0.0.1';
  var mesmaOrigem = location.protocol !== 'file:' && (!ehLocal || location.port === '3000');
  window.VITALSYNC_API = window.VITALSYNC_API || (mesmaOrigem ? '/api' : 'http://localhost:3000/api');
})();
