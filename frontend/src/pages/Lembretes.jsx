import React, { useEffect, useState } from 'react';
import { BellRing, Cake, CalendarClock, Gift, Send, MessageCircle } from 'lucide-react';
import { useApi } from '../context/AuthContext.jsx';

/* Central de Lembretes — reforço pelo CRM: Aniversários (leads), Agendamentos
   de amanhã (agenda) e Indicações (vendas da semana). Envia pelo WhatsApp da
   clínica (Z-API) em massa, ou 1 a 1 pelo wa.me com a mensagem pronta. */

const fmtBR = (s) => new Date(String(s).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const wa = (tel, msg) => `https://wa.me/55${String(tel || '').replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;

export default function Lembretes() {
  const api = useApi();
  const [aba, setAba] = useState('aniversarios');
  const [dados, setDados] = useState({ amanha: [], aniversarios: [], indicacoes: [], whatsapp: false });
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [sel, setSel] = useState(new Set());
  const [toast, setToast] = useState(null);
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const amanhaStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const hojeStr = new Date().toISOString().slice(0, 10);

  const load = () => {
    setCarregando(true);
    api.get(`/lembretes/resumo?amanha=${amanhaStr}&hoje=${hojeStr}`)
      .then(d => { setDados(d || {}); setCarregando(false); })
      .catch(() => setCarregando(false));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => { setSel(new Set()); }, [aba]);

  const msgAmanha = (ev) => {
    const serv = ev.servico || (ev.setor === 'terapias' ? 'sessão de terapia' : ev.setor === 'consultas' ? 'consulta' : 'atendimento');
    return `Olá! 💙 Aqui é da Vittalis Saúde. Lembrete: ${serv} de ${ev.paciente} no dia ${fmtBR(ev.data)} às ${ev.hora}${ev.profissional ? `, com ${ev.profissional}` : ''}. Responda SIM para confirmar, ou nos avise se precisar remarcar. Até lá! 😊`;
  };
  const msgNiver = (nome) => `🎂🎉 Parabéns, ${String(nome || '').split(' ')[0]}! A equipe da Vittalis Saúde deseja um aniversário cheio de saúde e alegria! 💙 Conte sempre com a gente. "Sua vida é preciosa!"`;
  const msgInd = (nome) => `Olá! 💙 Aqui é da Vittalis Saúde. Foi um prazer atender ${String(nome || '').split(' ')[0]}! Se você conhece alguém que também precisa de vacinas, consultas ou terapias, adoraríamos receber sua indicação. 😊 É só encaminhar nosso contato: (98) 98422-1002. Obrigado pela confiança!`;

  async function enviar(tipo, ids) {
    if (!ids.length) return;
    setEnviando(true);
    try {
      const j = await api.post('/lembretes/enviar', { tipo, ids });
      showToast(`✓ ${j.enviados} enviado(s)${j.pulados ? ` · ${j.pulados} sem telefone` : ''}${j.falhas ? ` · ⚠ ${j.falhas} falha(s)` : ''}`);
      load();
    } catch (e) { showToast('⚠️ ' + (e.message || 'Erro ao enviar')); }
    setEnviando(false);
  }

  const temTel = (t) => String(t || '').replace(/\D/g, '').length >= 10;
  const amanhaPend = (dados.amanha || []).filter(e => !e.lembrete_enviado_em && temTel(e.telefone));
  const niverHoje = (dados.aniversarios || []).filter(a => a.dias === 0 && temTel(a.telefone));
  const toggleSel = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const ABAS = [
    { k: 'aniversarios', label: 'Aniversários', Icon: Cake, n: (dados.aniversarios || []).length },
    { k: 'amanha', label: 'Amanhã', Icon: CalendarClock, n: (dados.amanha || []).length },
    { k: 'indicacoes', label: 'Indicações', Icon: Gift, n: (dados.indicacoes || []).length },
  ];

  const SETOR_COR = { vacinas: '#7c3aed', consultas: '#0891b2', terapias: '#C4973B' };

  return (
    <div style={{ padding: 28, maxWidth: 980, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{ borderRadius: 18, padding: '22px 26px', marginBottom: 18, color: '#fff', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg,#06424A 0%,#0E8C96 60%,#00B8C0 130%)', boxShadow: '0 10px 30px rgba(6,66,74,.3)' }}>
        <div style={{ position: 'absolute', right: -25, top: -25, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,.1)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 800 }}><BellRing size={22} /> Lembretes</div>
        <div style={{ fontSize: 13.5, opacity: .95, marginTop: 6, maxWidth: 640, lineHeight: 1.5 }}>
          Reforce com o cliente: parabéns de aniversário, lembrete dos agendamentos de amanhã e pedido de indicação — direto pelo WhatsApp da clínica. 💙
        </div>
        {!dados.whatsapp && !carregando && (
          <div style={{ marginTop: 10, display: 'inline-block', background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700 }}>
            ⚠ WhatsApp da clínica desconectado — use os botões verdes (envio 1 a 1)
          </div>
        )}
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {ABAS.map(({ k, label, Icon, n }) => (
          <button key={k} onClick={() => setAba(k)} className="btn btn-sm" style={{ gap: 7, fontWeight: 800, padding: '9px 16px',
            background: aba === k ? 'var(--tq)' : 'var(--card)', color: aba === k ? '#fff' : 'var(--txt2)',
            border: aba === k ? 'none' : '1.5px solid var(--border)' }}>
            <Icon size={15} /> {label} {n > 0 && <span style={{ background: aba === k ? 'rgba(255,255,255,.25)' : 'var(--bg2)', borderRadius: 20, padding: '1px 8px', fontSize: 11 }}>{n}</span>}
          </button>
        ))}
      </div>

      {/* Barra de ação */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
          {aba === 'aniversarios' && <>🎂 Hoje e próximos 7 dias</>}
          {aba === 'amanha' && <>📅 Agendamentos de <b>amanhã ({fmtBR(amanhaStr)})</b> · prontos p/ lembrar: <b>{amanhaPend.length}</b></>}
          {aba === 'indicacoes' && <>🎁 Vendas dos últimos 7 dias — selecione a quem pedir indicação ({sel.size} selecionado{sel.size === 1 ? '' : 's'})</>}
        </div>
        {dados.whatsapp && aba === 'amanha' && (
          <button onClick={() => enviar('amanha', amanhaPend.map(e => e.id))} disabled={enviando || !amanhaPend.length} className="btn btn-p btn-sm" style={{ gap: 6 }}>
            <Send size={13} /> {enviando ? 'Enviando…' : `Enviar todos (${amanhaPend.length})`}
          </button>
        )}
        {dados.whatsapp && aba === 'aniversarios' && (
          <button onClick={() => enviar('aniversarios', niverHoje.map(a => a.id))} disabled={enviando || !niverHoje.length} className="btn btn-p btn-sm" style={{ gap: 6 }}>
            <Cake size={13} /> {enviando ? 'Enviando…' : `Parabenizar os de hoje (${niverHoje.length})`}
          </button>
        )}
        {dados.whatsapp && aba === 'indicacoes' && (
          <button onClick={() => enviar('indicacoes', Array.from(sel))} disabled={enviando || !sel.size} className="btn btn-p btn-sm" style={{ gap: 6 }}>
            <Gift size={13} /> {enviando ? 'Enviando…' : `Pedir indicação (${sel.size})`}
          </button>
        )}
      </div>

      {/* Listas */}
      {carregando ? (
        <div className="card" style={{ padding: 30, color: 'var(--muted)' }}>Carregando…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {aba === 'aniversarios' && ((dados.aniversarios || []).length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              <Cake size={30} color="var(--border)" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 700 }}>Nenhum aniversariante nos próximos 7 dias.</div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>A data de nascimento vem do cadastro do cliente (o bot também capta na conversa).</div>
            </div>
          ) : (dados.aniversarios || []).map(a => (
            <div key={a.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 20 }}>🎂</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{a.nome}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {a.dias === 0 ? <b style={{ color: '#ec4899' }}>🎉 HOJE — faz {a.idade} anos!</b> : `em ${a.dias} dia${a.dias > 1 ? 's' : ''} (${fmtBR(a.data)}) · faz ${a.idade}`}
                </div>
              </div>
              {temTel(a.telefone)
                ? <a href={wa(a.telefone, msgNiver(a.nome))} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ gap: 5, background: '#25D366', color: '#fff', border: 'none', fontWeight: 800 }}><MessageCircle size={13} /> WhatsApp</a>
                : <span style={{ fontSize: 11, color: 'var(--light)', fontWeight: 600 }}>sem telefone</span>}
            </div>
          )))}

          {aba === 'amanha' && ((dados.amanha || []).length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              <CalendarClock size={30} color="var(--border)" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 700 }}>Nenhum agendamento para amanhã.</div>
            </div>
          ) : (dados.amanha || []).map(ev => (
            <div key={ev.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: 5, background: SETOR_COR[ev.setor] || 'var(--tq)', flexShrink: 0 }} />
              <div style={{ padding: '12px 16px', flex: 1, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 900, fontFamily: 'monospace', fontSize: 14, color: 'var(--tq2)', minWidth: 46 }}>{ev.hora}</div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{ev.paciente}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{[ev.servico, ev.profissional, ev.setor].filter(Boolean).join(' · ')}</div>
                </div>
                {ev.lembrete_enviado_em && <span style={{ fontSize: 10.5, fontWeight: 800, color: '#16a34a', background: '#e7f8ef', borderRadius: 20, padding: '3px 9px' }}>✓ lembrete enviado</span>}
                {temTel(ev.telefone)
                  ? <a href={wa(ev.telefone, msgAmanha(ev))} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ gap: 5, background: '#25D366', color: '#fff', border: 'none', fontWeight: 800 }}><MessageCircle size={13} /> WhatsApp</a>
                  : <span style={{ fontSize: 11, color: 'var(--light)', fontWeight: 600 }}>sem telefone</span>}
              </div>
            </div>
          )))}

          {aba === 'indicacoes' && ((dados.indicacoes || []).length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              <Gift size={30} color="var(--border)" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 700 }}>Nenhuma venda nos últimos 7 dias.</div>
            </div>
          ) : (dados.indicacoes || []).map(v => (
            <div key={v.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {dados.whatsapp && (
                <input type="checkbox" checked={sel.has(v.id)} onChange={() => toggleSel(v.id)} disabled={!temTel(v.telefone)} style={{ width: 16, height: 16, accentColor: 'var(--tq)' }} />
              )}
              <span style={{ fontSize: 18 }}>🎁</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{v.nome || 'Cliente'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>compra em {fmtBR(v.data_venda)}{v.setor ? ` · ${v.setor}` : ''}</div>
              </div>
              {temTel(v.telefone)
                ? <a href={wa(v.telefone, msgInd(v.nome))} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ gap: 5, background: '#25D366', color: '#fff', border: 'none', fontWeight: 800 }}><MessageCircle size={13} /> WhatsApp</a>
                : <span style={{ fontSize: 11, color: 'var(--light)', fontWeight: 600 }}>sem telefone</span>}
            </div>
          )))}
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#111827', color: '#fff', padding: '12px 20px', borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,.35)', fontSize: 13.5, fontWeight: 600, zIndex: 1000 }}>{toast}</div>}
    </div>
  );
}
