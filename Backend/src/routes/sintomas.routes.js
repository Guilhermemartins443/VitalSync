const { Router } = require('express');
const controller = require('../controllers/sintomas.controller');
const { limitar } = require('../middleware/limitador');

const router = Router();

router.get('/catalogo', controller.listarCatalogo);
// cria entrada na fila: limite por IP evita encher a fila com senhas falsas
router.post('/avaliacoes', limitar({ max: 10, janelaMs: 10 * 60 * 1000 }), controller.criarAvaliacao);

module.exports = router;
