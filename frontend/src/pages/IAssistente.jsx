import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

/* ─── IA Assistente — chat livre (sem precisar abrir uma conversa) ──────────
   Mesmo motor GPT do Copiloto; pra análise vinculada a um cliente, use o
   Copiloto dentro do Chat (lá vai foto, PDF, áudio e geração de imagem).   */

const SUGESTOES = [
  'Monte um orçamento para vacinas de 2 meses',
  'Cliente achou caro o plano 0–18m. O que responder?',
  'Escreva uma mensagem de pós-vacinal carinhosa',
  'Como recuperar um cliente que parou de responder?',
];

export default function IAssistente() {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, loading]);

  const enviar = async (texto) => {
    const t = (texto ?? input).trim();
    if (!t || loading) return;
    const historico = msgs.map(m => ({ role: m.role, content: m.content }));
    setMsgs(p => [...p, { role: 'user', content: t }]);
    setInput(''); setLoading(true);
    try {
      const BASE = import.meta.env.VITE_API_URL || '';
      const tk = localStorage.getItem('vh_token') || '';
      const r = await fetch(`${BASE}/api/inbox/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ history: historico, message: t }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setMsgs(p => [...p, { role: 'assistant', content: d.texto }]);
    } catch (e) {
      setMsgs(p => [...p, { role: 'assistant', content: `Não consegui responder: ${e.message}` }]);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ padding: 28, height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 27, fontWeight: 800 }}>🤖 IA Assistente</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>Orçamentos, objeções, mensagens humanizadas e estratégia — pergunte qualquer coisa</p>
      </div>

      <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {msgs.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 480 }}>
              <Sparkles size={30} color="var(--tq)" style={{ marginBottom: 10 }} />
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Como posso ajudar, {(user?.nome || '').split(' ')[0]}?</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 16 }}>Pra analisar um cliente específico (com foto, PDF e áudio), use o Copiloto dentro do 💬 Chat.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {SUGESTOES.map(sg => (
                  <button key={sg} onClick={() => enviar(sg)}
                    style={{ padding: '9px 14px', borderRadius: 11, border: '1.5px solid var(--tq3)', background: 'var(--tq4)', color: 'var(--tq2)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
                    {sg}
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '78%',
              padding: '10px 14px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap',
              background: m.role === 'user' ? 'linear-gradient(135deg,var(--tq),#0aa6ae)' : 'var(--bg2)',
              color: m.role === 'user' ? '#fff' : 'var(--txt)' }}>
              {m.content}
            </div>
          ))}
          {loading && <div style={{ alignSelf: 'flex-start', padding: '10px 14px' }}><Loader2 size={16} className="spin" color="var(--tq)" /></div>}
          <div ref={endRef} />
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <input value={input} maxLength={2000} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            placeholder="Pergunte à IA… (Enter envia)"
            style={{ flex: 1, padding: '10px 14px', borderRadius: 12, border: '1.5px solid var(--border)', fontSize: 13, outline: 'none', background: 'var(--bg)', color: 'var(--txt)' }} />
          <button onClick={() => enviar()} disabled={loading || !input.trim()} className="btn btn-p" style={{ opacity: loading || !input.trim() ? .5 : 1 }}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
