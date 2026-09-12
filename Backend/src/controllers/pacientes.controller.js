const { query } = require('../db');

function somenteDigitos(valor = '') {
  return String(valor).replace(/\D/g, '');
}

// GET /api/pacientes/cpf/:cpf
// Usado em entrar.js / paciente.js no lugar de VitalSyncStore.findPacienteByCpf
async function buscarPorCpf(req, res) {
  try {
    const cpf = somenteDigitos(req.params.cpf);
    const { rows } = await query(
      `SELECT id, cpf, nome_completo, data_nascimento, cns, telefone, email, unidade_referencia_id
         FROM pacientes
        WHERE cpf = $1`,
      [cpf]
    );

    if (rows.length === 0) {
      return res.status(404).json({ encontrado: false });
    }
    res.json({ encontrado: true, paciente: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar paciente por CPF.' });
  }
}

// POST /api/pacientes
// Cadastra (ou atualiza, se o CPF já existir) — usado no wizard de paciente.html
async function cadastrar(req, res) {
  try {
    const {
      nome_completo,
      cpf,
      data_nascimento,
      cns,
      telefone,
      email,
      unidade_referencia_id,
    } = req.body;

    const cpfLimpo = somenteDigitos(cpf);

    if (!nome_completo || cpfLimpo.length !== 11 || !data_nascimento || !telefone) {
      return res.status(400).json({
        erro: 'Campos obrigatórios: nome_completo, cpf (11 dígitos), data_nascimento, telefone.',
      });
    }

    const { rows } = await query(
      `INSERT INTO pacientes
         (cpf, nome_completo, data_nascimento, cns, telefone, email, unidade_referencia_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (cpf) DO UPDATE SET
         nome_completo = EXCLUDED.nome_completo,
         data_nascimento = EXCLUDED.data_nascimento,
         cns = EXCLUDED.cns,
         telefone = EXCLUDED.telefone,
         email = EXCLUDED.email,
         unidade_referencia_id = EXCLUDED.unidade_referencia_id,
         updated_at = NOW()
       RETURNING id, cpf, nome_completo, data_nascimento, cns, telefone, email, unidade_referencia_id`,
      [cpfLimpo, nome_completo, data_nascimento, cns || null, telefone, email || null, unidade_referencia_id || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar paciente.' });
  }
}

// GET /api/pacientes/:id — detalhe simples (usado no painel do profissional)
async function buscarPorId(req, res) {
  try {
    const { rows } = await query(
      `SELECT id, cpf, nome_completo, data_nascimento, cns, telefone, email, unidade_referencia_id
         FROM pacientes WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Paciente não encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar paciente.' });
  }
}

module.exports = { buscarPorCpf, cadastrar, buscarPorId };
