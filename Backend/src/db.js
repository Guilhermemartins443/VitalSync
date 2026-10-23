// =========================================================
// Conexão com o banco (PostgreSQL), usando pool de conexões.
// As tabelas usadas aqui são exatamente as criadas em
// Database/criacaoTabela.sql — nada de schema paralelo.
// =========================================================
const { Pool } = require('pg');

// Banco hospedado (Neon, Supabase, Render...) exige SSL; banco local não.
// Para forçar: DATABASE_SSL=true ou DATABASE_SSL=false.
const url = process.env.DATABASE_URL || '';
const ehLocal = /@(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);
const usarSsl = process.env.DATABASE_SSL ? process.env.DATABASE_SSL === 'true' : !ehLocal;

const pool = new Pool({
  connectionString: url,
  ssl: usarSsl ? { rejectUnauthorized: false } : false,
  // Na Vercel cada instância é efêmera: poucas conexões por instância evitam estourar o limite do banco.
  max: process.env.VERCEL ? 3 : 10,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err);
});

module.exports = {
  pool,
  // helper simples pra não repetir pool.query em todo controller
  query: (text, params) => pool.query(text, params),
};
