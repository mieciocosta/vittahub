import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';

import authRouter   from './routes/auth.js';
import leadsRouter  from './routes/leads.js';
import reportsRouter from './routes/reports.js';
import inboxRouter  from './routes/inbox.js';
import { handleWsUpgrade, wsBroadcast } from './ws.js';
import { startPgListener, onNotify } from './db/pgListener.js';
import pool from './db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Accept','Origin'],
}));
app.options('*', cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

app.get('/',           (_, res) => res.json({ ok:true, app:'VittaHub API', version:'2.2.0', realtime:'ws+pgnotify' }));
app.get('/api/health', (_, res) => res.json({ ok:true, status:'online', realtime:'ws+pgnotify' }));

app.use('/api/auth',    authRouter);
app.use('/api/leads',   leadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/inbox',   inboxRouter);

app.use((err, req, res, next) => {
  console.error('❌', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

// ── HTTP Server com WebSocket ─────────────────────────────────────────────────
const httpServer = createServer(app);

httpServer.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://localhost').pathname === '/ws') {
    handleWsUpgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL conectado');

    if (process.env.DATABASE_URL) {
      const { default: runMigrate } = await import('./db/autoMigrate.js');
      await runMigrate();
      console.log('✅ Migrations executadas');

      // ── PG LISTEN/NOTIFY → wsBroadcast ─────────────────────────────────────
      // Quando uma mensagem nova é inserida no banco (via webhook ou send),
      // o pg_notify dispara este callback → wsBroadcast para TODOS os clientes WS.
      // Funciona mesmo após restart do Railway e com múltiplas instâncias.
      await startPgListener();

      onNotify(async ({ event, convId, messageId, conv }) => {
        if (event !== 'new_message' || !messageId) return;
        try {
          const { rows: [msg] } = await pool.query(
            'SELECT * FROM mensagens WHERE id = $1',
            [messageId]
          );
          if (msg) {
            wsBroadcast('new_message', { convId, message: msg, conv });
          }
        } catch (e) { console.error('PG notify handler:', e.message); }
      });

      console.log('✅ Real-time: WebSocket + PG NOTIFY configurados');
    }
  } catch (err) {
    console.error('❌ Startup:', err.message);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 VittaHub v2.2 na porta ${PORT}`);
    console.log(`🌐 Frontend: ${process.env.FRONTEND_URL}`);
    console.log(`🔌 WebSocket: ws://0.0.0.0:${PORT}/ws`);
  });
}

start();
