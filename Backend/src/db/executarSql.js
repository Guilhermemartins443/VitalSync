// =========================================================
// Roda um arquivo .sql (ex.: Database/criacaoTabela.sql ou
// Database/insertScript.sql) contra o banco do DATABASE_URL.
// Uso: node src/db/executarSql.js ../Database/criacaoTabela.sql
// =========================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { poolConfig } = require('../db');

const caminhoRelativo = process.argv[2];
if (!caminhoRelativo) {
  console.error('Uso: node src/db/executarSql.js <caminho-do-arquivo.sql>');
  process.exit(1);
}

const caminhoSql = path.resolve(__dirname, '..', '..', caminhoRelativo);

async function main() {
  const sql = fs.readFileSync(caminhoSql, 'utf8');
  const pool = new Pool(poolConfig);

  try {
    console.log(`Executando ${caminhoSql}...`);
    await pool.query(sql);
    console.log('Concluído com sucesso.');
  } catch (err) {
    // AggregateError (ex.: ECONNREFUSED em localhost IPv4+IPv6) vem com message vazia
    const detalhe = err.message
      || (err.errors && err.errors.map((e) => e.code || e.message).join(', '))
      || err.code
      || String(err);
    console.error('Falha ao executar o script SQL:', detalhe);
    if (/ECONNREFUSED/.test(detalhe)) {
      console.error('Não foi possível conectar ao PostgreSQL. Ele está rodando? O DATABASE_URL do .env está certo?');
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
