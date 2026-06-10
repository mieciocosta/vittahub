import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';

import authRouter    from './routes/auth.js';
import leadsRouter   from './routes/leads.js';
import reportsRouter from './routes/reports.js';
import inboxRouter   from './routes/inbox.js';

import { createSocketServer, socketEmit } from './socketServer.js';
import { startPgListener, onNotify }       from './db/pgListener.js';
import pool from './db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app    = express();
const PORT   = process.env.PORT || 8080;
const ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({
  origin: (origin, cb) => {
    const allowed = [ORIGIN, 'http://localhost:3000', 'http://localhost:5173'];
    if (!origin || allowed.includes(origin) || /\.railway\.app$/.test(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Accept','Origin','Cache-Control'],
}));
app.options('*', cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

app.get('/',           (_, res) => res.json({ ok:true, app:'VittaHub API v2.3', realtime:'socket.io' }));
app.get('/api/health', (_, res) => res.json({ ok:true, status:'online', realtime:'socket.io' }));

app.use('/api/auth',    authRouter);
app.use('/api/leads',   leadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/inbox',   inboxRouter);

app.use((err, req, res, next) => {
  console.error('❌', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

// ── HTTP + Socket.io ──────────────────────────────────────────────────────────
const httpServer = createServer(app);
createSocketServer(httpServer, ORIGIN);

// ── PG LISTEN/NOTIFY → Socket.io emit ────────────────────────────────────────
async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL conectado');

    if (process.env.DATABASE_URL) {
      const { default: runMigrate } = await import('./db/autoMigrate.js');
      await runMigrate();
      console.log('✅ Migrations executadas');

      await startPgListener();

      onNotify(async ({ event, convId, messageId, conv }) => {
        if (event !== 'new_message' || !messageId) return;
        try {
          const { rows: [msg] } = await pool.query(
            'SELECT * FROM mensagens WHERE id = $1', [messageId]
          );
          if (msg) {
            // Socket.io entrega a todos os clientes conectados
            socketEmit('new_message', { convId, message: msg, conv });
          }
        } catch (e) { console.error('PG notify → Socket.io error:', e.message); }
      });

      console.log('✅ Real-time: Socket.io + PG NOTIFY configurados');
    }
  } catch (err) {
    console.error('❌ Startup:', err.message);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 VittaHub v2.3 na porta ${PORT}`);
    console.log(`🔌 Socket.io ativo`);
    console.log(`🌐 Frontend: ${ORIGIN}`);
  });
}

start();
