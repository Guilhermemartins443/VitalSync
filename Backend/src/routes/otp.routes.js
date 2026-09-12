const { Router } = require('express');
const controller = require('../controllers/otp.controller');

const router = Router();

router.post('/solicitar', controller.solicitar);
router.post('/verificar', controller.verificar);

module.exports = router;
