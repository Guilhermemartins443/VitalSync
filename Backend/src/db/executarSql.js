// =========================================================
// Roda um arquivo .sql (ex.: Database/criacaoTabela.sql ou
// Database/insertScript.sql) contra o banco do DATABASE_URL.
// Uso: node src/db/executarSql.js ../Database/criacaoTabela.sql
// =========================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const caminhoRelativo = process.argv[2];
if (!caminhoRelativo) {
  console.error('Uso: node src/db/executarSql.js <caminho-do-arquivo.sql>');
  process.exit(1);
}

const caminhoSql = path.resolve(__dirname, '..', '..', caminhoRelativo);

async function main() {
  const sql = fs.readFileSync(caminhoSql, 'utf8');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log(`Executando ${caminhoSql}...`);
    await pool.query(sql);
    console.log('Concluído com sucesso.');
  } catch (err) {
    console.error('Falha ao executar o script SQL:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
