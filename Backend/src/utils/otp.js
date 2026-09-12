// =========================================================
// Geração e verificação do código de 6 dígitos usado no login
// do paciente (telas entrar.html / paciente.html). O código
// nunca é guardado em texto puro — só o hash, na tabela
// codigos_verificacao.
// =========================================================
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const VALIDADE_MINUTOS = 5;
const MAX_TENTATIVAS = 5;

function gerarCodigo() {
  // 6 dígitos, sempre com zero à esquerda se precisar
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function gerarHash(codigo) {
  return bcrypt.hash(codigo, 10);
}

async function conferirCodigo(codigo, hash) {
  return bcrypt.compare(codigo, hash);
}

module.exports = {
  gerarCodigo,
  gerarHash,
  conferirCodigo,
  VALIDADE_MINUTOS,
  MAX_TENTATIVAS,
};
