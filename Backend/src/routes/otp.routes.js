const { Router } = require('express');
const controller = require('../controllers/otp.controller');
const { limitar } = require('../middleware/limitador');

const router = Router();

// Sem estes limites dava para disparar SMS/WhatsApp sem fim e, pedindo código novo
// toda hora (cada um reinicia as 5 tentativas), adivinhar os 6 dígitos por força bruta.
const porIp = limitar({ max: 20, janelaMs: 10 * 60 * 1000 });
const porPaciente = (max, janelaMs) =>
  limitar({ max, janelaMs, chave: (req) => `${req.ip}|${req.body && req.body.paciente_id}` });

router.post('/solicitar', porIp, porPaciente(3, 10 * 60 * 1000), controller.solicitar);
router.post('/verificar', porIp, porPaciente(10, 10 * 60 * 1000), controller.verificar);

module.exports = router;
