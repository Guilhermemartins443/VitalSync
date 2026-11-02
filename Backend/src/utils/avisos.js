// =========================================================
// Avisos por WhatsApp/SMS durante a fila — SOMENTE para quem pediu (opt-in na avaliação:
// fila_atendimento.avisos_ativos). O texto leva só a senha e o local de atendimento,
// NUNCA nome, sintomas ou qualquer dado de saúde.
//
// Falha de envio nunca derruba a ação do profissional: devolvemos 'falhou' e seguimos.
// No máximo 4 mensagens por espera: 1ª chamada, até 2 rechamadas e 1 "você é o próximo".
// =========================================================
const { query } = require('../db');
const { enviarMensagem } = require('./enviar');

const LIMITE_ENVIO_MS = 4000; // não deixa o clique do profissional esperando um provedor lento

async function enviarComLimite(telefone, texto) {
  let timer;
  const estouro = new Promise((_, rejeitar) => {
    timer = setTimeout(() => rejeitar(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), LIMITE_ENVIO_MS);
  });
  try {
    await Promise.race([enviarMensagem({ telefone, canal: 'whatsapp', texto }), estouro]);
    return 'enviada';
  } catch (err) {
    // log sem telefone e sem texto: só o código do erro
    console.error('Falha ao enviar aviso da fila:', err.code || err.message);
    return 'falhou';
  } finally {
    clearTimeout(timer);
  }
}

// Paciente foi chamado (ou rechamado). -> 'enviada' | 'falhou' | null (não pediu aviso)
async function avisarChamada(filaId) {
  try {
    const { rows } = await query(
      `SELECT f.senha, f.guiche, f.chamadas, f.avisos_ativos, p.telefone
         FROM fila_atendimento f
         JOIN pacientes p ON p.id = f.paciente_id
        WHERE f.id = $1`,
      [filaId]
    );
    const f = rows[0];
    if (!f || !f.avisos_ativos) return null;

    const local = f.guiche ? ` Local de atendimento: ${f.guiche}.` : '';
    const texto = f.chamadas > 1
      ? `VitalSync: a senha ${f.senha} está sendo chamada de novo (${f.chamadas}ª chamada).${local}`
      : `VitalSync: a senha ${f.senha} foi chamada.${local}`;
    return await enviarComLimite(f.telefone, texto);
  } catch (err) {
    console.error('Erro ao preparar aviso de chamada:', err.code || err.message);
    return 'falhou';
  }
}

// A fila andou: quem ficou em 1º lugar (e pediu aviso) recebe "você é o próximo", uma vez só
// por espera. Chamar depois de qualquer mudança que altere a ordem da fila.
async function avisarProximo(unidadeId) {
  try {
    const { rows } = await query(
      `SELECT f.id, f.senha, f.avisos_ativos, f.aviso_proximo_em, p.telefone
         FROM fila_atendimento f
         JOIN pacientes p ON p.id = f.paciente_id
        WHERE f.unidade_id = $1 AND f.status = 'aguardando'
        ORDER BY f.prioridade ASC, f.created_at ASC
        LIMIT 1`,
      [unidadeId]
    );
    const prox = rows[0];
    if (!prox || !prox.avisos_ativos || prox.aviso_proximo_em) return null;

    // marca ANTES de enviar: duas mudanças ao mesmo tempo não mandam duas mensagens
    const marcou = await query(
      'UPDATE fila_atendimento SET aviso_proximo_em = NOW() WHERE id = $1 AND aviso_proximo_em IS NULL',
      [prox.id]
    );
    if (marcou.rowCount === 0) return null;

    return await enviarComLimite(
      prox.telefone,
      `VitalSync: você é o próximo da fila (senha ${prox.senha}). Fique por perto: sua chamada deve ser em breve.`
    );
  } catch (err) {
    console.error('Erro ao preparar aviso de próximo:', err.code || err.message);
    return 'falhou';
  }
}

module.exports = { avisarChamada, avisarProximo };
