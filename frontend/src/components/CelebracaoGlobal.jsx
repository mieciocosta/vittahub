import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext.jsx';
import MascoteAplaudindo from './MascoteAplaudindo.jsx';

/* ─── Celebração global (gamificação) ────────────────────────────────────────
   Ouve o evento 'celebracao' do servidor e mostra confete + mensagem:
   · tipo 'setor'      → todo mundo do setor vê (ex: venda de Vacinas)
   · tipo 'individual' → só quem fez a ação vê
   · tipo 'marco'      → todos veem (25/50/75/100% da meta)
   Confete em CSS puro — sem bibliotecas, leve e rápido.                     */

const CORES = ['#00B8C0', '#0E8C96', '#C4973B', '#0fb07a', '#3b82f6', '#ec4899', '#f59e0b', '#a855f7', '#f43f5e'];

/* 🎊 NOVE CHUVAS DIFERENTES (ordem do master, 28/08: "quero tipos de confete
   diferentes, e um mais lindo que o outro"). Sorteadas a cada comemoração, sem
   repetir as três últimas. Tudo em CSS: nenhuma imagem, nenhuma biblioteca —
   a tela da equipe não fica pesada.

   fita       · o confete clássico, agora girando em três eixos
   coracoes   · chuva de corações, balançando como folha caindo
   estrelas   · estrelinhas que piscam enquanto caem
   fogos      · fogos de artifício estourando dos dois cantos de baixo
   bolhas     · bolhas de sabão subindo, com brilho
   petalas    · pétalas de flor descendo em zigue-zague
   serpentina · fitas compridas de festa junina
   moedas     · moedas douradas girando (é venda, afinal)
   baloes     · balões subindo com a cordinha                                */
const rnd = (a, b) => a + Math.random() * (b - a);

function Chuva({ tipo, grande }) {
  const n = grande ? 70 : 46;
  const base = { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 999, overflow: 'hidden' };

  if (tipo === 'fogos') {
    // Dois estouros radiais, um de cada canto de baixo
    const faisca = (cx, atraso) => Array.from({ length: 26 }).map((_, i) => {
      const ang = (i / 26) * Math.PI * 2;
      const dist = rnd(120, 260);
      return (
        <span key={`${cx}-${i}`} style={{
          position: 'absolute', left: cx, bottom: '14%', width: 7, height: 7, borderRadius: '50%',
          background: CORES[i % CORES.length], boxShadow: `0 0 10px ${CORES[i % CORES.length]}`,
          ['--dx']: `${Math.cos(ang) * dist}px`, ['--dy']: `${Math.sin(ang) * dist - 40}px`,
          animation: `vh-faisca 1.5s ${atraso}s cubic-bezier(.15,.7,.35,1) forwards`,
        }} />
      );
    });
    return (
      <div style={base}>
        {faisca('22%', 0)}{faisca('78%', .35)}{faisca('50%', .7)}
        <style>{`@keyframes vh-faisca {
          0%   { transform: translate(0,0) scale(1);   opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(.3); opacity: 0; } }`}</style>
      </div>
    );
  }

  if (tipo === 'bolhas' || tipo === 'baloes') {
    const balao = tipo === 'baloes';
    return (
      <div style={base}>
        {Array.from({ length: balao ? 22 : 34 }).map((_, i) => {
          const tam = balao ? rnd(26, 46) : rnd(14, 40);
          const cor = CORES[i % CORES.length];
          return (
            <span key={i} style={{
              position: 'absolute', bottom: -70, left: `${rnd(2, 96)}%`, width: tam, height: balao ? tam * 1.2 : tam,
              borderRadius: balao ? '50% 50% 46% 46%' : '50%',
              background: balao ? cor : `radial-gradient(circle at 32% 30%, rgba(255,255,255,.9), ${cor}55 42%, ${cor}22 70%)`,
              border: balao ? 'none' : `1.5px solid ${cor}66`,
              boxShadow: balao ? `0 6px 16px ${cor}55` : 'none',
              animation: `vh-sobe ${rnd(3, 5)}s ${rnd(0, .9)}s ease-in forwards`,
            }} />
          );
        })}
        <style>{`@keyframes vh-sobe {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          12%  { opacity: 1; }
          50%  { transform: translateY(-52vh) translateX(22px); }
          100% { transform: translateY(-108vh) translateX(-18px); opacity: .1; } }`}</style>
      </div>
    );
  }

  // As que CAEM (fita, corações, estrelas, pétalas, serpentina, moedas)
  const EMOJI = { coracoes: ['💖', '💗', '❤️', '💕', '🩵'], estrelas: ['✨', '⭐', '🌟', '💫'],
    petalas: ['🌸', '🌺', '🌼', '🍀'], moedas: ['🪙', '💰', '🏅'] };
  return (
    <div style={base}>
      {Array.from({ length: n }).map((_, i) => {
        const left = rnd(0, 100), atraso = rnd(0, .7), dur = rnd(2.2, 4);
        const cor = CORES[i % CORES.length];
        const comum = { position: 'absolute', top: -28, left: `${left}%`,
          animation: `${tipo === 'petalas' ? 'vh-folha' : 'vh-cai'} ${dur}s ${atraso}s cubic-bezier(.25,.6,.4,1) forwards` };
        if (EMOJI[tipo]) {
          const e = EMOJI[tipo][i % EMOJI[tipo].length];
          return <span key={i} style={{ ...comum, fontSize: rnd(14, 28),
            filter: tipo === 'estrelas' ? 'drop-shadow(0 0 6px rgba(255,255,255,.8))' : 'none' }}>{e}</span>;
        }
        if (tipo === 'serpentina') {
          return <span key={i} style={{ ...comum, width: rnd(4, 7), height: rnd(38, 80),
            background: `repeating-linear-gradient(45deg, ${cor}, ${cor} 7px, #fff 7px, #fff 12px)`,
            borderRadius: 4, opacity: .95 }} />;
        }
        // fita (clássico), com giro nos três eixos
        const w = rnd(7, 13);
        return <span key={i} style={{ ...comum, width: w, height: w * (Math.random() > .5 ? 1 : .45),
          background: cor, borderRadius: Math.random() > .6 ? '50%' : 2, boxShadow: `0 1px 4px ${cor}55` }} />;
      })}
      <style>{`
        @keyframes vh-cai   { 0% { transform: translateY(0) rotate(0) rotateY(0);   opacity: 1; }
                              100% { transform: translateY(106vh) rotate(680deg) rotateY(720deg); opacity: .7; } }
        @keyframes vh-folha { 0%   { transform: translateY(0) translateX(0) rotate(0); opacity: 1; }
                              33%  { transform: translateY(35vh) translateX(46px) rotate(140deg); }
                              66%  { transform: translateY(70vh) translateX(-40px) rotate(280deg); }
                              100% { transform: translateY(107vh) translateX(24px) rotate(420deg); opacity: .8; } }
      `}</style>
    </div>
  );
}

const TIPOS_CHUVA = ['fita', 'coracoes', 'estrelas', 'fogos', 'bolhas', 'petalas', 'serpentina', 'moedas', 'baloes'];
// Sorteia sem repetir as três últimas — cada venda tem a sua festa
const sortearChuva = () => {
  let recentes = [];
  try { recentes = JSON.parse(localStorage.getItem('vh_confete_recentes') || '[]'); } catch { /* ok */ }
  const livres = TIPOS_CHUVA.filter(t => !recentes.includes(t));
  const t = (livres.length ? livres : TIPOS_CHUVA)[Math.floor(Math.random() * (livres.length || TIPOS_CHUVA.length))];
  try { localStorage.setItem('vh_confete_recentes', JSON.stringify([t, ...recentes].slice(0, 3))); } catch { /* ok */ }
  return t;
};

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
      setFesta({ ...c, chuva: sortearChuva() });
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFesta(null), c.tipo === 'marco' ? 4200 : c.festa === 'palmas' ? 4600 : 2800);
    });

    return () => { socket.disconnect(); clearTimeout(timerRef.current); };
  }, [user]); // eslint-disable-line

  if (!festa) return null;
  const grande = festa.tipo === 'marco';

  return (
    <>
      <Chuva tipo={festa.chuva || 'fita'} grande={grande} />
      {/* 👏 A Vitinha aparece batendo palma quando é venda (ordem do master, 28/08) */}
      {festa.festa === 'palmas' && <MascoteAplaudindo nome={festa.quem} valor={festa.valorTxt} />}
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
