const { query, pool } = require('../db');
const { classificarPrioridade } = require('../utils/prioridade');
const { proximaSenha } = require('../utils/senha');
const { normalizarTelefone } = require('../utils/enviar');
const { ATIVOS_SQL, encerrarVencidasDoPaciente } = require('../utils/expediente');

// GET /api/sintomas/catalogo — alimenta os checkboxes de sintomas.html
async function listarCatalogo(req, res) {
  try {
    const { rows } = await query(
      `SELECT id, chave, label, is_red_flag
         FROM sintomas_catalogo
        ORDER BY id`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar catálogo de sintomas.' });
  }
}

// POST /api/avaliacoes
// Recebe o formulário de sintomas.js, classifica a prioridade no
// servidor (nunca confia no front-end), grava a avaliação e já
// cria a entrada correspondente na fila de atendimento — tudo em
// uma transação, pra não deixar avaliação "órfã" sem senha.
// A senha ATIVA do paciente (aguardando, chamando ou em atendimento), se houver
async function senhaAtivaDoPaciente(pacienteId) {
  const { rows } = await query(
    `SELECT id, senha, status FROM fila_atendimento
      WHERE paciente_id = $1 AND status IN ${ATIVOS_SQL}
      ORDER BY id DESC LIMIT 1`,
    [pacienteId]
  );
  return rows[0] || null;
}

// 409: o paciente já tem senha. Devolve qual é, para a tela levar ele até ela.
function respostaJaTemSenha(res, ativa) {
  return res.status(409).json({
    erro: `Você já tem uma senha ativa (${ativa.senha}). Acompanhe por ela ou saia da fila antes de pedir outra.`,
    fila: { id: ativa.id, senha: ativa.senha, status: ativa.status },
  });
}

async function criarAvaliacao(req, res) {
  let client;
  try {
    const {
      paciente_id,
      unidade_id,
      descricao,
      tempo_inicio,
      intensidade,
      alergias_medicamentos,
      sintomas, // array de chaves, ex.: ['febre', 'dor_cabeca']
      avisos_mensagem, // true = o paciente pediu aviso por WhatsApp/SMS (opt-in)
    } = req.body;

    if (!paciente_id || !unidade_id || !descricao || !tempo_inicio || intensidade === undefined) {
      return res.status(400).json({
        erro: 'Campos obrigatórios: paciente_id, unidade_id, descricao, tempo_inicio, intensidade.',
      });
    }

    if (!/^\d{1,9}$/.test(String(paciente_id)) || !/^\d{1,9}$/.test(String(unidade_id))) {
      return res.status(400).json({ erro: 'paciente_id e unidade_id devem ser números.' });
    }

    // Uma senha ativa por paciente. Antes, uma senha esquecida de ontem (de qualquer unidade) é
    // encerrada, para não bloquear quem chegou hoje.
    await encerrarVencidasDoPaciente(paciente_id);
    const jaTem = await senhaAtivaDoPaciente(paciente_id);
    if (jaTem) return respostaJaTemSenha(res, jaTem);

    const listaSintomas = Array.isArray(sintomas) ? sintomas : [];
    const prioridade = classificarPrioridade(listaSintomas, Number(intensidade));

    // Aviso por mensagem só vale se o paciente pediu E o telefone cadastrado é utilizável
    let avisosAtivos = false;
    if (avisos_mensagem === true) {
      const { rows: pac } = await query('SELECT telefone FROM pacientes WHERE id = $1', [paciente_id]);
      avisosAtivos = pac.length > 0 && normalizarTelefone(pac[0].telefone) !== null;
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const avaliacaoResult = await client.query(
      `INSERT INTO avaliacoes_sintomas
         (paciente_id, unidade_id, descricao, tempo_inicio, intensidade, alergias_medicamentos, prioridade_calculada)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [paciente_id, unidade_id, descricao, tempo_inicio, intensidade, alergias_medicamentos || null, prioridade]
    );
    const avaliacaoId = avaliacaoResult.rows[0].id;

    if (listaSintomas.length) {
      const catalogoResult = await client.query(
        `SELECT id, chave FROM sintomas_catalogo WHERE chave = ANY($1::text[])`,
        [listaSintomas]
      );
      for (const s of catalogoResult.rows) {
        await client.query(
          `INSERT INTO avaliacao_sintoma (avaliacao_id, sintoma_id) VALUES ($1, $2)`,
          [avaliacaoId, s.id]
        );
      }
    }

    // número pelo contador do banco, dentro desta transação (nunca repete)
    const { senha, dia } = await proximaSenha(client, unidade_id, prioridade);

    const filaResult = await client.query(
      `INSERT INTO fila_atendimento
         (paciente_id, unidade_id, avaliacao_id, senha, prioridade, status, avisos_ativos, dia_atendimento)
       VALUES ($1, $2, $3, $4, $5, 'aguardando', $6, $7::date)
       RETURNING id, senha, prioridade, status, avisos_ativos, created_at`,
      [paciente_id, unidade_id, avaliacaoId, senha, prioridade, avisosAtivos, dia]
    );

    await client.query('COMMIT');

    res.status(201).json({
      avaliacao_id: avaliacaoId,
      prioridade_calculada: prioridade,
      fila: filaResult.rows[0],
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});

    // dois pedidos do MESMO paciente ao mesmo tempo (clique duplo): o índice único do banco deixa
    // passar um só; o outro cai aqui e recebe a senha que o primeiro criou
    if (err.code === '23505' && err.constraint === 'uniq_fila_paciente_ativa') {
      try {
        const ativa = await senhaAtivaDoPaciente(req.body.paciente_id);
        if (ativa) return respostaJaTemSenha(res, ativa);
      } catch (e) { /* cai no erro genérico abaixo */ }
    }
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar a avaliação de sintomas.' });
  } finally {
    if (client) client.release();
  }
}

module.exports = { listarCatalogo, criarAvaliacao };
