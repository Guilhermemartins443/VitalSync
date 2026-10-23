// =========================================================
// Limitador de requisições em memória (janela fixa), sem
// dependência externa. Serve para as rotas PÚBLICAS (sem login),
// que são as que expõem/aceitam dado de paciente.
//
// Em produção com várias instâncias (ou atrás de proxy/load
// balancer), trocar por express-rate-limit + Redis e configurar
// `app.set('trust proxy', ...)` para req.ip ser o IP real do cliente.
//
// Uso:
//   router.get('/x', limitar({ max: 20, janelaMs: 60_000 }), handler)
//   limitar({ max: 3, janelaMs: 60_000, chave: (req) => `${req.ip}|${req.body.paciente_id}` })
// =========================================================
function limitar({ max, janelaMs, chave, mensagem } = {}) {
  const registros = new Map(); // chave -> { count, inicio }

  // limpeza periódica para o Map não crescer sem limite
  const faxina = setInterval(() => {
    const agora = Date.now();
    for (const [k, r] of registros) if (agora - r.inicio > janelaMs) registros.delete(k);
  }, janelaMs);
  faxina.unref();

  return (req, res, next) => {
    const k = chave ? chave(req) : req.ip;
    const agora = Date.now();
    let reg = registros.get(k);

    if (!reg || agora - reg.inicio > janelaMs) {
      reg = { count: 0, inicio: agora };
      registros.set(k, reg);
    }
    reg.count += 1;

    if (reg.count > max) {
      const espera = Math.ceil((reg.inicio + janelaMs - agora) / 1000);
      res.set('Retry-After', String(espera));
      return res.status(429).json({ erro: mensagem || 'Muitas requisições. Aguarde um pouco e tente de novo.' });
    }
    next();
  };
}

module.exports = { limitar };
