import React, { useEffect, useState } from 'react';

/* 🔗 AGENDAMENTO PÚBLICO — página SEM login, pra colocar no Instagram e no
   status do WhatsApp. A mãe escolhe serviço, dia e horário e o pedido cai
   direto na Agenda do CRM + vira lead. Nenhum dado de cliente é exibido. */

const BASE = import.meta.env.VITE_API_URL || '';
const SETORES = [
  { k: 'vacinas', emoji: '💉', label: 'Vacinação', cor: '#7c5cbf' },
  { k: 'consultas', emoji: '🩺', label: 'Consulta', cor: '#00B8C0' },
  { k: 'terapias', emoji: '🧩', label: 'Terapia', cor: '#C4973B' },
];
const WHATS = '5598984221002';

const maskTel = (v) => {
  const n = String(v || '').replace(/\D/g, '').slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
};
const amanhaISO = () => new Date(Date.now() - 3 * 3600 * 1000 + 86400000).toISOString().slice(0, 10);
const maxISO = () => new Date(Date.now() - 3 * 3600 * 1000 + 60 * 86400000).toISOString().slice(0, 10);
const fmtLongo = (d) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

export default function AgendarPublico() {
  const [setor, setSetor] = useState('vacinas');
  const [data, setData] = useState(amanhaISO());
  const [hora, setHora] = useState('');
  const [horarios, setHorarios] = useState(null);
  const [aviso, setAviso] = useState('');
  const [form, setForm] = useState({ paciente: '', responsavel: '', telefone: '', observacoes: '' });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(null);

  useEffect(() => {
    setHora(''); setHorarios(null); setAviso('');
    if (!data) return;
    fetch(`${BASE}/api/publico/horarios?data=${data}&setor=${setor}`)
      .then(r => r.json())
      .then(d => { setHorarios(d.horarios || []); setAviso(d.aviso || ''); })
      .catch(() => { setHorarios([]); setAviso('Não consegui carregar os horários. Tente de novo.'); });
  }, [data, setor]);

  const enviar = async () => {
    setErro('');
    const tel = form.telefone.replace(/\D/g, '');
    if (form.paciente.trim().length < 2) return setErro('Escreva o nome de quem vai ser atendido 💙');
    if (tel.length < 10) return setErro('Informe seu WhatsApp com DDD.');
    if (!hora) return setErro('Escolha um horário.');
    setEnviando(true);
    try {
      const r = await fetch(`${BASE}/api/publico/agendar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, telefone: tel, setor, data, hora }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Não foi possível agendar.');
      setPronto({ ...d, paciente: form.paciente });
    } catch (e) { setErro(e.message); }
    setEnviando(false);
  };

  const cor = SETORES.find(s => s.k === setor)?.cor || '#0E8C96';
  const campo = { width: '100%', padding: '11px 13px', borderRadius: 12, border: '1.5px solid #dfe6ee', fontSize: 14.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff', color: '#0f172a' };
  const rotulo = { display: 'block', fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 5, letterSpacing: .2 };

  if (pronto) return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0E8C96,#00B8C0 60%,#7dd3d8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: '38px 30px', maxWidth: 430, width: '100%', textAlign: 'center', boxShadow: '0 24px 60px rgba(3,43,48,.3)' }}>
        <div style={{ fontSize: 54, lineHeight: 1 }}>💙</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '14px 0 6px', color: '#0f172a' }}>Recebemos seu pedido!</h1>
        <p style={{ fontSize: 14.5, color: '#475569', lineHeight: 1.6, margin: 0 }}>
          Já está tudo anotado com muito carinho para <b>{pronto.paciente}</b>:
        </p>
        <div style={{ margin: '18px 0', padding: '14px 16px', background: '#f0fdfa', border: '1px solid #99e6e9', borderRadius: 14, fontSize: 15, fontWeight: 700, color: '#0E8C96', lineHeight: 1.7 }}>
          {pronto.setor}<br />🗓️ {fmtLongo(pronto.data)}<br />⏰ {pronto.hora}
        </div>
        <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
          Nossa equipe vai confirmar com você pelo WhatsApp em breve. Qualquer coisa, é só chamar! 🥰
        </p>
        <a href={`https://wa.me/${WHATS}`} target="_blank" rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '12px 22px', borderRadius: 30, background: '#25D366', color: '#fff', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
          💬 Falar no WhatsApp
        </a>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0E8C96,#00B8C0 55%,#e8f7f8 55%)', padding: '26px 16px 40px', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* Cabeçalho */}
        <div style={{ textAlign: 'center', color: '#fff', marginBottom: 20 }}>
          <img src="/logos/logo-v-white.png" alt="Vittalis Saúde" style={{ height: 74, objectFit: 'contain' }} />
          <h1 style={{ fontSize: 21, fontWeight: 800, margin: '10px 0 4px' }}>Agende online 💙</h1>
          <p style={{ fontSize: 13.5, opacity: .95, margin: 0 }}>Escolha o melhor dia e horário para a sua família</p>
        </div>

        <div style={{ background: '#fff', borderRadius: 22, padding: '22px 20px', boxShadow: '0 18px 50px rgba(3,43,48,.22)' }}>
          {/* Serviço */}
          <label style={rotulo}>O QUE VOCÊ PRECISA?</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {SETORES.map(s => (
              <button key={s.k} onClick={() => setSetor(s.k)}
                style={{ flex: 1, padding: '13px 4px', borderRadius: 14, cursor: 'pointer', fontWeight: 800, fontSize: 12.5,
                  border: `2px solid ${setor === s.k ? s.cor : '#e6edf3'}`,
                  background: setor === s.k ? `${s.cor}14` : '#fff', color: setor === s.k ? s.cor : '#64748b',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all .15s' }}>
                <span style={{ fontSize: 21 }}>{s.emoji}</span>{s.label}
              </button>
            ))}
          </div>

          {/* Data */}
          <label style={rotulo}>QUAL DIA?</label>
          <input type="date" value={data} min={amanhaISO()} max={maxISO()} onChange={e => setData(e.target.value)} style={{ ...campo, marginBottom: 6 }} />
          {data && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14, textTransform: 'capitalize' }}>{fmtLongo(data)}</div>}

          {/* Horários */}
          <label style={rotulo}>HORÁRIOS LIVRES</label>
          {horarios === null ? (
            <div style={{ fontSize: 13, color: '#94a3b8', padding: '10px 0' }}>Buscando horários…</div>
          ) : aviso ? (
            <div style={{ fontSize: 13, color: '#b45309', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '10px 13px' }}>{aviso}</div>
          ) : horarios.length === 0 ? (
            <div style={{ fontSize: 13, color: '#b45309', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '10px 13px' }}>
              Esse dia já está cheio 😅 Escolha outra data — ou fale com a gente no WhatsApp que damos um jeitinho!
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(76px,1fr))', gap: 8, marginBottom: 18 }}>
              {horarios.map(h => (
                <button key={h} onClick={() => setHora(h)}
                  style={{ padding: '11px 0', borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 14,
                    border: `2px solid ${hora === h ? cor : '#e6edf3'}`,
                    background: hora === h ? cor : '#fff', color: hora === h ? '#fff' : '#334155', transition: 'all .12s' }}>
                  {h}
                </button>
              ))}
            </div>
          )}

          {/* Dados */}
          <label style={rotulo}>NOME DE QUEM VAI SER ATENDIDO</label>
          <input value={form.paciente} maxLength={80} onChange={e => setForm({ ...form, paciente: e.target.value })} placeholder="Ex.: João Pedro" style={{ ...campo, marginBottom: 14 }} />

          <label style={rotulo}>SEU NOME (RESPONSÁVEL)</label>
          <input value={form.responsavel} maxLength={80} onChange={e => setForm({ ...form, responsavel: e.target.value })} placeholder="Ex.: Maria Silva" style={{ ...campo, marginBottom: 14 }} />

          <label style={rotulo}>SEU WHATSAPP</label>
          <input value={form.telefone} inputMode="numeric" onChange={e => setForm({ ...form, telefone: maskTel(e.target.value) })} placeholder="(98) 98422-1002" style={{ ...campo, marginBottom: 14 }} />

          <label style={rotulo}>QUER NOS CONTAR ALGO? (OPCIONAL)</label>
          <input value={form.observacoes} maxLength={300} onChange={e => setForm({ ...form, observacoes: e.target.value })} placeholder="Ex.: vacina de 3 meses, atendimento em casa…" style={{ ...campo, marginBottom: 16 }} />

          {erro && <div style={{ marginBottom: 12, padding: '10px 13px', borderRadius: 12, background: '#fdecec', color: '#c0392b', fontSize: 13, fontWeight: 600 }}>{erro}</div>}

          <button onClick={enviar} disabled={enviando}
            style={{ width: '100%', padding: '15px 0', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 15.5, fontWeight: 800, color: '#fff',
              background: enviando ? '#94a3b8' : `linear-gradient(135deg, ${cor}, #0E8C96)`, boxShadow: `0 8px 22px ${cor}55` }}>
            {enviando ? 'Enviando…' : '💙 Quero agendar'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
            Prefere falar com uma pessoa?{' '}
            <a href={`https://wa.me/${WHATS}`} target="_blank" rel="noreferrer" style={{ color: '#0E8C96', fontWeight: 800, textDecoration: 'none' }}>Chamar no WhatsApp</a>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11.5, color: '#0f766e', fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase' }}>
          Vittalis Saúde · São Luís/MA
        </div>
      </div>
    </div>
  );
}
