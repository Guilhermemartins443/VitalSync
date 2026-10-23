// MODO DE FUNCIONAMENTO DO LOGIN DE PROFISSIONAIS
//   'local' -> tudo no navegador (localStorage), sem back-end.
//   'api'   -> usa o back-end (Backend/) com PostgreSQL.
//
// Automático:
//   - Abrindo no seu computador (localhost, 127.0.0.1 ou arquivo) -> 'local' (como sempre foi).
//   - Publicado online (Render etc., servido pelo próprio back-end) -> 'api', mesma origem em /api.
// Para forçar outro valor, defina window.VITALSYNC_MODO / window.VITALSYNC_API ANTES de carregar este arquivo.
(function () {
  var host = window.location.hostname;
  var emDev = !host || host === 'localhost' || host === '127.0.0.1';
  window.VITALSYNC_MODO = window.VITALSYNC_MODO || (emDev ? 'local' : 'api');
  window.VITALSYNC_API = window.VITALSYNC_API || (emDev ? 'http://localhost:3000/api' : window.location.origin + '/api');
})();
