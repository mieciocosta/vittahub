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

// CORS — libera tudo, sem restrições
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// Health check
app.get('/api/health', async (_, res) => {
  let db = false;
  try { await pool.query('SELECT 1'); db = true; } catch {}
  res.json({ ok: true, app: 'VittaHub', version: '2.0.0', db: db ? 'ok' : 'error' });
});

app.use('/api/auth',    authRouter);
app.use('/api/leads',   leadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/inbox',   inboxRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

// Start
async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL conectado');
    if (process.env.DATABASE_URL) {
      const { default: runMigrate } = await import('./db/autoMigrate.js');
      await runMigrate();
    }
  } catch (err) {
    console.error('⚠️  DB indisponível:', err.message);
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n💎 VittaHub rodando na porta ${PORT}`);
  });
}

start();
