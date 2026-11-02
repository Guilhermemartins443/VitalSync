// =========================================================
// Protege rotas que só o profissional logado (painel.html)
// pode usar: chamar/atender/finalizar paciente na fila, ver
// detalhes clínicos, etc. Espera um header:
//   Authorization: Bearer <token>
// =========================================================
const jwt = require('jsonwebtoken');

function autenticarProfissional(req, res, next) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Token de autenticação ausente.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // o token do PACIENTE (OTP) é assinado com a mesma chave: sem esta checagem ele passaria aqui
    if (payload.tipo === 'paciente') {
      return res.status(403).json({ erro: 'Esta área é só para profissionais.' });
    }
    req.profissional = payload; // { id, nome, cargo, unidade_id }
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

// Sessão do PACIENTE: o token é entregue por POST /api/otp/verificar (depois de provar que tem
// o telefone cadastrado). Só serve para as rotas /api/pacientes/me/... (dados do próprio paciente).
function autenticarPaciente(req, res, next) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Entre com o seu CPF para ver estes dados.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.tipo !== 'paciente' || !Number.isInteger(payload.id)) {
      return res.status(403).json({ erro: 'Sessão inválida para esta área.' });
    }
    req.paciente = { id: payload.id };
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Sua sessão expirou. Entre novamente.' });
  }
}

// Uso: router.post('/x', autenticarProfissional, exigirCargo('admin'), handler)
// Precisa vir DEPOIS de autenticarProfissional (depende de req.profissional).
function exigirCargo(...cargos) {
  return (req, res, next) => {
    if (!req.profissional || !cargos.includes(req.profissional.cargo)) {
      return res.status(403).json({ erro: 'Você não tem permissão para esta ação.' });
    }
    next();
  };
}

module.exports = { autenticarProfissional, autenticarPaciente, exigirCargo };
