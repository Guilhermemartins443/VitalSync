// =========================================================
// Cria (ou promove) o PRIMEIRO administrador — o cadastro de
// profissionais é fechado, então alguém precisa ser criado
// fora da API. Uso:
//   npm run admin:criar -- "Nome" email@unidade.gov.br "senha-com-8+" [unidade_id]
// =========================================================
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

async function main() {
  const [nome, email, senha, unidadeId] = process.argv.slice(2);
  if (!nome || !email || !senha) {
    console.error('Uso: npm run admin:criar -- "Nome" email senha [unidade_id]');
    process.exit(1);
  }
  if (senha.length < 8) {
    console.error('A senha precisa ter pelo menos 8 caracteres.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(senha, 10);
  const { rows } = await pool.query(
    `INSERT INTO profissionais (nome, email, senha_hash, cargo, unidade_id, status)
     VALUES ($1, $2, $3, 'admin', $4, 'ativo')
     ON CONFLICT (email) DO UPDATE
        SET senha_hash = EXCLUDED.senha_hash, cargo = 'admin', status = 'ativo', nome = EXCLUDED.nome,
            unidade_id = COALESCE(EXCLUDED.unidade_id, profissionais.unidade_id)
     RETURNING id, nome, email, cargo, unidade_id`,
    [nome.trim(), email.trim().toLowerCase(), hash, unidadeId ? Number(unidadeId) : null]
  );
  console.log('Administrador pronto:', rows[0]);
  if (!rows[0].unidade_id) {
    console.warn('Atenção: sem unidade_id — este admin só cadastrará profissionais sem unidade. Informe o 4º argumento.');
  }
}

main()
  .catch((err) => { console.error('Falha:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
