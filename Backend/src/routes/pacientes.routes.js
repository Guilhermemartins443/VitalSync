const { Router } = require('express');
const controller = require('../controllers/pacientes.controller');
const { autenticarProfissional, autenticarPaciente } = require('../middleware/auth');
const atendimentos = require('../controllers/atendimentos.controller');
const { limitar } = require('../middleware/limitador');

const router = Router();

// Públicas (paciente sem login) — com limite por IP e SEM devolver dado pessoal:
//  - POST: cria cadastro novo; se o CPF já existe, não altera nada nem devolve dados.
//  - GET /cpf/:cpf: só informa se existe + id + telefone mascarado (para o passo do OTP).
router.post('/', limitar({ max: 10, janelaMs: 10 * 60 * 1000 }), controller.cadastrar);
router.get('/cpf/:cpf', limitar({ max: 10, janelaMs: 10 * 60 * 1000 }), controller.buscarPorCpf);

// Sessão do PACIENTE (token do OTP): só os dados dele. Estas rotas vêm ANTES de /:id.
const limiteMe = limitar({ max: 120, janelaMs: 60 * 1000 });
router.get('/me/atendimentos', limiteMe, autenticarPaciente, atendimentos.listar);
router.post('/me/medicamentos/:medId/comprado', limiteMe, autenticarPaciente, atendimentos.confirmarCompra);

// Protegida: dado completo (nome, CPF, CNS, telefone, e-mail) só para profissional
// autenticado e apenas de pacientes ligados à unidade dele.
router.get('/:id', autenticarProfissional, controller.buscarPorId);

module.exports = router;
