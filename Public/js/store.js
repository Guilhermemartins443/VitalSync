/* =========================================================
   VITALSYNC STORE — "banco de dados" simulado no navegador
   =========================================================
   Sem back-end ainda: usa localStorage para que as telas do
   MESMO navegador conversem entre si (ex.: paciente envia
   sintomas em uma aba e o profissional vê na fila, em outra).

   Limite importante: localStorage é por navegador/dispositivo.
   Isso sincroniza abas e telas do mesmo computador, mas não
   sincroniza entre dispositivos diferentes — isso só é possível
   com um back-end real (API + banco), que pode substituir estas
   funções por chamadas fetch() mantendo a mesma assinatura.
========================================================= */

const VitalSyncStore = (function () {
  const KEYS = {
    PACIENTES: 'vitalsync_pacientes',
    PACIENTE_ATUAL: 'vitalsync_paciente_atual',
    FILA: 'vitalsync_fila',
    CONTADORES: 'vitalsync_contadores',
    MINHA_SENHA_ID: 'vitalsync_minha_senha_id',
    SEED_DONE: 'vitalsync_seed_done',
  };

  // ---------- CONFIG COMPARTILHADA ----------
  const PRIORITY = [
    { level: 0, key: 'emerg',  label: 'Emergência',    letter: 'E', dot: 't-emerg'  },
    { level: 1, key: 'urg',    label: 'Urgente',       letter: 'U', dot: 't-urg'    },
    { level: 2, key: 'pouco',  label: 'Pouco urgente', letter: 'P', dot: 't-pouco'  },
    { level: 3, key: 'naourg', label: 'Não urgente',   letter: 'N', dot: 't-naourg' },
  ];

  // chaves iguais às usadas nos checkboxes de sintomas.html
  const SINTOMAS_CATALOGO = {
    dor_peito:   { label: 'Dor no peito',         redFlag: true  },
    falta_ar:    { label: 'Falta de ar',          redFlag: true  },
    sangramento: { label: 'Sangramento',          redFlag: true  },
    desmaio:     { label: 'Tontura / desmaio',    redFlag: true  },
    febre:       { label: 'Febre alta',           redFlag: false },
    vomito:      { label: 'Vômito persistente',   redFlag: false },
    dor_cabeca:  { label: 'Dor de cabeça forte',  redFlag: false },
  };

  const UNIT_LABELS = {
    'ubs-jardim': 'UBS Jardim das Flores',
    'upa-vila-nova': 'UPA Vila Nova',
    'ubs-centro': 'UBS Centro',
    'outra': 'Unidade a definir',
  };

  const TEMPO_INICIO_LABEL = {
    agora: 'Começou agora, nos últimos minutos',
    hoje: 'Hoje',
    dias: 'Há alguns dias',
    semana: 'Há mais de uma semana',
  };

  // ---------- LEITURA / ESCRITA BAIXO NÍVEL ----------
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // localStorage indisponível — segue sem persistir neste protótipo
    }
    // avisa quem está OUVINDO NA MESMA aba (o evento nativo "storage" só
    // dispara em OUTRAS abas, então replicamos manualmente aqui)
    window.dispatchEvent(new CustomEvent('vitalsync:update', { detail: { key } }));
  }

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // ---------- PACIENTES ----------
  function getPacientes() {
    return readJSON(KEYS.PACIENTES, {});
  }

  function savePaciente(paciente) {
    const pacientes = getPacientes();
    const id = paciente.id || uid();
    pacientes[id] = { ...paciente, id };
    writeJSON(KEYS.PACIENTES, pacientes);
    return pacientes[id];
  }

  function findPacienteByCpf(cpfDigits) {
    const pacientes = getPacientes();
    return Object.values(pacientes).find(p => p.cpf === cpfDigits) || null;
  }

  function getPaciente(id) {
    return getPacientes()[id] || null;
  }

  function setPacienteAtual(id) {
    try { localStorage.setItem(KEYS.PACIENTE_ATUAL, id); } catch (err) { /* segue sem persistir */ }
  }

  function getPacienteAtual() {
    let id = null;
    try { id = localStorage.getItem(KEYS.PACIENTE_ATUAL); } catch (err) { /* indisponível */ }
    return id ? getPaciente(id) : null;
  }

  // ---------- SENHAS (contador por nível de prioridade) ----------
  function nextSenha(level) {
    const contadores = readJSON(KEYS.CONTADORES, { 0: 0, 1: 0, 2: 0, 3: 0 });
    contadores[level] = (contadores[level] || 0) + 1;
    writeJSON(KEYS.CONTADORES, contadores);
    return `${PRIORITY[level].letter}${String(contadores[level]).padStart(3, '0')}`;
  }

  // ---------- FILA DE ATENDIMENTO ----------
  function getFila() {
    return readJSON(KEYS.FILA, []);
  }

  function addToFila(entry) {
    const fila = getFila();
    const completo = {
      status: 'aguardando',
      guiche: null,
      createdAt: Date.now(),
      ...entry,
      id: entry.id || uid(),
    };
    fila.push(completo);
    writeJSON(KEYS.FILA, fila);
    return completo;
  }

  function updateFilaEntry(id, changes) {
    const fila = getFila();
    const idx = fila.findIndex(f => f.id === id);
    if (idx === -1) return null;
    fila[idx] = { ...fila[idx], ...changes };
    writeJSON(KEYS.FILA, fila);
    return fila[idx];
  }

  function getFilaEntry(id) {
    return getFila().find(f => f.id === id) || null;
  }

  function setMinhaSenhaId(id) {
    try { localStorage.setItem(KEYS.MINHA_SENHA_ID, id); } catch (err) { /* segue sem persistir */ }
  }

  function getMinhaSenhaId() {
    try { return localStorage.getItem(KEYS.MINHA_SENHA_ID); } catch (err) { return null; }
  }

  // ---------- SEED (só na primeira carga, pra fila não nascer vazia) ----------
  function seedIfEmpty() {
    let already = false;
    try { already = localStorage.getItem(KEYS.SEED_DONE) === '1'; } catch (err) { /* indisponível */ }
    if (already || getFila().length) return;

    const seedPacientes = [
      { nome_completo: 'Maria Aparecida Souza', cpf: '38912456700', data_nascimento: '1958-03-14', cns: '700 6031 4455 0012', telefone: '(11) 98221-3344', email: 'maria.souza@exemplo.com', unidade_referencia: 'UBS Jardim das Flores', level: 0, descricao: 'Dor forte no peito que começou de repente, irradiando para o braço esquerdo. Sudorese e falta de ar.', tempo_inicio: 'agora', intensidade: 9, alergias_medicamentos: 'Alergia a dipirona.', sintomas: ['dor_peito', 'falta_ar', 'desmaio'], minutosAtras: 6 },
      { nome_completo: 'João Pedro Lima', cpf: '25587744401', data_nascimento: '1990-11-02', cns: '700 1122 3344 0099', telefone: '(11) 97744-1122', email: '', unidade_referencia: 'UBS Jardim das Flores', level: 1, descricao: 'Corte profundo na mão ao manusear ferramenta de trabalho, sangramento não estanca com o curativo.', tempo_inicio: 'hoje', intensidade: 7, alergias_medicamentos: 'Nenhuma relatada.', sintomas: ['sangramento'], minutosAtras: 14 },
      { nome_completo: 'Antônio Carlos Ferreira', cpf: '11223344556', data_nascimento: '1975-07-22', cns: '', telefone: '(11) 99988-7766', email: 'ac.ferreira@exemplo.com', unidade_referencia: 'UBS Jardim das Flores', level: 1, descricao: 'Febre alta há dois dias, calafrios e dor no corpo. Hoje pela manhã começou a sentir falta de ar leve.', tempo_inicio: 'dias', intensidade: 6, alergias_medicamentos: 'Alergia a penicilina.', sintomas: ['febre', 'falta_ar'], minutosAtras: 21 },
      { nome_completo: 'Beatriz Nogueira Alves', cpf: '44556677889', data_nascimento: '2001-01-30', cns: '700 5566 7788 0033', telefone: '(11) 96655-4433', email: 'bia.alves@exemplo.com', unidade_referencia: 'UBS Jardim das Flores', level: 2, descricao: 'Dor de cabeça latejante e tontura ao se levantar, começou ontem à noite.', tempo_inicio: 'dias', intensidade: 5, alergias_medicamentos: 'Nenhuma relatada.', sintomas: ['dor_cabeca', 'desmaio'], minutosAtras: 27 },
      { nome_completo: 'Sebastião dos Reis', cpf: '77889900112', data_nascimento: '1965-05-09', cns: '700 8899 0011 0044', telefone: '(11) 95544-3322', email: '', unidade_referencia: 'UBS Jardim das Flores', level: 2, descricao: 'Dor abdominal leve após as refeições, com náusea ocasional, há cerca de uma semana.', tempo_inicio: 'semana', intensidade: 4, alergias_medicamentos: 'Nenhuma relatada.', sintomas: ['vomito'], minutosAtras: 33 },
      { nome_completo: 'Luiza Martins Cardoso', cpf: '99001122334', data_nascimento: '1998-09-18', cns: '', telefone: '(11) 94433-2211', email: 'luiza.cardoso@exemplo.com', unidade_referencia: 'UBS Jardim das Flores', level: 3, descricao: 'Tosse seca persistente há alguns dias, sem febre, quer uma avaliação de rotina.', tempo_inicio: 'semana', intensidade: 2, alergias_medicamentos: 'Nenhuma relatada.', sintomas: [], minutosAtras: 40 },
    ];

    const pacientes = getPacientes();
    const fila = [];

    seedPacientes.forEach(p => {
      const pacienteId = uid();
      pacientes[pacienteId] = {
        id: pacienteId,
        nome_completo: p.nome_completo,
        cpf: p.cpf,
        data_nascimento: p.data_nascimento,
        cns: p.cns,
        telefone: p.telefone,
        email: p.email,
        unidade_referencia: p.unidade_referencia,
      };

      fila.push({
        id: uid(),
        pacienteId,
        senha: nextSenha(p.level),
        level: p.level,
        descricao: p.descricao,
        tempo_inicio: p.tempo_inicio,
        intensidade: p.intensidade,
        alergias_medicamentos: p.alergias_medicamentos,
        sintomas: p.sintomas,
        unidade_referencia: p.unidade_referencia,
        status: 'aguardando',
        guiche: null,
        createdAt: Date.now() - p.minutosAtras * 60 * 1000,
      });
    });

    writeJSON(KEYS.PACIENTES, pacientes);
    writeJSON(KEYS.FILA, fila);
    try { localStorage.setItem(KEYS.SEED_DONE, '1'); } catch (err) { /* indisponível */ }
  }

  // ---------- REATIVIDADE ----------
  // dispara callback quando o "banco" muda — tanto em outra aba (evento
  // nativo "storage") quanto na mesma aba (evento customizado acima).
  function onChange(callback) {
    window.addEventListener('storage', (e) => {
      if (Object.values(KEYS).includes(e.key)) callback(e.key);
    });
    window.addEventListener('vitalsync:update', (e) => callback(e.detail.key));
  }

  return {
    KEYS, PRIORITY, SINTOMAS_CATALOGO, UNIT_LABELS, TEMPO_INICIO_LABEL,
    savePaciente, findPacienteByCpf, getPaciente, getPacientes,
    setPacienteAtual, getPacienteAtual,
    nextSenha,
    getFila, addToFila, updateFilaEntry, getFilaEntry,
    setMinhaSenhaId, getMinhaSenhaId,
    seedIfEmpty,
    onChange,
  };
})();
