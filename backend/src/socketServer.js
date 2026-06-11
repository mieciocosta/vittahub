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

/** Emite evento para TODOS os clientes conectados */
export function socketEmit(event, data) {
  if (!io) return;
  io.emit(event, data);
}

/** Emite para clientes de uma conversa específica */
export function socketEmitConv(convId, event, data) {
  if (!io) return;
  io.to(`conv:${convId}`).emit(event, data);
  io.emit(event, data); // também emite globalmente para lista de conversas
}
