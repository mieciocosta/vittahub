import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext.jsx';

/* ─── Celebração global (gamificação) ────────────────────────────────────────
   Ouve o evento 'celebracao' do servidor e mostra confete + mensagem:
   · tipo 'setor'      → todo mundo do setor vê (ex: venda de Vacinas)
   · tipo 'individual' → só quem fez a ação vê
   · tipo 'marco'      → todos veem (25/50/75/100% da meta)
   Confete em CSS puro — sem bibliotecas, leve e rápido.                     */

const CORES = ['#00B8C0', '#0E8C96', '#C4973B', '#0fb07a', '#3b82f6', '#ec4899', '#f59e0b'];

function Confetes({ grande }) {
  const n = grande ? 90 : 50;
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 999, overflow: 'hidden' }}>
      {Array.from({ length: n }).map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.6;
        const dur = 2 + Math.random() * 1.6;
        const size = 6 + Math.random() * 7;
        const cor = CORES[i % CORES.length];
        const rot = Math.random() * 360;
        return (
          <span key={i} style={{
            position: 'absolute', top: -18, left: `${left}%`, width: size, height: size * (Math.random() > 0.5 ? 1 : 0.45),
            background: cor, borderRadius: Math.random() > 0.6 ? '50%' : 2,
            transform: `rotate(${rot}deg)`,
            animation: `vh-confete ${dur}s ${delay}s cubic-bezier(.2,.6,.4,1) forwards`,
          }} />
        );
      })}
      <style>{`@keyframes vh-confete {
        0%   { transform: translateY(0) rotate(0deg);    opacity: 1; }
        100% { transform: translateY(105vh) rotate(720deg); opacity: .65; }
      }`}</style>
    </div>
  );
}

export default function CelebracaoGlobal() {
  const { user } = useAuth();
  const [festa, setFesta] = useState(null); // { titulo, texto, tipo, pct }
  const timerRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const BASE = import.meta.env.VITE_API_URL || '';
    const tk = localStorage.getItem('vh_token') || '';
    const socket = io(BASE, { transports: ['websocket', 'polling'], auth: { token: tk } });

    socket.on('celebracao', (c) => {
      if (!c) return;
      // individual: só quem fez a ação comemora
      if (c.tipo === 'individual' && c.userId && c.userId !== user.id) return;
      // setor: equipe do setor + gestão
      if (c.tipo === 'setor' && user.role === 'atendente' && user.setor && user.setor !== c.setor) return;
      setFesta(c);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFesta(null), c.tipo === 'marco' ? 4200 : 2800);
    });

    return () => { socket.disconnect(); clearTimeout(timerRef.current); };
  }, [user]); // eslint-disable-line

  if (!festa) return null;
  const grande = festa.tipo === 'marco';

  return (
    <>
      <Confetes grande={grande} />
      <div style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
        animation: 'vh-pop .35s cubic-bezier(.3,1.6,.5,1)' }}>
        <div style={{ background: 'var(--card)', borderRadius: 18, padding: '16px 26px', textAlign: 'center',
          border: '2px solid var(--tq)', boxShadow: '0 12px 40px rgba(0,184,192,.35)', minWidth: 280, maxWidth: 420 }}>
          <div style={{ fontSize: 30, lineHeight: 1, marginBottom: 6 }}>🎊</div>
          <div style={{ fontWeight: 800, fontSize: grande ? 18 : 16, color: 'var(--txt)' }}>{festa.titulo}</div>
          <div style={{ fontSize: 13, color: 'var(--txt2)', marginTop: 3 }}>{festa.texto}</div>
          {festa.pct != null && (
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 8, borderRadius: 6, background: 'var(--tq4)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(festa.pct, 100)}%`, height: '100%', borderRadius: 6,
                  background: 'linear-gradient(90deg, var(--tq), var(--pet))', transition: 'width .8s' }} />
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tq2)', marginTop: 4 }}>{festa.pct}% da meta do mês</div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes vh-pop { 0% { transform: translateX(-50%) scale(.6); opacity: 0; } 100% { transform: translateX(-50%) scale(1); opacity: 1; } }`}</style>
    </>
  );
}
