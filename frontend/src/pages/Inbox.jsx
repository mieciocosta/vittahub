import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Send, Paperclip, Mic, MicOff, Sparkles, Search, RefreshCw, X,
  UserPlus, Hash, Bot, FileText, Volume2, File, Tag,
  Smile, PanelLeftClose, PanelLeftOpen, Play, ChevronUp, Loader2,
  CheckCircle2, Clock, MessageCircle, Phone, Image,
} from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt, openWA } from '../hooks/utils.js';
import PropostaModal from '../components/PropostaModal.jsx';
import Copiloto from '../components/Copiloto.jsx';

/* ── Icons ──────────────────────────────────────────────────────────────────── */
const WA = ({s=13})=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.556 4.118 1.523 5.847L0 24l6.302-1.496A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.807 9.807 0 01-5.032-1.388l-.361-.214-3.741.888.948-3.651-.235-.374A9.786 9.786 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>;
const IG = ({s=13})=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>;

/* ── Status de atendimento ──────────────────────────────────────────────────── */
const STATUS_CFG = {
  aberto:          { label: 'Aberto',       color: '#10b981', bg: '#d1fae5', icon: MessageCircle },
  em_atendimento:  { label: 'Em atend.',    color: '#0ea5e9', bg: '#e0f2fe', icon: Clock },
  resolvido:       { label: 'Resolvido',    color: '#6b7280', bg: '#f3f4f6', icon: CheckCircle2 },
};
const ITEM_HEIGHT = 80;

/* ── Avatar ─────────────────────────────────────────────────────────────────── */
const Avatar = React.memo(function Avatar({ conv, size = 38, fontSize = 13 }) {
  const initials = (conv.contact_name || conv.phone || '?').split(' ').slice(0, 2).map(w => w[0] || '?').join('').toUpperCase();
  const bg    = conv.channel === 'whatsapp' ? '#d4f7e0' : '#fce4ef';
  const color = conv.channel === 'whatsapp' ? '#0a7a40' : '#9a1050';
  const badge = Math.round(size * 0.37);
  const icon  = Math.round(size * 0.18);
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize, color, position: 'relative', overflow: 'hidden' }}>
      {conv.profile_pic
        ? <img src={conv.profile_pic} alt="" loading="lazy"
            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', position: 'absolute', inset: 0 }}
            onError={e => e.target.style.display = 'none'} />
        : initials}
      <span style={{ position: 'absolute', bottom: -1, right: -1, width: badge, height: badge, borderRadius: '50%',
        background: conv.channel === 'whatsapp' ? 'var(--wa)' : 'var(--ig)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--card,#fff)' }}>
        {conv.channel === 'whatsapp' ? <WA s={icon}/> : <IG s={icon}/>}
      </span>
    </div>
  );
});

/* ── StatusBadge ────────────────────────────────────────────────────────────── */
const StatusBadge = ({ status, size = 'sm' }) => {
  const cfg = STATUS_CFG[status] || STATUS_CFG.aberto;
  const Icon = cfg.icon;
  const p = size === 'xs' ? '2px 6px' : '4px 10px';
  const fs = size === 'xs' ? 9.5 : 11.5;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: p,
      borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: fs, flexShrink: 0 }}>
      <Icon size={size === 'xs' ? 8 : 10} />
      {cfg.label}
    </span>
  );
};

/* ── VirtualList ─────────────────────────────────────────────────────────────── */
function VirtualList({ items, selectedId, onSelect, containerHeight, loadMore, hasMore, loadingMore, usersById }) {
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
    const near = st + containerHeight >= totalHeight - ITEM_HEIGHT * 4;
    if (near && hasMore && !loadingMore) loadMore();
  }, [containerHeight, totalHeight, hasMore, loadingMore, loadMore]);

  return (
    <div ref={scrollRef} onScroll={onScroll}
      style={{ flex: 1, overflowY: 'auto', position: 'relative', height: containerHeight }}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: visibleStart * ITEM_HEIGHT, left: 0, right: 0 }}>
          {visibleItems.map(c => (
            <ConvoRow key={c.id} conv={c} selected={selectedId === c.id} onSelect={onSelect} usersById={usersById} />
          ))}
        </div>
      </div>
      {loadingMore && (
        <div style={{ textAlign: 'center', padding: 12 }}>
          <Loader2 size={16} color="var(--tq)" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      )}
    </div>
  );
}

/* ── ConvoRow ────────────────────────────────────────────────────────────────── */
const MEDIA_PREVIEW = {
  '[image]': 'Foto', '[video]': 'Vídeo', '[audio]': 'Áudio',
  '[document]': 'Documento', '[sticker]': 'Figurinha',
};
const ConvoRow = React.memo(function ConvoRow({ conv, selected, onSelect, usersById }) {
  const st = STATUS_CFG[conv.status_atend] || STATUS_CFG.aberto;
  const hasUnread = conv.unread > 0;
  const resp = conv.responsavel_id ? usersById?.[conv.responsavel_id] : null;
  const preview = MEDIA_PREVIEW[conv.last_message] || conv.last_message || '…';
  return (
    <div onClick={() => onSelect(conv)} className={`conv-row${selected ? ' sel' : ''}`}
      style={{
        display: 'flex', gap: 11, padding: '0 13px', cursor: 'pointer',
        height: ITEM_HEIGHT, alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        borderLeft: `3px solid ${selected ? 'var(--tq)' : hasUnread ? st.color : 'transparent'}`,
      }}>
      <Avatar conv={conv} size={44} fontSize={14} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontWeight: hasUnread ? 800 : 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 6 }}>
            {conv.contact_name || fmt.phone(conv.phone) || '…'}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: hasUnread ? 800 : 500, color: hasUnread ? 'var(--tq)' : 'var(--light)', flexShrink: 0 }}>
            {fmt.relTime(conv.last_message_at)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: hasUnread ? 'var(--txt2)' : 'var(--muted)', fontWeight: hasUnread ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {preview}
          </span>
          {hasUnread && (
            <span style={{ background: 'var(--tq)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 800, flexShrink: 0, boxShadow: '0 1px 4px rgba(0,184,192,.4)' }}>
              {conv.unread > 99 ? '99+' : conv.unread}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <StatusBadge status={conv.status_atend} size="xs" />
          {conv.bot_ativo && <span style={{ fontSize: 9, color: 'var(--ok)', fontWeight: 800, background: 'var(--ok2)', padding: '1.5px 6px', borderRadius: 8, letterSpacing: .4 }}>BOT</span>}
          {conv.lead_id   && <span style={{ fontSize: 9, color: 'var(--tq)', fontWeight: 800, background: 'var(--tq3)', padding: '1.5px 6px', borderRadius: 8, letterSpacing: .4 }}>LEAD</span>}
          {resp && (
            <span title={`Responsável: ${resp.nome}`} style={{ marginLeft: 'auto', width: 18, height: 18, borderRadius: '50%', background: resp.cor || 'var(--tq)', color: '#fff', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid var(--card)' }}>
              {fmt.initials(resp.nome)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

/* ── SearchBar ───────────────────────────────────────────────────────────────── */
function SearchBar({ value, onChange, filter, setFilter, totalUnread, unreadOnly, setUnreadOnly }) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {[['all','Todos'],['whatsapp','WA'],['instagram','IG']].map(([ch, l]) => (
          <button key={ch} onClick={() => setFilter(ch)}
            style={{ flex: 1, padding: '5px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
              background: filter === ch ? (ch === 'whatsapp' ? 'var(--wa2)' : ch === 'instagram' ? 'var(--ig2)' : 'var(--tq3)') : 'var(--card,#fff)',
              color: filter === ch ? (ch === 'whatsapp' ? 'var(--wa)' : ch === 'instagram' ? 'var(--ig)' : 'var(--tq)') : 'var(--muted)',
              borderColor: filter === ch ? 'currentColor' : 'var(--border)' }}>{l}</button>
        ))}
        {totalUnread > 0 && (
          <button onClick={() => setUnreadOnly(p => !p)}
            style={{ padding: '4px 7px', borderRadius: 8, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', border: '1.5px solid',
              background: unreadOnly ? 'var(--tq)' : 'var(--card,#fff)', color: unreadOnly ? '#fff' : 'var(--muted)', borderColor: unreadOnly ? 'var(--tq)' : 'var(--border)' }}>
            🔔{totalUnread}
          </button>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
        <input value={value} onChange={e => onChange(e.target.value)}
          placeholder="Buscar por nome, número…"
          style={{ width: '100%', padding: '7px 30px 7px 27px', border: '1.5px solid var(--border)', borderRadius: 8, outline: 'none', fontSize: 12.5, background: 'var(--bg)', color: 'var(--txt)' }}
          onFocus={e => e.target.style.borderColor = 'var(--tq)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        {value && <button onClick={() => onChange('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', padding: 3, color: 'var(--muted)', cursor: 'pointer', border: 'none' }}><X size={11} /></button>}
      </div>
    </div>
  );
}

/* ── LazyMedia: carrega base64 sob demanda via endpoint ─────────────────────── */
function LazyMedia({ msgId, type, filename, token, onLightbox }) {
  const [src, setSrc]     = useState(null);
  const [loading, setLoading] = useState(false);
  const BASE = import.meta.env.VITE_API_URL || '';

  const load = useCallback(async () => {
    if (src || loading) return;
    setLoading(true);
    try {
      const resp = await fetch(`${BASE}/api/inbox/messages/${msgId}/content`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.redirected || resp.headers.get('Content-Type')?.startsWith('image/') ||
          resp.headers.get('Content-Type')?.startsWith('audio/') ||
          resp.headers.get('Content-Type')?.startsWith('video/') ||
          resp.headers.get('Content-Type')?.includes('pdf')) {
        // Para mídia binária, cria object URL
        const blob = await resp.blob();
        setSrc(URL.createObjectURL(blob));
      } else {
        const text = await resp.text();
        setSrc(text);
      }
    } catch {}
    setLoading(false);
  }, [msgId, src, loading]);

  if (type === 'image') {
    if (!src) return (
      <div onClick={load} style={{ width:160, height:100, background:'var(--bg2)', borderRadius:8, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, cursor:'pointer' }}>
        {loading ? <Loader2 size={18} style={{animation:'spin 1s linear infinite'}} color="var(--muted)"/> : <><Image size={22} color="var(--muted)"/><span style={{fontSize:10.5,color:'var(--muted)'}}>Clique para ver</span></>}
      </div>
    );
    return <img src={src} alt="img" onClick={()=>onLightbox(src)} style={{ maxWidth:220, maxHeight:220, borderRadius:8, display:'block', objectFit:'cover', cursor:'pointer' }}/>;
  }
  if (type === 'audio') {
    if (!src) return (
      <div onClick={load} style={{ display:'flex', alignItems:'center', gap:8, minWidth:200, padding:'6px 0', cursor:'pointer' }}>
        {loading ? <Loader2 size={14} style={{animation:'spin 1s linear infinite'}} color="var(--tq)"/> : <Volume2 size={14} color="var(--tq)"/>}
        <span style={{fontSize:12,color:'var(--muted)'}}>Clique para carregar áudio</span>
      </div>
    );
    return <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:200 }}><Volume2 size={14} color="var(--tq)"/><audio controls src={src} style={{ flex:1, height:28, minWidth:150 }}/></div>;
  }
  if (type === 'video') {
    if (!src) return (
      <div onClick={load} style={{ width:200, height:120, background:'#000', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', gap:6, cursor:'pointer' }}>
        {loading ? <Loader2 size={18} style={{animation:'spin 1s linear infinite'}} color="#fff"/> : <><Play size={24} color="#fff"/></>}
      </div>
    );
    return <video controls src={src} style={{ maxWidth:260, borderRadius:8, display:'block' }}/>;
  }
  // document
  if (!src) return (
    <div onClick={load} style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 10px', background:'rgba(0,0,0,.04)', borderRadius:8, cursor:'pointer' }}>
      <div style={{ width:32, height:32, borderRadius:6, background:'var(--err2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        {loading ? <Loader2 size={16} style={{animation:'spin 1s linear infinite'}} color="var(--err)"/> : <FileText size={16} color="var(--err)"/>}
      </div>
      <div><div style={{fontWeight:600,fontSize:12.5}}>{filename||'Documento'}</div><div style={{fontSize:10.5,color:'var(--muted)'}}>Clique para carregar</div></div>
    </div>
  );
  return (
    <a href={src} download={filename} target="_blank" rel="noreferrer"
      style={{ display:'flex', alignItems:'center', gap:9, color:'var(--pet)', fontSize:13, padding:'8px 10px', background:'rgba(0,0,0,.04)', borderRadius:8, textDecoration:'none' }}>
      <div style={{ width:32, height:32, borderRadius:6, background:'var(--err2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <FileText size={16} color="var(--err)"/>
      </div>
      <div><div style={{fontWeight:600,fontSize:12.5}}>{filename||'Documento'}</div><div style={{fontSize:10.5,color:'var(--muted)'}}>Clique para baixar</div></div>
    </a>
  );
}


const MsgItem = React.memo(function MsgItem({ m, prevMsg, contactName, channel, onLightbox, token }) {
  const isMe = m.from_type==='me', isBot=m.from_type==='bot', isSys=m.from_type==='system';
  // Usa prevMsg em vez do array msgs inteiro — React.memo agora é eficaz
  const showDate = !prevMsg || new Date(prevMsg.created_at).toDateString() !== new Date(m.created_at).toDateString();
  const showSender = isMe && m.sender_nome && (!prevMsg || prevMsg.from_type !== 'me' || prevMsg.sender_nome !== m.sender_nome);
  const lazyMatch = m.content?.match(/^\[media:([a-f0-9-]+)\]$/);
  const isLazy = !!lazyMatch;
  const lazyId = lazyMatch?.[1] || m.id;
  // Paleta por classe CSS (.bub-pN) — tem versão clara E escura no index.css,
  // resolvendo o contraste ruim do modo escuro (texto claro em pastel claro)
  const bubClass = useMemo(() => {
    if (isBot) return 'bub bub-bot';
    if (!isMe) return 'bub bub-contact';
    const name = m.sender_nome || 'Equipe';
    let h = 0; for (let c of name) h = ((h << 5) - h) + c.charCodeAt(0);
    return `bub bub-p${Math.abs(h) % 5}`;
  }, [m.sender_nome, isMe, isBot]);
  return (
    <React.Fragment>
      {showDate && (
        <div style={{ textAlign:'center', margin:'10px 0 6px' }}>
          <span className="msg-date-pill" style={{ borderRadius:20, padding:'3px 14px', fontSize:10.5, fontWeight:500 }}>
            {new Date(m.created_at).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'short' })}
          </span>
        </div>
      )}
      {isSys ? (
        <div style={{ textAlign:'center', margin:'3px 0' }}>
          <span style={{ background:'var(--ok2)', color:'var(--ok)', borderRadius:8, padding:'3px 14px', fontSize:10.5, fontWeight:600 }}>✓ {m.content}</span>
        </div>
      ) : (
        <div style={{ display:'flex', justifyContent:isMe||isBot?'flex-end':'flex-start', marginBottom:2 }}>
          <div className={bubClass} style={{ maxWidth:'72%',
            borderRadius:isMe||isBot?'14px 14px 3px 14px':'14px 14px 14px 3px',
            padding:'8px 11px', boxShadow:'0 1px 2px rgba(0,0,0,.05)' }}>
            {(isBot||showSender) && (
              <div className="bub-tag" style={{ fontSize:10, fontWeight:700, marginBottom:3 }}>
                {isBot ? 'Vitta · IA' : m.sender_nome?.split(' ')[0]}
              </div>
            )}
            {isLazy && <LazyMedia msgId={lazyId} type={m.type} filename={m.filename} token={token} onLightbox={onLightbox}/>}
            {!isLazy && m.type==='text'     && <div style={{ fontSize:13.5, lineHeight:1.55, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{m.content}</div>}
            {!isLazy && m.type==='image'    && <img onClick={()=>onLightbox(m.content)} src={m.content} alt="img" loading="lazy" style={{ maxWidth:220, maxHeight:220, borderRadius:8, display:'block', objectFit:'cover', cursor:'pointer' }} onError={e=>e.target.style.display='none'}/>}
            {!isLazy && m.type==='audio'    && <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:200 }}><Volume2 size={14} color="var(--tq)"/><audio controls src={m.content} style={{ flex:1, height:28, minWidth:150 }}/></div>}
            {!isLazy && m.type==='video'    && <video controls src={m.content} style={{ maxWidth:260, borderRadius:8, display:'block' }}/>}
            {!isLazy && m.type==='document' && (
              <a href={m.content} download target="_blank" rel="noreferrer"
                style={{ display:'flex', alignItems:'center', gap:9, color:'var(--pet)', fontSize:13, padding:'8px 10px', background:'rgba(0,0,0,.04)', borderRadius:8, textDecoration:'none' }}>
                <div style={{ width:32, height:32, borderRadius:6, background:'var(--err2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <FileText size={16} color="var(--err)"/>
                </div>
                <div><div style={{fontWeight:600,fontSize:12.5}}>{m.filename||'Documento'}</div><div style={{fontSize:10.5,color:'var(--muted)'}}>Clique para baixar</div></div>
              </a>
            )}
            <div style={{ fontSize:10, color:'var(--light)', marginTop:4, textAlign:'right', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:3 }}>
              {fmt.msgTime(m.created_at||m.timestamp)}
              {isMe&&<span style={{ color:m.status==='delivered'||m.status==='read'?'var(--tq)':'var(--light)' }}>{m.status==='delivered'||m.status==='read'?'✓✓':'✓'}</span>}
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
});

/* ═══════════════════════════════════════════════════════════════
   MAIN INBOX
═══════════════════════════════════════════════════════════════ */
export default function Inbox({ onUnreadChange }) {
  const api   = useApi();
  const { user } = useAuth();
  const token = localStorage.getItem('vh_token') || '';

  // ── Lista ──────────────────────────────────────────────────────────────────
  const [convos, setConvos]           = useState([]);
  const [listWidth, setListWidth]     = useState(300);
  const resizing                      = useRef(false);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const LIMIT = 50;

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [listCollapsed, setListCollapsed] = useState(false);
  const [sel, setSel]                     = useState(null);
  const [msgs, setMsgs]                   = useState([]);
  const [msgsTotal, setMsgsTotal]         = useState(0);
  const [msgsHasMore, setMsgsHasMore]     = useState(false);
  const [loadingOlderMsgs, setLoadingOlderMsgs] = useState(false);
  const [input, setInput]     = useState('');
  const [sending, setSending] = useState(false); // guard: evita envios duplos
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder]   = useState(null);
  const [showAI, setShowAI]     = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [filePreview, setFilePreview] = useState(null);
  const [showQR, setShowQR]     = useState(false);
  const [qr, setQr]             = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [showProposta, setShowProposta] = useState(false);
  const [leadData, setLeadData] = useState(null);
  const [users, setUsers] = useState([]);
  const usersById = useMemo(() => Object.fromEntries(users.map(u => [u.id, u])), [users]);
  useEffect(() => { api.get('/leads/meta').then(m => setUsers(m.users || [])).catch(() => {}); }, []);
  const [listH, setListH]       = useState(500);

  const endRef           = useRef(null);
  const msgAreaRef       = useRef(null);
  const fileRef          = useRef(null);
  const textRef          = useRef(null);
  const listContainerRef = useRef(null);
  const searchTimeout    = useRef(null);
  const lastPollTs       = useRef(new Date().toISOString());
  const lastMsgTs        = useRef(null);
  const selRef           = useRef(sel);
  // CRÍTICO: atribuir no render body (síncrono), não em useEffect (assíncrono)
  // Evita janela onde WebSocket chega e selRef ainda aponta para conversa anterior
  selRef.current = sel;

  // ── Mede altura da lista ───────────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      if (listContainerRef.current) setListH(listContainerRef.current.getBoundingClientRect().height || 500);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ── Tab ativa? ─────────────────────────────────────────────────────────────
  const isTabActive = () => !document.hidden;

  // ── Socket.io: real-time confiável ───────────────────────────────────────────
  // Socket.io gerencia automaticamente: WebSocket → HTTP polling fallback
  // Reconexão automática, funciona com qualquer proxy (Railway, nginx, Cloudflare)
  useEffect(() => {
    const BASE = import.meta.env.VITE_API_URL || '';
    const tk   = localStorage.getItem('vh_token') || '';
    if (!tk) return;

    // Importação dinâmica do socket.io-client (evita aumentar bundle no SSR)
    let socket = null;
    let active = true;

    import('socket.io-client').then(({ io }) => {
      if (!active) return;

      socket = io(BASE, {
        auth: { token: tk },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });

      socket.on('connect', () => {
        console.log('%c Socket.io ✅ Tempo real ativo', 'background:#00B8C0;color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold');
      });

      socket.on('disconnect', (reason) => {
        console.log('Socket.io desconectado:', reason);
      });

      socket.on('connect_error', (err) => {
        console.warn('Socket.io erro:', err.message);
      });

      socket.on('new_message', ({ convId, message, conv: updConv }) => {
        // Atualiza lista de conversas — move para o topo
        setConvos(prev => {
          const ex = prev.find(c => c.id === convId);
          return [{ ...(ex || {}), ...updConv }, ...prev.filter(c => c.id !== convId)];
        });

        // Adiciona mensagem se a conversa aberta for essa
        if (selRef.current?.id === convId) {
          setMsgs(prev => {
            if (prev.find(m => m.id === message.id)) return prev;
            // Substitui otimista correspondente (tmp-*) pela versão real
            const clean = prev.filter(p =>
              !String(p.id).startsWith('tmp-') ||
              !(p.from_type === 'me' && p.content === message.content)
            );
            lastMsgTs.current = message.created_at;
            return [...clean, message];
          });
        }
      });
    }).catch(err => console.warn('socket.io-client não disponível:', err.message));

    return () => {
      active = false;
      socket?.disconnect();
    };
  }, []); // uma vez, persiste durante toda a sessão


  // ── POLL DE MENSAGENS — 2s, simples, garantido funcionar ─────────────────────
  // Socket.io tenta entrega instantânea (bônus quando funcionar)
  // Este poll de 2s é o mecanismo PRINCIPAL e confiável
  // Max delay: 2s — aceitável para chat
  useEffect(() => {
    if (!sel) return;
    const BASE  = import.meta.env.VITE_API_URL || '';
    const convId = sel.id;

    const fetchNew = async () => {
      try {
        const afterTs = lastMsgTs.current || new Date(Date.now() - 30000).toISOString();
        const resp = await fetch(
          `${BASE}/api/inbox/conversations/${convId}/messages/new?after_ts=${encodeURIComponent(afterTs)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!resp.ok) return;
        const { messages: newMsgs = [] } = await resp.json();
        if (!newMsgs.length) return;

        setMsgs(prev => {
          const ids = new Set(prev.map(m => m.id));
          // Só mensagens que ainda não estão no estado
          const truly = newMsgs.filter(m => !ids.has(m.id));
          if (!truly.length) return prev;
          // Remove otimistas correspondentes (evita duplicata ao confirmar envio)
          const clean = prev.filter(p =>
            !String(p.id).startsWith('tmp-') ||
            !truly.some(r => r.from_type === 'me' && r.content === p.content)
          );
          lastMsgTs.current = truly[truly.length - 1].created_at;
          return [...clean, ...truly];
        });

        // Também atualiza a lista de conversas
        setConvos(prev => prev.map(c =>
          c.id !== convId ? c : {
            ...c,
            last_message: newMsgs[newMsgs.length - 1].content?.slice(0, 80) || c.last_message,
            last_message_at: newMsgs[newMsgs.length - 1].created_at,
          }
        ));
      } catch {}
    };

    // Poll imediato ao abrir conversa + a cada 2s
    fetchNew();
    const iv = setInterval(fetchNew, 2000);
    return () => clearInterval(iv);
  }, [sel?.id, token]);



  // ── POLL da lista de conversas (cache em memória no servidor) ─────────────
  useEffect(() => {
    const iv = setInterval(async () => {
      if (!isTabActive()) return;
      try {
        const since = lastPollTs.current;
        lastPollTs.current = new Date().toISOString();
        const params = new URLSearchParams({ since });
        if (filter !== 'all') params.set('channel', filter);
        if (search) params.set('search', search);
        if (unreadOnly) params.set('unread_only', 'true');
        const data = await api.get(`/inbox/conversations/updates?${params}`);
        const updated = data.data || [];
        if (updated.length === 0) return;
        setConvos(prev => {
          const map = new Map(prev.map(c => [c.id, c]));
          updated.forEach(c => map.set(c.id, { ...map.get(c.id), ...c }));
          return Array.from(map.values()).sort((a, b) => new Date(b.last_message_at||0) - new Date(a.last_message_at||0));
        });
        onUnreadChange?.(updated.reduce((s, c) => s + (c.unread || 0), 0));
      } catch {}
    }, 5000);
    return () => clearInterval(iv);
  }, [filter, search, unreadOnly]);

  // ── Auto-scroll ao chegar novas mensagens ─────────────────────────────────
  // Só rola se o usuário já estava perto do fim (não interrompe quem lê mensagens antigas)
  useEffect(() => {
    if (!msgAreaRef.current || msgs.length === 0) return;
    const el = msgAreaRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 250;
    if (nearBottom) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [msgs.length]); // depende do LENGTH, não do array — evita trigger em mutações internas

  // ── Carrega lista inicial ──────────────────────────────────────────────────
  const loadConvos = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: 1, limit: LIMIT });
      if (filter !== 'all') params.set('channel', filter);
      if (search) params.set('search', search);
      if (unreadOnly) params.set('unread_only', 'true');
      const data = await api.get(`/inbox/conversations?${params}`);
      const list = data.data || data;
      const tot  = data.total ?? list.length;
      setConvos(list); setTotal(tot); setPage(1); setHasMore(list.length < tot);
      lastPollTs.current = new Date().toISOString();
      onUnreadChange?.(list.reduce((s, c) => s + (c.unread || 0), 0));
    } catch(err) { console.error('loadConvos:', err.message); }
  }, [filter, search, unreadOnly]);

  // ── Infinite scroll ────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const params = new URLSearchParams({ page: next, limit: LIMIT });
      if (filter !== 'all') params.set('channel', filter);
      if (search) params.set('search', search);
      if (unreadOnly) params.set('unread_only', 'true');
      const data = await api.get(`/inbox/conversations?${params}`);
      const list = data.data || [];
      setConvos(prev => {
        const ids = new Set(prev.map(c => c.id));
        const merged = [...prev, ...list.filter(c => !ids.has(c.id))];
        setHasMore(merged.length < (data.total ?? 0));
        return merged;
      });
      setPage(next);
    } catch {}
    setLoadingMore(false);
  }, [page, hasMore, loadingMore, filter, search, unreadOnly]);

  // ── Search debounced ───────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => loadConvos(), 350);
    return () => clearTimeout(searchTimeout.current);
  }, [search, filter, unreadOnly]);

  useEffect(() => { api.get('/inbox/quick-replies').then(setQr).catch(() => {}); }, []);

  // ── Abre conversa ─────────────────────────────────────────────────────────
  // Trocar o responsável pela conversa (auto-assign acontece ao abrir; aqui troca manual)
  const changeResp = async (respId) => {
    if (!sel) return;
    const u = usersById[respId] || null;
    setSel(prev => ({ ...prev, responsavel_id: respId || null, responsavel_nome: u?.nome || null, responsavel_cor: u?.cor || null }));
    setConvos(prev => prev.map(x => x.id === sel.id ? { ...x, responsavel_id: respId || null } : x));
    try { await api.patch(`/inbox/conversations/${sel.id}/assign`, { responsavel_id: respId || null }); } catch {}
  };

  const openConvo = async (c) => {
    setSel(c); setMsgs([]); setMsgsHasMore(false); setMsgsTotal(0);
    setShowAI(false); setShowProposta(false); setLeadData(null);
    lastMsgTs.current = null;
    try {
      const data = await api.get(`/inbox/conversations/${c.id}`);
      setMsgs(data.messages || []);
      setMsgsTotal(data.messages_total || data.messages?.length || 0);
      setMsgsHasMore(!!data.has_more);
      setSel(prev => ({ ...prev, ...(data.profile_pic ? { profile_pic: data.profile_pic } : {}),
        status_atend: data.status_atend || 'aberto',
        responsavel_id: data.responsavel_id || null,
        responsavel_nome: data.responsavel_nome || null,
        responsavel_cor: data.responsavel_cor || null }));
      if (data.responsavel_id) setConvos(prev => prev.map(x => x.id === c.id ? { ...x, responsavel_id: data.responsavel_id } : x));
      if (data.lead_id) api.get(`/leads/${data.lead_id}`).then(setLeadData).catch(() => {});
      // Sem foto de perfil? Busca na Z-API em segundo plano e atualiza ao vivo
      if (!c.profile_pic && !data.profile_pic) {
        api.post(`/inbox/conversations/${c.id}/load-from-zapi`).then(() =>
          api.get(`/inbox/conversations/${c.id}`).then(d2 => {
            if (d2.profile_pic) {
              setSel(prev => prev?.id === c.id ? { ...prev, profile_pic: d2.profile_pic } : prev);
              setConvos(prev => prev.map(x => x.id === c.id ? { ...x, profile_pic: d2.profile_pic } : x));
            }
          })
        ).catch(() => {});
      }
      const lastTs = data.messages?.[data.messages.length - 1]?.created_at;
      if (lastTs) lastMsgTs.current = lastTs;
      setTimeout(() => { if (msgAreaRef.current) msgAreaRef.current.scrollTop = msgAreaRef.current.scrollHeight; }, 80);
    } catch {}
    fetch(`${import.meta.env.VITE_API_URL||''}/api/inbox/conversations/${c.id}/read`, { method:'PATCH', headers:{ Authorization:`Bearer ${token}` } });
    setConvos(prev => prev.map(x => x.id === c.id ? { ...x, unread:0 } : x));
  };

  // ── Carregar mensagens mais antigas ───────────────────────────────────────
  const loadOlderMsgs = async () => {
    if (!sel || loadingOlderMsgs || !msgsHasMore) return;
    setLoadingOlderMsgs(true);
    try {
      const firstTs = msgs[0]?.created_at;
      const data = await api.get(`/inbox/conversations/${sel.id}?before_ts=${encodeURIComponent(firstTs)}`);
      const older = data.messages || [];
      setMsgs(prev => {
        const ids = new Set(prev.map(m => m.id));
        return [...older.filter(m => !ids.has(m.id)), ...prev];
      });
      setMsgsHasMore(!!data.has_more);
      const el = msgAreaRef.current;
      if (el) { const ph = el.scrollHeight; requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - ph; }); }
    } catch {}
    setLoadingOlderMsgs(false);
  };

  // ── Enviar mensagem ────────────────────────────────────────────────────────
  const send = async (text) => {
    const t = (text || input).trim();
    if (!t || !sel || sending) return; // guard: bloqueia double-send
    setSending(true);
    setInput('');
    const now = new Date().toISOString();
    const tmp = { id:`tmp-${Date.now()}`, from_type:'me', type:'text', content:t, created_at:now, status:'sent', sender_nome:user?.nome };
    setMsgs(p => [...p, tmp]);
    setConvos(p => p.map(c => c.id===sel.id ? {...c, last_message:t, last_message_at:now} : c));
    try { await api.post(`/inbox/conversations/${sel.id}/send`, { content:t }); }
    catch(e) { console.error('send error:', e.message); }
    finally { setSending(false); }
  };

  // ── Arquivo ───────────────────────────────────────────────────────────────
  const handleFile = async (e) => {
    const f = e.target.files[0]; if (!f || !sel) return;
    // Detectar tipo corretamente (GIF é imagem, não vídeo)
    const type = f.type==='image/gif'    ? 'image'
               : f.type.startsWith('image/')   ? 'image'
               : f.type.startsWith('video/')   ? 'video'
               : f.type.startsWith('audio/')   ? 'audio'
               : 'document';
    if (type==='image'||type==='video') {
      const url = URL.createObjectURL(f);
      setFilePreview({ url, type, name:f.name, file:f, mime:f.type });
      e.target.value=''; return;
    }
    // PDF e documentos: preview especial sem URL do objeto
    if (type==='document') {
      setFilePreview({ url:null, type:'document', name:f.name, file:f, mime:f.type });
      e.target.value=''; return;
    }
    // Audio: upload direto
    const fd = new FormData(); fd.append('file', f);
    const m = await api.upload(`/inbox/conversations/${sel.id}/upload`, fd);
    setMsgs(p => [...p, m]); e.target.value='';
  };

  const sendFilePreview = async () => {
    if (!filePreview || !sel || sending) return; // guard: evita múltiplos cliques
    setSending(true);
    try {
      const fd = new FormData(); fd.append('file', filePreview.file);
      const m = await api.upload(`/inbox/conversations/${sel.id}/upload`, fd);
      setMsgs(p => [...p, m]);
      if (filePreview.url) URL.revokeObjectURL(filePreview.url);
      setFilePreview(null);
    } catch(e) { console.error('upload error:', e.message); }
    finally { setSending(false); }
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      const mr = new MediaRecorder(stream); const ch = [];
      mr.ondataavailable = e => ch.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(ch, { type:'audio/webm' });
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
    const d = await api.patch(`/inbox/conversations/${sel.id}/bot`, { ativo:!sel.bot_ativo });
    setSel(p => ({ ...p, bot_ativo:d.botAtivo }));
    setConvos(p => p.map(c => c.id===sel.id ? {...c, bot_ativo:d.botAtivo} : c));
  };

  const changeStatus = async (status) => {
    await api.patch(`/inbox/conversations/${sel.id}/status`, { status });
    setSel(p => ({ ...p, status_atend:status }));
    setConvos(p => p.map(c => c.id===sel.id ? {...c, status_atend:status} : c));
  };

  const totalUnread = useMemo(() => convos.reduce((s, c) => s + (c.unread||0), 0), [convos]);

  /* ─────────────────── RENDER ──────────────────────────────────────────────── */
  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}
      onMouseMove={e => { if (resizing.current) { const w=Math.min(500,Math.max(220,e.clientX-230)); setListWidth(w); } }}
      onMouseUp={() => { resizing.current=false; document.body.style.cursor=''; }}
      onMouseLeave={() => { resizing.current=false; document.body.style.cursor=''; }}>

      {/* ── LISTA DE CONVERSAS ─────────────────────────────────────────────── */}
      <div style={{ width:listCollapsed?0:listWidth, flexShrink:0, background:'var(--card,#fff)',
        display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)',
        overflow:'hidden', transition:'width .2s ease' }}>
        {/* Header */}
        <div style={{ padding:'12px 12px 0', flexShrink:0, borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <h2 style={{ fontSize:17, fontWeight:700 }}>Inbox</h2>
              {totalUnread>0 && <span style={{ background:'var(--tq)', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10.5, fontWeight:800, boxShadow:'0 2px 6px rgba(0,184,192,.3)' }}>{totalUnread>99?'99+':totalUnread}</span>}
            </div>
            <div style={{ display:'flex', gap:3, alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>{total.toLocaleString()}</span>
              <button onClick={()=>loadConvos()} className="btn btn-g btn-ico" title="Recarregar"><RefreshCw size={13}/></button>
              <button onClick={()=>setListCollapsed(true)} className="btn btn-g btn-ico" title="Recolher"><PanelLeftClose size={13}/></button>
            </div>
          </div>
        </div>

        <SearchBar value={search} onChange={setSearch} filter={filter} setFilter={setFilter}
          totalUnread={totalUnread} unreadOnly={unreadOnly} setUnreadOnly={setUnreadOnly}/>

        <div ref={listContainerRef} style={{ flex:1, minHeight:0 }}>
          <VirtualList items={convos} selectedId={sel?.id} onSelect={openConvo} usersById={usersById}
            containerHeight={listH-118} loadMore={loadMore} hasMore={hasMore} loadingMore={loadingMore}/>
        </div>
      </div>

      {/* Resize handle */}
      {!listCollapsed && (
        <div onMouseDown={()=>{resizing.current=true;document.body.style.cursor='col-resize';}}
          style={{ width:4, flexShrink:0, cursor:'col-resize', background:'transparent', transition:'background .15s', zIndex:10 }}
          onMouseEnter={e=>e.currentTarget.style.background='var(--tq)'}
          onMouseLeave={e=>{if(!resizing.current)e.currentTarget.style.background='transparent';}}/>
      )}

      {/* ── CHAT ───────────────────────────────────────────────────────────── */}
      {!sel ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg)', position:'relative' }}>
          {listCollapsed && (
            <button onClick={()=>setListCollapsed(false)} style={{ position:'absolute', top:14, left:14, padding:'6px 12px', borderRadius:8, background:'var(--card,#fff)', border:'1.5px solid var(--border)', display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600, cursor:'pointer', color:'var(--txt)' }}>
              <PanelLeftOpen size={13}/> Conversas
            </button>
          )}
          <img src="/logos/logo-icon-color.png" alt="" style={{ width:48, opacity:.1, marginBottom:14 }}/>
          <p style={{ color:'var(--light)', fontSize:13.5 }}>Selecione uma conversa</p>
          <p style={{ color:'var(--light)', fontSize:11.5, marginTop:4 }}>{total.toLocaleString()} conversas · {totalUnread} não lidas</p>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

          {/* Header do chat */}
          <div style={{ background:'var(--card,#fff)', padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:9, flexShrink:0 }}>
            {listCollapsed && (
              <button onClick={()=>setListCollapsed(false)} style={{ padding:'5px 7px', borderRadius:8, background:'var(--bg2)', border:'1.5px solid var(--border)', cursor:'pointer', color:'var(--muted)', display:'flex', alignItems:'center', flexShrink:0 }}>
                <PanelLeftOpen size={13}/>
              </button>
            )}
            <Avatar conv={sel} size={32} fontSize={11}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:600, fontSize:13.5, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sel.contact_name}</span>
                {sel.bot_ativo && <span style={{ display:'inline-flex', alignItems:'center', gap:2, background:'var(--ok2)', color:'var(--ok)', borderRadius:6, padding:'1px 6px', fontSize:9.5, fontWeight:700, flexShrink:0 }}><Bot size={7}/>Bot</span>}
                {leadData && <span style={{ display:'inline-flex', alignItems:'center', gap:2, background:'var(--tq3)', color:'var(--tq2)', borderRadius:6, padding:'1px 6px', fontSize:9.5, fontWeight:700, flexShrink:0 }}>◆ Lead</span>}
              </div>
              {sel.phone && <div style={{ fontSize:10.5, color:'var(--muted)' }}>{fmt.phone(sel.phone)}</div>}
            </div>

            {/* Responsável pela conversa */}
            <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
              <span title={sel.responsavel_nome ? `Responsável: ${sel.responsavel_nome}` : 'Sem responsável'}
                style={{ width:22, height:22, borderRadius:'50%', background:sel.responsavel_cor||'var(--bord2)', color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {sel.responsavel_nome ? fmt.initials(sel.responsavel_nome) : '—'}
              </span>
              <select value={sel.responsavel_id || ''} onChange={e=>changeResp(e.target.value)} title="Responsável pela conversa"
                style={{ padding:'4px 22px 4px 8px', borderRadius:20, fontSize:11, fontWeight:700, cursor:'pointer',
                  border:'1.5px solid var(--border)', background:'var(--bg2)', color:'var(--txt2)',
                  outline:'none', appearance:'none', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis' }}>
                <option value="">Sem responsável</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.nome.split(' ')[0]}</option>)}
              </select>
            </div>

            {/* Status de atendimento */}
            <div style={{ display:'flex', alignItems:'center', gap:4, position:'relative' }}>
              <select value={sel.status_atend||'aberto'} onChange={e=>changeStatus(e.target.value)}
                style={{ padding:'4px 8px', borderRadius:20, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px solid',
                  borderColor: STATUS_CFG[sel.status_atend||'aberto']?.color,
                  background: STATUS_CFG[sel.status_atend||'aberto']?.bg,
                  color: STATUS_CFG[sel.status_atend||'aberto']?.color,
                  outline:'none', appearance:'none', paddingRight:24, minWidth:100
                }}>
                <option value="aberto">🟢 Aberto</option>
                <option value="em_atendimento">🔵 Em atend.</option>
                <option value="resolvido">⚫ Resolvido</option>
              </select>
            </div>

            <div style={{ display:'flex', gap:4, flexShrink:0 }}>
              <button onClick={toggleBot} className="btn btn-sm" style={{ background:sel.bot_ativo?'var(--ok2)':'var(--bg2)', color:sel.bot_ativo?'var(--ok)':'var(--muted)', border:`1.5px solid ${sel.bot_ativo?'var(--ok)':'var(--border)'}`, fontSize:11, padding:'4px 9px' }}>
                <Bot size={10}/>{sel.bot_ativo?'Bot ON':'Bot'}
              </button>
              <button onClick={()=>setShowProposta(true)} className="btn btn-sm" style={{ background:'linear-gradient(135deg,#071e2c,#207898)', color:'#fff', fontSize:11, padding:'4px 9px' }}>
                <FileText size={10}/> Proposta
              </button>
              <button onClick={toLead} className="btn btn-s btn-sm" style={{ fontSize:11, padding:'4px 9px' }}><UserPlus size={10}/> Lead</button>
              <button onClick={()=>{setShowAI(p=>!p);setShowInfo(false);}} className="btn btn-sm" style={{ background:showAI?'#071e2c':'var(--bg2)', color:showAI?'#00B8C0':'var(--muted)', border:`1.5px solid ${showAI?'rgba(0,184,192,.4)':'var(--border)'}`, fontSize:11, padding:'4px 9px' }}>
                <Sparkles size={10}/> IA
              </button>
              <button onClick={()=>{setShowInfo(p=>!p);setShowAI(false);}} className="btn btn-sm" style={{ background:showInfo?'var(--tq3)':'var(--bg2)', color:showInfo?'var(--tq2)':'var(--muted)', border:`1.5px solid ${showInfo?'var(--tq)':'var(--border)'}`, fontSize:11, padding:'4px 9px' }}>
                <Tag size={10}/> Info
              </button>
            </div>
          </div>

          {/* Área de mensagens + info panel */}
          <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>
            {/* Mensagens */}
            <div ref={msgAreaRef} style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:3, background:'var(--bg)' }}>
              {msgsHasMore && (
                <div style={{ textAlign:'center', marginBottom:8 }}>
                  <button onClick={loadOlderMsgs} disabled={loadingOlderMsgs}
                    style={{ padding:'5px 16px', borderRadius:20, background:'var(--card,#fff)', border:'1.5px solid var(--border)', fontSize:11.5, fontWeight:600, cursor:loadingOlderMsgs?'default':'pointer', color:'var(--muted)', display:'inline-flex', alignItems:'center', gap:5 }}>
                    {loadingOlderMsgs?<Loader2 size={11} style={{animation:'spin 1s linear infinite'}}/>:<ChevronUp size={11}/>}
                    {loadingOlderMsgs?'Carregando…':'Ver mensagens anteriores'}
                  </button>
                </div>
              )}
              {msgs.map((m, i) => (
                <MsgItem key={m.id||i} m={m} prevMsg={msgs[i-1] || null} contactName={sel.contact_name} channel={sel.channel} onLightbox={setLightbox} token={token}/>
              ))}
              <div ref={endRef}/>
            </div>

            {/* Copiloto IA — painel lateral */}
            {showAI && sel && (
              <Copiloto key={sel.id} conv={sel}
                onUse={t=>{setInput(t);textRef.current?.focus();}}
                onClose={()=>setShowAI(false)} />
            )}

            {/* Info panel */}
            {showInfo && (
              <div style={{ width:272, flexShrink:0, borderLeft:'1px solid var(--border)', background:'var(--card,#fff)', overflowY:'auto', display:'flex', flexDirection:'column' }}>
                <div style={{ padding:'14px 14px 10px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontWeight:700, fontSize:13 }}>Informações</span>
                  <button onClick={()=>setShowInfo(false)} style={{ padding:4, background:'none', border:'none', cursor:'pointer', color:'var(--muted)' }}>✕</button>
                </div>
                <div style={{ padding:'16px 14px', textAlign:'center', borderBottom:'1px solid var(--border)' }}>
                  <Avatar conv={sel} size={64} fontSize={20}/>
                  <div style={{ fontWeight:700, fontSize:15, marginBottom:3, marginTop:10 }}>{sel.contact_name}</div>
                  {sel.phone && <div style={{ fontSize:12.5, color:'var(--muted)', marginBottom:8 }}>+{sel.phone}</div>}
                  <StatusBadge status={sel.status_atend} size="sm"/>
                  <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:10 }}>
                    <a href={`https://wa.me/55${sel.phone?.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                      style={{ padding:'5px 12px', background:'#25D366', color:'#fff', borderRadius:8, fontSize:11.5, fontWeight:700, textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
                      <WA s={11}/> WhatsApp
                    </a>
                    <button onClick={async()=>{
                        try {
                          await api.post(`/inbox/conversations/${sel.id}/load-from-zapi`);
                          const d = await api.get(`/inbox/conversations/${sel.id}`);
                          if (d.profile_pic) {
                            setSel(prev=>({ ...prev, profile_pic:d.profile_pic }));
                            setConvos(prev=>prev.map(x=>x.id===sel.id?{...x, profile_pic:d.profile_pic}:x));
                          }
                        } catch {}
                      }}
                      title="Buscar foto e dados atualizados do contato no WhatsApp"
                      style={{ padding:'5px 12px', background:'var(--tq3)', color:'var(--tq2)', borderRadius:8, fontSize:11.5, fontWeight:700, border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                      <RefreshCw size={11}/> Atualizar
                    </button>
                  </div>
                </div>
                {leadData ? (
                  <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ fontSize:10.5, fontWeight:700, color:'var(--tq2)', textTransform:'uppercase', letterSpacing:.6, marginBottom:9 }}>◆ Lead no Funil</div>
                    {[['Interesse',leadData.interesse],['Status',leadData.status],leadData.valor_proposta>0&&['Proposta',`R$ ${parseFloat(leadData.valor_proposta).toFixed(2).replace('.',',')}`]].filter(Boolean).map(([k,v])=>(
                      <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12.5 }}>
                        <span style={{ color:'var(--muted)' }}>{k}</span>
                        <span style={{ fontWeight:600 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>Não é lead ainda</div>
                    <button onClick={toLead} className="btn btn-p btn-sm" style={{ width:'100%', justifyContent:'center' }}><UserPlus size={12}/> Adicionar ao funil</button>
                  </div>
                )}
                <div style={{ padding:'12px 14px' }}>
                  <div style={{ fontSize:10.5, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.6, marginBottom:9 }}>Estatísticas</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                    {[['Mensagens',msgsTotal||msgs.length],['Não lidas',sel.unread||0],['Canal',sel.channel==='whatsapp'?'WhatsApp':'Instagram'],['Bot',sel.bot_ativo?'✅ Ativo':'⏸ Inativo']].map(([k,v])=>(
                      <div key={k} style={{ background:'var(--bg)', borderRadius:8, padding:'9px 10px', textAlign:'center' }}>
                        <div style={{ fontWeight:800, fontSize:15 }}>{v}</div>
                        <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:2 }}>{k}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick replies */}
          {showQR && (
            <div style={{ background:'var(--card,#fff)', borderTop:'1px solid var(--border)', padding:'8px 12px', display:'flex', gap:5, flexWrap:'wrap', maxHeight:95, overflowY:'auto', flexShrink:0 }}>
              {qr.map(q=><button key={q.id} onClick={()=>{setInput(q.texto);setShowQR(false);textRef.current?.focus();}} style={{ padding:'4px 11px', borderRadius:8, background:'var(--tq3)', color:'var(--tq2)', border:'1px solid var(--tq3)', fontSize:12, fontWeight:600, cursor:'pointer' }}>{q.titulo}</button>)}
            </div>
          )}

          {/* Preview de arquivo (imagem / vídeo / PDF) */}
          {filePreview && (
            <div style={{ background:'var(--bg)', borderTop:'1px solid var(--border)', padding:'10px 12px', flexShrink:0, display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ position:'relative', flexShrink:0 }}>
                {filePreview.type==='image' && (
                  <img src={filePreview.url} alt="" style={{ width:76, height:76, objectFit:'cover', borderRadius:8 }}/>
                )}
                {filePreview.type==='video' && (
                  <div style={{ width:76, height:76, background:'#000', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Play size={22} color="#fff"/>
                  </div>
                )}
                {filePreview.type==='document' && (
                  <div style={{ width:76, height:76, background:'var(--err2)', borderRadius:8, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4 }}>
                    <FileText size={26} color="var(--err)"/>
                    <span style={{ fontSize:9, fontWeight:700, color:'var(--err)', textTransform:'uppercase' }}>
                      {filePreview.name?.split('.').pop()?.toUpperCase() || 'FILE'}
                    </span>
                  </div>
                )}
                <button onClick={()=>{if(filePreview.url)URL.revokeObjectURL(filePreview.url);setFilePreview(null);}} style={{ position:'absolute', top:-6, right:-6, width:19, height:19, borderRadius:'50%', background:'var(--err)', color:'#fff', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9 }}>✕</button>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12.5, fontWeight:600, marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{filePreview.name}</div>
                <div style={{ fontSize:11.5, color:'var(--muted)' }}>
                  {filePreview.type==='image'?'📷 Imagem':filePreview.type==='video'?'🎥 Vídeo':'📎 Documento'} · pronto para enviar
                </div>
              </div>
              <button onClick={sendFilePreview} disabled={sending} className="btn btn-p btn-sm" style={{ gap:5, minWidth:90, opacity: sending ? 0.7 : 1 }}>
                {sending
                  ? <><Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/> Enviando…</>
                  : <><Send size={12}/> Enviar</>
                }
              </button>
            </div>
          )}

          {/* Emoji picker */}
          {showEmoji && (
            <div style={{ background:'var(--card,#fff)', borderTop:'1px solid var(--border)', padding:'9px 12px', flexShrink:0, maxHeight:160, overflowY:'auto' }}>
              <div style={{ fontSize:10.5, fontWeight:700, color:'var(--muted)', marginBottom:7, textTransform:'uppercase', letterSpacing:.6 }}>Emojis</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                {['😊','😂','❤️','👍','🙏','😍','🎉','😢','😮','😡','👏','🔥','✅','⭐','💎','💉','🏥','👶','💊','🩺','😁','🤣','😘','🥰','😎','🤔','😴','🤒','🤧','💪','🌟','💯','📋','📅','⏰','📞','💬','📱','🚀','✨'].map(e=>(
                  <button key={e} onClick={()=>{setInput(p=>p+e);textRef.current?.focus();}}
                    style={{ fontSize:19, padding:'3px 4px', background:'none', border:'none', cursor:'pointer', borderRadius:5, lineHeight:1 }}
                    onMouseEnter={ev=>ev.currentTarget.style.background='var(--bg)'}
                    onMouseLeave={ev=>ev.currentTarget.style.background='none'}
                  >{e}</button>
                ))}
              </div>
            </div>
          )}

          {/* Input bar */}
          <div style={{ background:'var(--card,#fff)', padding:'8px 12px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
            <div style={{ display:'flex', gap:5, alignItems:'flex-end' }}>
              <button onClick={()=>fileRef.current?.click()} className="btn btn-g btn-ico"><Paperclip size={15}/></button>
              <button onClick={()=>{setShowEmoji(p=>!p);setShowQR(false);}} className="btn btn-ico" style={{ background:showEmoji?'var(--tq3)':'transparent', color:showEmoji?'var(--tq)':'var(--muted)', borderRadius:8 }}><Smile size={15}/></button>
              <button onClick={()=>{setShowQR(p=>!p);setShowEmoji(false);}} className="btn btn-ico" style={{ background:showQR?'var(--tq3)':'transparent', color:showQR?'var(--tq)':'var(--muted)', borderRadius:8 }}><Hash size={15}/></button>
              <input ref={fileRef} type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.gif" style={{ display:'none' }} onChange={handleFile}/>
              <textarea ref={textRef} value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}
                placeholder="Mensagem… (Enter envia)" rows={1}
                style={{ flex:1, padding:'8px 12px', border:'1.5px solid var(--border)', borderRadius:10, fontSize:13, resize:'none', outline:'none', maxHeight:100, overflowY:'auto', lineHeight:1.55, fontFamily:'DM Sans, sans-serif', transition:'border-color .15s', background:'var(--card,#fff)', color:'var(--txt)' }}
                onFocus={e=>e.target.style.borderColor='var(--tq)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
              <button onClick={recording?stopRec:startRec} className="btn btn-ico" style={{ background:recording?'var(--err2)':'var(--bg2)', color:recording?'var(--err)':'var(--muted)', borderRadius:8, animation:recording?'pulse 1.2s infinite':'none' }}>
                {recording?<MicOff size={15}/>:<Mic size={15}/>}
              </button>
              <button onClick={()=>send()} disabled={(!input.trim()&&!filePreview)||sending} className="btn btn-ico" style={{ background:(input.trim()||filePreview)&&!sending?'var(--tq)':'var(--bg2)', color:(input.trim()||filePreview)&&!sending?'#fff':'var(--light)', borderRadius:8, transition:'all .15s' }}>
                {sending ? <Loader2 size={15} style={{animation:'spin 1s linear infinite'}}/> : <Send size={15}/>}
              </button>
            </div>
            {recording&&<div style={{ textAlign:'center', marginTop:5, fontSize:11, color:'var(--err)', fontWeight:600 }}>🔴 Gravando… clique para parar</div>}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={()=>setLightbox(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.92)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }}>
          <img src={lightbox} alt="" style={{ maxWidth:'92vw', maxHeight:'90vh', borderRadius:8 }}/>
          <button onClick={()=>setLightbox(null)} style={{ position:'absolute', top:18, right:18, background:'rgba(255,255,255,.14)', color:'#fff', border:'none', borderRadius:'50%', padding:9, cursor:'pointer' }}><X size={17}/></button>
        </div>
      )}

      {showProposta && sel && (
        <PropostaModal convId={sel.id} token={token} contactName={sel.contact_name} atendente={user?.nome}
          onClose={txt=>{setShowProposta(false);if(txt)setMsgs(p=>[...p,{id:Date.now(),from_type:'me',type:'text',content:txt,created_at:new Date().toISOString(),status:'sent',sender_nome:user?.nome}]);}}/>
      )}
    </div>
  );
}
