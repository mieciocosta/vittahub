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

<<<<<<< HEAD
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

=======
app.use(cors({ origin: '*', credentials: false, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.options('*', cors({ origin: '*' }));
>>>>>>> 0cb57dae0b66c12fdffad00f93b5838c314c11ef
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

app.get('/api/health', async (_, res) => {
<<<<<<< HEAD
  let db = false;
  try { await pool.query('SELECT 1'); db = true; } catch {}
  res.json({ ok: true, app: 'VittaHub', version: '2.0.0', db });
=======
  let dbOk = false;
  try { await pool.query('SELECT 1'); dbOk = true; } catch {}
  res.json({ ok: true, app: 'VittaHub', version: '2.0.0', db: dbOk ? 'ok' : 'error' });
>>>>>>> 0cb57dae0b66c12fdffad00f93b5838c314c11ef
});

app.use('/api/auth',    authRouter);
app.use('/api/leads',   leadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/inbox',   inboxRouter);

app.use((err, req, res, next) => {
<<<<<<< HEAD
  console.error(err.message);
=======
>>>>>>> 0cb57dae0b66c12fdffad00f93b5838c314c11ef
  res.status(err.status || 500).json({ error: err.message });
});

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL connected');
    if (process.env.DATABASE_URL) {
<<<<<<< HEAD
      const { default: migrate } = await import('./db/autoMigrate.js');
      await migrate();
    }
  } catch (e) {
    console.error('⚠️  DB:', e.message);
=======
      const { default: runMigrate } = await import('./db/autoMigrate.js');
      await runMigrate();
    }
  } catch (err) {
    console.error('⚠️  DB error:', err.message);
>>>>>>> 0cb57dae0b66c12fdffad00f93b5838c314c11ef
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`💎 VittaHub → http://0.0.0.0:${PORT}`);
  });
}

<<<<<<< HEAD
start();
=======
start();
>>>>>>> 0cb57dae0b66c12fdffad00f93b5838c314c11ef
