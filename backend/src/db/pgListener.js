/**
 * PostgreSQL LISTEN/NOTIFY — real-time confiável
 * 
 * Por que não usar in-memory (Map/waiters/sseClients):
 *   - Railway reinicia o container ao fazer deploy → Map é zerado
 *   - Se houver 2 réplicas, cada uma tem seu Map separado
 *   - PG NOTIFY funciona entre instâncias, após restart, sem Redis adicional
 * 
 * Fluxo:
 *   webhook → pg_notify('vittahub', payload)
 *   → este listener recebe → callback → wsBroadcast → frontend WebSocket
 */
import pg from 'pg';
const { Client } = pg;

let client = null;
const callbacks = [];

export function onNotify(cb) {
  callbacks.push(cb);
}

async function connect() {
  if (!process.env.DATABASE_URL) return;
  try {
    client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query('LISTEN vittahub');

    client.on('notification', (msg) => {
      try {
        const data = JSON.parse(msg.payload);
        callbacks.forEach(cb => { try { cb(data); } catch {} });
      } catch {}
    });

    client.on('error', (err) => {
      console.error('PG Listener erro:', err.message);
      client = null;
      setTimeout(connect, 3000);
    });

    client.on('end', () => {
      console.warn('PG Listener desconectado, reconectando...');
      client = null;
      setTimeout(connect, 3000);
    });

    console.log('✅ Postgres LISTEN/NOTIFY ativo (canal: vittahub)');
  } catch (err) {
    console.error('PG Listener connect error:', err.message);
    setTimeout(connect, 5000);
  }
}

export async function startPgListener() {
  await connect();
}
