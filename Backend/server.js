// =========================================================
// ACOLHESUS / VITALSYNC — API
// Back-end real para o front-end de Public/, substituindo o
// VitalSyncStore (localStorage) por chamadas HTTP a um banco
// PostgreSQL de verdade (Database/criacaoTabela.sql).
//
// Roda de dois jeitos:
//   - local:  `npm start` (esta pasta) -> sobe o servidor e serve Public/
//   - Vercel: api/index.js importa o `app` exportado aqui (função serverless)
// =========================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { query } = require('./src/db');

const unidadesRoutes = require('./src/routes/unidades.routes');
const pacientesRoutes = require('./src/routes/pacientes.routes');
const otpRoutes = require('./src/routes/otp.routes');
const authRoutes = require('./src/routes/auth.routes');
const sintomasRoutes = require('./src/routes/sintomas.routes');
const filaRoutes = require('./src/routes/fila.routes');

const rodandoDireto = require.main === module;
const emProducao = process.env.NODE_ENV === 'production';
const jwtOk = !!process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16;

// Rodando local sem JWT_SECRET: para na hora, com mensagem clara. Em serverless NÃO
// podemos dar process.exit (a função cairia com 500 genérico): respondemos com o motivo.
if (!jwtOk && rodandoDireto) {
  console.error('JWT_SECRET ausente ou muito curto (mínimo 16 caracteres). Configure o .env.');
  process.exit(1);
}

const app = express();

// Atrás do proxy da Vercel, req.ip precisa vir do X-Forwarded-For (limitador de requisições).
if (process.env.VERCEL || process.env.TRUST_PROXY) app.set('trust proxy', 1);

// CORS: FRONTEND_ORIGIN aceita várias origens separadas por vírgula. Em desenvolvimento,
// qualquer localhost/127.0.0.1 (qualquer porta) também é aceito, para não travar o front
// aberto por Live Server, outra porta, etc. Sem FRONTEND_ORIGIN, libera tudo (como antes).
// Na Vercel o front e a API ficam no mesmo domínio, então CORS nem chega a ser necessário.
const origensPermitidas = (process.env.FRONTEND_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
const emDev = !emProducao;
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

// Saúde: /api/saude -> servidor no ar. /api/saude?banco=1 -> também testa o PostgreSQL
// (útil para diagnosticar o deploy; devolve só o código do erro, nunca detalhes).
app.get('/api/saude', async (req, res) => {
  const resp = { status: 'ok', jwt: jwtOk ? 'ok' : 'JWT_SECRET ausente ou curto', banco_configurado: !!process.env.DATABASE_URL };
  if (req.query.banco) {
    try {
      await query('SELECT 1');
      resp.banco = 'ok';
    } catch (err) {
      resp.banco = 'erro';
      resp.codigo = err.code || (err.errors && err.errors[0] && err.errors[0].code) || 'desconhecido';
    }
  }
  res.json(resp);
});

// Sem JWT_SECRET nada de autenticação funciona: responde com o motivo em vez de quebrar.
if (!jwtOk) {
  app.use('/api', (req, res) => res.status(500).json({
    erro: 'Servidor mal configurado: defina JWT_SECRET (mínimo 16 caracteres) nas variáveis de ambiente.',
  }));
}

// ---------------------------------------------------------
// Admin inicial automático.
//  - Local (fora de produção): cria admin@vitalsync.local / admin1234 se não existir.
//  - Produção (Vercel): só cria se ADMIN_EMAIL e ADMIN_SENHA estiverem definidos nas
//    variáveis de ambiente (nunca com senha padrão pública). Depois de criado, pode
//    remover essas duas variáveis.
// Roda uma vez por instância; se falhar (ex.: banco ainda sem tabelas), tenta de novo
// no máximo a cada 60 s.
// ---------------------------------------------------------
let adminResolvido = false;
let adminTentativa = 0;
async function garantirAdminPadrao() {
  if (adminResolvido || Date.now() - adminTentativa < 60000) return;
  adminTentativa = Date.now();

  const emailEnv = process.env.ADMIN_EMAIL;
  const senhaEnv = process.env.ADMIN_SENHA;
  if (emProducao && !(emailEnv && senhaEnv)) { adminResolvido = true; return; }

  const email = (emailEnv || 'admin@vitalsync.local').trim().toLowerCase();
  const senha = senhaEnv || 'admin1234';
  try {
    const existe = await query('SELECT 1 FROM profissionais WHERE email = $1', [email]);
    if (existe.rows.length) { adminResolvido = true; return; }

    const unidade = await query('SELECT id FROM unidades_saude ORDER BY id LIMIT 1');
    if (!unidade.rows.length) {
      console.warn('Admin inicial não criado: nenhuma unidade cadastrada (rode o insertScript.sql / npm run db:seed).');
      return;
    }
    const hash = await bcrypt.hash(senha, 10);
    await query(
      `INSERT INTO profissionais (nome, email, senha_hash, cargo, unidade_id, status)
       VALUES ('Administrador', $1, $2, 'admin', $3, 'ativo')
       ON CONFLICT (email) DO NOTHING`,
      [email, hash, unidade.rows[0].id]
    );
    adminResolvido = true;
    console.log(`Admin inicial criado: ${email}`);
  } catch (err) {
    console.warn('Não foi possível criar o admin inicial:', err.message || err.code || err);
  }
}
if (jwtOk) {
  app.use('/api', async (req, res, next) => { await garantirAdminPadrao(); next(); });
}

app.use('/api/unidades', unidadesRoutes);
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/sintomas', sintomasRoutes);
app.use('/api/fila', filaRoutes);

// Serve o front (Public/) no mesmo endereço da API: abra http://localhost:3000/ e pronto,
// sem Live Server e sem problema de CORS. (Na Vercel, quem serve o Public/ é a própria
// plataforma — veja vercel.json.)
app.use(express.static(path.join(__dirname, '..', 'Public'), { index: 'index.html' }));

// 404 padrão para rotas de API não encontradas
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// tratador de erro genérico (rede de segurança)
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

if (rodandoDireto) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`API do AcolheSus rodando em http://localhost:${PORT}`);
    garantirAdminPadrao();
  });
}

module.exports = app;
