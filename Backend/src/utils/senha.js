// =========================================================
// Gera a senha de atendimento (ex.: "E001", "U014").
//
// O número vem de um CONTADOR no banco (tabela contadores_senha: unidade + dia + prioridade),
// incrementado de forma atômica. Antes era "contar quantas senhas já existem", o que falhava de
// dois jeitos: duas pessoas ao mesmo tempo recebiam a MESMA senha, e reclassificar alguém
// mudava a contagem e podia repetir um número.
//
// Chame DENTRO da transação que insere a fila (o `client` dela): o contador fica travado até o
// COMMIT, então quem chega junto espera uns milissegundos e recebe o número seguinte; se a
// transação falhar, o número volta.
// O "dia" das senhas é definido em utils/expediente.js (vira às 05:00 de Brasília).
//
// Como garantia extra, nunca devolve uma senha que ainda esteja ATIVA na unidade (por exemplo,
// uma de antes da virada do dia): pula para o próximo número.
// =========================================================
const { DIA_AGORA_SQL, ATIVOS_SQL } = require('./expediente');

const LETRA_POR_PRIORIDADE = { 0: 'E', 1: 'U', 2: 'P', 3: 'N' };
const MAX_TENTATIVAS = 50;

// -> { senha: 'P003', dia: '2026-11-02' }
async function proximaSenha(client, unidadeId, prioridade) {
  const letra = LETRA_POR_PRIORIDADE[prioridade];
  if (!letra) throw new Error('Prioridade inválida (use 0 a 3).');

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa += 1) {
    const { rows } = await client.query(
      `INSERT INTO contadores_senha (unidade_id, dia, prioridade, ultimo)
       VALUES ($1, ${DIA_AGORA_SQL}, $2, 1)
       ON CONFLICT (unidade_id, dia, prioridade)
       DO UPDATE SET ultimo = contadores_senha.ultimo + 1
       RETURNING ultimo, dia::text AS dia`,
      [unidadeId, prioridade]
    );
    const senha = `${letra}${String(rows[0].ultimo).padStart(3, '0')}`;

    const { rows: emUso } = await client.query(
      `SELECT 1 FROM fila_atendimento
        WHERE unidade_id = $1 AND senha = $2 AND status IN ${ATIVOS_SQL} LIMIT 1`,
      [unidadeId, senha]
    );
    if (emUso.length === 0) return { senha, dia: rows[0].dia };
  }
  throw new Error('Não foi possível gerar uma senha livre.');
}

module.exports = { proximaSenha };
