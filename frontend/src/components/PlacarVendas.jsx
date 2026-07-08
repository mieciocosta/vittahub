import React, { useEffect, useState, useRef } from 'react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* PLACAR DE VENDAS — faixa chamativa no topo pra equipe RESPIRAR VENDAS. 🔥
   Mostra vendas do dia + progresso da meta do mês, atualizando ao vivo a cada
   venda registrada. Some no Login (sem user). */

export default function PlacarVendas() {
  const api = useApi();
  const { user } = useAuth();
  const [meta, setMeta] = useState(null);
  const [hoje, setHoje] = useState(null);
  const [pulse, setPulse] = useState(false);
  const sockRef = useRef(null);

  const carregar = () => {
    api.get('/extras/meta-setor').then(setMeta).catch(() => {});
    api.get('/extras/vendas/hoje').then(setHoje).catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    carregar();
    const t = setInterval(carregar, 90000);
    import('socket.io-client').then(({ io }) => {
      const BASE = import.meta.env.VITE_API_URL || '';
      const s = io(BASE, { transports: ['websocket', 'polling'], auth: { token: localStorage.getItem('vh_token') || '' } });
      s.on('venda_registrada', () => { carregar(); setPulse(true); setTimeout(() => setPulse(false), 1500); });
      sockRef.current = s;
    }).catch(() => {});
    return () => { clearInterval(t); try { sockRef.current?.disconnect(); } catch {} };
  }, [user]); // eslint-disable-line

  if (!user || !meta || !meta.metaGlobal) return null;
  const gestao = ['master', 'supervisor'].includes(user.role);
  const nomeSetor = meta.setor && meta.setor !== 'geral' ? meta.setor[0].toUpperCase() + meta.setor.slice(1) : 'Geral';
  const pct = Math.min(meta.pctGlobal ?? 0, 100);
  const batida = (meta.faltaGlobal ?? 0) <= 0;
  const nHoje = hoje?.n ?? 0;

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 90, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      padding: '8px 18px', color: '#fff', overflow: 'hidden',
      background: batida ? 'linear-gradient(90deg,#065f46,#059669,#10b981)' : 'linear-gradient(90deg,#0b1023,#3b0764,#7c3aed)',
      boxShadow: '0 3px 14px rgba(0,0,0,.22)', borderBottom: '1px solid rgba(212,175,55,.35)' }}>
      <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.14),transparent)', transform: 'translateX(-100%)', animation: 'vh-placar-shine 4.5s ease-in-out infinite', pointerEvents: 'none' }} />

      {/* Vendas do dia */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, transition: 'transform .3s', transform: pulse ? 'scale(1.08)' : 'scale(1)' }}>
        <span style={{ fontSize: 18 }}>🔥</span>
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: 'rgba(255,255,255,.7)' }}>Vendas hoje</div>
          <div style={{ fontSize: 15, fontWeight: 900 }}>{nHoje} {nHoje === 1 ? 'fechada' : 'fechadas'}{gestao && hoje?.total != null ? ` · ${fmt.brl(hoje.total)}` : ''}</div>
        </div>
      </div>

      <div style={{ width: 1, height: 26, background: 'rgba(255,255,255,.25)' }} />

      {/* Progresso da meta do mês — separado por setor (multi-setor mostra cada um) */}
      <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {(meta.porSetor && meta.porSetor.length ? meta.porSetor : [meta]).map((s) => {
          const p = Math.min(s.pctGlobal ?? 0, 100);
          const ok = (s.faltaGlobal ?? 0) <= 0;
          const nome = s.setor && s.setor !== 'geral' ? s.setor[0].toUpperCase() + s.setor.slice(1) : 'Geral';
          return (
            <div key={s.setor} style={{ flex: 1, minWidth: 170, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{ok ? '🏆' : '🎯'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.5, marginBottom: 3 }}>
                  <span style={{ fontWeight: 800 }}>Meta {nome}: <b style={{ color: '#fde68a' }}>{fmt.brl(s.confirmado || 0)}</b> de {fmt.brl(s.metaGlobal)}</span>
                  <span style={{ fontWeight: 900, color: '#fde68a' }}>{p}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 5, background: 'rgba(255,255,255,.2)', overflow: 'hidden' }}>
                  <div style={{ width: `${p}%`, height: '100%', borderRadius: 5, background: ok ? '#fff' : 'linear-gradient(90deg,#f59e0b,#fbbf24,#fde68a)', boxShadow: '0 0 8px rgba(251,191,36,.6)', transition: 'width .5s' }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grito de guerra */}
      <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
        {batida ? '🎉 Meta batida! Bora além!' : nHoje > 0 ? 'Bora fechar mais uma! 💪' : 'Primeira venda do dia é sua! 🚀'}
      </div>

      <style>{`@keyframes vh-placar-shine { 0% { transform: translateX(-100%);} 55%,100% { transform: translateX(200%);} }`}</style>
    </div>
  );
}
