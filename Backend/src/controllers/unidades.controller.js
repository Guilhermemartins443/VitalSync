const { query } = require('../db');

// GET /api/unidades — usado no <select> de unidade em paciente.html
async function listar(req, res) {
  try {
    const { rows } = await query(
      `SELECT id, nome, tipo, endereco, telefone
         FROM unidades_saude
        ORDER BY nome`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar unidades de saúde.' });
  }
}

module.exports = { listar };
