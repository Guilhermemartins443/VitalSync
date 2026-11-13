// =========================================================
// ATENDIMENTOS DO PRÓPRIO PACIENTE (histórico, receitas, orientações).
// Exige o token do paciente (POST /api/otp/verificar). Cada consulta é presa ao paciente do
// token: ele nunca lê, nem altera, dado de outra pessoa.
// NÃO devolve evolução médica (anotação interna do profissional) nem o log de lembretes.
// =========================================================
const { query } = require('../db');
const { MS } = require('../utils/tempo');
const { lerReceitas, lerOrientacoes } = require('./prontuario.controller');
const { avisarProximo } = require('../utils/avisos');

// GET /api/pacientes/me/atendimentos  (os 100 mais recentes)
async function listar(req, res) {
  try {
    const { rows: fila } = await query(
      `SELECT f.id, f.senha, f.prioridade, f.status, f.guiche,
              ${MS('f.created_at')} AS criado_em_ms,
              a.descricao, a.tempo_inicio, a.intensidade, a.alergias_medicamentos,
              COALESCE(
                (SELECT array_agg(sc.chave)
                   FROM avaliacao_sintoma asi
                   JOIN sintomas_catalogo sc ON sc.id = asi.sintoma_id
                  WHERE asi.avaliacao_id = a.id),
                '{}'
              ) AS sintomas
         FROM fila_atendimento f
    LEFT JOIN avaliacoes_sintomas a ON a.id = f.avaliacao_id
        WHERE f.paciente_id = $1
        ORDER BY f.created_at DESC, f.id DESC
        LIMIT 100`,
      [req.paciente.id]
    );

    const ids = fila.map((f) => f.id);
    const receitas = await lerReceitas(ids, { lembretes: false });
    const orientacoes = await lerOrientacoes(ids);

    res.json(fila.map((f) => ({
      ...f,
      receitas: receitas.get(f.id) || [],
      orientacoes: orientacoes.get(f.id) || [],
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao carregar o seu histórico.' });
  }
}

// POST /api/pacientes/me/medicamentos/:medId/comprado  (o paciente confirma compra/adesão)
async function confirmarCompra(req, res) {
  try {
    if (!/^\d{1,9}$/.test(String(req.params.medId))) {
      return res.status(404).json({ erro: 'Medicamento não encontrado.' });
    }
    const { rows } = await query(
      `UPDATE receita_medicamentos m
          SET comprado = TRUE, comprado_em = COALESCE(m.comprado_em, NOW())
         FROM receitas r JOIN fila_atendimento f ON f.id = r.fila_id
        WHERE m.id = $1 AND r.id = m.receita_id AND f.paciente_id = $2
       RETURNING m.id, m.comprado, ${MS('m.comprado_em')} AS comprado_em_ms`,
      [req.params.medId, req.paciente.id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Medicamento não encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao confirmar a compra.' });
  }
}

// POST /api/pacientes/me/fila/:id/sair  (o paciente desiste da própria senha)
// Só da PRÓPRIA senha e só enquanto aguarda ou foi chamado e ainda não entrou: depois que o
// atendimento começa, quem encerra é o profissional. Repetir o pedido (clique duplo) é inofensivo.
async function sairDaFila(req, res) {
  try {
    if (!/^\d{1,9}$/.test(String(req.params.id))) {
      return res.status(404).json({ erro: 'Senha não encontrada.' });
    }
    const { rows } = await query(
      'SELECT id, status, unidade_id, desistencia_origem FROM fila_atendimento WHERE id = $1 AND paciente_id = $2',
      [req.params.id, req.paciente.id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Senha não encontrada.' });
    const f = rows[0];

    if (f.status === 'desistencia' && f.desistencia_origem === 'paciente') {
      return res.json({ id: f.id, status: f.status }); // já tinha saído
    }
    if (f.status === 'atendimento') {
      return res.status(409).json({ erro: 'O seu atendimento já começou: não dá mais para sair da fila.' });
    }
    if (f.status !== 'aguardando' && f.status !== 'chamando') {
      return res.status(409).json({ erro: 'Esta senha já foi encerrada.' });
    }

    // WHERE com o status: se o profissional iniciou o atendimento nesse meio-tempo, não sobrescreve
    const { rows: upd } = await query(
      `UPDATE fila_atendimento
          SET status = 'desistencia', desistencia_em = NOW(), desistencia_origem = 'paciente'
        WHERE id = $1 AND status IN ('aguardando', 'chamando')
       RETURNING id, senha, status, desistencia_origem`,
      [f.id]
    );
    if (upd.length === 0) {
      return res.status(409).json({ erro: 'A situação da sua senha mudou. Atualize a tela.' });
    }

    await avisarProximo(f.unidade_id); // a fila andou: avisa quem virou o próximo
    res.json(upd[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao sair da fila.' });
  }
}

module.exports = { listar, confirmarCompra, sairDaFila };
