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

module.exports = { autenticarProfissional };
