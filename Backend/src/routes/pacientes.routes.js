const { Router } = require('express');
const controller = require('../controllers/pacientes.controller');

const router = Router();

router.post('/', controller.cadastrar);
router.get('/cpf/:cpf', controller.buscarPorCpf);
router.get('/:id', controller.buscarPorId);

module.exports = router;
