const { query } = require('../db');

const TRANSICAO_STATUS = {
  aguardando: ['chamando'],
  chamando: ['atendimento', 'aguardando'],
  atendimento: ['finalizado', 'aguardando'],
  finalizado: [],
};

// ids numéricos simples (evita erro 500 do Postgres com "abc" e entradas estranhas)
function ehId(valor) {
  return /^\d{1,9}$/.test(String(valor));
}

// GET /api/fila?unidade_id=1   (PÚBLICA — usada por fila.html, visão do paciente)
// Só senha, prioridade, status e tempos. NUNCA nome, CPF ou id do paciente: quem vê
// a fila pública não pode saber quem é cada senha.
async function listar(req, res) {
  try {
    const { unidade_id } = req.query;
    if (!ehId(unidade_id)) return res.status(400).json({ erro: 'Informe unidade_id válido.' });

    const { rows } = await query(
      `SELECT f.id, f.senha, f.prioridade, f.status, f.guiche, f.created_at,
              f.chamado_em, f.atendimento_iniciado_em, f.atendimento_finalizado_em
         FROM fila_atendimento f
        WHERE f.unidade_id = $1
          AND f.status != 'finalizado'
        ORDER BY f.prioridade ASC, f.created_at ASC`,
      [unidade_id]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar a fila de atendimento.' });
  }
}

// GET /api/fila/painel   (PROTEGIDA — painel.html)
// Fila da unidade DO PROFISSIONAL logado (a unidade vem do token, não da URL), com o
// nome do paciente. CPF e demais dados só em GET /api/fila/:id.
async function listarPainel(req, res) {
  try {
    const { rows } = await query(
      `SELECT f.id, f.senha, f.prioridade, f.status, f.guiche, f.created_at,
              f.chamado_em, f.atendimento_iniciado_em, f.atendimento_finalizado_em,
              p.id AS paciente_id, p.nome_completo
         FROM fila_atendimento f
         JOIN pacientes p ON p.id = f.paciente_id
        WHERE f.unidade_id = $1
          AND f.status != 'finalizado'
        ORDER BY f.prioridade ASC, f.created_at ASC`,
      [req.profissional.unidade_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar a fila do painel.' });
  }
}

// GET /api/fila/:id — detalhe completo (paciente + avaliação), para painel.html
// PROTEGIDA e restrita à unidade do profissional (outra unidade => 404).
async function detalhar(req, res) {
  try {
    if (!ehId(req.params.id)) return res.status(404).json({ erro: 'Entrada da fila não encontrada.' });
    const { rows } = await query(
      `SELECT f.id, f.senha, f.prioridade, f.status, f.guiche, f.created_at,
              p.nome_completo, p.cpf, p.data_nascimento, p.cns, p.telefone, p.email,
              a.descricao, a.tempo_inicio, a.intensidade, a.alergias_medicamentos,
              COALESCE(
                (SELECT array_agg(sc.chave)
                   FROM avaliacao_sintoma asi
                   JOIN sintomas_catalogo sc ON sc.id = asi.sintoma_id
                  WHERE asi.avaliacao_id = a.id),
                '{}'
              ) AS sintomas
         FROM fila_atendimento f
         JOIN pacientes p ON p.id = f.paciente_id
    LEFT JOIN avaliacoes_sintomas a ON a.id = f.avaliacao_id
        WHERE f.id = $1
          AND f.unidade_id = $2`,
      [req.params.id, req.profissional.unidade_id]
    );

    if (rows.length === 0) return res.status(404).json({ erro: 'Entrada da fila não encontrada.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar detalhes da fila.' });
  }
}

// GET /api/fila/:id/posicao — posição e estimativa de espera, para fila.html (visão do paciente)
async function posicao(req, res) {
  try {
    if (!ehId(req.params.id)) return res.status(404).json({ erro: 'Entrada da fila não encontrada.' });
    const { rows } = await query(`SELECT unidade_id, prioridade, created_at FROM fila_atendimento WHERE id = $1`, [
      req.params.id,
    ]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Entrada da fila não encontrada.' });

    const entrada = rows[0];
    const { rows: naFrenteRows } = await query(
      `SELECT COUNT(*)::int AS na_frente
         FROM fila_atendimento
        WHERE unidade_id = $1
          AND status != 'finalizado'
          AND (prioridade < $2 OR (prioridade = $2 AND created_at < $3))`,
      [entrada.unidade_id, entrada.prioridade, entrada.created_at]
    );

    res.json({ posicao: naFrenteRows[0].na_frente + 1, pessoas_na_frente: naFrenteRows[0].na_frente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao calcular a posição na fila.' });
  }
}

// PATCH /api/fila/:id/status  { status: 'chamando' | 'atendimento' | 'finalizado' | 'aguardando' }
// Usado pelos botões "Chamar paciente" / "Iniciar atendimento" /
// "Finalizar atendimento" / "Voltar para a fila" do painel.js.
async function atualizarStatus(req, res) {
  try {
    const { id } = req.params;
    const { status: novoStatus, guiche } = req.body;

    if (!ehId(id)) return res.status(404).json({ erro: 'Entrada da fila não encontrada.' });
    if (!Object.prototype.hasOwnProperty.call(TRANSICAO_STATUS, novoStatus)) {
      return res.status(400).json({ erro: 'Status inválido.' });
    }
    if (guiche !== undefined && guiche !== null && (typeof guiche !== 'string' || guiche.length > 10)) {
      return res.status(400).json({ erro: 'Guichê inválido (texto de até 10 caracteres).' });
    }

    // só mexe na fila da própria unidade
    const { rows: atuais } = await query(
      'SELECT status FROM fila_atendimento WHERE id = $1 AND unidade_id = $2',
      [id, req.profissional.unidade_id]
    );
    if (atuais.length === 0) return res.status(404).json({ erro: 'Entrada da fila não encontrada.' });

    const statusAtual = atuais[0].status;
    const permitido = TRANSICAO_STATUS[statusAtual] || [];
    if (!permitido.includes(novoStatus)) {
      return res.status(400).json({
        erro: `Transição inválida: de "${statusAtual}" para "${novoStatus}".`,
      });
    }

    const campoTimestamp = {
      chamando: 'chamado_em',
      atendimento: 'atendimento_iniciado_em',
      finalizado: 'atendimento_finalizado_em',
    }[novoStatus];

    const sets = ['status = $1'];
    const params = [novoStatus];
    let idx = 2;

    if (campoTimestamp) {
      sets.push(`${campoTimestamp} = NOW()`);
    }
    if (novoStatus === 'aguardando') {
      sets.push('guiche = NULL');
    } else if (guiche) {
      sets.push(`guiche = $${idx}`);
      params.push(guiche);
      idx += 1;
    }

    params.push(id);

    const { rows } = await query(
      `UPDATE fila_atendimento SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, senha, prioridade, status, guiche, chamado_em, atendimento_iniciado_em, atendimento_finalizado_em`,
      params
    );

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar o status na fila.' });
  }
}

module.exports = { listar, listarPainel, detalhar, posicao, atualizarStatus };
