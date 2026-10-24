// Ponto de entrada da API na Vercel (função serverless).
// O vercel.json manda todo /api/* para cá; o Express cuida do roteamento.
module.exports = require('../Backend/server.js');
