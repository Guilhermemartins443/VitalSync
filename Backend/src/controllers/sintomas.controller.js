const { query, pool } = require('../db');
const { classificarPrioridade } = require('../utils/prioridade');
const { proximaSenha } = require('../utils/senha');

// GET /api/sintomas/catalogo — alimenta os checkboxes de sintomas.html
async function listarCatalogo(req, res) {
  try {
    const { rows } = await query(
      `SELECT id, chave, label, is_red_flag
         FROM sintomas_catalogo
        ORDER BY id`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar catálogo de sintomas.' });
  }
}

// POST /api/avaliacoes
// Recebe o formulário de sintomas.js, classifica a prioridade no
// servidor (nunca confia no front-end), grava a avaliação e já
// cria a entrada correspondente na fila de atendimento — tudo em
// uma transação, pra não deixar avaliação "órfã" sem senha.
async function criarAvaliacao(req, res) {
  const client = await pool.connect();
  try {
    const {
      paciente_id,
      unidade_id,
      descricao,
      tempo_inicio,
      intensidade,
      alergias_medicamentos,
      sintomas, // array de chaves, ex.: ['febre', 'dor_cabeca']
    } = req.body;

    if (!paciente_id || !unidade_id || !descricao || !tempo_inicio || intensidade === undefined) {
      return res.status(400).json({
        erro: 'Campos obrigatórios: paciente_id, unidade_id, descricao, tempo_inicio, intensidade.',
      });
    }

    const listaSintomas = Array.isArray(sintomas) ? sintomas : [];
    const prioridade = classificarPrioridade(listaSintomas, Number(intensidade));

    await client.query('BEGIN');

    const avaliacaoResult = await client.query(
      `INSERT INTO avaliacoes_sintomas
         (paciente_id, unidade_id, descricao, tempo_inicio, intensidade, alergias_medicamentos, prioridade_calculada)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [paciente_id, unidade_id, descricao, tempo_inicio, intensidade, alergias_medicamentos || null, prioridade]
    );
    const avaliacaoId = avaliacaoResult.rows[0].id;

    if (listaSintomas.length) {
      const catalogoResult = await client.query(
        `SELECT id, chave FROM sintomas_catalogo WHERE chave = ANY($1::text[])`,
        [listaSintomas]
      );
      for (const s of catalogoResult.rows) {
        await client.query(
          `INSERT INTO avaliacao_sintoma (avaliacao_id, sintoma_id) VALUES ($1, $2)`,
          [avaliacaoId, s.id]
        );
      }
    }

    const senha = await proximaSenha(unidade_id, prioridade);

    const filaResult = await client.query(
      `INSERT INTO fila_atendimento (paciente_id, unidade_id, avaliacao_id, senha, prioridade, status)
       VALUES ($1, $2, $3, $4, $5, 'aguardando')
       RETURNING id, senha, prioridade, status, created_at`,
      [paciente_id, unidade_id, avaliacaoId, senha, prioridade]
    );

    await client.query('COMMIT');

    res.status(201).json({
      avaliacao_id: avaliacaoId,
      prioridade_calculada: prioridade,
      fila: filaResult.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar a avaliação de sintomas.' });
  } finally {
    client.release();
  }
}

module.exports = { listarCatalogo, criarAvaliacao };
