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

// ─── CORS — aceita tudo em produção Railway ───────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    // Sem origin (Postman, curl, mobile) = ok
    if (!origin) return cb(null, true);
    // Railway domains = ok
    if (origin.includes('.railway.app') || origin.includes('.up.railway.app')) return cb(null, true);
    // Localhost = ok
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return cb(null, true);
    // FRONTEND_URL personalizado = ok
    if (process.env.FRONTEND_URL && origin.startsWith(process.env.FRONTEND_URL)) return cb(null, true);
    // Domínio customizado = ok
    if (process.env.CUSTOM_DOMAIN && origin.includes(process.env.CUSTOM_DOMAIN)) return cb(null, true);
    cb(null, true); // Em caso de dúvida, deixa passar (pode restringir depois)
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// Responde preflight OPTIONS imediatamente
app.options('*', cors());

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
  console.error('Error:', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

// ─── START ────────────────────────────────────────────────────────────────────
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
    console.log(`\n💎 VittaHub v2.0 → http://0.0.0.0:${PORT}`);
    console.log(`   DB: ${process.env.DATABASE_URL ? 'PostgreSQL ✅' : 'sem banco'}`);
  });
}

start();
