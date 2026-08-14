import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';

import authRouter    from './routes/auth.js';
import leadsRouter   from './routes/leads.js';
import reportsRouter from './routes/reports.js';
import inboxRouter, { rodarFollowups, configurarWebhooksZapi, alertarLeadsSemResposta, vigiaEntradaMensagens, rodarResgateIA } from './routes/inbox.js';
import extrasRouter, { gerarSolicitacoesDaAgenda } from './routes/extras.js';
import auditoriaRouter from './routes/auditoria.js';
import integracaoRouter from './routes/integracao.js';
import vittamedRouter from './routes/vittamed.js';
import terapiasRouter from './routes/terapias.js';
import publicoRouter from './routes/publico.js';
import lembretesRouter, { rodarLembretesAutomaticos } from './routes/lembretes.js';

import { createSocketServer, socketEmit } from './socketServer.js';
import { startPgListener, onNotify }       from './db/pgListener.js';
import pool from './db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app    = express();
const PORT   = process.env.PORT || 8080;
const ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── CORS: nunca lança erro 500  (Z-API chama o webhook de servidor para servidor) ──
app.use(cors({
  origin: (origin, cb) => {
    // cb(null, false) em vez de Error evita o 500 que bloqueava os webhooks da Z-API
    const allowed = [ORIGIN, 'http://localhost:3000', 'http://localhost:5173'];
    // Não confiar em QUALQUER *.railway.app (domínio público compartilhado) —
    // só o frontend da Vitta e os domínios oficiais vittalissaude.com.br.
    if (!origin || allowed.includes(origin)
      || /^https:\/\/vittahub-frontend[\w-]*\.up\.railway\.app$/.test(origin)
      || /\.vittalissaude\.com\.br$/.test(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Accept','Origin','Cache-Control'],
}));
app.options('*', cors());
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

app.get('/',           (_, res) => res.json({ ok:true, app:'VittaHub API v2.3', realtime:'socket.io' }));
app.get('/api/health', (_, res) => res.json({ ok:true, status:'online', realtime:'socket.io' }));

app.use('/api/auth',    authRouter);
app.use('/api/leads',   leadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/inbox',   inboxRouter);
app.use('/api/extras',  extrasRouter);
app.use('/api/auditoria', auditoriaRouter);
app.use('/api/integracao', integracaoRouter);
app.use('/api/extras/vittamed', vittamedRouter); // agenda do VittaMed lida daqui
app.use('/api/terapias', terapiasRouter);            // area de terapias + meta de planos
app.use('/api/publico', publicoRouter); // 🔗 agendamento pelo site (sem login)
app.use('/api/lembretes', lembretesRouter);

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

      // Follow-up automático: a cada 5 min reativa leads em silêncio (a própria
      // função respeita horário comercial, o liga/desliga e a cadência).
      setInterval(() => { rodarFollowups().catch(e => console.error('Follow-up tick:', e.message)); }, 5 * 60 * 1000);
      console.log('✅ Follow-up automático de leads agendado (5 min)');

      // Alerta de lead não respondido: a cada 5 min avisa a equipe (sino) sobre
      // clientes esperando resposta humana há tempo demais — pra ninguém esquecer.
      setInterval(() => { alertarLeadsSemResposta().catch(e => console.error('Alerta sem-resposta tick:', e.message)); }, 5 * 60 * 1000);
      console.log('✅ Alerta de leads sem resposta agendado (5 min)');

      // Piloto automático dos lembretes: checa a cada minuto se chegou a hora
      // configurada (fuso da clínica) e dispara amanhã/aniversários sozinho.
      setInterval(() => { rodarLembretesAutomaticos().catch(e => console.error('Lembretes auto tick:', e.message)); }, 60 * 1000);
      console.log('✅ Envio automático de lembretes agendado (checagem por minuto)');

      // 🤖 Resgate com IA dos leads sem venda: a cada 30 min checa quem está no
      // tempo da próxima tentativa. A cadência (3, 7 e 14 dias) mora na própria
      // consulta — o tick só precisa ser frequente o bastante pra não atrasar.
      setInterval(() => { rodarResgateIA().catch(e => console.error('Resgate IA tick:', e.message)); }, 30 * 60 * 1000);
      console.log('✅ Resgate de leads sem venda agendado (30 min · opt-in em Configurações)');

      // 💉 Solicitação de vacinas nasce da AGENDA: a cada 5 min varre os
      // próximos 30 dias e cria o pedido de todo atendimento de vacina que
      // ainda não tem — não importa por qual caminho ele foi marcado (esta
      // tela, o site, a Vitta na conversa, a carteira vacinal ou o VittaMed).
      setInterval(() => {
        gerarSolicitacoesDaAgenda({ dias: 30 })
          .then(o => o?.criadas && console.log(`💉 Solicitações geradas da agenda: ${o.criadas}`))
          .catch(e => console.error('Solicitações da agenda tick:', e.message));
      }, 5 * 60 * 1000);
      setTimeout(() => { gerarSolicitacoesDaAgenda({ dias: 30 }).catch(() => {}); }, 30000);
      console.log('✅ Solicitação de vacinas conforme a agenda (varredura de 5 min)');

      // Vigia da ENTRADA: se o WhatsApp parar de avisar o VittaHub em pleno
      // expediente, reaponta os webhooks sozinho e alerta o master (antes era
      // preciso alguém perceber que "o chat está quieto demais").
      setInterval(() => { vigiaEntradaMensagens().catch(e => console.error('Vigia entrada tick:', e.message)); }, 10 * 60 * 1000);
      console.log('✅ Vigia da entrada de mensagens agendado (10 min)');

      // Auto-cura dos webhooks da Z-API: reaponta TODOS (inclusive o "enviadas
      // por mim", que faz mensagens do CELULAR subirem pro CRM) para este backend.
      setTimeout(() => {
        configurarWebhooksZapi()
          .then(out => out?.results && console.log('🔗 Webhooks Z-API reconfigurados:', JSON.stringify(out.results)))
          .catch(e => console.error('Webhooks Z-API:', e.message));
      }, 8000);
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
