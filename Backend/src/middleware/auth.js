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
    req.profissional = payload; // { id, nome, cargo, unidade_id }
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
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

module.exports = { autenticarProfissional, exigirCargo };
