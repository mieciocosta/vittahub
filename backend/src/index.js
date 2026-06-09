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
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*', credentials: false, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.options('*', cors({ origin: '*' }));
app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

app.get('/api/health', async (_, res) => {
  let dbOk = false;
  try { await pool.query('SELECT 1'); dbOk = true; } catch {}
  res.json({ ok: true, app: 'VittaHub', version: '2.0.0', db: dbOk ? 'ok' : 'error' });
});

app.use('/api/auth',    authRouter);
app.use('/api/leads',   leadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/inbox',   inboxRouter);

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message });
});

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL connected');
    if (process.env.DATABASE_URL) {
      const { default: runMigrate } = await import('./db/autoMigrate.js');
      await runMigrate();
    }
  } catch (err) {
    console.error('⚠️  DB error:', err.message);
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`💎 VittaHub → http://0.0.0.0:${PORT}`);
  });
}

start();