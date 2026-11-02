const { Router } = require('express');
const controller = require('../controllers/fila.controller');
const { autenticarProfissional } = require('../middleware/auth');
const { limitar } = require('../middleware/limitador');
const prontuario = require('../controllers/prontuario.controller');
const { exigirPermissao } = require('../utils/permissoes');

const router = Router();

// Públicas: usadas pela tela do paciente (fila.html) — só senha, prioridade,
// status e posição. Sem nome, CPF ou id de paciente. Com limite por IP.
const limitePublico = limitar({ max: 60, janelaMs: 60 * 1000 });
// A tela do paciente atualiza sozinha a cada poucos segundos. Vários pacientes na mesma
// sala usam o MESMO IP (Wi-Fi da unidade), então este limite é mais folgado
// (atualização a cada 3 s = 20 pedidos/min por paciente -> cabem ~30 pacientes por IP).
const limiteAcompanhar = limitar({ max: 600, janelaMs: 60 * 1000 });
router.get('/', limitePublico, controller.listar);
router.get('/acompanhar', limiteAcompanhar, controller.acompanhar);
router.get('/:id/posicao', limitePublico, controller.posicao);

// Protegidas: só profissional autenticado, sempre restritas à unidade dele.
// (/painel precisa vir ANTES de /:id, senão "painel" seria tratado como id.)
router.get('/painel', autenticarProfissional, controller.listarPainel);
router.get('/indicadores', autenticarProfissional, controller.indicadores);
router.get('/:id', autenticarProfissional, controller.detalhar);
router.patch('/:id/status', autenticarProfissional, controller.atualizarStatus);
router.patch('/:id/prioridade', autenticarProfissional, exigirPermissao('reclassificar'), controller.reclassificar);

// Prontuário (só INSERE; sem edição/exclusão). Cargo define quem pode cada coisa (utils/permissoes.js).
router.post('/:id/evolucoes', autenticarProfissional, exigirPermissao('evoluir'), prontuario.adicionarEvolucao);
router.post('/:id/receitas', autenticarProfissional, exigirPermissao('prescrever'), prontuario.adicionarMedicamento);
router.post('/:id/medicamentos/:medId/lembretes', autenticarProfissional, exigirPermissao('lembrete'), prontuario.registrarLembrete);
router.post('/:id/orientacoes', autenticarProfissional, exigirPermissao('evoluir'), prontuario.adicionarOrientacao);

module.exports = router;
