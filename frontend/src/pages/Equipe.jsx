import React, { useEffect, useState, useRef } from 'react';
import { Send, Users, MessageSquare } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* Chat interno da equipe — conversa usuário ↔ usuário (separado do WhatsApp). */
export default function Equipe() {
  const api = useApi();
  const { user } = useAuth();
  const [contatos, setContatos] = useState([]);
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const endRef = useRef(null);

  const loadContatos = () => api.get('/inbox/chat-interno/contatos').then(d => setContatos(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { loadContatos(); const t = setInterval(loadContatos, 8000); return () => clearInterval(t); }, []); // eslint-disable-line

  const abrir = (c) => {
    setSel(c); setMsgs([]);
    api.get(`/inbox/chat-interno/${c.id}`).then(d => { setMsgs(Array.isArray(d) ? d : []); loadContatos(); }).catch(() => {});
  };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  // Tempo real
  useEffect(() => {
    let socket;
    import('socket.io-client').then(({ io }) => {
      const BASE = import.meta.env.VITE_API_URL || '';
      socket = io(BASE || undefined, { auth: { token: localStorage.getItem('vh_token') } });
      socket.on('chat_interno', (m) => {
        loadContatos();
        if (sel && (m.de_id === sel.id || m.para_id === sel.id)) setMsgs(p => p.some(x => x.id === m.id) ? p : [...p, m]);
      });
    }).catch(() => {});
    return () => socket?.disconnect();
  }, [sel]); // eslint-disable-line

  const enviar = async () => {
    const t = input.trim();
    if (!t || !sel) return;
    setInput('');
    const tmp = { id: 'tmp' + Date.now(), de_id: user.id, para_id: sel.id, conteudo: t, created_at: new Date().toISOString() };
    setMsgs(p => [...p, tmp]);
    try { const m = await api.post('/inbox/chat-interno', { para_id: sel.id, conteudo: t }); setMsgs(p => p.map(x => x.id === tmp.id ? m : x)); }
    catch { setMsgs(p => p.filter(x => x.id !== tmp.id)); }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 0px)', overflow: 'hidden' }}>
      {/* Lista de contatos */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--card)' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Users size={18} color="var(--tq)" /><span style={{ fontWeight: 800, fontSize: 15 }}>Equipe</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {contatos.map(c => (
            <div key={c.id} onClick={() => abrir(c)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer', background: sel?.id === c.id ? 'var(--bg2)' : 'transparent', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: c.cor || 'var(--tq)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{fmt.initials(c.nome)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{(c.nome || '').split(' ')[0]}</span>
                  {c.nao_lidas > 0 && <span style={{ background: 'var(--tq)', color: '#fff', borderRadius: 10, padding: '0 7px', fontSize: 10.5, fontWeight: 800 }}>{c.nao_lidas}</span>}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ultima || (c.role === 'master' ? 'Gestão' : c.setor || 'Equipe')}</div>
              </div>
            </div>
          ))}
          {contatos.length === 0 && <div style={{ padding: 20, fontSize: 12.5, color: 'var(--muted)' }}>Nenhum colega disponível.</div>}
        </div>
      </div>

      {/* Conversa */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!sel ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 10 }}>
            <MessageSquare size={40} color="var(--border)" />
            <div>Escolha um colega para conversar.</div>
          </div>
        ) : (
          <>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: sel.cor || 'var(--tq)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{fmt.initials(sel.nome)}</div>
              <div><div style={{ fontWeight: 800, fontSize: 14 }}>{sel.nome}</div><div style={{ fontSize: 11.5, color: 'var(--muted)', textTransform: 'capitalize' }}>{sel.role === 'master' ? 'Gestão' : sel.setor || 'Equipe'}</div></div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {msgs.map(m => {
                const meu = m.de_id === user.id;
                return (
                  <div key={m.id} style={{ alignSelf: meu ? 'flex-end' : 'flex-start', maxWidth: '70%', background: meu ? 'var(--tq)' : 'var(--bg2)', color: meu ? '#fff' : 'var(--text)', padding: '8px 12px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {m.conteudo}
                    <div style={{ fontSize: 9.5, opacity: .7, marginTop: 3, textAlign: 'right' }}>{fmt.relTime ? fmt.relTime(m.created_at) : new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                placeholder="Mensagem para a equipe… (Enter envia)" rows={1}
                style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, resize: 'none', outline: 'none', maxHeight: 100, background: 'var(--card)', color: 'var(--text)' }} />
              <button onClick={enviar} className="btn btn-p btn-ico" style={{ alignSelf: 'flex-end' }}><Send size={16} /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
