import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../context/AuthContext.jsx';

/* ⌘K / Ctrl+K — busca rápida global. De qualquer tela: digita o nome do
   cliente e vai direto pra conversa; ou digita uma página ("caixa", "agenda")
   e pula pra ela. Economiza dezenas de cliques por dia da equipe. */

const PAGINAS = [
  ['Resumo', '/', '🏠'], ['Chat', '/inbox', '💬'], ['Agenda', '/agenda', '📅'],
  ['Follow-up', '/retornos', '🔔'], ['Recuperação', '/recuperacao', '🔥'],
  ['Clientes', '/leads', '👥'], ['Lembretes', '/lembretes', '⏰'], ['Caixa', '/caixa', '💰'],
  ['Metas', '/metas', '🎯'], ['Relatórios', '/relatorios', '📊'], ['Organização', '/funil', '🗂️'],
  ['Banco de Dados', '/banco-dados', '🗄️'], ['Chat da Equipe', '/equipe', '👨‍👩‍👧'],
  ['Meu Devocional', '/amigo', '📖'], ['Figurinhas', '/figurinhas', '💟'],
  ['Biblioteca', '/biblioteca', '🖼️'], ['Indicações', '/indicacoes', '🎁'],
  ['Cursos', '/cursos', '🎓'], ['Quiz de Vendas', '/quiz', '🎮'], ['Configurações', '/configuracoes', '⚙️'],
];

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function BuscaRapida() {
  const api = useApi();
  const nav = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState('');
  const [convs, setConvs] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  // Atalho global: Ctrl+K (Windows) ou ⌘K (Mac); Esc fecha
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setAberto(a => !a); setQ(''); setConvs([]); setIdx(0);
      } else if (e.key === 'Escape') setAberto(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (aberto) setTimeout(() => inputRef.current?.focus(), 40); }, [aberto]);

  // Busca de clientes (2+ letras), com pequeno atraso pra não pesar o servidor
  useEffect(() => {
    if (!aberto || q.trim().length < 2) { setConvs([]); return; }
    setBuscando(true);
    const t = setTimeout(() => {
      api.get(`/inbox/conversations/buscar?q=${encodeURIComponent(q.trim())}`)
        .then(d => setConvs(Array.isArray(d) ? d.slice(0, 6) : []))
        .catch(() => setConvs([]))
        .finally(() => setBuscando(false));
    }, 260);
    return () => { clearTimeout(t); setBuscando(false); };
  }, [q, aberto]); // eslint-disable-line

  if (!aberto) return null;

  const termo = semAcento(q);
  const pgs = termo ? PAGINAS.filter(p => semAcento(p[0]).includes(termo)).slice(0, 5) : PAGINAS.slice(0, 6);
  const itens = [
    ...convs.map(c => ({ tipo: 'conversa', titulo: c.contact_name || c.phone || 'Cliente', sub: 'Abrir conversa', emoji: '💬', ir: () => nav(`/inbox?conv=${c.id}`) })),
    ...pgs.map(p => ({ tipo: 'pagina', titulo: p[0], sub: 'Ir para a página', emoji: p[2], ir: () => nav(p[1]) })),
  ];

  const escolher = (i) => { const it = itens[i]; if (!it) return; setAberto(false); it.ir(); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, itens.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(idx); }
  };

  return (
    <div onClick={e => e.target === e.currentTarget && setAberto(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(3,43,48,.5)', zIndex: 9998, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', padding: '12vh 16px 16px' }}>
      <div style={{ width: '100%', maxWidth: 540, background: 'var(--card,#fff)', borderRadius: 18, boxShadow: '0 24px 60px rgba(3,43,48,.4)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 17 }}>🔎</span>
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKeyDown}
            placeholder="Buscar cliente ou página…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15.5, background: 'transparent', color: 'var(--txt)', fontFamily: 'inherit' }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px' }}>ESC</span>
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          {buscando && <div style={{ padding: '12px 18px', fontSize: 12.5, color: 'var(--muted)' }}>Procurando…</div>}
          {itens.length === 0 && !buscando && (
            <div style={{ padding: '22px 18px', fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
              Nada encontrado. Digite o nome de um cliente ou de uma página.
            </div>
          )}
          {itens.map((it, i) => (
            <div key={`${it.tipo}-${i}`} onClick={() => escolher(i)} onMouseEnter={() => setIdx(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 18px', cursor: 'pointer',
                background: i === idx ? 'var(--tq4,#e8f7f8)' : 'transparent' }}>
              <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{it.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.titulo}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{it.sub}</div>
              </div>
              {i === idx && <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--tq2)' }}>Enter ↵</span>}
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 18px', borderTop: '1px solid var(--border)', fontSize: 10.5, color: 'var(--muted)', display: 'flex', gap: 14 }}>
          <span>↑↓ navegar</span><span>↵ abrir</span><span>Ctrl+K a qualquer momento</span>
        </div>
      </div>
    </div>
  );
}
