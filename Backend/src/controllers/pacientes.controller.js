const { query } = require('../db');

function somenteDigitos(valor = '') {
  return String(valor).replace(/\D/g, '');
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function ehId(valor) {
  return /^\d{1,9}$/.test(String(valor));
}

// (11) 98221-3344 -> (11) 9****-3344  — o paciente só precisa reconhecer o próprio número
function mascararTelefone(telefone = '') {
  const d = somenteDigitos(telefone);
  if (d.length < 10) return '(**) *****-****';
  const ddd = d.slice(0, 2);
  const final = d.slice(-4);
  return `(${ddd}) ${d.length === 11 ? '9' : ''}****-${final}`;
}

// GET /api/pacientes/cpf/:cpf   (PÚBLICA, com limite de requisições)
// Usada em entrar.js / paciente.js. NÃO devolve nome, CPF, e-mail, CNS nem data de
// nascimento: só o suficiente para seguir para a verificação por código (OTP).
async function buscarPorCpf(req, res) {
  try {
    const cpf = somenteDigitos(req.params.cpf);
    if (cpf.length !== 11) return res.status(400).json({ erro: 'CPF inválido.' });

    const { rows } = await query('SELECT id, telefone FROM pacientes WHERE cpf = $1', [cpf]);

    if (rows.length === 0) {
      return res.status(404).json({ encontrado: false });
    }
    res.json({
      encontrado: true,
      paciente: { id: rows[0].id, telefone_mascarado: mascararTelefone(rows[0].telefone) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar paciente por CPF.' });
  }
}

// POST /api/pacientes   (PÚBLICA, com limite de requisições)
// Cria o cadastro. Se o CPF já existir, NÃO sobrescreve (antes qualquer pessoa podia
// trocar nome/telefone/e-mail de outro paciente só sabendo o CPF) e não devolve dados.
async function cadastrar(req, res) {
  try {
    const { nome_completo, cpf, data_nascimento, cns, telefone, email, unidade_referencia_id } = req.body;

    const cpfLimpo = somenteDigitos(cpf);
    const nome = typeof nome_completo === 'string' ? nome_completo.trim() : '';
    const tel = typeof telefone === 'string' ? telefone.trim() : '';
    const mail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
    const cnsLimpo = cns ? somenteDigitos(cns) : null;

    if (!nome || cpfLimpo.length !== 11 || !DATA_REGEX.test(String(data_nascimento)) || !tel) {
      return res.status(400).json({
        erro: 'Campos obrigatórios: nome_completo, cpf (11 dígitos), data_nascimento (AAAA-MM-DD), telefone.',
      });
    }
    if (nome.length > 150 || tel.length > 20 || (mail && (mail.length > 150 || !EMAIL_REGEX.test(mail)))) {
      return res.status(400).json({ erro: 'Dados inválidos: verifique nome, telefone e e-mail.' });
    }
    if (cnsLimpo && cnsLimpo.length !== 15) {
      return res.status(400).json({ erro: 'CNS inválido (15 dígitos).' });
    }
    if (unidade_referencia_id && !ehId(unidade_referencia_id)) {
      return res.status(400).json({ erro: 'unidade_referencia_id inválido.' });
    }

    const { rows } = await query(
      `INSERT INTO pacientes
         (cpf, nome_completo, data_nascimento, cns, telefone, email, unidade_referencia_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (cpf) DO NOTHING
       RETURNING id`,
      [cpfLimpo, nome, data_nascimento, cnsLimpo, tel, mail, unidade_referencia_id || null]
    );

    if (rows.length === 0) {
      // já existia: devolve só o id, para o fluxo seguir para o OTP; nada foi alterado
      const { rows: existente } = await query('SELECT id FROM pacientes WHERE cpf = $1', [cpfLimpo]);
      return res.status(200).json({ id: existente[0].id, ja_cadastrado: true });
    }
    res.status(201).json({ id: rows[0].id, ja_cadastrado: false });
  } catch (err) {
    if (err.code === '23505') {
      // CNS duplicado (UNIQUE) — mensagem genérica, sem revelar de quem é
      return res.status(409).json({ erro: 'Não foi possível concluir o cadastro com estes dados.' });
    }
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar paciente.' });
  }
}

// GET /api/pacientes/:id   (PROTEGIDA — profissional autenticado)
// Dado completo, mas só de paciente da unidade do profissional: referência cadastrada
// nela OU com entrada na fila dela. Fora disso responde 404 (não revela que existe).
async function buscarPorId(req, res) {
  try {
    if (!ehId(req.params.id)) return res.status(404).json({ erro: 'Paciente não encontrado.' });

    const { rows } = await query(
      `SELECT p.id, p.cpf, p.nome_completo, p.data_nascimento, p.cns, p.telefone, p.email, p.unidade_referencia_id
         FROM pacientes p
        WHERE p.id = $1
          AND ( p.unidade_referencia_id = $2
                OR EXISTS (SELECT 1 FROM fila_atendimento f
                            WHERE f.paciente_id = p.id AND f.unidade_id = $2) )`,
      [req.params.id, req.profissional.unidade_id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Paciente não encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar paciente.' });
  }
}

module.exports = { buscarPorCpf, cadastrar, buscarPorId };
