// =========================================================
// Conexão com o banco (PostgreSQL), usando pool de conexões.
// As tabelas usadas aqui são exatamente as criadas em
// Database/criacaoTabela.sql — nada de schema paralelo.
//
// Funciona local (localhost, sem SSL) e em nuvem (Neon, Supabase,
// Render...), que exige SSL. Para forçar sem SSL: DATABASE_SSL=false.
// =========================================================
const { Pool } = require('pg');

function montarConfig() {
  let url = process.env.DATABASE_URL || '';
  const local = /@(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);

  // O pg dá prioridade ao "?sslmode=" da URL sobre a opção ssl abaixo; removemos
  // esse parâmetro e controlamos o SSL aqui, de forma previsível.
  try {
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    url = u.toString();
  } catch (_) { /* URL vazia/inválida: o pg reporta o erro na primeira consulta */ }

  const usarSsl = !local && process.env.DATABASE_SSL !== 'false';
  return {
    connectionString: url || undefined,
    ssl: usarSsl ? { rejectUnauthorized: false } : false,
    // em serverless cada instância deve segurar poucas conexões
    max: process.env.VERCEL ? 3 : 10,
    connectionTimeoutMillis: 10000,
  };
}

const poolConfig = montarConfig();
const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err);
});

module.exports = {
  pool,
  poolConfig,
  // helper simples pra não repetir pool.query em todo controller
  query: (text, params) => pool.query(text, params),
};
