// =========================================================
// PRONTUÁRIO (profissional): evolução, receitas, orientações/atestado e lembretes.
// Tudo restrito à unidade do profissional (a unidade vem do token) e ao cargo (utils/permissoes).
// Registros clínicos só são INSERIDOS: não há rota de edição nem de exclusão.
// Toda escrita devolve o prontuário atualizado ({ prontuario }) para a tela se redesenhar.
// =========================================================
const { query } = require('../db');
const { MS } = require('../utils/tempo');
const { pode } = require('../utils/permissoes');

const ehId = (v) => /^\d{1,9}$/.test(String(v));
const limpo = (v) => (typeof v === 'string' ? v.trim() : '');

// ---------- leitura ----------
// receitas (com medicamentos) de várias entradas da fila: Map(filaId -> receitas[])
async function lerReceitas(filaIds, { lembretes }) {
  const porFila = new Map();
  if (!filaIds.length) return porFila;

  const { rows: recs } = await query(
    `SELECT r.id, r.fila_id, r.autor AS por, ${MS('r.created_at')} AS criado_em_ms
       FROM receitas r WHERE r.fila_id = ANY($1::int[]) ORDER BY r.created_at, r.id`,
    [filaIds]
  );
  const { rows: meds } = await query(
    `SELECT m.id, m.receita_id, m.nome, m.dosagem, m.posologia, m.duracao, m.comprado,
            ${MS('m.comprado_em')} AS comprado_em_ms
       FROM receita_medicamentos m JOIN receitas r ON r.id = m.receita_id
      WHERE r.fila_id = ANY($1::int[]) ORDER BY m.id`,
    [filaIds]
  );
  let lembs = [];
  if (lembretes) {
    ({ rows: lembs } = await query(
      `SELECT l.id, l.medicamento_id, l.canal, ${MS('l.enviado_em')} AS enviado_em_ms
         FROM lembretes_medicamento l
         JOIN receita_medicamentos m ON m.id = l.medicamento_id
         JOIN receitas r ON r.id = m.receita_id
        WHERE r.fila_id = ANY($1::int[]) ORDER BY l.id`,
      [filaIds]
    ));
  }

  const receitas = new Map();
  recs.forEach((r) => {
    const obj = { id: r.id, por: r.por, criado_em_ms: r.criado_em_ms, medicamentos: [] };
    receitas.set(r.id, obj);
    if (!porFila.has(r.fila_id)) porFila.set(r.fila_id, []);
    porFila.get(r.fila_id).push(obj);
  });
  const medicamentos = new Map();
  meds.forEach((m) => {
    const obj = {
      id: m.id, nome: m.nome, dosagem: m.dosagem, posologia: m.posologia, duracao: m.duracao,
      comprado: m.comprado, comprado_em_ms: m.comprado_em_ms,
    };
    if (lembretes) obj.lembretes = [];
    medicamentos.set(m.id, obj);
    receitas.get(m.receita_id).medicamentos.push(obj);
  });
  lembs.forEach((l) => {
    const med = medicamentos.get(l.medicamento_id);
    if (med) med.lembretes.push({ id: l.id, canal: l.canal, enviado_em_ms: l.enviado_em_ms });
  });
  return porFila;
}

async function lerOrientacoes(filaIds) {
  const porFila = new Map();
  if (!filaIds.length) return porFila;
  const { rows } = await query(
    `SELECT id, fila_id, autor AS por, texto, atestado, dias_afastamento, ${MS('created_at')} AS criado_em_ms
       FROM orientacoes WHERE fila_id = ANY($1::int[]) ORDER BY created_at, id`,
    [filaIds]
  );
  rows.forEach((o) => {
    if (!porFila.has(o.fila_id)) porFila.set(o.fila_id, []);
    const { fila_id, ...resto } = o;
    porFila.get(fila_id).push(resto);
  });
  return porFila;
}

// prontuário completo de UM atendimento (visão do profissional)
async function lerProntuario(filaId) {
  const { rows: evolucoes } = await query(
    `SELECT id, autor, texto, ${MS('created_at')} AS criado_em_ms
       FROM evolucoes_clinicas WHERE fila_id = $1 ORDER BY created_at, id`,
    [filaId]
  );
  const { rows: reclassificacoes } = await query(
    `SELECT id, autor AS por, de_prioridade AS de, para_prioridade AS para, motivo, ${MS('created_at')} AS em_ms
       FROM reclassificacoes WHERE fila_id = $1 ORDER BY created_at, id`,
    [filaId]
  );
  const receitas = (await lerReceitas([filaId], { lembretes: true })).get(filaId) || [];
  const orientacoes = (await lerOrientacoes([filaId])).get(filaId) || [];
  return { evolucoes, receitas, orientacoes, reclassificacoes };
}

// ---------- escrita ----------
// atendimento da unidade do profissional (ou responde 404 e devolve null)
async function entradaDaUnidade(req, res) {
  if (!ehId(req.params.id)) {
    res.status(404).json({ erro: 'Entrada da fila não encontrada.' });
    return null;
  }
  const { rows } = await query(
    'SELECT id, status FROM fila_atendimento WHERE id = $1 AND unidade_id = $2',
    [req.params.id, req.profissional.unidade_id]
  );
  if (rows.length === 0) {
    res.status(404).json({ erro: 'Entrada da fila não encontrada.' });
    return null;
  }
  return rows[0];
}

async function responder(res, filaId, status = 201) {
  res.status(status).json({ prontuario: await lerProntuario(filaId) });
}

// POST /api/fila/:id/evolucoes { texto }
async function adicionarEvolucao(req, res) {
  try {
    const fila = await entradaDaUnidade(req, res);
    if (!fila) return;
    const texto = limpo(req.body.texto);
    if (texto.length < 1 || texto.length > 5000) {
      return res.status(400).json({ erro: 'A evolução deve ter de 1 a 5000 caracteres.' });
    }
    await query(
      'INSERT INTO evolucoes_clinicas (fila_id, profissional_id, autor, texto) VALUES ($1, $2, $3, $4)',
      [fila.id, req.profissional.id, req.profissional.nome, texto]
    );
    await responder(res, fila.id);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar a evolução.' });
  }
}

// POST /api/fila/:id/receitas { nome, dosagem, posologia, duracao }
// Soma o medicamento à receita aberta DESTE profissional neste atendimento (ou cria uma nova).
async function adicionarMedicamento(req, res) {
  try {
    const fila = await entradaDaUnidade(req, res);
    if (!fila) return;

    const campos = {
      nome: [limpo(req.body.nome), 120],
      dosagem: [limpo(req.body.dosagem), 80],
      posologia: [limpo(req.body.posologia), 120],
      duracao: [limpo(req.body.duracao), 80],
    };
    for (const [campo, [valor, max]] of Object.entries(campos)) {
      if (!valor || valor.length > max) {
        return res.status(400).json({ erro: `Preencha "${campo}" (até ${max} caracteres).` });
      }
    }

    const { rows: abertas } = await query(
      'SELECT id FROM receitas WHERE fila_id = $1 AND profissional_id = $2 ORDER BY id DESC LIMIT 1',
      [fila.id, req.profissional.id]
    );
    let receitaId = abertas.length ? abertas[0].id : null;
    if (!receitaId) {
      const { rows } = await query(
        'INSERT INTO receitas (fila_id, profissional_id, autor) VALUES ($1, $2, $3) RETURNING id',
        [fila.id, req.profissional.id, req.profissional.nome]
      );
      receitaId = rows[0].id;
    }
    await query(
      `INSERT INTO receita_medicamentos (receita_id, nome, dosagem, posologia, duracao)
       VALUES ($1, $2, $3, $4, $5)`,
      [receitaId, campos.nome[0], campos.dosagem[0], campos.posologia[0], campos.duracao[0]]
    );
    await responder(res, fila.id);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar o medicamento.' });
  }
}

// POST /api/fila/:id/medicamentos/:medId/lembretes { canal: 'whatsapp' | 'sms' }
async function registrarLembrete(req, res) {
  try {
    const fila = await entradaDaUnidade(req, res);
    if (!fila) return;
    const { canal } = req.body;
    if (canal !== 'whatsapp' && canal !== 'sms') return res.status(400).json({ erro: 'Canal inválido.' });
    if (!ehId(req.params.medId)) return res.status(404).json({ erro: 'Medicamento não encontrado.' });

    const { rows } = await query(
      `SELECT m.id FROM receita_medicamentos m JOIN receitas r ON r.id = m.receita_id
        WHERE m.id = $1 AND r.fila_id = $2`,
      [req.params.medId, fila.id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Medicamento não encontrado.' });

    await query(
      'INSERT INTO lembretes_medicamento (medicamento_id, profissional_id, canal) VALUES ($1, $2, $3)',
      [rows[0].id, req.profissional.id, canal]
    );
    await responder(res, fila.id);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar o lembrete.' });
  }
}

// POST /api/fila/:id/orientacoes { texto, atestado?, dias_afastamento? }
// Atestado só para quem pode prescrever (médico/admin).
async function adicionarOrientacao(req, res) {
  try {
    const fila = await entradaDaUnidade(req, res);
    if (!fila) return;

    const texto = limpo(req.body.texto);
    if (texto.length < 1 || texto.length > 5000) {
      return res.status(400).json({ erro: 'A orientação deve ter de 1 a 5000 caracteres.' });
    }
    const atestado = req.body.atestado === true;
    let dias = null;
    if (atestado) {
      if (!pode(req.profissional.cargo, 'prescrever')) {
        return res.status(403).json({ erro: 'Só médico pode emitir atestado.' });
      }
      dias = req.body.dias_afastamento;
      if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
        return res.status(400).json({ erro: 'Informe os dias de afastamento (1 a 365).' });
      }
    }
    await query(
      `INSERT INTO orientacoes (fila_id, profissional_id, autor, texto, atestado, dias_afastamento)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [fila.id, req.profissional.id, req.profissional.nome, texto, atestado, dias]
    );
    await responder(res, fila.id);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar a orientação.' });
  }
}

module.exports = {
  lerProntuario, lerReceitas, lerOrientacoes,
  adicionarEvolucao, adicionarMedicamento, registrarLembrete, adicionarOrientacao,
};
