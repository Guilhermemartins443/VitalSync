/* =========================================================
   AUTH — sessão do profissional + "middleware" de rota do front
   =========================================================
   Dois modos (ver js/config.js):
     'local' (padrão) -> contas no localStorage deste navegador, sem back-end.
     'api'            -> back-end real (JWT + PostgreSQL).

   Carregue em <head>, de forma síncrona, DEPOIS de js/config.js:
     <script src="js/config.js"></script>
     <script src="js/auth.js"></script>
     <script>Auth.exigirLogin();</script>                       // painel, verde
     <script>Auth.exigirLogin({ cargos: ['admin'] });</script>  // cadastro

   Telas usam só a interface abaixo (login, solicitarAcesso, cadastrarProfissional,
   listarSolicitacoes, decidirSolicitacao, listarUnidades), igual nos dois modos.

   IMPORTANTE: isto protege a TELA, não o dado. No modo local NÃO existe segurança
   real (qualquer pessoa com acesso ao navegador pode ler/editar o localStorage):
   serve para demonstração. A segurança de verdade é a do modo 'api'.
========================================================= */
(function () {
  const MODO = window.VITALSYNC_MODO === 'api' ? 'api' : 'local';
  const API = window.VITALSYNC_API;
  const KEY_TOKEN = 'vitalsync_token';
  const KEY_PROF = 'vitalsync_profissional';
  const KEY_CONTAS = 'vitalsync_profissionais';
  const LOGIN_URL = 'login.html';
  const HOME_URL = 'painel.html';
  const SESSAO_MS = 8 * 60 * 60 * 1000;

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const CARGOS_VALIDOS = ['medico', 'enfermeiro', 'tecnico', 'recepcao', 'admin'];
  const CARGOS_SOLICITAVEIS = ['medico', 'enfermeiro', 'tecnico', 'recepcao'];

  const UNIDADES_LOCAIS = [
    { id: 'ubs-jardim', nome: 'UBS Jardim das Flores' },
    { id: 'upa-vila-nova', nome: 'UPA Vila Nova' },
    { id: 'ubs-centro', nome: 'UBS Centro' },
  ];
  // Conta de demonstração criada no 1º uso do modo local, para existir alguém que aprove pedidos.
  const ADMIN_DEMO = { nome: 'Administrador (demo)', email: 'admin@vitalsync.local', senha: 'admin1234', unidade_id: 'ubs-jardim' };

  // ---------- sessão (storage) ----------
  // "Manter conectado" -> localStorage; senão sessionStorage (some ao fechar a aba)
  function lerStorage(key) {
    try { return sessionStorage.getItem(key) || localStorage.getItem(key); } catch (e) { return null; }
  }
  function limpar() {
    [KEY_TOKEN, KEY_PROF].forEach((k) => {
      try { sessionStorage.removeItem(k); } catch (e) {}
      try { localStorage.removeItem(k); } catch (e) {}
    });
  }
  function salvar(token, profissional, manter) {
    limpar();
    const st = manter ? localStorage : sessionStorage;
    st.setItem(KEY_TOKEN, token);
    st.setItem(KEY_PROF, JSON.stringify(profissional));
  }
  function getToken() { return lerStorage(KEY_TOKEN); }
  function getProfissional() {
    try { return JSON.parse(lerStorage(KEY_PROF)); } catch (e) { return null; }
  }
  function atualizarProfissional(prof) {
    const manter = !!(() => { try { return localStorage.getItem(KEY_TOKEN); } catch (e) { return null; } })();
    const st = manter ? localStorage : sessionStorage;
    try { st.setItem(KEY_PROF, JSON.stringify(prof)); } catch (e) {}
  }

  // token expirado? (checagem local só para evitar ida desnecessária ao servidor)
  function tokenExpirado(token) {
    try {
      if (token.startsWith('local:')) return Number(token.split(':')[2]) <= Date.now();
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.exp && payload.exp * 1000 <= Date.now();
    } catch (e) { return true; }
  }

  function irParaLogin() {
    limpar();
    window.location.replace(LOGIN_URL);
  }

  function logout() { irParaLogin(); }

  // =========================================================
  // MODO API
  // =========================================================
  async function authFetch(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const resp = await fetch(`${API}${path}`, Object.assign({}, options, { headers }));
    if (resp.status === 401) irParaLogin();
    return resp;
  }
  async function jsonOuErro(resp, padrao) {
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.erro || padrao);
    return data;
  }

  const api = {
    async login(email, senha, manter) {
      const resp = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });
      const data = await jsonOuErro(resp, 'Não foi possível entrar.');
      salvar(data.token, data.profissional, manter);
      return data.profissional;
    },
    async listarUnidades() {
      const resp = await fetch(`${API}/unidades`);
      if (!resp.ok) throw new Error('Falha ao listar unidades.');
      return resp.json();
    },
    async solicitarAcesso(dados) {
      const resp = await fetch(`${API}/auth/solicitar-acesso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });
      return jsonOuErro(resp, 'Não foi possível enviar a solicitação.');
    },
    async cadastrarProfissional(dados) {
      const resp = await authFetch('/auth/cadastro', { method: 'POST', body: JSON.stringify(dados) });
      return jsonOuErro(resp, 'Não foi possível cadastrar.');
    },
    async listarSolicitacoes() {
      const resp = await authFetch('/auth/solicitacoes');
      return jsonOuErro(resp, 'Não foi possível listar as solicitações.');
    },
    async decidirSolicitacao(id, acao) {
      const resp = await authFetch(`/auth/solicitacoes/${id}`, { method: 'PATCH', body: JSON.stringify({ acao }) });
      return jsonOuErro(resp, 'Não foi possível atualizar.');
    },
    exigirLogin(opcoes) {
      const token = getToken();
      if (!token || tokenExpirado(token)) { irParaLogin(); return; }
      const raiz = document.documentElement;
      raiz.style.visibility = 'hidden'; // evita "piscar" conteúdo protegido antes da validação
      authFetch('/auth/me')
        .then(async (resp) => {
          if (!resp.ok) throw new Error('sessao');
          const { profissional } = await resp.json();
          atualizarProfissional(profissional);
          if (opcoes.cargos && !opcoes.cargos.includes(profissional.cargo)) {
            window.location.replace(HOME_URL);
            return;
          }
          raiz.style.visibility = '';
        })
        .catch(() => irParaLogin()); // servidor fora do ar ou sessão inválida: não libera a tela
    },
  };

  // =========================================================
  // MODO LOCAL (localStorage, sem back-end)
  // =========================================================
  function lerContas() {
    try { return JSON.parse(localStorage.getItem(KEY_CONTAS)) || []; } catch (e) { return []; }
  }
  function gravarContas(contas) {
    try { localStorage.setItem(KEY_CONTAS, JSON.stringify(contas)); }
    catch (e) { throw new Error('Não foi possível salvar neste navegador (armazenamento indisponível).'); }
  }
  function novoId() { return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function novoSalt() {
    try {
      const a = new Uint8Array(8); crypto.getRandomValues(a);
      return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { return Math.random().toString(36).slice(2, 10); }
  }
  // SHA-256 quando o navegador permite (localhost/https); senão um hash simples. Protótipo, não é segurança.
  async function hashSenha(senha, salt) {
    const txt = `${salt}:${senha}`;
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381;
    for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) >>> 0;
    return 'x' + h.toString(16);
  }
  function nomeUnidade(id) {
    const u = UNIDADES_LOCAIS.find((x) => x.id === id);
    return u ? u.nome : '';
  }
  function publico(c) {
    return { id: c.id, nome: c.nome, email: c.email, cargo: c.cargo, status: c.status, unidade_id: c.unidade_id, unidade_nome: c.unidade_nome };
  }

  let seedPromise = null;
  function garantirAdminDemo() {
    if (!seedPromise) {
      seedPromise = (async () => {
        const contas = lerContas();
        if (contas.some((c) => c.cargo === 'admin')) return;
        const salt = novoSalt();
        contas.push({
          id: novoId(), nome: ADMIN_DEMO.nome, email: ADMIN_DEMO.email,
          salt, senha: await hashSenha(ADMIN_DEMO.senha, salt),
          cargo: 'admin', status: 'ativo',
          unidade_id: ADMIN_DEMO.unidade_id, unidade_nome: nomeUnidade(ADMIN_DEMO.unidade_id),
          criadoEm: Date.now(),
        });
        gravarContas(contas);
      })();
    }
    return seedPromise;
  }

  // bloqueio de tentativas (em memória): 5 falhas em 15 min
  const falhas = new Map();
  function bloqueado(chave) {
    const r = falhas.get(chave);
    if (!r) return false;
    if (Date.now() - r.desde > 15 * 60 * 1000) { falhas.delete(chave); return false; }
    return r.count >= 5;
  }
  function registrarFalha(chave) {
    const r = falhas.get(chave);
    if (!r || Date.now() - r.desde > 15 * 60 * 1000) falhas.set(chave, { count: 1, desde: Date.now() });
    else r.count++;
  }

  function sessaoLocal() {
    const token = getToken();
    if (!token || !token.startsWith('local:') || tokenExpirado(token)) return null;
    const id = token.split(':')[1];
    const conta = lerContas().find((c) => c.id === id);
    return conta && conta.status === 'ativo' ? conta : null;
  }
  function exigirAdminLocal() {
    const conta = sessaoLocal();
    if (!conta || conta.cargo !== 'admin') throw new Error('Você não tem permissão para esta ação.');
    return conta;
  }
  function validarDados({ nome, email, senha, cargo }, cargosOk) {
    if (!nome || !String(nome).trim() || !email || !senha) throw new Error('Preencha nome, e-mail, senha e função.');
    if (!cargosOk.includes(cargo)) throw new Error('Função inválida.');
    if (!EMAIL_REGEX.test(email)) throw new Error('E-mail inválido.');
    if (senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  }
  async function criarConta(dados, unidade_id, status) {
    const email = dados.email.trim().toLowerCase();
    const contas = lerContas();
    if (contas.some((c) => c.email === email)) throw new Error('Já existe uma conta ou solicitação com este e-mail.');
    const salt = novoSalt();
    const conta = {
      id: novoId(), nome: dados.nome.trim(), email, salt,
      senha: await hashSenha(dados.senha, salt),
      cargo: dados.cargo, status, unidade_id, unidade_nome: nomeUnidade(unidade_id), criadoEm: Date.now(),
    };
    contas.push(conta);
    gravarContas(contas);
    return conta;
  }

  const local = {
    async login(email, senha, manter) {
      await garantirAdminDemo();
      const chave = String(email).trim().toLowerCase();
      if (bloqueado(chave)) throw new Error('Muitas tentativas. Aguarde alguns minutos e tente de novo.');
      const conta = lerContas().find((c) => c.email === chave);
      const ok = conta && (await hashSenha(senha, conta.salt)) === conta.senha;
      if (!ok) { registrarFalha(chave); throw new Error('E-mail ou senha inválidos.'); }
      falhas.delete(chave);
      if (conta.status === 'pendente') throw new Error('Seu acesso ainda está aguardando aprovação do administrador da unidade.');
      if (conta.status === 'recusado') throw new Error('Sua solicitação de acesso não foi aprovada. Fale com a administração da unidade.');
      const token = `local:${conta.id}:${Date.now() + SESSAO_MS}`;
      salvar(token, publico(conta), manter);
      return publico(conta);
    },
    async listarUnidades() { return UNIDADES_LOCAIS.slice(); },
    async solicitarAcesso(dados) {
      await garantirAdminDemo();
      validarDados(dados, CARGOS_SOLICITAVEIS); // 'admin' nunca por aqui
      if (!UNIDADES_LOCAIS.some((u) => u.id === dados.unidade_id)) throw new Error('Unidade de saúde inválida.');
      await criarConta(dados, dados.unidade_id, 'pendente');
      return { mensagem: 'Solicitação enviada. Você poderá entrar assim que o administrador da unidade aprovar.' };
    },
    async cadastrarProfissional(dados) {
      const admin = exigirAdminLocal();
      validarDados(dados, CARGOS_VALIDOS);
      return publico(await criarConta(dados, admin.unidade_id, 'ativo'));
    },
    async listarSolicitacoes() {
      const admin = exigirAdminLocal();
      return lerContas()
        .filter((c) => c.status === 'pendente' && c.unidade_id === admin.unidade_id)
        .sort((a, b) => a.criadoEm - b.criadoEm)
        .map(publico);
    },
    async decidirSolicitacao(id, acao) {
      const admin = exigirAdminLocal();
      if (!['aprovar', 'recusar'].includes(acao)) throw new Error("Informe acao: 'aprovar' ou 'recusar'.");
      const contas = lerContas();
      const conta = contas.find((c) => c.id === id && c.status === 'pendente' && c.unidade_id === admin.unidade_id);
      if (!conta) throw new Error('Solicitação não encontrada.');
      conta.status = acao === 'aprovar' ? 'ativo' : 'recusado';
      gravarContas(contas);
      return publico(conta);
    },
    exigirLogin(opcoes) {
      const token = getToken();
      if (!token || tokenExpirado(token)) { irParaLogin(); return; }
      const raiz = document.documentElement;
      raiz.style.visibility = 'hidden';
      garantirAdminDemo()
        .then(() => {
          const conta = sessaoLocal();
          if (!conta) throw new Error('sessao');
          atualizarProfissional(publico(conta));
          if (opcoes.cargos && !opcoes.cargos.includes(conta.cargo)) {
            window.location.replace(HOME_URL);
            return;
          }
          raiz.style.visibility = '';
        })
        .catch(() => irParaLogin());
    },
  };

  const impl = MODO === 'api' ? api : local;

  function exigirLogin(opcoes = {}) { impl.exigirLogin(opcoes); }

  // botões/links com data-logout ou id="logoutLink" saem da sessão
  document.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-logout]');
    if (alvo) { e.preventDefault(); logout(); }
  });

  window.Auth = {
    modo: MODO,
    adminDemo: { email: ADMIN_DEMO.email, senha: ADMIN_DEMO.senha },
    login: (...a) => impl.login(...a),
    listarUnidades: () => impl.listarUnidades(),
    solicitarAcesso: (d) => impl.solicitarAcesso(d),
    cadastrarProfissional: (d) => impl.cadastrarProfissional(d),
    listarSolicitacoes: () => impl.listarSolicitacoes(),
    decidirSolicitacao: (id, acao) => impl.decidirSolicitacao(id, acao),
    exigirLogin, logout, getToken, getProfissional, authFetch,
  };
})();
