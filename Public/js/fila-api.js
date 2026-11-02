/* =========================================================
   FILA-API — fila, prontuário e histórico de verdade (back-end + PostgreSQL)
   =========================================================
   Faz o papel do VitalSyncStore, mas lendo e gravando na API, e atualiza sozinha a cada
   poucos segundos (polling). Assim painel do profissional e tela do paciente funcionam em
   aparelhos DIFERENTES.

   Tem a mesma "cara" do VitalSyncStore (getFila, getFilaEntry, getPaciente, updateFilaEntry,
   onChange, adicionarEvolucao, adicionarMedicamento, reclassificar, getMeusAtendimentos...),
   então as telas usam um ou outro:
       const Dados = FilaAPI.ativo ? FilaAPI : VitalSyncStore;

   Só fica ativo quando window.VITALSYNC_MODO === 'api' (js/config.js).
   Carregue DEPOIS de config.js, auth.js (painel) e store.js.

   Quem usa qual sessão:
     - painel (profissional): token do login do profissional (Auth.authFetch);
     - histórico/receitas do paciente: token do paciente, entregue ao confirmar o código OTP
       (VitalSyncStore.getPacienteToken). Expira em 8 h; depois é só entrar de novo.

   Eventos (window):
     vitalsync:update  {key}      a fila/prontuário mudou (mesmo evento do store.js)
     vitalsync:sync               uma atualização com o servidor deu certo
     vitalsync:aviso   {tipo, mensagem}   'erro' | 'rede' | 'ok'
========================================================= */
const FilaAPI = (function () {
  const ativo = window.VITALSYNC_MODO === 'api';
  const API = window.VITALSYNC_API;
  const KEYS = VitalSyncStore.KEYS;

  const INTERVALO_PAINEL_MS = 5000;
  const INTERVALO_PACIENTE_MS = 3000; // quem foi chamado some da fila dos outros pacientes em até ~3 s
  const INTERVALO_HISTORICO_MS = 15000;
  const CICLOS_ENTRE_ATENDIMENTOS = 5; // na tela da fila, o histórico é atualizado a cada 5 ciclos (~15 s)

  // ---------- estado em memória ----------
  let filaBase = [];      // entradas normalizadas (formato do store local)
  let pacientes = {};     // pacienteId -> dados do paciente (só no painel)
  let detalhes = {};      // id da fila -> campos clínicos da avaliação (só no painel)
  let prontuarios = {};   // id da fila -> evolução, receitas, orientações, reclassificações (só no painel)
  let meus = [];          // atendimentos do paciente logado (histórico, receitas)
  let assinatura = '';    // resumo da última resposta, para só avisar quando algo MUDOU
  let assinaturaMeus = '';
  let modo = null;        // 'painel' | 'paciente' | 'historico' (quem está fazendo polling)
  let timer = null;
  let emAndamento = false;
  let ciclos = 0;
  let sessaoPendente = false; // paciente sem sessão válida no servidor: o aviso não some sozinho
  let unidadesCache = null;
  let unidadePacienteId = null;
  let unidadeNomePainel = null;

  // ---------- eventos ----------
  function emitir(tipo, detalhe) {
    window.dispatchEvent(new CustomEvent(tipo, { detail: detalhe || {} }));
  }
  function emitirMudanca() { emitir('vitalsync:update', { key: KEYS.FILA }); }
  function avisar(tipo, mensagem) { emitir('vitalsync:aviso', { tipo, mensagem }); }

  // ---------- HTTP ----------
  async function lerResposta(resp) {
    const dados = await resp.json().catch(() => null);
    if (!resp.ok) {
      const err = new Error((dados && dados.erro) || 'Algo deu errado. Tente novamente.');
      err.status = resp.status;
      throw err;
    }
    return dados;
  }

  function erroDeRede() {
    const err = new Error('Sem conexão com o servidor. Verifique a internet.');
    err.rede = true;
    return err;
  }

  // rotas do profissional (com token; Auth.authFetch manda para o login se expirar)
  async function pedirProfissional(metodo, caminho, corpo) {
    let resp;
    try {
      resp = await Auth.authFetch(caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined });
    } catch (e) {
      throw erroDeRede();
    }
    return lerResposta(resp);
  }

  // rotas públicas (paciente sem sessão)
  async function pedirPublico(metodo, caminho, corpo) {
    let resp;
    try {
      resp = await fetch(API + caminho, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch (e) {
      throw erroDeRede();
    }
    return lerResposta(resp);
  }

  // rotas do PACIENTE logado (token do OTP). Token vencido -> limpa e pede para entrar de novo.
  async function pedirPaciente(metodo, caminho, corpo) {
    const token = VitalSyncStore.getPacienteToken();
    let resp;
    try {
      resp = await fetch(API + caminho, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch (e) {
      throw erroDeRede();
    }
    if (resp.status === 401) {
      VitalSyncStore.setPacienteToken(null);
      const err = new Error('Sua sessão expirou. Entre novamente com o seu CPF para ver o histórico e as receitas.');
      err.status = 401;
      err.sessao = true;
      throw err;
    }
    return lerResposta(resp);
  }

  // ---------- normalização: linha da API -> formato usado pelas telas ----------
  // O relógio do aparelho pode estar errado, então a espera vem do SERVIDOR em segundos
  // e é "ancorada" no instante em que a resposta chegou:
  //   createdAt = recebidoEm - espera   (entrou na fila há `espera` segundos)
  //   chamadoEm = recebidoEm            (só para quem já foi chamado: congela a espera)
  function normalizar(r, recebidoEm) {
    const espera = Number(r.espera_segundos) || 0;
    const aguardando = r.status === 'aguardando';
    return {
      id: String(r.id),
      senha: r.senha,
      level: r.prioridade,
      status: r.status,
      guiche: r.guiche || null,
      createdAt: recebidoEm - espera * 1000,
      chamadoEm: aguardando ? null : recebidoEm,
      chamadas: Number(r.chamadas) || 0,
      chamandoDesde: r.chamando_ha_segundos != null ? recebidoEm - Number(r.chamando_ha_segundos) * 1000 : null,
      pacienteId: r.paciente_id != null ? String(r.paciente_id) : null,
      sintomas: r.sintomas || undefined,   // só na lista do painel (usado pelo painel Verde)
      avisosAtivos: r.avisos_ativos === true, // o paciente pediu aviso por WhatsApp/SMS
      // posição calculada pelo servidor (ordem exata, sem empate de segundos)
      posicao: r.posicao != null ? r.posicao : undefined,
      naFrente: r.pessoas_na_frente != null ? r.pessoas_na_frente : undefined,
      // tempo estimado de espera, calculado pelo servidor com os atendimentos reais da unidade
      esperaEstimadaMin: r.espera_estimada_min != null ? r.espera_estimada_min : undefined,
    };
  }

  function normalizarReceitas(lista) {
    return (lista || []).map((r) => ({
      id: String(r.id),
      por: r.por,
      criadoEm: r.criado_em_ms,
      medicamentos: (r.medicamentos || []).map((m) => ({
        id: String(m.id),
        nome: m.nome,
        dosagem: m.dosagem,
        posologia: m.posologia,
        duracao: m.duracao,
        comprado: m.comprado === true,
        compradoEm: m.comprado_em_ms || null,
        lembretes: (m.lembretes || []).map((l) => ({ id: String(l.id), canal: l.canal, enviadoEm: l.enviado_em_ms })),
      })),
    }));
  }

  function normalizarOrientacoes(lista) {
    return (lista || []).map((o) => ({
      id: String(o.id),
      por: o.por,
      texto: o.texto,
      atestado: o.atestado === true,
      diasAfastamento: o.dias_afastamento,
      criadoEm: o.criado_em_ms,
    }));
  }

  // prontuário completo de um atendimento (visão do profissional); null = cargo sem acesso clínico
  function normalizarProntuario(p) {
    if (!p) return {};
    return {
      evolucoes: (p.evolucoes || []).map((e) => ({ id: String(e.id), autor: e.autor, texto: e.texto, criadoEm: e.criado_em_ms })),
      receitas: normalizarReceitas(p.receitas),
      orientacoes: normalizarOrientacoes(p.orientacoes),
      reclassificacoes: (p.reclassificacoes || []).map((h) => ({
        id: String(h.id), de: h.de, para: h.para, motivo: h.motivo || '', em: h.em_ms, por: h.por,
      })),
    };
  }

  // resumo só do que as telas mostram: se não mudou, não redesenha (e não apaga o que
  // a pessoa está digitando nos formulários do painel)
  function assinar(linhas) {
    return JSON.stringify(linhas.map((r) => [
      r.id, r.status, r.guiche, r.prioridade, r.chamadas, r.nome_completo, r.posicao, r.pessoas_na_frente,
    ]));
  }

  // ---------- leitura (mesma assinatura do VitalSyncStore) ----------
  function camposClinicos(d) {
    if (!d) return {};
    return {
      descricao: d.descricao,
      tempo_inicio: d.tempo_inicio,
      intensidade: d.intensidade,
      alergias_medicamentos: d.alergias_medicamentos,
      sintomas: d.sintomas || [],
      unidade_referencia: unidadeNomePainel || undefined,
    };
  }

  function getFila() {
    return filaBase.map((f) => Object.assign({}, f, camposClinicos(detalhes[f.id]), prontuarios[f.id] || {}));
  }

  function getFilaEntry(id) {
    id = String(id);
    return getFila().find((f) => f.id === id) || null;
  }

  function getPaciente(id) {
    return pacientes[String(id)] || null;
  }

  // ---------- PAINEL ----------
  async function buscarPainel(forcar) {
    const linhas = await pedirProfissional('GET', '/fila/painel');
    const recebidoEm = Date.now();
    filaBase = linhas.map((r) => normalizar(r, recebidoEm));
    linhas.forEach((r) => {
      const pid = String(r.paciente_id);
      pacientes[pid] = Object.assign({}, pacientes[pid], { id: pid, nome_completo: r.nome_completo });
    });
    const nova = assinar(linhas);
    if (forcar || nova !== assinatura) {
      assinatura = nova;
      emitirMudanca();
    }
  }

  // ficha completa (CPF, sintomas, prontuário...) de um paciente da fila — chamada ao selecioná-lo
  async function carregarDetalhe(id) {
    try {
      const d = await pedirProfissional('GET', `/fila/${encodeURIComponent(id)}`);
      detalhes[String(id)] = d;
      prontuarios[String(id)] = normalizarProntuario(d.prontuario);
      const pid = String(d.paciente_id);
      pacientes[pid] = {
        id: pid,
        nome_completo: d.nome_completo,
        cpf: d.cpf,
        data_nascimento: d.data_nascimento,
        cns: d.cns,
        telefone: d.telefone,
        email: d.email,
        unidade_referencia: unidadeNomePainel || '',
      };
      emitirMudanca();
    } catch (e) {
      avisar('erro', e.message);
    }
  }

  // ---------- PRONTUÁRIO (painel) ----------
  // Cada função devolve Promise<boolean> (true = gravou). O servidor confere o cargo e a
  // unidade; o autor do registro vem do login, não do que a tela manda.
  async function escrever(id, metodo, caminho, corpo) {
    try {
      const resp = await pedirProfissional(metodo, caminho, corpo);
      if (resp && resp.prontuario) prontuarios[String(id)] = normalizarProntuario(resp.prontuario);
      if (/\/prioridade$/.test(caminho)) {
        await buscarPainel(true).catch(() => {}); // a ordem da fila mudou
      } else {
        emitirMudanca();
      }
      return true;
    } catch (e) {
      avisar(e.rede ? 'rede' : 'erro', e.message);
      return false;
    }
  }

  const enc = (v) => encodeURIComponent(v);

  function adicionarEvolucao(id, texto) {
    return escrever(id, 'POST', `/fila/${enc(id)}/evolucoes`, { texto });
  }
  function adicionarMedicamento(id, med) {
    return escrever(id, 'POST', `/fila/${enc(id)}/receitas`, med);
  }
  function registrarLembrete(id, medId, canal) {
    return escrever(id, 'POST', `/fila/${enc(id)}/medicamentos/${enc(medId)}/lembretes`, { canal });
  }
  function adicionarOrientacao(id, dados) {
    return escrever(id, 'POST', `/fila/${enc(id)}/orientacoes`, {
      texto: dados.texto,
      atestado: !!dados.atestado,
      dias_afastamento: dados.atestado ? dados.diasAfastamento : undefined,
    });
  }
  function reclassificar(id, nivel, motivo) {
    return escrever(id, 'PATCH', `/fila/${enc(id)}/prioridade`, { prioridade: nivel, motivo: motivo || '' });
  }

  // ---------- PACIENTE: fila ----------
  async function listarUnidades() {
    if (unidadesCache) return unidadesCache;
    const lista = await pedirPublico('GET', '/unidades');
    unidadesCache = Array.isArray(lista) ? lista : [];
    return unidadesCache;
  }

  // O cadastro do paciente ainda não pergunta a unidade; sem unidade de referência,
  // usamos a primeira cadastrada.
  async function resolverUnidadeId(nomeUnidade) {
    const lista = await listarUnidades();
    const achada = lista.find((u) => u.nome === nomeUnidade);
    if (achada) return achada.id;
    return lista.length ? lista[0].id : null;
  }

  function getMinhaSenhaId() {
    const id = VitalSyncStore.getMinhaSenhaId();
    // ids do modo local ("k3j2...") não existem no banco; só ids numéricos valem
    return id && /^\d{1,9}$/.test(String(id)) ? String(id) : null;
  }

  async function buscarPaciente(forcar) {
    const params = new URLSearchParams();
    const minhaId = getMinhaSenhaId();
    if (minhaId) params.set('id', minhaId);

    if (!unidadePacienteId) {
      const p = VitalSyncStore.getPacienteAtual();
      unidadePacienteId = await resolverUnidadeId(p && p.unidade_referencia);
    }
    if (unidadePacienteId) params.set('unidade_id', unidadePacienteId);

    if (!params.has('id') && !params.has('unidade_id')) {
      filaBase = [];
      return;
    }

    const resp = await pedirPublico('GET', `/fila/acompanhar?${params.toString()}`);
    const recebidoEm = Date.now();
    const lista = resp.fila.map((r) => normalizar(r, recebidoEm));

    if (resp.minha) {
      const eu = normalizar(resp.minha, recebidoEm);
      const local = VitalSyncStore.getPacienteAtual();
      eu.pacienteId = local ? local.id : null;
      const i = lista.findIndex((f) => f.id === eu.id);
      if (i >= 0) lista[i] = Object.assign({}, lista[i], eu); else lista.push(eu);
      unidadePacienteId = resp.unidade_id;
    }
    filaBase = lista;

    const nova = JSON.stringify([
      resp.fila.map((r) => [r.id, r.status, r.prioridade]),
      resp.minha && [resp.minha.id, resp.minha.status, resp.minha.guiche, resp.minha.chamadas,
        resp.minha.posicao, resp.minha.prioridade],
    ]);
    if (forcar || nova !== assinatura) {
      assinatura = nova;
      emitirMudanca();
    }
  }

  // -> { avaliacao_id, prioridade_calculada, fila: { id, senha, prioridade, status, created_at } }
  function criarAvaliacao(dados) {
    return pedirPublico('POST', '/sintomas/avaliacoes', dados);
  }

  // ---------- PACIENTE: histórico, receitas e orientações (exige a sessão do paciente) ----------
  function normalizarAtendimento(a, pacienteLocalId) {
    return {
      id: String(a.id),
      pacienteId: pacienteLocalId,
      senha: a.senha,
      level: a.prioridade,
      status: a.status,
      guiche: a.guiche || null,
      createdAt: a.criado_em_ms,
      descricao: a.descricao || '',
      tempo_inicio: a.tempo_inicio,
      intensidade: a.intensidade,
      alergias_medicamentos: a.alergias_medicamentos,
      sintomas: a.sintomas || [],
      receitas: normalizarReceitas(a.receitas),
      orientacoes: normalizarOrientacoes(a.orientacoes),
    };
  }

  function getMeusAtendimentos() {
    return meus;
  }

  async function carregarMeusAtendimentos() {
    const paciente = VitalSyncStore.getPacienteAtual();
    if (!paciente) {
      if (meus.length) { meus = []; assinaturaMeus = ''; emitirMudanca(); }
      return;
    }
    if (!VitalSyncStore.getPacienteToken()) {
      // quem entrou antes desta versão não tem token: precisa entrar de novo uma vez
      sessaoPendente = true;
      avisar('erro', 'Entre novamente com o seu CPF para ver o histórico e as receitas.');
      return;
    }
    try {
      const lista = await pedirPaciente('GET', '/pacientes/me/atendimentos');
      sessaoPendente = false;
      const nova = JSON.stringify(lista);
      meus = lista.map((a) => normalizarAtendimento(a, paciente.id));
      if (nova !== assinaturaMeus) {
        assinaturaMeus = nova;
        emitirMudanca();
      }
    } catch (e) {
      if (e.sessao) sessaoPendente = true;
      avisar(e.rede ? 'rede' : 'erro', e.message);
    }
  }

  async function confirmarCompra(atendimentoId, medId) {
    try {
      await pedirPaciente('POST', `/pacientes/me/medicamentos/${enc(medId)}/comprado`);
      await carregarMeusAtendimentos();
      return true;
    } catch (e) {
      avisar(e.rede ? 'rede' : 'erro', e.message);
      return false;
    }
  }

  // ---------- polling ----------
  async function ciclo() {
    if (emAndamento || !modo) return;
    emAndamento = true;
    try {
      if (modo === 'painel') {
        await buscarPainel(false);
      } else if (modo === 'paciente') {
        await buscarPaciente(false);
        if (ciclos % CICLOS_ENTRE_ATENDIMENTOS === 0) await carregarMeusAtendimentos();
      } else {
        await carregarMeusAtendimentos();
      }
      ciclos += 1;
      if (!sessaoPendente) avisar('ok');
      emitir('vitalsync:sync');
    } catch (e) {
      avisar(e.rede ? 'rede' : 'erro', e.rede ? 'Sem conexão com o servidor. Tentando de novo...' : e.message);
    } finally {
      emAndamento = false;
      agendar();
    }
  }

  function agendar() {
    clearTimeout(timer);
    if (!modo) return;
    const intervalo = modo === 'painel' ? INTERVALO_PAINEL_MS
      : modo === 'paciente' ? INTERVALO_PACIENTE_MS : INTERVALO_HISTORICO_MS;
    // aba em segundo plano não precisa consultar o servidor
    timer = setTimeout(() => (document.hidden ? agendar() : ciclo()), intervalo);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && modo) { clearTimeout(timer); ciclo(); }
  });

  function iniciar(m) {
    if (!ativo || modo) return;
    modo = m;
    ciclo();
  }

  function iniciarPainel() {
    const prof = window.Auth && Auth.getProfissional();
    unidadeNomePainel = (prof && prof.unidade_nome) || null;
    iniciar('painel');
  }
  function iniciarPaciente() { iniciar('paciente'); }
  function iniciarHistorico() { iniciar('historico'); }

  // ---------- escrita da fila (painel) ----------
  // Aplica a mudança na tela NA HORA (otimista) e confirma com o servidor; se o servidor
  // recusar (ex.: outra pessoa já mexeu nesse paciente), avisa e volta ao que o servidor diz.
  function aplicarOtimista(entrada, mudancas) {
    if (!('status' in mudancas)) return;

    const anterior = entrada.status;
    entrada.status = mudancas.status;
    if (mudancas.status === 'chamando') {
      if (anterior === 'chamando') {
        entrada.chamadas += 1;                       // rechamada: espera continua congelada na 1ª
      } else {
        entrada.chamadas = 1;
        entrada.chamadoEm = Date.now();
      }
      entrada.chamandoDesde = Date.now();
      if (mudancas.guiche) entrada.guiche = mudancas.guiche;
    } else if (mudancas.status === 'aguardando') {
      entrada.guiche = null;
      entrada.chamadoEm = null;
      entrada.chamadas = 0;
      entrada.chamandoDesde = null;
    } else if (mudancas.guiche) {
      entrada.guiche = mudancas.guiche;
    }
  }

  async function enviar(id, mudancas, entradaAntes) {
    try {
      const corpo = { status: mudancas.status };
      if (mudancas.guiche) corpo.guiche = mudancas.guiche;
      // rechamada tem que ser pedida de propósito (o servidor recusa "chamar" quem já está sendo chamado)
      if (mudancas.status === 'chamando' && entradaAntes.status === 'chamando') corpo.rechamar = true;
      const resp = await pedirProfissional('PATCH', `/fila/${encodeURIComponent(id)}/status`, corpo);
      // o servidor tentou avisar o paciente por mensagem e não conseguiu: o profissional chama em voz alta
      if (resp && resp.notificacao === 'falhou') {
        avisar('erro', 'Não foi possível enviar o aviso por mensagem ao paciente. Chame-o em voz alta.');
      }
    } catch (e) {
      avisar(e.rede ? 'rede' : 'erro', e.message);
    }
    // sempre termina buscando a verdade do servidor (desfaz a mudança otimista se foi recusada)
    try { await buscarPainel(true); } catch (e) { /* o próximo ciclo tenta de novo */ }
  }

  // Mesma assinatura do VitalSyncStore.updateFilaEntry(id, mudancas), só para STATUS e guichê.
  // (Prontuário e reclassificação têm funções próprias: adicionarEvolucao, reclassificar...)
  function updateFilaEntry(id, mudancas) {
    id = String(id);
    const entrada = filaBase.find((f) => f.id === id);
    if ('status' in mudancas && entrada) {
      const antes = Object.assign({}, entrada);
      aplicarOtimista(entrada, mudancas);
      emitirMudanca();
      enviar(id, mudancas, antes);
    }
    return getFilaEntry(id);
  }

  return {
    ativo,
    // fila, no formato do VitalSyncStore
    getFila, getFilaEntry, getPaciente, updateFilaEntry,
    onChange: VitalSyncStore.onChange,
    seedIfEmpty() { /* sem dados de demonstração quando a fila é a real */ },
    // prontuário (painel)
    adicionarEvolucao, adicionarMedicamento, registrarLembrete, adicionarOrientacao, reclassificar,
    // paciente: sessão, histórico e receitas
    getPacienteAtual: VitalSyncStore.getPacienteAtual,
    getMinhaSenhaId,
    setMinhaSenhaId: VitalSyncStore.setMinhaSenhaId,
    getMeusAtendimentos, carregarMeusAtendimentos, confirmarCompra,
    // específicos da API
    iniciarPainel, iniciarPaciente, iniciarHistorico, carregarDetalhe,
    listarUnidades, resolverUnidadeId, criarAvaliacao,
  };
})();
