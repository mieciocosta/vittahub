import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Send, Paperclip, Mic, MicOff, Sparkles, Search, RefreshCw, X,
  UserPlus, Hash, Bot, FileText, Volume2, File, Tag, Filter, ChevronDown, ArrowUpDown
} from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt, openWA } from '../hooks/utils.js';
import PropostaModal from '../components/PropostaModal.jsx';

/* ── Channel icons ───────────────────────────────────────────────────────────── */
const WA = ({s=13})=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.556 4.118 1.523 5.847L0 24l6.302-1.496A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.807 9.807 0 01-5.032-1.388l-.361-.214-3.741.888.948-3.651-.235-.374A9.786 9.786 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>;
const IG = ({s=13})=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>;

const ITEM_HEIGHT = 72; // px per conversation row — used for virtual scroll

/* ── VirtualList: renders only visible rows ──────────────────────────────────── */
function VirtualList({ items, selectedId, onSelect, containerHeight, loadMore, hasMore, loadingMore }) {
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);

  const visibleStart = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 3);
  const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT) + 6;
  const visibleEnd   = Math.min(items.length, visibleStart + visibleCount);
  const visibleItems = items.slice(visibleStart, visibleEnd);
  const totalHeight  = items.length * ITEM_HEIGHT;

  const onScroll = useCallback(e => {
    const st = e.currentTarget.scrollTop;
    setScrollTop(st);
    // Infinite scroll trigger
    const near = st + containerHeight >= totalHeight - ITEM_HEIGHT * 3;
    if (near && hasMore && !loadingMore) loadMore();
  }, [containerHeight, totalHeight, hasMore, loadingMore, loadMore]);

  return (
    <div ref={scrollRef} onScroll={onScroll}
      style={{ flex: 1, overflowY: 'auto', position: 'relative', height: containerHeight }}>
      {/* Spacer fills total height so scrollbar is correct */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Only render visible slice */}
        <div style={{ position: 'absolute', top: visibleStart * ITEM_HEIGHT, left: 0, right: 0 }}>
          {visibleItems.map((c, i) => (
            <ConvoRow key={c.id} conv={c} selected={selectedId === c.id} onSelect={onSelect} idx={visibleStart + i} />
          ))}
        </div>
      </div>
      {loadingMore && (
        <div style={{ textAlign: 'center', padding: 12 }}>
          <span className="spin" style={{ width: 16, height: 16 }} />
        </div>
      )}
      {!hasMore && items.length > 30 && (
        <div style={{ textAlign: 'center', padding: 10, fontSize: 11.5, color: 'var(--light)' }}>
          {items.length} conversas carregadas
        </div>
      )}
    </div>
  );
}

/* ── Single conversation row ─────────────────────────────────────────────────── */
const ConvoRow = React.memo(function ConvoRow({ conv, selected, onSelect }) {
  return (
    <div onClick={() => onSelect(conv)}
      style={{
        display: 'flex', gap: 10, padding: '10px 13px', cursor: 'pointer',
        height: ITEM_HEIGHT, alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        borderLeft: `3px solid ${selected ? 'var(--tq)' : 'transparent'}`,
        background: selected ? 'var(--tq4)' : 'transparent',
        transition: 'background .1s',
        willChange: 'transform', // GPU acceleration hint
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}>
      {/* Avatar */}
      <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        background: conv.channel === 'whatsapp' ? '#d4f7e0' : '#fce4ef',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 13, color: conv.channel === 'whatsapp' ? '#0a7a40' : '#9a1050',
        position: 'relative'
      }}>
        {(conv.contact_name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
        <span style={{ position: 'absolute', bottom: -1, right: -1, width: 14, height: 14, borderRadius: '50%',
          background: conv.channel === 'whatsapp' ? 'var(--wa)' : 'var(--ig)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff'
        }}>{conv.channel === 'whatsapp' ? <WA s={6} /> : <IG s={6} />}</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {conv.contact_name}
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--light)', flexShrink: 0, marginLeft: 4 }}>
            {fmt.relTime(conv.last_message_at)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {conv.last_message || '…'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 4 }}>
            {conv.bot_ativo && <span style={{ fontSize: 9, color: 'var(--ok)', fontWeight: 700 }}>BOT</span>}
            {conv.lead_id   && <span style={{ fontSize: 9, color: 'var(--tq)', fontWeight: 700 }}>LEAD</span>}
            {conv.unread > 0 && (
              <span style={{ background: 'var(--tq)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10.5, fontWeight: 800, boxShadow: '0 2px 6px rgba(0,184,192,.3)' }}>
                {conv.unread > 99 ? '99+' : conv.unread}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

/* ── Search + filter bar ─────────────────────────────────────────────────────── */
function SearchBar({ value, onChange, filter, setFilter, showFilters, setShowFilters, totalUnread, unreadOnly, setUnreadOnly }) {
  return (
    <div style={{ padding: '12px 13px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      {/* Channel tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 9 }}>
        {[['all','Todos'],['whatsapp','WA'],['instagram','IG']].map(([ch, l]) => (
          <button key={ch} onClick={() => setFilter(ch)}
            style={{ flex: 1, padding: '6px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
              background: filter === ch ? (ch === 'whatsapp' ? 'var(--wa2)' : ch === 'instagram' ? 'var(--ig2)' : 'var(--tq3)') : '#fff',
              color: filter === ch ? (ch === 'whatsapp' ? 'var(--wa)' : ch === 'instagram' ? 'var(--ig)' : 'var(--tq)') : 'var(--muted)',
              borderColor: filter === ch ? 'currentColor' : 'var(--border)',
            }}>{l}</button>
        ))}
        {totalUnread > 0 && (
          <button onClick={() => setUnreadOnly(p => !p)}
            style={{ padding: '5px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid',
              background: unreadOnly ? 'var(--tq)' : '#fff', color: unreadOnly ? '#fff' : 'var(--muted)', borderColor: unreadOnly ? 'var(--tq)' : 'var(--border)' }}>
            🔔{totalUnread}
          </button>
        )}
      </div>

      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
        <input value={value} onChange={e => onChange(e.target.value)}
          placeholder="Buscar por nome, número…"
          style={{ width: '100%', padding: '8px 32px 8px 28px', border: '1.5px solid var(--border)', borderRadius: 8, outline: 'none', fontSize: 13, background: 'var(--bg)' }}
          onFocus={e => e.target.style.borderColor = 'var(--tq)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        {value && (
          <button onClick={() => onChange('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', padding: 3, color: 'var(--muted)', cursor: 'pointer', border: 'none' }}>
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ── AI Panel ─────────────────────────────────────────────────────────────────── */
function AIPanel({ messages, contactName, token, convId, onUseSuggestion, onClose }) {
  const [mode, setMode] = useState(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async (m) => {
    setMode(m); setResult(''); setLoading(true);
    const transcript = (messages || []).filter(x => x.type === 'text' && x.from_type !== 'system').slice(-20)
      .map(x => `${x.from_type === 'me' ? `Atendente(${x.sender_nome || 'Equipe'})` : x.from_type === 'bot' ? 'Bot' : contactName}: ${x.content}`).join('\n');
    const sys = `Você é assistente comercial da Vittalis Saúde (clínica de vacinas, São Luís-MA). Tom: humano, empático, leve. Slogan: "Sua vida é preciosa."`;
    const prompts = {
      summary: `${sys}\n\nAnalise e gere resumo: interesse, objeções, intenção (baixa/média/alta🔥), próximo passo.\n\nConversa:\n${transcript}\n\npt-BR, markdown, máx 180 palavras.`,
      qualify: `${sys}\n\nScore 1-10 para ${contactName}: potencial, urgência, budget, next step.\n\nConversa:\n${transcript}`,
      suggest: `${sys}\n\nMelhor estratégia de fechamento agora. Específico: qual produto, qual objeção, qual gatilho.\n\nConversa:\n${transcript}`,
      reply:   `${sys}\n\nEscreva a próxima mensagem perfeita para ${contactName}. Tom acolhedor. APENAS O TEXTO, sem explicações.\n\nConversa:\n${transcript}`,
    };
    try {
      const BASE = import.meta.env.VITE_API_URL || '';
      const tk = localStorage.getItem('vh_token') || '';
      const resp = await fetch(`${BASE}/api/inbox/ai-assist`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` }, body: JSON.stringify({ prompt: prompts[m], convId }) });
      const d = await resp.json();
      setResult(d.text || d.error || 'Sem resposta');
    } catch (e) { setResult('Erro: ' + e.message); }
    setLoading(false);
  };

  const BTNS = [['summary','📋 Resumo'],['qualify','⭐ Score'],['suggest','💡 Estratégia'],['reply','✍️ Resposta']];

  return (
    <div style={{ background: '#071e2c', padding: '12px 16px', flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={12} color="#00B8C0" />
          <span style={{ color: '#00B8C0', fontWeight: 700, fontSize: 12 }}>IA Vittalis · Claude</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {BTNS.map(([k, l]) => (
            <button key={k} onClick={() => run(k)} disabled={loading}
              style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${mode === k && result ? '#00B8C0' : 'rgba(255,255,255,0.12)'}`, background: mode === k && result ? 'rgba(0,184,192,.2)' : 'rgba(255,255,255,.06)', color: mode === k && result ? '#00B8C0' : 'rgba(255,255,255,.55)' }}>
              {loading && mode === k ? <span className="spin" style={{ width: 9, height: 9, borderColor: 'rgba(255,255,255,.2)', borderTopColor: '#fff' }} /> : l}
            </button>
          ))}
          <button onClick={onClose} style={{ padding: '2px 5px', background: 'none', color: 'rgba(255,255,255,0.3)', borderRadius: 6, cursor: 'pointer', border: 'none' }}><X size={11} /></button>
        </div>
      </div>
      {result && (
        <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'rgba(255,255,255,.82)', lineHeight: 1.65, whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto' }}>
          {result}
          {mode === 'reply' && <button onClick={() => { onUseSuggestion(result); onClose(); }} style={{ display: 'block', marginTop: 8, padding: '5px 12px', background: 'var(--tq)', color: '#fff', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none' }}>↑ Usar esta resposta</button>}
        </div>
      )}
      {!result && !loading && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.25)', fontStyle: 'italic' }}>Clique em uma opção para analisar com IA</div>}
    </div>
  );
}

/* ── Message item ────────────────────────────────────────────────────────────── */
const MsgItem = React.memo(function MsgItem({ m, i, msgs, contactName, channel, onLightbox }) {
  const isMe = m.from_type === 'me', isBot = m.from_type === 'bot', isSys = m.from_type === 'system';
  const showDate = i === 0 || new Date(msgs[i-1].created_at).toDateString() !== new Date(m.created_at).toDateString();

  return (
    <React.Fragment>
      {showDate && (
        <div style={{ textAlign: 'center', margin: '8px 0' }}>
          <span style={{ background: 'rgba(0,0,0,.06)', color: 'var(--muted)', borderRadius: 20, padding: '3px 14px', fontSize: 11, fontWeight: 500 }}>
            {new Date(m.created_at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}
          </span>
        </div>
      )}
      {isSys ? (
        <div style={{ textAlign: 'center' }}>
          <span style={{ background: 'var(--ok2)', color: 'var(--ok)', borderRadius: 8, padding: '3px 14px', fontSize: 11, fontWeight: 600 }}>✓ {m.content}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: isMe || isBot ? 'flex-end' : 'flex-start' }}>
          <div style={{ maxWidth: '70%', background: isBot ? '#e8faf4' : isMe ? (channel === 'whatsapp' ? '#dcfce7' : '#fde4f0') : '#fff', borderRadius: isMe || isBot ? '14px 14px 3px 14px' : '14px 14px 14px 3px', padding: '9px 12px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
            {isBot && <div style={{ fontSize: 10, color: 'var(--ok)', fontWeight: 700, marginBottom: 3 }}>🤖 Bot</div>}
            {isMe && m.sender_nome && i > 0 && msgs[i-1].from_type !== 'me' && <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2, fontWeight: 600 }}>{m.sender_nome?.split(' ')[0]}</div>}
            {m.type === 'text' && <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{m.content}</div>}
            {m.type === 'image' && <img onClick={() => onLightbox(m.content)} src={m.content} alt="img" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, display: 'block', objectFit: 'cover', cursor: 'pointer' }} onError={e => e.target.style.display = 'none'} />}
            {m.type === 'audio' && <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}><Volume2 size={13} color="var(--tq)" /><audio controls src={m.content} style={{ flex: 1, height: 28, minWidth: 140 }} /></div>}
            {m.type === 'video' && <video controls src={m.content} style={{ maxWidth: 240, borderRadius: 8 }} />}
            {m.type === 'document' && <a href={m.content} download target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--pet)', fontSize: 13 }}><File size={13} /><span style={{ textDecoration: 'underline' }}>{m.filename || 'Arquivo'}</span></a>}
            <div style={{ fontSize: 10, color: 'var(--light)', marginTop: 4, textAlign: 'right' }}>
              {fmt.msgTime(m.created_at || m.timestamp)}{isMe && <span style={{ marginLeft: 3 }}>{m.status === 'delivered' ? '✓✓' : '✓'}</span>}
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
});

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN INBOX COMPONENT
──────────────────────────────────────────────────────────────────────────────── */
export default function Inbox({ onUnreadChange }) {
  const api = useApi();
  const { user } = useAuth();
  const token = localStorage.getItem('vh_token') || '';

  // Conversation list state
  const [convos, setConvos] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 50;

  // Filters
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Chat state
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder] = useState(null);
  const [showAI, setShowAI] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qr, setQr] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [showProposta, setShowProposta] = useState(false);
  const [leadData, setLeadData] = useState(null);
  const [listH, setListH] = useState(500);

  const endRef = useRef(null);
  const fileRef = useRef(null);
  const textRef = useRef(null);
  const listContainerRef = useRef(null);
  const searchTimeout = useRef(null);

  // Measure list container height for virtual scroll
  useEffect(() => {
    const measure = () => {
      if (listContainerRef.current) {
        const rect = listContainerRef.current.getBoundingClientRect();
        setListH(rect.height || 500);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Load conversations (first page or full reload)
  const loadConvos = useCallback(async (reset = true) => {
    try {
      const params = new URLSearchParams({ page: 1, limit: LIMIT });
      if (filter !== 'all') params.set('channel', filter);
      if (search)           params.set('search', search);
      if (unreadOnly)       params.set('unread_only', 'true');

      const data = await api.get(`/inbox/conversations?${params}`);
      const list = data.data || data; // handle both paginated and flat
      const tot  = data.total ?? list.length;
      setConvos(list);
      setTotal(tot);
      setPage(1);
      setHasMore(list.length < tot);
      onUnreadChange?.(list.reduce((s, c) => s + (c.unread || 0), 0));
    } catch (err) { console.error('loadConvos:', err.message); }
  }, [filter, search, unreadOnly]);

  // Load more (pagination for infinite scroll)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const params = new URLSearchParams({ page: next, limit: LIMIT });
      if (filter !== 'all') params.set('channel', filter);
      if (search)           params.set('search', search);
      if (unreadOnly)       params.set('unread_only', 'true');

      const data = await api.get(`/inbox/conversations?${params}`);
      const list = data.data || [];
      setConvos(prev => [...prev, ...list]);
      setPage(next);
      setHasMore(convos.length + list.length < (data.total ?? 0));
    } catch (err) { console.error('loadMore:', err.message); }
    setLoadingMore(false);
  }, [page, hasMore, loadingMore, filter, search, unreadOnly, convos.length]);

  // Debounced search
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => loadConvos(true), 300);
    return () => clearTimeout(searchTimeout.current);
  }, [search, filter, unreadOnly]);

  useEffect(() => { api.get('/inbox/quick-replies').then(setQr).catch(() => {}); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const openConvo = async (c) => {
    setSel(c); setShowAI(false); setShowProposta(false); setLeadData(null);
    try {
      const data = await api.get(`/inbox/conversations/${c.id}`);
      setMsgs(data.messages || []);
      if (data.lead_id) api.get(`/leads/${data.lead_id}`).then(setLeadData).catch(() => {});
    } catch {}
    fetch(`${import.meta.env.VITE_API_URL || ''}/api/inbox/conversations/${c.id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
    setConvos(prev => prev.map(x => x.id === c.id ? { ...x, unread: 0 } : x));
  };

  const send = async (text) => {
    const t = (text || input).trim(); if (!t || !sel) return;
    setInput('');
    const now = new Date().toISOString();
    const tmp = { id: `tmp-${Date.now()}`, from_type: 'me', type: 'text', content: t, created_at: now, status: 'sent', sender_nome: user?.nome };
    setMsgs(p => [...p, tmp]);
    setConvos(p => p.map(c => c.id === sel.id ? { ...c, last_message: t, last_message_at: now } : c));
    try { await api.post(`/inbox/conversations/${sel.id}/send`, { content: t }); }
    catch (e) { console.error('send error:', e.message); }
  };

  const handleFile = async (e) => {
    const f = e.target.files[0]; if (!f || !sel) return;
    const fd = new FormData(); fd.append('file', f);
    const m = await api.upload(`/inbox/conversations/${sel.id}/upload`, fd);
    setMsgs(p => [...p, m]); e.target.value = '';
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); const ch = [];
      mr.ondataavailable = e => ch.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(ch, { type: 'audio/webm' });
        const fd = new FormData(); fd.append('file', blob, 'audio.webm');
        const m = await api.upload(`/inbox/conversations/${sel.id}/upload`, fd);
        setMsgs(p => [...p, m]); stream.getTracks().forEach(t => t.stop());
      };
      mr.start(); setRecorder(mr); setRecording(true);
    } catch { alert('Microfone indisponível'); }
  };
  const stopRec = () => { recorder?.stop(); setRecording(false); setRecorder(null); };

  const toLead = async () => {
    const d = await api.post(`/inbox/conversations/${sel.id}/to-lead`, {});
    if (d.created) { alert(`✅ Lead criado: ${d.lead.nome}`); setLeadData(d.lead); }
    else { alert(`ℹ️ Lead já existe: ${d.lead.nome}`); setLeadData(d.lead); }
  };

  const toggleBot = async () => {
    const d = await api.patch(`/inbox/conversations/${sel.id}/bot`, { ativo: !sel.bot_ativo });
    setSel(p => ({ ...p, bot_ativo: d.botAtivo }));
  };

  const totalUnread = useMemo(() => convos.reduce((s, c) => s + (c.unread || 0), 0), [convos]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── LEFT PANEL: Conversation list ────────────────────────────────────── */}
      <div style={{ width: 300, flexShrink: 0, background: '#fff', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
        {/* Header */}
        <div style={{ padding: '14px 13px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Inbox</h2>
              {totalUnread > 0 && <span style={{ background: 'var(--tq)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 800, boxShadow: '0 2px 6px rgba(0,184,192,.3)' }}>{totalUnread > 99 ? '99+' : totalUnread}</span>}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', alignSelf: 'center' }}>{total.toLocaleString()}</span>
              <button onClick={() => loadConvos(true)} className="btn btn-g btn-ico" title="Recarregar"><RefreshCw size={14} /></button>
            </div>
          </div>
        </div>

        <SearchBar value={search} onChange={setSearch} filter={filter} setFilter={setFilter}
          showFilters={showFilters} setShowFilters={setShowFilters}
          totalUnread={totalUnread} unreadOnly={unreadOnly} setUnreadOnly={setUnreadOnly} />

        {/* Virtual list */}
        <div ref={listContainerRef} style={{ flex: 1, minHeight: 0 }}>
          <VirtualList
            items={convos}
            selectedId={sel?.id}
            onSelect={openConvo}
            containerHeight={listH - 120}
            loadMore={loadMore}
            hasMore={hasMore}
            loadingMore={loadingMore}
          />
        </div>
      </div>

      {/* ── RIGHT PANEL: Chat ─────────────────────────────────────────────────── */}
      {!sel ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
          <img src="/logos/logo-icon-color.png" alt="" style={{ width: 50, opacity: .12, marginBottom: 14 }} />
          <p style={{ color: 'var(--light)', fontSize: 13.5 }}>Selecione uma conversa</p>
          <p style={{ color: 'var(--light)', fontSize: 12, marginTop: 4 }}>{total.toLocaleString()} conversa{total !== 1 ? 's' : ''} · {totalUnread} não lida{totalUnread !== 1 ? 's' : ''}</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Chat header */}
          <div style={{ background: '#fff', padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: sel.channel === 'whatsapp' ? '#d4f7e0' : '#fce4ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11.5, color: sel.channel === 'whatsapp' ? '#0a7a40' : '#9a1050', position: 'relative', flexShrink: 0 }}>
              {(sel.contact_name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
              <span style={{ position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: '50%', background: sel.channel === 'whatsapp' ? 'var(--wa)' : 'var(--ig)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>{sel.channel === 'whatsapp' ? <WA s={5} /> : <IG s={5} />}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sel.contact_name}</span>
                {sel.bot_ativo && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--ok2)', color: 'var(--ok)', borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}><Bot size={8} />Bot</span>}
                {leadData && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--tq3)', color: 'var(--tq2)', borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>◆ Lead</span>}
              </div>
              {sel.phone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt.phone(sel.phone)}</div>}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <button onClick={toggleBot} className="btn btn-sm" style={{ background: sel.bot_ativo ? 'var(--ok2)' : 'var(--bg2)', color: sel.bot_ativo ? 'var(--ok)' : 'var(--muted)', border: `1.5px solid ${sel.bot_ativo ? 'var(--ok)' : 'var(--border)'}`, fontSize: 11.5, padding: '5px 10px' }}>
                <Bot size={11} /> {sel.bot_ativo ? 'Bot ON' : 'Bot'}
              </button>
              <button onClick={() => setShowProposta(true)} className="btn btn-sm" style={{ background: 'linear-gradient(135deg,#071e2c,#207898)', color: '#fff', fontSize: 11.5, padding: '5px 10px' }}>
                <FileText size={11} /> Proposta
              </button>
              <button onClick={toLead} className="btn btn-s btn-sm" style={{ fontSize: 11.5, padding: '5px 10px' }}><UserPlus size={11} /> Lead</button>
              <button onClick={() => setShowAI(p => !p)} className="btn btn-sm" style={{ background: showAI ? '#071e2c' : 'var(--bg2)', color: showAI ? '#00B8C0' : 'var(--muted)', border: `1.5px solid ${showAI ? 'rgba(0,184,192,.4)' : 'var(--border)'}`, fontSize: 11.5, padding: '5px 10px' }}>
                <Sparkles size={11} /> IA
              </button>
            </div>
          </div>

          {/* AI Panel */}
          {showAI && <AIPanel messages={msgs} contactName={sel.contact_name} token={token} convId={sel.id} onUseSuggestion={t => { setInput(t); textRef.current?.focus(); }} onClose={() => setShowAI(false)} />}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {msgs.map((m, i) => <MsgItem key={m.id || i} m={m} i={i} msgs={msgs} contactName={sel.contact_name} channel={sel.channel} onLightbox={setLightbox} />)}
            <div ref={endRef} />
          </div>

          {/* Quick replies */}
          {showQR && (
            <div style={{ background: '#fff', borderTop: '1px solid var(--border)', padding: '9px 14px', display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 100, overflowY: 'auto', flexShrink: 0 }}>
              {qr.map(q => <button key={q.id} onClick={() => { setInput(q.texto); setShowQR(false); textRef.current?.focus(); }} style={{ padding: '5px 12px', borderRadius: 8, background: 'var(--tq3)', color: 'var(--tq2)', border: '1px solid var(--tq3)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{q.titulo}</button>)}
            </div>
          )}

          {/* Input bar */}
          <div style={{ background: '#fff', padding: '9px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              <button onClick={() => fileRef.current?.click()} className="btn btn-g btn-ico"><Paperclip size={16} /></button>
              <button onClick={() => setShowQR(p => !p)} className="btn btn-ico" style={{ background: showQR ? 'var(--tq3)' : 'transparent', color: showQR ? 'var(--tq)' : 'var(--muted)', borderRadius: 8 }}><Hash size={16} /></button>
              <input ref={fileRef} type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={handleFile} />
              <textarea ref={textRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Mensagem… (Enter envia)" rows={1}
                style={{ flex: 1, padding: '9px 13px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13.5, resize: 'none', outline: 'none', maxHeight: 100, overflowY: 'auto', lineHeight: 1.55, fontFamily: 'DM Sans, sans-serif', transition: 'border-color .15s' }}
                onFocus={e => e.target.style.borderColor = 'var(--tq)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              <button onClick={recording ? stopRec : startRec} className="btn btn-ico" style={{ background: recording ? 'var(--err2)' : 'var(--bg2)', color: recording ? 'var(--err)' : 'var(--muted)', borderRadius: 8, animation: recording ? 'pulse 1.2s infinite' : 'none' }}>
                {recording ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <button onClick={() => send()} disabled={!input.trim()} className="btn btn-ico" style={{ background: input.trim() ? 'var(--tq)' : 'var(--bg2)', color: input.trim() ? '#fff' : 'var(--light)', borderRadius: 8, transition: 'all .15s' }}>
                <Send size={16} />
              </button>
            </div>
            {recording && <div style={{ textAlign: 'center', marginTop: 5, fontSize: 11.5, color: 'var(--err)', fontWeight: 600 }}>🔴 Gravando… clique novamente para parar</div>}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.9)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={lightbox} alt="" style={{ maxWidth: '92vw', maxHeight: '90vh', borderRadius: 8 }} />
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: '50%', padding: 10, cursor: 'pointer' }}><X size={18} /></button>
        </div>
      )}

      {/* Proposta */}
      {showProposta && sel && (
        <PropostaModal convId={sel.id} token={token} contactName={sel.contact_name} atendente={user?.nome}
          onClose={txt => { setShowProposta(false); if (txt) setMsgs(p => [...p, { id: Date.now(), from_type: 'me', type: 'text', content: txt, created_at: new Date().toISOString(), status: 'sent', sender_nome: user?.nome }]); }} />
      )}
    </div>
  );
}
