const { Router } = require('express');
const controller = require('../controllers/auth.controller');
const { autenticarProfissional, exigirCargo } = require('../middleware/auth');
const { limitar } = require('../middleware/limitador');

const router = Router();

// Cadastro FECHADO: só um administrador autenticado cria contas de profissionais.
// (O primeiro admin é criado por linha de comando: npm run admin:criar)
router.post('/cadastro', autenticarProfissional, exigirCargo('admin'), controller.cadastrar);
router.post('/login', controller.login);

// Auto-cadastro: público, mas a conta nasce PENDENTE e só um admin da unidade libera o acesso.
router.post('/solicitar-acesso', limitar({ max: 5, janelaMs: 60 * 60 * 1000 }), controller.solicitarAcesso);
router.get('/solicitacoes', autenticarProfissional, exigirCargo('admin'), controller.listarSolicitacoes);
router.patch('/solicitacoes/:id', autenticarProfissional, exigirCargo('admin'), controller.decidirSolicitacao);
// Usado pelo guard do front para validar a sessão e recarregar os dados do profissional
router.get('/me', autenticarProfissional, controller.me);

module.exports = router;
