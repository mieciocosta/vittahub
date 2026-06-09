import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import authRouter from './routes/auth.js';
import leadsRouter from './routes/leads.js';
import reportsRouter from './routes/reports.js';
import inboxRouter from './routes/inbox.js';

import pool from './db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

/**
 * CORS
 */
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://vittahub-frontend-production.up.railway.app',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type,Authorization,Accept'
  );

  res.setHeader(
    'Access-Control-Allow-Credentials',
    'true'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

/**
 * Middlewares
 */
app.use(express.json({ limit: '25mb' }));

app.use(
  '/uploads',
  express.static(path.join(__dirname, '../../uploads'))
);

/**
 * Health Check
 */
app.get('/api/health', async (_, res) => {
  let db = false;

  try {
    await pool.query('SELECT 1');
    db = true;
  } catch (error) {
    console.error(error);
  }

  res.json({
    ok: true,
    app: 'VittaHub',
    version: '2.0.0',
    db: db ? 'ok' : 'error'
  });
});

/**
 * Rotas
 */
app.use('/api/auth', authRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/inbox', inboxRouter);

/**
 * Tratamento global de erros
 */
app.use((err, req, res, next) => {
  console.error(err);

  return res.status(err.status || 500).json({
    error: err.message || 'Erro interno do servidor'
  });
});

/**
 * Inicialização
 */
async function start() {
  try {
    await pool.query('SELECT 1');

    console.log('✅ PostgreSQL conectado');

    if (process.env.DATABASE_URL) {
      const { default: runMigrate } = await import('./db/autoMigrate.js');

      await runMigrate();

      console.log('✅ Migrations executadas');
    }
  } catch (err) {
    console.error('❌ Erro ao conectar no banco:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 VittaHub rodando na porta ${PORT}`);
    console.log(`🌐 Frontend permitido: ${process.env.FRONTEND_URL}`);
  });
}

start();