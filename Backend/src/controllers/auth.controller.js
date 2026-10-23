const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const CARGOS_VALIDOS = ['medico', 'enfermeiro', 'tecnico', 'recepcao', 'admin'];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/cadastro — usado em cadastro.html. Rota protegida: só admin (ver auth.routes.js).
async function cadastrar(req, res) {
  try {
    const { nome, email, senha, cargo } = req.body;
    // Admin só cadastra gente na PRÓPRIA unidade (ignora unidade_id vindo do corpo da requisição)
    const unidade_id = req.profissional.unidade_id;

    if (!nome || !email || !senha || !CARGOS_VALIDOS.includes(cargo)) {
      return res.status(400).json({
        erro: `Campos obrigatórios: nome, email, senha, cargo (${CARGOS_VALIDOS.join(', ')}).`,
      });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ erro: 'E-mail inválido.' });
    }
    if (senha.length < 8) {
      return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const { rows } = await query(
      `INSERT INTO profissionais (nome, email, senha_hash, cargo, unidade_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, email, cargo, unidade_id`,
      [nome.trim(), email.trim().toLowerCase(), senhaHash, cargo, unidade_id || null]
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

// ---------- limite de tentativas de login (em memória, por IP + e-mail) ----------
// 5 falhas em 15 min bloqueiam novas tentativas. Em produção com várias instâncias,
// trocar por Redis/express-rate-limit.
const MAX_FALHAS = 5;
const JANELA_MS = 15 * 60 * 1000;
const falhas = new Map(); // chave -> { count, desde }

function chaveTentativa(req, email) {
  return `${req.ip}|${String(email).trim().toLowerCase()}`;
}
function bloqueado(chave) {
  const reg = falhas.get(chave);
  if (!reg) return false;
  if (Date.now() - reg.desde > JANELA_MS) { falhas.delete(chave); return false; }
  return reg.count >= MAX_FALHAS;
}
function registrarFalha(chave) {
  const reg = falhas.get(chave);
  if (!reg || Date.now() - reg.desde > JANELA_MS) falhas.set(chave, { count: 1, desde: Date.now() });
  else reg.count++;
}

// POST /api/auth/login — usado em login.html
async function login(req, res) {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ erro: 'Informe email e senha.' });
    }

    const chave = chaveTentativa(req, email);
    if (bloqueado(chave)) {
      return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
    }

    const { rows } = await query(
      `SELECT p.id, p.nome, p.email, p.senha_hash, p.cargo, p.status, p.unidade_id, u.nome AS unidade_nome
         FROM profissionais p
    LEFT JOIN unidades_saude u ON u.id = p.unidade_id
        WHERE p.email = $1`,
      [email.trim().toLowerCase()]
    );

    if (rows.length === 0) {
      registrarFalha(chave);
      return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }

    const profissional = rows[0];
    const senhaConfere = await bcrypt.compare(senha, profissional.senha_hash);
    if (!senhaConfere) {
      registrarFalha(chave);
      return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }

    falhas.delete(chave);

    // Só informa o status depois de a senha conferir (não revela quem tem conta a quem não sabe a senha)
    if (profissional.status === 'pendente') {
      return res.status(403).json({ erro: 'Seu acesso ainda está aguardando aprovação do administrador da unidade.' });
    }
    if (profissional.status === 'recusado') {
      return res.status(403).json({ erro: 'Sua solicitação de acesso não foi aprovada. Fale com a administração da unidade.' });
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

// GET /api/auth/me — devolve o profissional da sessão atual (token válido) lendo do banco,
// então um profissional removido/alterado deixa de passar no guard do front.
async function me(req, res) {
  try {
    const { rows } = await query(
      `SELECT p.id, p.nome, p.email, p.cargo, p.unidade_id, u.nome AS unidade_nome
         FROM profissionais p
    LEFT JOIN unidades_saude u ON u.id = p.unidade_id
        WHERE p.id = $1 AND p.status = 'ativo'`,
      [req.profissional.id]
    );
    if (rows.length === 0) {
      return res.status(401).json({ erro: 'Profissional não encontrado.' });
    }
    res.json({ profissional: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar sessão.' });
  }
}

// ---------- AUTO-CADASTRO COM APROVAÇÃO ----------
// Cargos que o próprio profissional pode pedir. 'admin' NUNCA vem por aqui.
const CARGOS_SOLICITAVEIS = ['medico', 'enfermeiro', 'tecnico', 'recepcao'];

// POST /api/auth/solicitar-acesso — público (solicitar.html). Cria a conta como 'pendente':
// ela não consegue entrar até um admin da mesma unidade aprovar.
async function solicitarAcesso(req, res) {
  try {
    const { nome, email, senha, cargo, unidade_id } = req.body;
    const unidadeId = Number(unidade_id);

    if (!nome || !email || !senha || !CARGOS_SOLICITAVEIS.includes(cargo) || !Number.isInteger(unidadeId)) {
      return res.status(400).json({
        erro: `Campos obrigatórios: nome, email, senha, unidade e cargo (${CARGOS_SOLICITAVEIS.join(', ')}).`,
      });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ erro: 'E-mail inválido.' });
    }
    if (senha.length < 8) {
      return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
    }

    const unidade = await query('SELECT id FROM unidades_saude WHERE id = $1', [unidadeId]);
    if (unidade.rows.length === 0) {
      return res.status(400).json({ erro: 'Unidade de saúde inválida.' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    await query(
      `INSERT INTO profissionais (nome, email, senha_hash, cargo, unidade_id, status)
       VALUES ($1, $2, $3, $4, $5, 'pendente')`,
      [nome.trim(), email.trim().toLowerCase(), senhaHash, cargo, unidadeId]
    );

    res.status(201).json({ mensagem: 'Solicitação enviada. Você poderá entrar assim que o administrador da unidade aprovar.' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Já existe uma conta ou solicitação com este e-mail.' });
    }
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar solicitação.' });
  }
}

// GET /api/auth/solicitacoes — admin: pedidos pendentes da PRÓPRIA unidade
async function listarSolicitacoes(req, res) {
  try {
    const { rows } = await query(
      `SELECT id, nome, email, cargo, created_at
         FROM profissionais
        WHERE status = 'pendente' AND unidade_id = $1
        ORDER BY created_at`,
      [req.profissional.unidade_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar solicitações.' });
  }
}

// PATCH /api/auth/solicitacoes/:id  { acao: 'aprovar' | 'recusar' } — admin, só da própria unidade
async function decidirSolicitacao(req, res) {
  try {
    const id = Number(req.params.id);
    const { acao } = req.body;
    if (!Number.isInteger(id) || !['aprovar', 'recusar'].includes(acao)) {
      return res.status(400).json({ erro: "Informe acao: 'aprovar' ou 'recusar'." });
    }

    const { rows } = await query(
      `UPDATE profissionais
          SET status = $1
        WHERE id = $2 AND status = 'pendente' AND unidade_id = $3
        RETURNING id, nome, email, cargo, status`,
      [acao === 'aprovar' ? 'ativo' : 'recusado', id, req.profissional.unidade_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Solicitação não encontrada.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar solicitação.' });
  }
}

module.exports = { cadastrar, login, me, solicitarAcesso, listarSolicitacoes, decidirSolicitacao };
