const { query } = require('../db');
const { gerarCodigo, gerarHash, conferirCodigo, VALIDADE_MINUTOS, MAX_TENTATIVAS } = require('../utils/otp');

// POST /api/otp/solicitar { paciente_id, canal }
// Substitui o "setTimeout" fake de entrar.js: gera um código real,
// guarda só o hash, e (por enquanto) loga no console — em produção
// entraria aqui a integração de envio por SMS/WhatsApp.
async function solicitar(req, res) {
  try {
    const { paciente_id, canal } = req.body;
    if (!paciente_id || !['whatsapp', 'sms'].includes(canal)) {
      return res.status(400).json({ erro: 'Informe paciente_id e canal ("whatsapp" ou "sms").' });
    }

    const codigo = gerarCodigo();
    const codigoHash = await gerarHash(codigo);
    const expiraEm = new Date(Date.now() + VALIDADE_MINUTOS * 60 * 1000);

    await query(
      `INSERT INTO codigos_verificacao (paciente_id, codigo_hash, canal, expira_em)
       VALUES ($1, $2, $3, $4)`,
      [paciente_id, codigoHash, canal, expiraEm]
    );

    // TODO: plugar um provedor real de SMS/WhatsApp aqui.
    console.log(`[OTP] Código para paciente ${paciente_id} via ${canal}: ${codigo}`);

    res.status(201).json({ enviado: true, expira_em: expiraEm, validade_minutos: VALIDADE_MINUTOS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o código de verificação.' });
  }
}

// POST /api/otp/verificar { paciente_id, codigo }
async function verificar(req, res) {
  try {
    const { paciente_id, codigo } = req.body;
    if (!paciente_id || !codigo) {
      return res.status(400).json({ erro: 'Informe paciente_id e codigo.' });
    }

    const { rows } = await query(
      `SELECT id, codigo_hash, tentativas, expira_em, verificado_em
         FROM codigos_verificacao
        WHERE paciente_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [paciente_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Nenhum código foi solicitado para este paciente.' });
    }

    const registro = rows[0];

    if (registro.verificado_em) {
      return res.status(400).json({ erro: 'Este código já foi utilizado.' });
    }
    if (new Date(registro.expira_em) < new Date()) {
      return res.status(400).json({ erro: 'Código expirado. Solicite um novo.' });
    }
    if (registro.tentativas >= MAX_TENTATIVAS) {
      return res.status(429).json({ erro: 'Número máximo de tentativas excedido. Solicite um novo código.' });
    }

    const confere = await conferirCodigo(codigo, registro.codigo_hash);

    if (!confere) {
      await query('UPDATE codigos_verificacao SET tentativas = tentativas + 1 WHERE id = $1', [registro.id]);
      return res.status(400).json({ erro: 'Código incorreto.' });
    }

    await query('UPDATE codigos_verificacao SET verificado_em = NOW() WHERE id = $1', [registro.id]);

    res.json({ verificado: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao verificar o código.' });
  }
}

module.exports = { solicitar, verificar };
