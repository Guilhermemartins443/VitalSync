const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { gerarCodigo, gerarHash, conferirCodigo, VALIDADE_MINUTOS, MAX_TENTATIVAS } = require('../utils/otp');
const { enviarCodigo } = require('../utils/enviar');

const INTERVALO_REENVIO_S = 30;     // mesmo tempo do botão "Reenviar" do front
const MAX_CODIGOS_JANELA = 3;       // no máximo 3 códigos por paciente a cada 10 minutos
const JANELA_MIN = 10;

// POST /api/otp/solicitar { paciente_id, canal }
// Gera um código real, guarda só o hash e ENVIA por SMS/WhatsApp para o telefone cadastrado
// do paciente (nunca para um número vindo do front). Se o envio falhar, o código é descartado
// e a resposta é um erro — nunca "enviado: true" sem ter enviado.
async function solicitar(req, res) {
  try {
    const { paciente_id, canal } = req.body || {};
    if (!/^\d{1,9}$/.test(String(paciente_id)) || !['whatsapp', 'sms'].includes(canal)) {
      return res.status(400).json({ erro: 'Informe paciente_id e canal ("whatsapp" ou "sms").' });
    }

    const { rows: pac } = await query('SELECT id, telefone FROM pacientes WHERE id = $1', [paciente_id]);
    if (pac.length === 0) return res.status(404).json({ erro: 'Paciente não encontrado.' });

    // Limite por paciente no banco (vale mesmo com várias instâncias serverless e vários IPs):
    // impede "bombardear" o celular de alguém e gastar SMS.
    const { rows: recentes } = await query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(EXTRACT(EPOCH FROM (NOW() - MAX(created_at))), 9999)::int AS segundos_ultimo
         FROM codigos_verificacao
        WHERE paciente_id = $1 AND created_at > NOW() - ($2 || ' minutes')::interval`,
      [paciente_id, String(JANELA_MIN)]
    );
    if (recentes[0].segundos_ultimo < INTERVALO_REENVIO_S) {
      const espera = INTERVALO_REENVIO_S - recentes[0].segundos_ultimo;
      res.set('Retry-After', String(espera));
      return res.status(429).json({ erro: `Aguarde ${espera}s para pedir um novo código.` });
    }
    if (recentes[0].total >= MAX_CODIGOS_JANELA) {
      return res.status(429).json({ erro: 'Muitos códigos solicitados. Aguarde alguns minutos e tente de novo.' });
    }

    const codigo = gerarCodigo();
    const codigoHash = await gerarHash(codigo);
    const expiraEm = new Date(Date.now() + VALIDADE_MINUTOS * 60 * 1000);

    const { rows: inserido } = await query(
      `INSERT INTO codigos_verificacao (paciente_id, codigo_hash, canal, expira_em)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [paciente_id, codigoHash, canal, expiraEm]
    );

    let canalUsado;
    try {
      ({ canal: canalUsado } = await enviarCodigo({
        telefone: pac[0].telefone, canal, codigo, validadeMinutos: VALIDADE_MINUTOS,
      }));
    } catch (err) {
      await query('DELETE FROM codigos_verificacao WHERE id = $1', [inserido[0].id]);
      if (err.code === 'TELEFONE_INVALIDO') {
        return res.status(422).json({ erro: 'O telefone cadastrado não é válido para receber o código. Procure a unidade de saúde para atualizar o cadastro.' });
      }
      if (err.code === 'SEM_PROVEDOR') {
        console.error('Envio de código indisponível:', err.message);
        return res.status(503).json({ erro: 'O envio de códigos ainda não está configurado neste servidor.' });
      }
      console.error('Falha ao enviar código:', err.code || err.message);
      return res.status(502).json({ erro: 'Não foi possível enviar o código agora. Tente novamente em instantes.' });
    }

    if (canalUsado !== canal) {
      await query('UPDATE codigos_verificacao SET canal = $1 WHERE id = $2', [canalUsado, inserido[0].id]);
    }

    res.status(201).json({ enviado: true, canal: canalUsado, expira_em: expiraEm, validade_minutos: VALIDADE_MINUTOS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar o código de verificação.' });
  }
}

// POST /api/otp/verificar { paciente_id, codigo }
// Se o código confere, devolve os dados do próprio paciente (quem acertou o código provou
// ter acesso ao telefone cadastrado), para o front montar a sessão.
async function verificar(req, res) {
  try {
    const { paciente_id, codigo } = req.body || {};
    if (!/^\d{1,9}$/.test(String(paciente_id)) || !/^\d{6}$/.test(String(codigo))) {
      return res.status(400).json({ erro: 'Informe paciente_id e o código de 6 dígitos.' });
    }

    const { rows } = await query(
      `SELECT id, codigo_hash, tentativas, expira_em, verificado_em
         FROM codigos_verificacao
        WHERE paciente_id = $1
        ORDER BY created_at DESC, id DESC
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

    const confere = await conferirCodigo(String(codigo), registro.codigo_hash);

    if (!confere) {
      await query('UPDATE codigos_verificacao SET tentativas = tentativas + 1 WHERE id = $1', [registro.id]);
      return res.status(400).json({ erro: 'Código incorreto.' });
    }

    await query('UPDATE codigos_verificacao SET verificado_em = NOW() WHERE id = $1', [registro.id]);

    const { rows: pac } = await query(
      `SELECT p.id, p.cpf, p.nome_completo, to_char(p.data_nascimento, 'YYYY-MM-DD') AS data_nascimento,
              p.cns, p.telefone, p.email, u.nome AS unidade_referencia
         FROM pacientes p
         LEFT JOIN unidades_saude u ON u.id = p.unidade_referencia_id
        WHERE p.id = $1`,
      [paciente_id]
    );

    // Sessão do paciente: token de curta duração só para ler os PRÓPRIOS dados (histórico, receitas)
    const token = pac[0]
      ? jwt.sign({ tipo: 'paciente', id: pac[0].id }, process.env.JWT_SECRET, { expiresIn: '8h' })
      : null;

    res.json({ verificado: true, paciente: pac[0] || null, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao verificar o código.' });
  }
}

module.exports = { solicitar, verificar };
