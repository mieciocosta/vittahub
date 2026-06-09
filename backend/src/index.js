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

// ─── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED = [
  'http://localhost:3000',
  'http://localhost:4173',
  'https://vittahub-frontend-production.up.railway.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED.some(o => origin.startsWith(o))) cb(null, true);
    else { console.warn('CORS blocked:', origin); cb(new Error('Not allowed by CORS')); }
  },
  credentials: true,
}));

app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.get('/api/health', async (_, res) => {
  let dbOk = false;
  try { await pool.query('SELECT 1'); dbOk = true; } catch {}
  res.json({ ok: true, app: 'VittaHub', version: '2.0.0', db: dbOk ? 'postgres' : 'error' });
});

app.use('/api/auth',    authRouter);
app.use('/api/leads',   leadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/inbox',   inboxRouter);

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: err.message });
});

// ─── START ────────────────────────────────────────────────────────────────────
async function start() {
  // Test DB connection
  try {
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL connected');

    // Auto-migrate on startup in production
    if (process.env.DATABASE_URL) {
      const { default: runMigrate } = await import('./db/autoMigrate.js');
      await runMigrate();
    }
  } catch (err) {
    console.error('⚠️  DB not available, continuing with mock fallback:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n💎 VittaHub v2.0 → http://0.0.0.0:${PORT}`);
    console.log(`   DB: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'mock'}`);
  });
}

start();
