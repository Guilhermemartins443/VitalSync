const { Router } = require('express');
const controller = require('../controllers/sintomas.controller');

const router = Router();

router.get('/catalogo', controller.listarCatalogo);
router.post('/avaliacoes', controller.criarAvaliacao);

module.exports = router;
