// =========================================================
// Conexão com o banco (PostgreSQL), usando pool de conexões.
// As tabelas usadas aqui são exatamente as criadas em
// Database/criacaoTabela.sql — nada de schema paralelo.
// =========================================================
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err);
});

module.exports = {
  pool,
  // helper simples pra não repetir pool.query em todo controller
  query: (text, params) => pool.query(text, params),
};
