const { Router } = require('express');
const controller = require('../controllers/fila.controller');
const { autenticarProfissional } = require('../middleware/auth');
const { limitar } = require('../middleware/limitador');

const router = Router();

// Públicas: usadas pela tela do paciente (fila.html) — só senha, prioridade,
// status e posição. Sem nome, CPF ou id de paciente. Com limite por IP.
const limitePublico = limitar({ max: 60, janelaMs: 60 * 1000 });
router.get('/', limitePublico, controller.listar);
router.get('/:id/posicao', limitePublico, controller.posicao);

// Protegidas: só profissional autenticado, sempre restritas à unidade dele.
// (/painel precisa vir ANTES de /:id, senão "painel" seria tratado como id.)
router.get('/painel', autenticarProfissional, controller.listarPainel);
router.get('/:id', autenticarProfissional, controller.detalhar);
router.patch('/:id/status', autenticarProfissional, controller.atualizarStatus);

module.exports = router;
