const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const CARGOS_VALIDOS = ['medico', 'enfermeiro', 'tecnico', 'recepcao', 'admin'];

// POST /api/auth/cadastro — usado em cadastro.html
async function cadastrar(req, res) {
  try {
    const { nome, email, senha, cargo, unidade_id } = req.body;

    if (!nome || !email || !senha || !CARGOS_VALIDOS.includes(cargo)) {
      return res.status(400).json({
        erro: `Campos obrigatórios: nome, email, senha, cargo (${CARGOS_VALIDOS.join(', ')}).`,
      });
    }
    if (senha.length < 8) {
      return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const { rows } = await query(
      `INSERT INTO profissionais (nome, email, senha_hash, cargo, unidade_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, email, cargo, unidade_id`,
      [nome, email.toLowerCase(), senhaHash, cargo, unidade_id || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      // violação de UNIQUE(email)
      return res.status(409).json({ erro: 'Já existe um profissional cadastrado com este e-mail.' });
    }
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar profissional.' });
  }
}

// POST /api/auth/login — usado em login.html, substitui o "login simulado" de login.js
async function login(req, res) {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ erro: 'Informe email e senha.' });
    }

    const { rows } = await query(
      `SELECT p.id, p.nome, p.email, p.senha_hash, p.cargo, p.unidade_id, u.nome AS unidade_nome
         FROM profissionais p
    LEFT JOIN unidades_saude u ON u.id = p.unidade_id
        WHERE p.email = $1`,
      [email.toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }

    const profissional = rows[0];
    const senhaConfere = await bcrypt.compare(senha, profissional.senha_hash);
    if (!senhaConfere) {
      return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }

    const token = jwt.sign(
      {
        id: profissional.id,
        nome: profissional.nome,
        cargo: profissional.cargo,
        unidade_id: profissional.unidade_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      profissional: {
        id: profissional.id,
        nome: profissional.nome,
        email: profissional.email,
        cargo: profissional.cargo,
        unidade_id: profissional.unidade_id,
        unidade_nome: profissional.unidade_nome,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao autenticar.' });
  }
}

module.exports = { cadastrar, login };
