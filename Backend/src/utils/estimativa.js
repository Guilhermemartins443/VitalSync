// =========================================================
// Tempo estimado de espera com base no que REALMENTE aconteceu na unidade.
//
//  - tempo de ocupação de um atendimento = da 1ª chamada até finalizar (inclui o paciente
//    caminhar até o guichê), média dos últimos 30 dias POR PRIORIDADE;
//  - ignora o que é claramente erro: menos de 30 s (clique errado) e limita cada um a 120 min
//    (esqueceram de finalizar);
//  - poucos dados? suavizamos com o valor padrão: (n*média + 5*padrão) / (n + 5). Assim, no
//    começo a estimativa é a de sempre e vai "aprendendo" sozinha conforme há atendimentos;
//  - vários guichês atendendo ao mesmo tempo dividem a fila: usamos quantos guichês estão em
//    uso agora (ou finalizaram algo nos últimos 30 min), no mínimo 1.
// Cache de 60 s por unidade (a tela do paciente consulta a cada poucos segundos).
// =========================================================
const { query } = require('../db');

const PADRAO_MIN = { 0: 5, 1: 12, 2: 18, 3: 24 };
const PESO_PADRAO = 5;
const CACHE_MS = Number(process.env.ESTIMATIVA_CACHE_MS ?? 60 * 1000); // 0 desliga o cache (testes)
const cache = new Map(); // unidade_id -> { em, valor }

async function carregar(unidadeId) {
  const { rows: medias } = await query(
    `SELECT prioridade, COUNT(*)::int AS n,
            AVG(LEAST(EXTRACT(EPOCH FROM (atendimento_finalizado_em - chamado_em)) / 60, 120))::float8 AS media_min
       FROM fila_atendimento
      WHERE unidade_id = $1
        AND status = 'finalizado'
        AND chamado_em IS NOT NULL
        AND atendimento_finalizado_em IS NOT NULL
        AND atendimento_finalizado_em >= NOW() - interval '30 days'
        AND atendimento_finalizado_em - chamado_em >= interval '30 seconds'
      GROUP BY prioridade`,
    [unidadeId]
  );
  const { rows: guiches } = await query(
    `SELECT COUNT(DISTINCT guiche)::int AS n
       FROM fila_atendimento
      WHERE unidade_id = $1 AND guiche IS NOT NULL
        AND (status IN ('chamando', 'atendimento')
             OR (status = 'finalizado' AND atendimento_finalizado_em >= NOW() - interval '30 minutes'))`,
    [unidadeId]
  );

  const porPrioridade = {};
  let amostras = 0;
  for (const p of [0, 1, 2, 3]) {
    const linha = medias.find((m) => m.prioridade === p);
    const n = linha ? linha.n : 0;
    amostras += n;
    porPrioridade[p] = linha
      ? (n * linha.media_min + PESO_PADRAO * PADRAO_MIN[p]) / (n + PESO_PADRAO)
      : PADRAO_MIN[p];
  }
  return { porPrioridade, amostras, guiches: Math.max(1, guiches[0].n) };
}

async function dadosDaUnidade(unidadeId) {
  const hit = cache.get(unidadeId);
  if (hit && Date.now() - hit.em < CACHE_MS) return hit.valor;
  const valor = await carregar(unidadeId);
  cache.set(unidadeId, { em: Date.now(), valor });
  return valor;
}

// `aFrente`: lista (já na ordem da fila) de quem está antes do paciente, cada um com `.prioridade`.
// -> { minutos, amostras, guiches }
async function estimarEspera(unidadeId, aFrente) {
  const d = await dadosDaUnidade(unidadeId);
  const total = aFrente.reduce((soma, f) => soma + (d.porPrioridade[f.prioridade] ?? 15), 0);
  return { minutos: Math.max(1, Math.round(total / d.guiches)), amostras: d.amostras, guiches: d.guiches };
}

function limparCache() { cache.clear(); }

module.exports = { estimarEspera, limparCache, PADRAO_MIN };
