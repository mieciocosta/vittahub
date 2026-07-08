import React, { useEffect, useState, useRef } from 'react';
import { Heart, Send, Trash2, Lock, Sparkles } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* MEU AMIGO — espaço PRIVADO pra desabafar com uma IA acolhedora. Ninguém mais lê
   (nem o master). A IA escuta, acolhe e dá conselhos com empatia. */

const SUGESTOES = [
  'Tô meio pra baixo hoje…',
  'Tive um dia difícil no trabalho',
  'Preciso de um conselho',
  'Tô ansiosa com as metas',
];

export default function Amigo() {
  const api = useApi();
  const { user } = useAuth();
  const primeiro = (user?.nome || '').split(' ')[0];
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const fimRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.get('/extras/amigo/historico').then(d => setMsgs(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setCarregando(false));
  }, []); // eslint-disable-line
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
            <div style={{ fontSize: 12.5, opacity: .95, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}><Lock size={12} /> Só você lê isso aqui. Desabafe à vontade. 💚</div>
          </div>
          {msgs.length > 0 && (
            <button onClick={limpar} title="Apagar conversa" style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 9, padding: '7px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
              <Trash2 size={13} /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* Conversa */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 2px' }}>
        {carregando ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Carregando…</div>
        ) : msgs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--muted)' }}>
            <div style={{ width: 66, height: 66, borderRadius: '50%', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#be185d,#ec4899)', boxShadow: '0 8px 24px rgba(190,24,93,.3)' }}>
              <Heart size={30} color="#fff" fill="#fff" />
            </div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--txt)' }}>Oi, {primeiro}. Como você tá? 💛</div>
            <div style={{ fontSize: 13, marginTop: 6, maxWidth: 420, marginInline: 'auto', lineHeight: 1.5 }}>
              Esse é o seu cantinho pra respirar. Pode desabafar, pedir um conselho ou só conversar. Tô aqui pra te escutar, sem julgamento.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 18 }}>
              {SUGESTOES.map(s => (
                <button key={s} onClick={() => enviar(s)} className="btn btn-s btn-sm" style={{ borderRadius: 20 }}>{s}</button>
              ))}
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
          rows={1} placeholder="Escreve aqui o que tá sentindo…"
          style={{ flex: 1, resize: 'none', maxHeight: 120, padding: '12px 15px', borderRadius: 14, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)', fontSize: 14, fontFamily: 'inherit' }} />
        <button onClick={() => enviar()} disabled={enviando || !texto.trim()} className="btn btn-p" style={{ borderRadius: 14, height: 46, width: 46, padding: 0, justifyContent: 'center', opacity: !texto.trim() ? .5 : 1 }}>
          <Send size={17} />
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--light)', textAlign: 'center', marginTop: 7 }}>
        <Sparkles size={10} style={{ verticalAlign: -1 }} /> Seu amigo virtual é um apoio, não substitui ajuda profissional. Em crise, ligue <b>188 (CVV)</b>.
      </div>
    </div>
  );
}
