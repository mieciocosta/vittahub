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

// ─── CORS manual — sem depender da lib cors ────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

app.get('/api/health', async (_, res) => {
  let db = false;
  try { await pool.query('SELECT 1'); db = true; } catch {}
  res.json({ ok: true, app: 'VittaHub', version: '2.0.0', db });
});

app.use('/api/auth',    authRouter);
app.use('/api/leads',   leadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/inbox',   inboxRouter);

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.message });
});

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL connected');
    if (process.env.DATABASE_URL) {
      const { default: migrate } = await import('./db/autoMigrate.js');
      await migrate();
    }
  } catch (e) {
    console.error('⚠️  DB:', e.message);
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`💎 VittaHub → http://0.0.0.0:${PORT}`);
  });
}

start();
