// Colunas TIMESTAMP (sem fuso) guardam a hora no fuso da sessão do banco. Para o navegador
// receber um instante exato (milissegundos desde 1970) sem depender do fuso do servidor
// Node, convertemos no próprio SQL: MS('f.created_at') -> float8.
const MS = (coluna) =>
  `(EXTRACT(EPOCH FROM (${coluna} AT TIME ZONE current_setting('TimeZone'))) * 1000)::float8`;

module.exports = { MS };
