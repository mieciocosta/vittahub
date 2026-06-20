/**
 * Socket.io — real-time server
 * 
 * Substitui o WebSocket caseiro (ws.js) por Socket.io  que:
 * - Negocia automaticamente WebSocket → HTTP long-poll fallback
 * - Reconexão automática no cliente
 * - Funciona através de qualquer proxy (Railway, nginx, Cloudflare)
 * - Sem configuração de SSL/headers manual
 */
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { SECRET } from './middleware/auth.js';

let io = null;

// Função (injetada pelo inbox.js) que devolve o GRUPO de uma conversa:
// 'vacina' | 'nao-vacina' | null(indefinido). Usada pra entregar eventos de
// conversa só pra quem tem acesso àquele setor — sem vazar pra outros atendentes.
let convGroupFn = null;
export function setConvGroupFn(fn) { convGroupFn = fn; }
// Resolve o setor de um usuário pelo id (injetado pelo inbox.js) — cobre tokens
// antigos que não traziam o setor.
let userSetorFn = null;
export function setUserSetorFn(fn) { userSetorFn = fn; }

// true se o usuário do socket pode ver uma conversa daquele grupo
function socketPodeVer(user, grupo) {
  if (!user || user.role === 'master') return true;
  const setor = user.setor || (userSetorFn ? userSetorFn(user.id) : null);
  if (!setor) return true;
  if (!grupo) return true; // conversa indefinida (sem setor/responsável) → todos
  return setor === 'vacinas' ? grupo === 'vacina' : grupo === 'nao-vacina';
}

export function createSocketServer(httpServer, frontendUrl) {
  io = new Server(httpServer, {
    cors: {
      origin: [
        frontendUrl,
        'http://localhost:3000',
        'http://localhost:5173',
        /\.railway\.app$/,
        /\.vittalissaude\.com\.br$/,
      ].filter(Boolean),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Tenta WebSocket primeiro, cai para polling se bloqueado
    transports: ['websocket', 'polling'],
    // Ping a cada 25s para manter conexão viva no Railway
    pingInterval: 25000,
    pingTimeout: 10000,
  });

  // Middleware de autenticação JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
      || socket.handshake.query?.token;
    if (!token) return next(new Error('Token ausente'));
    try {
      socket.user = jwt.verify(token, SECRET);
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket.io ✅ cliente conectado: ${socket.user?.nome || socket.id}`);

    socket.on('disconnect', (reason) => {
      console.log(`Socket.io ❌ desconectado: ${reason}`);
    });

    // Clientes podem entrar em sala de conversa para updates específicos
    socket.on('join_conv', (convId) => {
      socket.join(`conv:${convId}`);
    });
    socket.on('leave_conv', (convId) => {
      socket.leave(`conv:${convId}`);
    });
  });

  console.log('✅ Socket.io server criado');
  return io;
}

/** Emite evento. Se o payload traz uma conversa (data.conv), entrega só pra quem
 *  tem acesso ao setor dela (regra de acesso por setor). Eventos sem conversa
 *  (status global, agenda, notificações…) seguem pra todos. */
export function socketEmit(event, data) {
  if (!io) return;
  try {
    if (data && data.conv && convGroupFn) {
      const grupo = convGroupFn(data.conv); // 'vacina' | 'nao-vacina' | null
      if (grupo) {
        for (const [, socket] of io.sockets.sockets) {
          if (socketPodeVer(socket.user, grupo)) socket.emit(event, data);
        }
        return;
      }
    }
  } catch { /* qualquer falha na classificação → cai pro broadcast normal */ }
  io.emit(event, data);
}

/** Emite para clientes de uma conversa específica */
export function socketEmitConv(convId, event, data) {
  if (!io) return;
  io.to(`conv:${convId}`).emit(event, data);
  io.emit(event, data); // também emite globalmente para lista de conversas
}
