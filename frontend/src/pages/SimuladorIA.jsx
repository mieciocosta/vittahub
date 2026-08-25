import React, { useEffect, useRef, useState } from 'react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { Toast } from '../hooks/toast.js';

/* 🧪 SIMULADOR DA IA (pedido do master, 24/08: "o meu intuito é avaliar").
   Aqui ele escreve como se fosse o cliente e vê a resposta REAL da IA: mesmo
   cérebro, mesmas regras, mesmas ferramentas. Nada sai pro WhatsApp, a conversa
   não aparece na lista do time e o pré-agendamento não entra na agenda de
   verdade — dá pra treinar e avaliar à vontade, sem risco nenhum. */

const SETORES = [
  ['consultas', '🩺 Consultas'],
  ['terapias', '🧩 Terapias'],
  ['vacinas', '💉 Vacinas'],
];

// Sugestões de cliente difícil, pra avaliar o que realmente importa
const ROTEIROS = [
  ['Preço de cara', 'Oi, quanto é a consulta com pediatra?'],
  ['Queixa de fala', 'Meu filho tem 3 anos e quase não fala, a pediatra mandou procurar fono. Quanto é?'],
  ['Tem convênio', 'Vocês atendem Unimed?'],
  ['Achou caro', 'Nossa, achei caro. Vou pensar.'],
  ['Vou ver com o marido', 'Vou conversar com meu marido e te falo depois.'],
  ['Clínica ou casa', 'Vocês atendem em casa ou só na clínica?'],
  ['Quer agendar', 'Quero agendar sim, pode ser quinta de manhã?'],
];

export default function SimuladorIA() {
  const api = useApi();
  const { user } = useAuth();
  const pode = ['master', 'supervisor'].includes(user?.role) || user?.ia_consultas === true;

  const [setor, setSetor] = useState('consultas');
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState(null);
  const fimRef = useRef(null);

  const carregar = (st = setor) => api.get(`/inbox/simulador?setor=${st}`)
    .then(d => setMsgs(Array.isArray(d?.mensagens) ? d.mensagens : []))
    .catch(e => Toast.show(e.message, 'error'));

  useEffect(() => { if (pode) carregar(); }, []); // eslint-disable-line
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  if (!pode) return <div style={{ padding: 40, color: 'var(--muted)' }}>🔒 O simulador é da gestão e de quem tem o botão da IA.</div>;

  const trocarSetor = async (st) => {
    setSetor(st);
    await api.post('/inbox/simulador/reiniciar', { setor: st }).catch(() => {});
    setMsgs([]); setMs(null);
  };

  const reiniciar = async () => {
    await api.post('/inbox/simulador/reiniciar', { setor }).catch(e => Toast.show(e.message, 'error'));
    setMsgs([]); setMs(null);
    Toast.show('Simulação reiniciada 🧪', 'success');
  };

  const enviar = async (texto) => {
    const t = String(texto ?? txt).trim();
    if (!t || busy) return;
    setTxt(''); setBusy(true); setMs(null);
    // Mostra logo a fala do cliente, a resposta vem do servidor
    setMsgs(m => [...m, { id: `tmp-${Date.now()}`, from_type: 'contact', content: t, created_at: new Date().toISOString() }]);
    try {
      const d = await api.post('/inbox/simulador/mensagem', { texto: t, setor });
      setMs(d?.ms || null);
      await carregar();
      if (!d?.respostas?.length) Toast.show('A IA não respondeu desta vez. Veja se a chave da IA está ligada.', 'info');
    } catch (e) { Toast.show(e.message, 'error'); }
    setBusy(false);
  };

  const balao = (m) => {
    const eu = m.from_type === 'contact';                 // aqui o "cliente" é o avaliador
    const cor = eu ? 'var(--tq3,#e6fffb)' : 'var(--card)';
    return (
      <div key={m.id} style={{ display: 'flex', justifyContent: eu ? 'flex-end' : 'flex-start', marginBottom: 9 }}>
        <div style={{ maxWidth: '78%', padding: '10px 13px', borderRadius: 14, background: cor,
          border: '1px solid var(--border)', borderBottomRightRadius: eu ? 4 : 14, borderBottomLeftRadius: eu ? 14 : 4 }}>
          {!eu && m.sender_nome && (
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--tq2)', marginBottom: 3 }}>{m.sender_nome}</div>
          )}
          <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {m.type === 'document' ? `📎 ${m.content || 'Documento'}` : m.type === 'image' ? '📸 Foto enviada' : m.content}
          </div>
          <div style={{ fontSize: 9.5, color: 'var(--muted)', marginTop: 4, textAlign: 'right' }}>
            {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '18px 20px 24px', maxWidth: 880, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>🧪 Simulador da IA</h1>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#8a6417', background: '#fdf6e7', border: '1px solid #C4973B', borderRadius: 99, padding: '3px 10px' }}>
          nada aqui vai pro WhatsApp
        </span>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.55, marginTop: 6 }}>
        Escreva como se fosse o cliente e veja a resposta de verdade da IA, com o mesmo treinamento das conversas reais.
        Serve pra avaliar o atendimento dela sem gastar nenhuma mensagem com cliente, e o pré-agendamento que ela fizer aqui não entra na agenda.
      </p>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '12px 0' }}>
        {SETORES.map(([v, l]) => (
          <button key={v} onClick={() => trocarSetor(v)}
            style={{ padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 800, cursor: 'pointer',
              border: `1.5px solid ${setor === v ? 'var(--tq)' : 'var(--border)'}`,
              background: setor === v ? 'var(--tq3)' : 'var(--card)', color: setor === v ? 'var(--tq2)' : 'var(--muted)' }}>{l}</button>
        ))}
        <button onClick={reiniciar}
          style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 800, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--muted)' }}>🔄 Começar do zero</button>
      </div>

      <div className="card" style={{ padding: 14, minHeight: 320, maxHeight: '52vh', overflowY: 'auto', background: 'var(--bg2)' }}>
        {!msgs.length && (
          <div style={{ color: 'var(--muted)', fontSize: 12.5, textAlign: 'center', padding: '40px 10px', lineHeight: 1.6 }}>
            Comece escrevendo a primeira mensagem do cliente 💙<br />
            <span style={{ fontSize: 11.5 }}>Se quiser, use um dos roteiros prontos aqui embaixo.</span>
          </div>
        )}
        {msgs.map(balao)}
        {busy && <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', padding: '4px 2px' }}>a IA está digitando…</div>}
        <div ref={fimRef} />
      </div>

      {ms != null && (
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 5 }}>Respondeu em {(ms / 1000).toFixed(1)}s</div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0 8px' }}>
        {ROTEIROS.map(([rot, frase]) => (
          <button key={rot} onClick={() => enviar(frase)} disabled={busy} title={frase}
            style={{ padding: '5px 11px', borderRadius: 9, fontSize: 11, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
              border: '1px dashed var(--border)', background: 'var(--card)', color: 'var(--txt2)', opacity: busy ? .5 : 1 }}>{rot}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea value={txt} onChange={e => setTxt(e.target.value)} rows={2}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          placeholder="Escreva aqui como se fosse o cliente…"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 11, border: '1.5px solid var(--border)', fontSize: 13,
            background: 'var(--card)', color: 'var(--txt)', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
        <button onClick={() => enviar()} disabled={busy || !txt.trim()} className="btn btn-p"
          style={{ fontWeight: 800, opacity: (busy || !txt.trim()) ? .5 : 1, whiteSpace: 'nowrap' }}>
          {busy ? '…' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
