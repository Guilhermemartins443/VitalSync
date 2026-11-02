/* =========================================================
   PACIENTE-API — conversa do front do paciente com o back-end
   (cadastro, busca por CPF e código de verificação por SMS/WhatsApp).
   Carregue DEPOIS de js/config.js e js/store.js.
   Só é usado quando window.VITALSYNC_MODO === 'api'; no modo 'local'
   as telas continuam na simulação antiga.
========================================================= */
const PacienteAPI = (function () {
  const ativo = window.VITALSYNC_MODO === 'api';
  const API = window.VITALSYNC_API;

  async function chamar(metodo, caminho, corpo) {
    let resp;
    try {
      resp = await fetch(API + caminho, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch (e) {
      const err = new Error('Sem conexão com o servidor. Verifique sua internet e tente de novo.');
      err.rede = true;
      throw err;
    }
    let dados = null;
    try { dados = await resp.json(); } catch (e) { /* corpo vazio */ }
    if (!resp.ok) {
      const err = new Error((dados && dados.erro) || 'Algo deu errado. Tente novamente.');
      err.status = resp.status;
      throw err;
    }
    return dados;
  }

  // -> { id, telefone_mascarado } ou null se o CPF não existe
  async function buscarPorCpf(cpfDigitos) {
    try {
      const r = await chamar('GET', `/pacientes/cpf/${cpfDigitos}`);
      return r.paciente;
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  // -> { id, ja_cadastrado }
  function cadastrar(dados) {
    return chamar('POST', '/pacientes', dados);
  }

  // Envia o código para o telefone CADASTRADO do paciente. -> { enviado, canal, validade_minutos }
  function solicitarCodigo(pacienteId, canal) {
    return chamar('POST', '/otp/solicitar', { paciente_id: pacienteId, canal: canal || 'whatsapp' });
  }

  // -> { verificado, paciente, token }
  // O token é a sessão do paciente no servidor (vale 8 h): é ele que abre o histórico, as receitas
  // e as orientações do próprio paciente (js/fila-api.js).
  function verificarCodigo(pacienteId, codigo) {
    return chamar('POST', '/otp/verificar', { paciente_id: pacienteId, codigo }).then((r) => {
      if (r && r.token) VitalSyncStore.setPacienteToken(r.token);
      return r;
    });
  }

  // O select do cadastro usa chaves locais ('ubs-jardim'); o banco usa ids. Casa pelo nome.
  async function resolverUnidadeId(nomeUnidade) {
    if (!nomeUnidade) return null;
    try {
      const lista = await chamar('GET', '/unidades');
      const alvo = lista.find((u) => u.nome === nomeUnidade);
      return alvo ? alvo.id : null;
    } catch (e) {
      return null; // unidade de referência é opcional
    }
  }

  // Depois de verificado o código, grava o paciente no store local para as demais telas
  // (sintomas, fila, histórico) continuarem funcionando, e o define como paciente atual.
  function entrarNoStore(p) {
    const existente = VitalSyncStore.findPacienteByCpf(p.cpf);
    const salvo = VitalSyncStore.savePaciente({
      ...(existente || {}),
      id: existente ? existente.id : 'db-' + p.id,
      paciente_db_id: p.id,
      nome_completo: p.nome_completo,
      cpf: p.cpf,
      data_nascimento: p.data_nascimento,
      cns: p.cns || '',
      telefone: p.telefone,
      email: p.email || '',
      unidade_referencia: p.unidade_referencia || (existente && existente.unidade_referencia) || 'Unidade a definir',
    });
    VitalSyncStore.setPacienteAtual(salvo.id);
    return salvo;
  }

  return { ativo, buscarPorCpf, cadastrar, solicitarCodigo, verificarCodigo, resolverUnidadeId, entrarNoStore };
})();
