/**
 * VittaHub — WebSocket real-time module
 * 
 * Módulo separado para evitar dependência circular:
 *   index.js → ws.js (handleUpgrade)
 *   inbox.js → ws.js (wsBroadcast)
 * 
 * Funciona no Railway: usa noServer + handleUpgrade manual
 */
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { SECRET } from './middleware/auth.js';

export const wss = new WebSocketServer({ noServer: true });

/** Trata o handshake HTTP→WebSocket chamado pelo index.js */
export function handleWsUpgrade(req, socket, head) {
  wss.handleUpgrade(req, socket, head, (ws) => {
    // Auth via query param (browser WebSocket não suporta headers customizados)
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) { ws.close(4001, 'Token ausente'); return; }
    try {
      ws.user = jwt.verify(token, SECRET);
    } catch {
      ws.close(4001, 'Token inválido'); return;
    }

    wss.emit('connection', ws, req);

    // Ping a cada 20s para manter a conexão viva no Railway
    const keepAlive = setInterval(() => {
      if (ws.readyState === 1 /* OPEN */) ws.ping();
      else clearInterval(keepAlive);
    }, 20000);

    ws.on('pong',  () => {});    // resposta ao ping — conexão viva
    ws.on('close', () => clearInterval(keepAlive));
    ws.on('error', () => { clearInterval(keepAlive); try { ws.close(); } catch {} });
  });
}

/** Envia evento para TODOS os clientes WebSocket conectados */
export function wsBroadcast(type, data) {
  const payload = JSON.stringify({ type, data, ts: Date.now() });
  wss.clients.forEach(ws => {
    if (ws.readyState === 1 /* OPEN */) {
      try { ws.send(payload); } catch {}
    }
  });
}
