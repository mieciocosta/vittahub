import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, MessageSquare, Sparkles, Send, Clock, RefreshCw, X, Check } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* RECUPERAÇÃO DE LEADS — clientes que esfriaram (mandou orçamento e sumiu).
   Follow-up assistido por IA em 1 clique: gera a mensagem, você revisa e envia. */

export default function Recuperacao() {
  const api = useApi();
  const nav = useNavigate();
  const { user } = useAuth();
  const [dias, setDias] = useState(2);
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [rascunho, setRascunho] = useState({}); // convId -> texto do follow-up
  const [gerando, setGerando] = useState(null);
  const [enviando, setEnviando] = useState(null);
  const [aberto, setAberto] = useState(null); // convId com o compositor aberto

  const load = () => {
    setCarregando(true);
    api.get(`/inbox/recuperacao?dias=${dias}`).then(d => setLista(Array.isArray(d) ? d : [])).catch(() => setLista([])).finally(() => setCarregando(false));
  };
  useEffect(() => { load(); }, [dias]); // eslint-disable-line

  const gerar = async (c) => {
    setGerando(c.id);
    try {
      const d = await api.post(`/inbox/conversations/${c.id}/sugerir-resposta`, {});
      setRascunho(p => ({ ...p, [c.id]: d.mensagem || '' }));
      setAberto(c.id);
    } catch (e) { window.alert(e.message || 'Não consegui gerar.'); }
    setGerando(null);
  };
  const enviar = async (c) => {
    const txt = (rascunho[c.id] || '').trim();
    if (!txt) return;
    setEnviando(c.id);
    try {
      await api.post(`/inbox/conversations/${c.id}/send`, { content: txt });
      setLista(p => p.filter(x => x.id !== c.id));
      setAberto(null);
    } catch (e) { window.alert(e.message || 'Falha ao enviar.'); }
    setEnviando(null);
  };

  const SETOR_COR = { vacinas: '#7c5cbf', consultas: '#00B8C0', terapias: '#C4973B' };
  const esperando = lista.filter(c => c.esperando).length;

  return (
    <div style={{ padding: 28, maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ borderRadius: 18, padding: '22px 26px', marginBottom: 18, color: '#fff', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg,#7c2d12 0%,#c2410c 55%,#f59e0b 130%)', boxShadow: '0 10px 30px rgba(194,65,12,.3)' }}>
        <div style={{ position: 'absolute', right: -25, top: -25, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,.1)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 23, fontWeight: 800 }}><Flame size={24} /> Recuperação de leads</div>
        <div style={{ fontSize: 13.5, opacity: .95, marginTop: 6, maxWidth: 620, lineHeight: 1.5 }}>
          Clientes que esfriaram — mandou orçamento, tirou dúvida e sumiu. Um follow-up gentil recupera muita venda que já estava quase fechada. 🔥
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Pra retomar</div><div style={{ fontSize: 22, fontWeight: 900 }}>{lista.length}</div></div>
          <div><div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8 }}>Esperando você</div><div style={{ fontSize: 22, fontWeight: 900, color: '#fde68a' }}>{esperando}</div></div>
        </div>
      </div>

      {/* Filtro de dias */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 700 }}>Sem resposta há:</span>
        {[2, 3, 5, 7].map(d => (
          <button key={d} onClick={() => setDias(d)} className="btn btn-sm" style={{ fontWeight: 700,
            background: dias === d ? '#c2410c' : 'var(--card)', color: dias === d ? '#fff' : 'var(--txt2)', border: dias === d ? 'none' : '1.5px solid var(--border)' }}>
            {d}+ dias
          </button>
        ))}
        <button onClick={load} className="btn btn-s btn-sm" style={{ gap: 5, marginLeft: 'auto' }}><RefreshCw size={13} /> Atualizar</button>
      </div>

      {carregando ? (
        <div style={{ color: 'var(--muted)', padding: 30 }}>Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="card" style={{ padding: 44, textAlign: 'center', color: 'var(--muted)' }}>
          <Flame size={34} color="var(--border)" style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 700 }}>Nenhum lead parado nesse período. 🎉</div>
          <div style={{ fontSize: 12.5, marginTop: 4 }}>Seu funil está em dia — ninguém esfriando sem retorno.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lista.map(c => {
            const cor = SETOR_COR[c.setor] || '#0E8C96';
            return (
              <div key={c.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: 5, background: c.esperando ? '#dc2626' : cor, flexShrink: 0 }} />
                <div style={{ flex: 1, padding: '13px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 14.5 }}>{c.contact_name || c.phone || 'Cliente'}</span>
                    {c.setor && <span style={{ fontSize: 10, fontWeight: 800, color: cor, background: cor + '18', borderRadius: 20, padding: '2px 8px' }}>{c.setor}</span>}
                    {c.esperando
                      ? <span style={{ fontSize: 10, fontWeight: 800, color: '#dc2626', background: '#fdecec', borderRadius: 20, padding: '2px 8px' }}>⏳ esperando você</span>
                      : <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', background: 'var(--bg2)', borderRadius: 20, padding: '2px 8px' }}>você falou por último</span>}
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={11} /> {c.dias_silencio} dia{c.dias_silencio === 1 ? '' : 's'}</span>
                  </div>
                  {c.last_message && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{c.last_message}”</div>}

                  {aberto === c.id ? (
                    <div style={{ marginTop: 10 }}>
                      <textarea value={rascunho[c.id] || ''} onChange={e => setRascunho(p => ({ ...p, [c.id]: e.target.value }))}
                        rows={3} placeholder="Escreva o follow-up…" style={{ width: '100%', padding: '9px 11px', borderRadius: 10, border: '1.5px solid var(--tq)', background: 'var(--card)', color: 'var(--txt)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <button onClick={() => enviar(c)} disabled={enviando === c.id || !(rascunho[c.id] || '').trim()} className="btn btn-p btn-sm" style={{ gap: 5 }}><Send size={13} /> {enviando === c.id ? 'Enviando…' : 'Enviar follow-up'}</button>
                        <button onClick={() => gerar(c)} disabled={gerando === c.id} className="btn btn-sm" style={{ gap: 5, background: '#f2ecfe', color: '#7c3aed', border: 'none', fontWeight: 700 }}><Sparkles size={13} /> {gerando === c.id ? '…' : 'Regerar'}</button>
                        <button onClick={() => setAberto(null)} className="btn btn-s btn-sm">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
                      <button onClick={() => gerar(c)} disabled={gerando === c.id} className="btn btn-p btn-sm" style={{ gap: 5, background: '#e11d48', border: 'none' }}>
                        {gerando === c.id ? <RefreshCw size={13} className="spin" /> : <Sparkles size={13} />} {gerando === c.id ? 'Gerando…' : 'Follow-up com IA'}
                      </button>
                      <button onClick={() => nav(`/inbox?conv=${c.id}`)} className="btn btn-s btn-sm" style={{ gap: 5 }}><MessageSquare size={13} /> Abrir conversa</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
