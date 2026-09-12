// =========================================================
// ACOLHESUS / VITALSYNC — API
// Back-end real para o front-end de Public/, substituindo o
// VitalSyncStore (localStorage) por chamadas HTTP a um banco
// PostgreSQL de verdade (Database/criacaoTabela.sql).
// =========================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const unidadesRoutes = require('./src/routes/unidades.routes');
const pacientesRoutes = require('./src/routes/pacientes.routes');
const otpRoutes = require('./src/routes/otp.routes');
const authRoutes = require('./src/routes/auth.routes');
const sintomasRoutes = require('./src/routes/sintomas.routes');
const filaRoutes = require('./src/routes/fila.routes');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/saude', (req, res) => res.json({ status: 'ok' }));

app.use('/api/unidades', unidadesRoutes);
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/sintomas', sintomasRoutes);
app.use('/api/fila', filaRoutes);

// 404 padrão para rotas de API não encontradas
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// tratador de erro genérico (rede de segurança)
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API do AcolheSus rodando em http://localhost:${PORT}`);
});
