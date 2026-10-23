const { Router } = require('express');
const controller = require('../controllers/pacientes.controller');
const { autenticarProfissional } = require('../middleware/auth');
const { limitar } = require('../middleware/limitador');

const router = Router();

// Públicas (paciente sem login) — com limite por IP e SEM devolver dado pessoal:
//  - POST: cria cadastro novo; se o CPF já existe, não altera nada nem devolve dados.
//  - GET /cpf/:cpf: só informa se existe + id + telefone mascarado (para o passo do OTP).
router.post('/', limitar({ max: 10, janelaMs: 10 * 60 * 1000 }), controller.cadastrar);
router.get('/cpf/:cpf', limitar({ max: 10, janelaMs: 10 * 60 * 1000 }), controller.buscarPorCpf);

// Protegida: dado completo (nome, CPF, CNS, telefone, e-mail) só para profissional
// autenticado e apenas de pacientes ligados à unidade dele.
router.get('/:id', autenticarProfissional, controller.buscarPorId);

module.exports = router;
