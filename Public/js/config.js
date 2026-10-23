// MODO DE FUNCIONAMENTO DO LOGIN DE PROFISSIONAIS
//   'local' -> tudo no navegador (localStorage), sem back-end. É o padrão.
//              Contas, pedidos de acesso e aprovações ficam só neste navegador/computador.
//   'api'   -> usa o back-end (Backend/) com PostgreSQL. Mude para 'api' quando puder rodá-lo.
window.VITALSYNC_MODO = window.VITALSYNC_MODO || 'local';

// URL base da API (só usada no modo 'api').
window.VITALSYNC_API = window.VITALSYNC_API || 'http://localhost:3000/api';
