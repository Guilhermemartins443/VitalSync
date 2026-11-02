const { query, pool } = require('../db');
const { avisarChamada, avisarProximo } = require('../utils/avisos');
const { estimarEspera } = require('../utils/estimativa');
const { pode } = require('../utils/permissoes');
const { lerProntuario } = require('./prontuario.controller');

// 1ª chamada + até 2 rechamadas. Passou disso: "não compareceu" ou voltar para a fila.
// (o painel.js tem a mesma constante, só para desabilitar o botão "Rechamar")
const MAX_CHAMADAS = 3;

const TRANSICAO_STATUS = {
  aguardando: ['chamando'],
  chamando: ['chamando', 'atendimento', 'aguardando', 'desistencia'], // chamando -> chamando = rechamar
  atendimento: ['finalizado', 'aguardando'],
  finalizado: [],
  desistencia: [],
};

// Guichê/sala: 1 a 20 caracteres (letras, números, espaço, ponto, º/ª e hífen).
// Ex.: "Guichê 2", "Consultório 3", "Sala de triagem".
const GUICHE_REGEX = /^[\p{L}\p{N}][\p{L}\p{N} .ºª-]{0,19}$/u;

// ids numéricos simples (evita erro 500 do Postgres com "abc" e entradas estranhas)
function ehId(valor) {
  return /^\d{1,9}$/.test(String(valor));
}

// Tempos calculados NO SERVIDOR (o relógio do aparelho do paciente pode estar errado):
//  - espera_segundos: da entrada na fila até a 1ª chamada (depois de chamado, congela)
//  - chamando_ha_segundos: desde a chamada mais recente (só enquanto status = 'chamando')
const ESPERA_SQL = `FLOOR(EXTRACT(EPOCH FROM (COALESCE(f.chamado_em, NOW()) - f.created_at)))::int AS espera_segundos`;
const CHAMANDO_HA_SQL = `CASE WHEN f.status = 'chamando' AND f.ultima_chamada_em IS NOT NULL
            THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - f.ultima_chamada_em)))::int END AS chamando_ha_segundos`;

// GET /api/fila?unidade_id=1   (PÚBLICA)
// Só senha, prioridade, status e tempos de quem ainda AGUARDA. NUNCA nome, CPF ou id do
// paciente: quem vê a fila pública não pode saber quem é cada senha.
async function listar(req, res) {
  try {
    const { unidade_id } = req.query;
    if (!ehId(unidade_id)) return res.status(400).json({ erro: 'Informe unidade_id válido.' });

    const { rows } = await query(
      `SELECT f.id, f.senha, f.prioridade, f.status, f.guiche, f.created_at,
              f.chamado_em, f.atendimento_iniciado_em, f.atendimento_finalizado_em,
              ${ESPERA_SQL}
         FROM fila_atendimento f
        WHERE f.unidade_id = $1
          AND f.status = 'aguardando'
        ORDER BY f.prioridade ASC, f.created_at ASC`,
      [unidade_id]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar a fila de atendimento.' });
  }
}

// GET /api/fila/acompanhar?id=12&unidade_id=1   (PÚBLICA — usada por fila.html)
// Uma ÚNICA chamada por atualização da tela do paciente: a fila de espera da unidade +
// a situação da senha dele (posição, status, guichê, quantas vezes foi chamado).
//  - com `id` válido a unidade é a da própria senha;
//  - sem `id` (paciente ainda sem senha) precisa de `unidade_id`.
async function acompanhar(req, res) {
  try {
    const { id, unidade_id } = req.query;

    let minha = null;
    let unidade = null;
    if (id !== undefined && ehId(id)) {
      const { rows } = await query(
        `SELECT f.id, f.senha, f.prioridade, f.status, f.guiche, f.chamadas, f.unidade_id,
                f.avisos_ativos, ${ESPERA_SQL}, ${CHAMANDO_HA_SQL}
           FROM fila_atendimento f
          WHERE f.id = $1`,
        [id]
      );
      if (rows.length) {
        minha = rows[0];
        unidade = minha.unidade_id;
      }
    }
    if (unidade === null) {
      if (!ehId(unidade_id)) return res.status(400).json({ erro: 'Informe unidade_id ou id válido.' });
      unidade = Number(unidade_id);
    }

    const { rows: fila } = await query(
      `SELECT f.id, f.senha, f.prioridade, f.status, f.guiche, ${ESPERA_SQL}
         FROM fila_atendimento f
        WHERE f.unidade_id = $1
          AND f.status = 'aguardando'
        ORDER BY f.prioridade ASC, f.created_at ASC`,
      [unidade]
    );

    if (minha) {
      // posição = lugar dentro da fila de espera (já ordenada); só quem aguarda tem posição
      const idx = minha.status === 'aguardando' ? fila.findIndex((f) => f.id === minha.id) : -1;
      minha.posicao = idx >= 0 ? idx + 1 : null;
      minha.pessoas_na_frente = idx >= 0 ? idx : 0;

      // tempo estimado com base nos atendimentos que de fato aconteceram na unidade
      if (idx >= 0) {
        try {
          const est = await estimarEspera(unidade, fila.slice(0, idx));
          minha.espera_estimada_min = est.minutos;
          minha.estimativa_amostras = est.amostras;
        } catch (e) {
          console.error('Falha ao estimar a espera:', e.code || e.message); // a tela usa o valor padrão
        }
      }
    }

    res.json({ unidade_id: unidade, fila, minha });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao acompanhar a fila.' });
  }
}

// GET /api/fila/painel   (PROTEGIDA — painel.html)
// Fila da unidade DO PROFISSIONAL logado (a unidade vem do token, não da URL), com o
// nome do paciente. Devolve quem aguarda, quem está sendo chamado e quem está em
// atendimento (a tela separa em dois blocos). CPF e demais dados só em GET /api/fila/:id.
async function listarPainel(req, res) {
  try {
    const { rows } = await query(
      `SELECT f.id, f.senha, f.prioridade, f.status, f.guiche, f.chamadas, f.created_at,
              f.chamado_em, f.atendimento_iniciado_em, f.atendimento_finalizado_em,
              ${ESPERA_SQL}, ${CHAMANDO_HA_SQL},
              p.id AS paciente_id, p.nome_completo,
              COALESCE(
                (SELECT array_agg(sc.chave)
                   FROM avaliacao_sintoma asi
                   JOIN sintomas_catalogo sc ON sc.id = asi.sintoma_id
                  WHERE asi.avaliacao_id = f.avaliacao_id),
                '{}'
              ) AS sintomas
         FROM fila_atendimento f
         JOIN pacientes p ON p.id = f.paciente_id
        WHERE f.unidade_id = $1
          AND f.status IN ('aguardando', 'chamando', 'atendimento')
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
      `SELECT f.id, f.senha, f.prioridade, f.status, f.guiche, f.chamadas, f.created_at,
              ${ESPERA_SQL}, ${CHAMANDO_HA_SQL},
              p.id AS paciente_id, p.nome_completo, p.cpf,
              to_char(p.data_nascimento, 'YYYY-MM-DD') AS data_nascimento,
              p.cns, p.telefone, p.email,
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

    // evolução, receitas, orientações e histórico de reclassificação: só cargos clínicos
    // (a recepção enxerga a fila, não o prontuário)
    const prontuario = pode(req.profissional.cargo, 'lerProntuario') ? await lerProntuario(rows[0].id) : null;
    res.json({ ...rows[0], prontuario });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar detalhes da fila.' });
  }
}

// GET /api/fila/:id/posicao — situação de UMA senha (a tela do paciente usa /acompanhar,
// que devolve isto junto com a fila numa chamada só; esta rota continua disponível).
async function posicao(req, res) {
  try {
    if (!ehId(req.params.id)) return res.status(404).json({ erro: 'Entrada da fila não encontrada.' });
    const { rows } = await query(
      `SELECT f.id, f.senha, f.prioridade, f.status, f.guiche, f.chamadas, f.unidade_id, f.created_at,
              ${ESPERA_SQL}, ${CHAMANDO_HA_SQL}
         FROM fila_atendimento f
        WHERE f.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Entrada da fila não encontrada.' });

    const entrada = rows[0];
    const { created_at, ...publico } = entrada;

    // quem já foi chamado (ou está em atendimento / saiu) não ocupa posição na fila
    if (entrada.status !== 'aguardando') {
      return res.json({ ...publico, posicao: null, pessoas_na_frente: 0 });
    }

    const { rows: naFrenteRows } = await query(
      `SELECT COUNT(*)::int AS na_frente
         FROM fila_atendimento
        WHERE unidade_id = $1
          AND status = 'aguardando'
          AND (prioridade < $2 OR (prioridade = $2 AND created_at < $3))`,
      [entrada.unidade_id, entrada.prioridade, created_at]
    );

    res.json({
      ...publico,
      posicao: naFrenteRows[0].na_frente + 1,
      pessoas_na_frente: naFrenteRows[0].na_frente,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao calcular a posição na fila.' });
  }
}

// PATCH /api/fila/:id/status  { status: 'chamando' | 'atendimento' | 'finalizado' | 'aguardando' | 'desistencia', guiche?, rechamar? }
//  A 1ª chamada EXIGE `guiche` (o local que o paciente vai ver e receber por mensagem).
//  Depois de chamar, o servidor avisa por WhatsApp/SMS quem pediu (campo `notificacao` na
//  resposta: 'enviada' | 'falhou' | null) e, se a fila andou, avisa o novo "próximo".
//  chamando -> chamando   = RECHAMAR (até MAX_CHAMADAS chamadas no total). Precisa vir com
//                           `rechamar: true`: sem isso, um clique duplo (ou duas pessoas
//                           chamando o mesmo paciente) viraria uma rechamada sem querer
//  chamando -> desistencia = "não compareceu" (sai da fila; para voltar, só com nova avaliação)
//  chamando/atendimento -> aguardando = devolve o paciente à fila; a espera volta a contar
//                                       desde a entrada original
async function atualizarStatus(req, res) {
  try {
    const { id } = req.params;
    const { status: novoStatus } = req.body;
    const guiche = typeof req.body.guiche === 'string' ? req.body.guiche.trim() : req.body.guiche;

    if (!ehId(id)) return res.status(404).json({ erro: 'Entrada da fila não encontrada.' });
    if (!Object.prototype.hasOwnProperty.call(TRANSICAO_STATUS, novoStatus)) {
      return res.status(400).json({ erro: 'Status inválido.' });
    }
    if (guiche !== undefined && guiche !== null && guiche !== ''
        && (typeof guiche !== 'string' || !GUICHE_REGEX.test(guiche))) {
      return res.status(400).json({
        erro: 'Guichê/sala inválido (até 20 caracteres: letras, números, espaço, ponto, hífen).',
      });
    }

    // só mexe na fila da própria unidade
    const { rows: atuais } = await query(
      'SELECT status, chamadas FROM fila_atendimento WHERE id = $1 AND unidade_id = $2',
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

    const rechamada = statusAtual === 'chamando' && novoStatus === 'chamando';
    if (novoStatus === 'chamando' && !rechamada && !guiche) {
      return res.status(400).json({ erro: 'Informe o seu guichê ou sala antes de chamar o paciente.' });
    }
    if (rechamada && req.body.rechamar !== true) {
      return res.status(409).json({ erro: 'Este paciente já está sendo chamado. Use "Rechamar" para chamar de novo.' });
    }
    if (rechamada && atuais[0].chamadas >= MAX_CHAMADAS) {
      return res.status(400).json({
        erro: `Limite de ${MAX_CHAMADAS} chamadas atingido. Marque "não compareceu" ou volte o paciente para a fila.`,
      });
    }

    const sets = ['status = $1'];
    const params = [novoStatus];
    let idx = 2;

    if (novoStatus === 'chamando') {
      if (rechamada) {
        // mantém chamado_em da 1ª chamada: o tempo de espera continua congelado nela
        sets.push('chamadas = chamadas + 1', 'ultima_chamada_em = NOW()');
      } else {
        sets.push('chamadas = 1', 'chamado_em = NOW()', 'ultima_chamada_em = NOW()');
      }
    } else if (novoStatus === 'atendimento') {
      sets.push('atendimento_iniciado_em = NOW()');
    } else if (novoStatus === 'finalizado') {
      sets.push('atendimento_finalizado_em = NOW()');
    } else if (novoStatus === 'desistencia') {
      sets.push('desistencia_em = NOW()');
    } else if (novoStatus === 'aguardando') {
      // volta pra fila: a espera volta a contar desde a entrada original (created_at)
      sets.push('guiche = NULL', 'chamado_em = NULL', 'ultima_chamada_em = NULL', 'chamadas = 0',
        'atendimento_iniciado_em = NULL', 'aviso_proximo_em = NULL');
    }

    if (novoStatus !== 'aguardando' && guiche) {
      sets.push(`guiche = $${idx}`);
      params.push(guiche);
      idx += 1;
    }

    // WHERE com o status lido acima: se outro profissional mexeu nesse meio-tempo
    // (ou clicou duas vezes), a atualização não acontece e avisamos em vez de sobrescrever.
    params.push(id, statusAtual);
    const { rows } = await query(
      `UPDATE fila_atendimento SET ${sets.join(', ')}
        WHERE id = $${idx} AND status = $${idx + 1}${rechamada ? ` AND chamadas < ${MAX_CHAMADAS}` : ''}
       RETURNING id, senha, prioridade, status, guiche, chamadas, chamado_em, ultima_chamada_em,
                 atendimento_iniciado_em, atendimento_finalizado_em, desistencia_em`,
      params
    );
    if (rows.length === 0) {
      return res.status(409).json({ erro: 'Este paciente foi atualizado por outra pessoa. A fila foi recarregada.' });
    }

    // avisos por mensagem (só para quem pediu): nunca derrubam a ação do profissional
    let notificacao = null;
    if (novoStatus === 'chamando') notificacao = await avisarChamada(id);
    await avisarProximo(req.profissional.unidade_id); // a fila andou: avisa quem virou o próximo

    res.json({ ...rows[0], notificacao });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar o status na fila.' });
  }
}

// PATCH /api/fila/:id/prioridade  { prioridade: 0..3, motivo? }   (reclassificação manual de risco)
// Só cargos clínicos (utils/permissoes). A prioridade calculada na triagem
// (avaliacoes_sintomas.prioridade_calculada) NÃO é alterada: fica como registro do que o sistema
// calculou. Cada mudança entra em `reclassificacoes` (de, para, motivo, quem, quando) e o
// profissional que revisou fica em avaliado_por_profissional_id. A senha (ex.: P003) não muda.
async function reclassificar(req, res) {
  const { id } = req.params;
  const { prioridade } = req.body;
  const motivo = typeof req.body.motivo === 'string' ? req.body.motivo.trim() : '';

  if (!ehId(id)) return res.status(404).json({ erro: 'Entrada da fila não encontrada.' });
  if (!Number.isInteger(prioridade) || prioridade < 0 || prioridade > 3) {
    return res.status(400).json({ erro: 'Prioridade inválida (use 0 a 3).' });
  }
  if (motivo.length > 1000) return res.status(400).json({ erro: 'O motivo pode ter até 1000 caracteres.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, senha, prioridade, status, avaliacao_id FROM fila_atendimento
        WHERE id = $1 AND unidade_id = $2 AND status IN ('aguardando', 'chamando', 'atendimento')
          FOR UPDATE`,
      [id, req.profissional.unidade_id]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Entrada da fila não encontrada ou já encerrada.' });
    }
    const atual = rows[0];

    if (atual.prioridade !== prioridade) {
      await client.query('UPDATE fila_atendimento SET prioridade = $1 WHERE id = $2', [prioridade, atual.id]);
      await client.query(
        `INSERT INTO reclassificacoes (fila_id, profissional_id, autor, de_prioridade, para_prioridade, motivo)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [atual.id, req.profissional.id, req.profissional.nome, atual.prioridade, prioridade, motivo || null]
      );
      if (atual.avaliacao_id) {
        await client.query('UPDATE avaliacoes_sintomas SET avaliado_por_profissional_id = $1 WHERE id = $2', [
          req.profissional.id, atual.avaliacao_id,
        ]);
      }
    }
    await client.query('COMMIT');

    if (atual.prioridade !== prioridade) {
      await avisarProximo(req.profissional.unidade_id); // a ordem da fila pode ter mudado
    }
    res.json({
      id: atual.id, senha: atual.senha, prioridade, status: atual.status,
      prontuario: await lerProntuario(atual.id),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ erro: 'Erro ao reclassificar o paciente.' });
  } finally {
    client.release();
  }
}

// GET /api/fila/indicadores   (PROTEGIDA — painel Verde)
// Tempos reais da unidade do profissional, sem nenhum dado pessoal:
//  espera = entrada -> 1ª chamada | até iniciar = chamada -> início | atendimento = início -> fim
// Cada duração é limitada (480/120/120 min) para um "esqueci de finalizar" não distorcer a média.
const MEDIAS_SQL = `
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE status = 'finalizado')::int AS finalizados,
  COUNT(*) FILTER (WHERE status = 'desistencia')::int AS nao_compareceu,
  AVG(LEAST(EXTRACT(EPOCH FROM (chamado_em - created_at)) / 60, 480))
      FILTER (WHERE chamado_em IS NOT NULL)::float8 AS espera_media_min,
  AVG(LEAST(EXTRACT(EPOCH FROM (atendimento_iniciado_em - chamado_em)) / 60, 120))
      FILTER (WHERE chamado_em IS NOT NULL AND atendimento_iniciado_em IS NOT NULL)::float8 AS ate_iniciar_media_min,
  AVG(LEAST(EXTRACT(EPOCH FROM (atendimento_finalizado_em - atendimento_iniciado_em)) / 60, 120))
      FILTER (WHERE status = 'finalizado' AND atendimento_iniciado_em IS NOT NULL
              AND atendimento_finalizado_em IS NOT NULL)::float8 AS atendimento_media_min`;

const arredondar = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
const formatarJanela = (r) => ({
  total: r.total, finalizados: r.finalizados, nao_compareceu: r.nao_compareceu,
  espera_media_min: arredondar(r.espera_media_min),
  ate_iniciar_media_min: arredondar(r.ate_iniciar_media_min),
  atendimento_media_min: arredondar(r.atendimento_media_min),
});

async function indicadores(req, res) {
  try {
    const unidade = req.profissional.unidade_id;
    const janela = async (intervalo) => {
      const { rows } = await query(
        `SELECT ${MEDIAS_SQL} FROM fila_atendimento WHERE unidade_id = $1 AND created_at >= NOW() - $2::interval`,
        [unidade, intervalo]
      );
      return formatarJanela(rows[0]);
    };
    const { rows: porPrioridade } = await query(
      `SELECT prioridade, ${MEDIAS_SQL} FROM fila_atendimento
        WHERE unidade_id = $1 AND created_at >= NOW() - interval '30 days'
        GROUP BY prioridade ORDER BY prioridade`,
      [unidade]
    );

    res.json({
      ultimas_24h: await janela('24 hours'),
      ultimos_30_dias: await janela('30 days'),
      por_prioridade: porPrioridade.map((r) => ({ prioridade: r.prioridade, ...formatarJanela(r) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao calcular os indicadores.' });
  }
}

module.exports = { listar, acompanhar, listarPainel, detalhar, posicao, atualizarStatus, reclassificar, indicadores };
