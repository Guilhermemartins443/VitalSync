// =========================================================
// Gera a senha de atendimento (ex.: "E001", "U014"), contando
// quantas entradas daquela prioridade já existem HOJE para a
// unidade — mesma ideia do contador por prioridade que o
// protótipo fazia no localStorage (Public/js/store.js).
// =========================================================
const { query } = require('../db');

const LETRA_POR_PRIORIDADE = { 0: 'E', 1: 'U', 2: 'P', 3: 'N' };

async function proximaSenha(unidadeId, prioridade) {
  const letra = LETRA_POR_PRIORIDADE[prioridade];
  if (!letra) throw new Error('Prioridade inválida (use 0 a 3).');

  const { rows } = await query(
    `SELECT COUNT(*)::int AS total
       FROM fila_atendimento
      WHERE unidade_id = $1
        AND prioridade = $2
        AND created_at::date = CURRENT_DATE`,
    [unidadeId, prioridade]
  );

  const numero = rows[0].total + 1;
  return `${letra}${String(numero).padStart(3, '0')}`;
}

module.exports = { proximaSenha };
