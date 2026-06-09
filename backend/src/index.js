import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRouter from './routes/auth.js';
import leadsRouter from './routes/leads.js';
import reportsRouter from './routes/reports.js';
import inboxRouter from './routes/inbox.js';

import pool from './db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 8080;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173'
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log(`❌ CORS bloqueado para: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin'
    ]
  })
);

app.options('*', cors());

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  '/uploads',
  express.static(path.join(__dirname, '../../uploads'))
);

app.get('/', (_, res) => {
  res.status(200).json({
    ok: true,
    app: 'VittaHub API',
    version: '2.0.0',
    status: 'online'
  });
});

app.get('/api/health', (_, res) => {
  res.status(200).json({
    ok: true,
    app: 'VittaHub',
    version: '2.0.0',
    status: 'online',
    frontend: process.env.FRONTEND_URL || 'não configurado'
  });
});

app.use('/api/auth', authRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/inbox', inboxRouter);

app.use((err, req, res, next) => {
  console.error('❌ Erro:', err);

  res.status(err.status || 500).json({
    error: err.message || 'Erro interno'
  });
});

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