// =========================================================
// ACOLHESUS / VITALSYNC — API
// Back-end real para o front-end de Public/, substituindo o
// VitalSyncStore (localStorage) por chamadas HTTP a um banco
// PostgreSQL de verdade (Database/criacaoTabela.sql).
// =========================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const unidadesRoutes = require('./src/routes/unidades.routes');
const pacientesRoutes = require('./src/routes/pacientes.routes');
const otpRoutes = require('./src/routes/otp.routes');
const authRoutes = require('./src/routes/auth.routes');
const sintomasRoutes = require('./src/routes/sintomas.routes');
const filaRoutes = require('./src/routes/fila.routes');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET ausente ou muito curto (mínimo 16 caracteres). Configure o .env.');
  process.exit(1);
}

const app = express();

// Atrás do proxy do Render/Railway: faz req.ip ser o IP real (o limitador de requisições depende disso).
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// CORS: FRONTEND_ORIGIN aceita várias origens separadas por vírgula. Em desenvolvimento,
// qualquer localhost/127.0.0.1 (qualquer porta) também é aceito, para não travar o front
// aberto por Live Server, outra porta, etc. Sem FRONTEND_ORIGIN, libera tudo (como antes).
const origensPermitidas = (process.env.FRONTEND_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
const emDev = process.env.NODE_ENV !== 'production';
app.use(cors({
  origin(origin, cb) {
    if (!origensPermitidas.length) return cb(null, true);
    if (!origin || origensPermitidas.includes(origin)) return cb(null, true);
    if (emDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
    return cb(null, false);
  },
}));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'no-store'); // respostas com dado pessoal não devem ficar em cache
  next();
});
app.use(express.json({ limit: '20kb' }));

app.get('/api/saude', (req, res) => res.json({ status: 'ok' }));

app.use('/api/unidades', unidadesRoutes);
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/sintomas', sintomasRoutes);
app.use('/api/fila', filaRoutes);

// Serve o front (Public/) no mesmo endereço da API: abra http://localhost:3000/ e pronto,
// sem Live Server e sem problema de CORS.
app.use(express.static(path.join(__dirname, '..', 'Public'), { index: 'index.html' }));

// 404 padrão para rotas de API não encontradas
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// tratador de erro genérico (rede de segurança)
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

// Na Vercel (serverless) o app é exportado e a plataforma cuida do servidor;
// em Render/local (node server.js) ele sobe normalmente com app.listen.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`API do AcolheSus rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
