const { Router } = require('express');
const controller = require('../controllers/fila.controller');
const { autenticarProfissional } = require('../middleware/auth');

const router = Router();

// Públicas: usadas pela tela do paciente (fila.html) — só senha,
// prioridade e posição, sem dado clínico ou pessoal sensível.
router.get('/', controller.listar);
router.get('/:id/posicao', controller.posicao);

// Protegidas: só profissional autenticado vê dado clínico (painel.html)
// ou pode avançar o status de alguém na fila.
router.get('/:id', autenticarProfissional, controller.detalhar);
router.patch('/:id/status', autenticarProfissional, controller.atualizarStatus);

module.exports = router;
