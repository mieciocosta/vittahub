import React, { useEffect, useState, useRef } from 'react';
import { Heart, Send, Trash2, Sparkles, Users, ChevronLeft, Eye } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* MEU AMIGO — espaço pra desabafar com uma IA acolhedora, que escuta e aconselha
   com empatia. O master pode acompanhar as conversas (cuidado com a equipe). */

export default function Amigo() {
  const api = useApi();
  const { user } = useAuth();
  const ehMaster = user?.role === 'master';
  const primeiro = (user?.nome || '').split(' ')[0];
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  // Modo master: 'chat' (própria conversa) | 'lista' | 'ver'
  const [modo, setModo] = useState('chat');
  const [equipe, setEquipe] = useState([]);
  const [vendo, setVendo] = useState(null); // { usuario, mensagens }
  const fimRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.get('/extras/amigo/historico').then(d => setMsgs(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setCarregando(false));
  }, []); // eslint-disable-line

  const abrirEquipe = () => {
    setModo('lista');
    api.get('/extras/amigo/usuarios').then(d => setEquipe(Array.isArray(d) ? d : [])).catch(() => setEquipe([]));
  };
  const verConversa = (u) => {
    api.get(`/extras/amigo/conversa/${u.usuario_id}`).then(d => { setVendo(d); setModo('ver'); }).catch(() => {});
  };
  const inic = (nome) => (nome || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase();
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, enviando]);

  const enviar = async (txtDireto) => {
    const t = (txtDireto ?? texto).trim();
    if (!t || enviando) return;
    setTexto('');
    setMsgs(p => [...p, { role: 'user', content: t }]);
    setEnviando(true);
    try {
      const r = await api.post('/extras/amigo/mensagem', { texto: t });
      setMsgs(p => [...p, { role: 'assistant', content: r.resposta }]);
    } catch (e) {
      setMsgs(p => [...p, { role: 'assistant', content: 'Desculpa, não consegui responder agora. Tenta de novo daqui a pouco? Tô aqui. 💚' }]);
    }
    setEnviando(false);
    inputRef.current?.focus();
  };

  const limpar = async () => {
    if (!window.confirm('Apagar toda a conversa? Isso não pode ser desfeito.')) return;
    setMsgs([]);
    try { await api.del('/extras/amigo/historico'); } catch {}
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 780, margin: '0 auto', padding: '18px 16px' }}>
      {/* Header */}
      <div style={{ borderRadius: 18, padding: '18px 22px', marginBottom: 14, color: '#fff', position: 'relative', overflow: 'hidden', flexShrink: 0,
        background: 'linear-gradient(135deg,#be185d 0%,#9d174d 55%,#831843 130%)', boxShadow: '0 10px 30px rgba(157,23,77,.3)' }}>
        <div style={{ position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,.1)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 20, fontWeight: 800 }}><Heart size={22} fill="#fff" /> Meu Amigo</div>
            <div style={{ fontSize: 12.5, opacity: .95, marginTop: 4 }}>Um cantinho pra você respirar, desabafar e receber um conselho. 💚</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {ehMaster && modo === 'chat' && (
              <button onClick={abrirEquipe} title="Ver conversas da equipe" style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 9, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
                <Users size={13} /> Equipe
              </button>
            )}
            {modo === 'chat' && msgs.length > 0 && (
              <button onClick={limpar} title="Apagar conversa" style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 9, padding: '7px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
                <Trash2 size={13} /> Limpar
              </button>
            )}
            {modo !== 'chat' && (
              <button onClick={() => { setModo('chat'); setVendo(null); }} style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 9, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
                <ChevronLeft size={13} /> Voltar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MASTER: lista da equipe */}
      {modo === 'lista' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>Acompanhe com carinho quem desabafou. As conversas são sensíveis — use pra cuidar da equipe.</div>
          {equipe.length === 0 ? (
            <div className="card" style={{ padding: 34, textAlign: 'center', color: 'var(--muted)' }}>Ninguém usou o Meu Amigo ainda.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {equipe.map(u => (
                <div key={u.usuario_id} onClick={() => verConversa(u)} className="card" style={{ padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: u.cor || 'linear-gradient(135deg,#be185d,#ec4899)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, overflow: 'hidden' }}>
                    {u.avatar ? <img src={u.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : inic(u.nome)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{u.nome || 'Usuário'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{u.setor || '—'} · {u.total} mensagem(ns) · última {u.ultima ? new Date(u.ultima).toLocaleDateString('pt-BR') : '—'}</div>
                  </div>
                  <Eye size={16} color="var(--muted)" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MASTER: conversa de um liderado (só leitura) */}
      {modo === 'ver' && vendo && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 2px' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--txt)' }}>{vendo.usuario?.nome || 'Conversa'} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>({vendo.usuario?.setor || '—'})</span></div>
          {(vendo.mensagens || []).map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '78%', padding: '10px 14px', borderRadius: 16, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? 'var(--tq)' : 'var(--card)', color: m.role === 'user' ? '#fff' : 'var(--txt)', border: m.role === 'user' ? 'none' : '1px solid var(--border)' }}>
                {m.content}
              </div>
            </div>
          ))}
          {!(vendo.mensagens || []).length && <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Sem mensagens.</div>}
        </div>
      )}

      {modo === 'chat' && (<>

      {/* Conversa */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 2px' }}>
        {carregando ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Carregando…</div>
        ) : msgs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--muted)' }}>
            <div style={{ width: 66, height: 66, borderRadius: '50%', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#be185d,#ec4899)', boxShadow: '0 8px 24px rgba(190,24,93,.3)' }}>
              <Heart size={30} color="#fff" fill="#fff" />
            </div>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--txt)' }}>Oi, {primeiro}. 💛</div>
            <div style={{ fontSize: 15, marginTop: 8, maxWidth: 420, marginInline: 'auto', lineHeight: 1.5, fontWeight: 700, color: 'var(--txt2)' }}>
              Diga: qual conselho você precisa hoje?
            </div>
          </div>
        ) : (
          msgs.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.role === 'assistant' && (
                <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#be185d,#ec4899)', alignSelf: 'flex-end' }}>
                  <Heart size={15} color="#fff" fill="#fff" />
                </div>
              )}
              <div style={{ maxWidth: '78%', padding: '11px 15px', borderRadius: 16, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? 'var(--tq)' : 'var(--card)', color: m.role === 'user' ? '#fff' : 'var(--txt)',
                border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                borderBottomRightRadius: m.role === 'user' ? 4 : 16, borderBottomLeftRadius: m.role === 'user' ? 16 : 4,
                boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
                {m.content}
              </div>
            </div>
          ))
        )}
        {enviando && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13, paddingLeft: 4 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#be185d,#ec4899)' }}><Heart size={15} color="#fff" fill="#fff" /></div>
            <span className="spin" style={{ width: 14, height: 14, borderColor: 'rgba(190,24,93,.2)', borderTopColor: '#be185d' }} /> pensando com carinho…
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 12, flexShrink: 0 }}>
        <textarea ref={inputRef} value={texto} onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          rows={1} placeholder="Diga: qual conselho você precisa hoje?"
          style={{ flex: 1, resize: 'none', maxHeight: 120, padding: '12px 15px', borderRadius: 14, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)', fontSize: 14, fontFamily: 'inherit' }} />
        <button onClick={() => enviar()} disabled={enviando || !texto.trim()} className="btn btn-p" style={{ borderRadius: 14, height: 46, width: 46, padding: 0, justifyContent: 'center', opacity: !texto.trim() ? .5 : 1 }}>
          <Send size={17} />
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--light)', textAlign: 'center', marginTop: 7 }}>
        <Sparkles size={10} style={{ verticalAlign: -1 }} /> Seu amigo virtual é um apoio, não substitui ajuda profissional. Em crise, ligue <b>188 (CVV)</b>.
      </div>
      </>)}
    </div>
  );
}
