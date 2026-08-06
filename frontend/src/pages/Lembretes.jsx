import React, { useEffect, useState } from 'react';
import { BellRing, Cake, CalendarClock, Gift, Send, MessageCircle, StickyNote, Trash2, X, Syringe } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* Central de Lembretes — reforço pelo CRM: Aniversários (leads), Agendamentos
   de amanhã (agenda) e Indicações (vendas da semana). Envia pelo WhatsApp da
   clínica (Z-API) em massa, ou 1 a 1 pelo wa.me com a mensagem pronta. */

const fmtBR = (s) => new Date(String(s).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const wa = (tel, msg) => `https://wa.me/55${String(tel || '').replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;

export default function Lembretes() {
  const api = useApi();
  const { user } = useAuth();
  const [aba, setAba] = useState('aniversarios');
  const [dados, setDados] = useState({ amanha: [], aniversarios: [], indicacoes: [], whatsapp: false });
  const [cal, setCal] = useState(null);        // 💉 calendário vacinal da base
  const [selCal, setSelCal] = useState(new Set());
  const [editCal, setEditCal] = useState(null);   // ✏️ ajuste do calendário (gestão)
  const gestaoU = ['master', 'supervisor'].includes(user?.role);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [sel, setSel] = useState(new Set());
  const [toast, setToast] = useState(null);
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  // Envio livre (pra quem ela quiser)
  const [dest, setDest] = useState(null);
  const [buscaQ, setBuscaQ] = useState('');
  const [buscaRes, setBuscaRes] = useState([]);
  const [telLivre, setTelLivre] = useState('');
  const [msgLivre, setMsgLivre] = useState('');
  // Lembretes pessoais (dela)
  const [meus, setMeus] = useState([]);
  const [novoMeu, setNovoMeu] = useState('');
  // Piloto automático (gestão)
  const gestao = ['master', 'supervisor'].includes(user?.role);
  const [autoCfg, setAutoCfg] = useState(null);
  const [salvandoAuto, setSalvandoAuto] = useState(false);

  const amanhaStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const hojeStr = new Date().toISOString().slice(0, 10);

  const load = () => {
    setCarregando(true);
    api.get(`/lembretes/resumo?amanha=${amanhaStr}&hoje=${hojeStr}`)
      .then(d => { setDados(d || {}); setCarregando(false); })
      .catch(() => setCarregando(false));
  };
  const loadCal = () => api.get('/lembretes/calendario-vacinal').then(setCal).catch(() => setCal({ total: 0, lista: [] }));
  useEffect(() => { load(); loadMeus(); loadCal(); api.get('/lembretes/auto').then(setAutoCfg).catch(() => {}); }, []); // eslint-disable-line
  async function salvarAuto(patch) {
    setSalvandoAuto(true);
    try { const novo = await api.put('/lembretes/auto', { ...autoCfg, ...patch }); setAutoCfg(novo); showToast(novo.ativo ? '🤖 Piloto automático LIGADO' : 'Piloto automático desligado'); }
    catch (e) { showToast('⚠️ ' + (e.message || 'Erro')); }
    setSalvandoAuto(false);
  }
  useEffect(() => { setSel(new Set()); setSelCal(new Set()); }, [aba]);
  const loadMeus = () => api.get('/extras/painel').then(d => setMeus((Array.isArray(d) ? d : []).filter(i => i.tipo === 'tarefa'))).catch(() => {});
  useEffect(() => {
    if (buscaQ.trim().length < 2) { setBuscaRes([]); return; }
    const t = setTimeout(() => api.get(`/lembretes/busca?q=${encodeURIComponent(buscaQ)}`).then(d => setBuscaRes(d.itens || [])).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [buscaQ]); // eslint-disable-line

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
    { k: 'calendario', label: 'Calendário vacinal', Icon: Syringe, n: cal?.total || 0 },
    { k: 'aniversarios', label: 'Aniversários', Icon: Cake, n: (dados.aniversarios || []).length },
    { k: 'amanha', label: 'Amanhã', Icon: CalendarClock, n: (dados.amanha || []).length },
    { k: 'indicacoes', label: 'Indicações', Icon: Gift, n: (dados.indicacoes || []).length },
    { k: 'enviar', label: 'Mensagem', Icon: Send, n: 0 },
    { k: 'meus', label: 'Meus lembretes', Icon: StickyNote, n: meus.filter(m => !m.concluido).length },
  ];

  const telFinal = String(dest?.telefone || telLivre || '').replace(/\D/g, '');
  async function enviarLivre() {
    if (telFinal.length < 10 || !msgLivre.trim()) return;
    const quem = dest?.nome || `+55 ${telFinal}`;
    if (!window.confirm(`Enviar agora para ${quem} pelo WhatsApp da clínica?`)) return;
    setEnviando(true);
    try {
      await api.post('/lembretes/livre', { telefone: telFinal, mensagem: msgLivre.trim() });
      showToast(`✓ Mensagem enviada pra ${quem} 💙`);
      setMsgLivre(''); setDest(null); setBuscaQ(''); setTelLivre('');
    } catch (e) { showToast('⚠️ ' + (e.message || 'Falha no envio')); }
    setEnviando(false);
  }
  async function addMeu() {
    const t = novoMeu.trim();
    if (!t) return;
    try { await api.post('/extras/painel', { tipo: 'tarefa', titulo: t }); setNovoMeu(''); loadMeus(); }
    catch (e) { showToast('⚠️ ' + (e.message || 'Erro')); }
  }

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

      {/* Piloto automático (gestão) */}
      {gestao && autoCfg && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          border: autoCfg.ativo ? '1.5px solid var(--tq)' : '1.5px solid var(--border)', background: autoCfg.ativo ? 'var(--tq4)' : 'var(--card)' }}>
          <button onClick={() => salvarAuto({ ativo: !autoCfg.ativo })} disabled={salvandoAuto || !dados.whatsapp}
            title={dados.whatsapp ? '' : 'Conecte o WhatsApp (Z-API) para ligar'}
            style={{ width: 52, height: 28, borderRadius: 20, border: 'none', cursor: 'pointer', position: 'relative', transition: 'all .2s',
              background: autoCfg.ativo ? 'var(--tq)' : 'var(--bord2)', opacity: dados.whatsapp ? 1 : .5 }}>
            <span style={{ position: 'absolute', top: 3, left: autoCfg.ativo ? 27 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'all .2s', boxShadow: '0 1px 4px rgba(0,0,0,.25)' }} />
          </button>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>🤖 Piloto automático {autoCfg.ativo ? <span style={{ color: 'var(--tq2)' }}>· LIGADO</span> : '· desligado'}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Todo dia, o sistema envia sozinho: lembretes de amanhã e parabéns de aniversário — pelo WhatsApp da clínica.</div>
          </div>
          <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>📅 Lembretes às
            <input type="time" value={autoCfg.horaLembrete} onChange={e => salvarAuto({ horaLembrete: e.target.value })}
              style={{ padding: '5px 8px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)', fontSize: 12.5 }} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>🎂 Parabéns às
            <input type="time" value={autoCfg.horaNiver} onChange={e => salvarAuto({ horaNiver: e.target.value })}
              style={{ padding: '5px 8px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)', fontSize: 12.5 }} />
          </label>
        </div>
      )}

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
          {aba === 'enviar' && <>✉️ Escreva sua mensagem e envie <b>pra quem você quiser</b> — sai pelo WhatsApp da clínica</>}
          {aba === 'meus' && <>📝 Seus lembretes pessoais — só você vê (meta, tarefas, o que for importante)</>}
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
          {aba === 'calendario' && (!cal ? (
            <div className="card" style={{ padding: 30, color: 'var(--muted)' }}>Calculando o calendário da base…</div>
          ) : cal.total === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              <Syringe size={30} color="var(--border)" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 700 }}>Nenhuma criança no ponto agora.</div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>A lista nasce da data de nascimento no cadastro — quanto mais fichas preenchidas, mais oportunidades aparecem aqui.</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                {[['🔴 Atrasadas', cal.atrasadas, '#dc2626'], ['🟢 No ponto', cal.no_ponto, '#16a34a'], ['🔵 Chegando', cal.chegando, '#2563eb']].map(([l, n, c]) => (
                  <div key={l} className="card" style={{ padding: '8px 14px', fontSize: 12.5, fontWeight: 800, color: c }}>{l}: {n}</div>
                ))}
                {gestaoU && (
                  <button onClick={() => api.get('/lembretes/calendario-config').then(d => setEditCal((d.marcos || []).map(m => `${m.mes} | ${m.nome} | ${m.vacinas}`).join('\n'))).catch(() => {})}
                    className="btn btn-s btn-sm" style={{ gap: 5, fontWeight: 700 }} title="Deixar igual ao esquema cadastrado no Vittasys">
                    ✏️ Ajustar calendário
                  </button>
                )}
                {dados.whatsapp && (
                  <button onClick={() => { if (!selCal.size) return; if (!window.confirm(`Enviar o convite de vacinação para ${selCal.size} família(s)? As mensagens saem espaçadas (4s) pra proteger o número.`)) return; enviar('calendario', [...selCal]); setSelCal(new Set()); setTimeout(loadCal, 1500); }}
                    disabled={enviando || !selCal.size} className="btn btn-p btn-sm" style={{ gap: 6, marginLeft: 'auto' }}>
                    <Send size={13} /> {enviando ? 'Enviando…' : `Convidar selecionadas (${selCal.size})`}
                  </button>
                )}
              </div>
              {(cal.lista || []).map(c => {
                const CS = { atrasada: ['#fdecec', '#dc2626', '🔴'], no_ponto: ['#e9f9ef', '#16a34a', '🟢'], chegando: ['#eaf1fe', '#2563eb', '🔵'] }[c.status];
                const marcado = selCal.has(c.lead_id);
                return (
                  <div key={c.lead_id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderLeft: `4px solid ${CS[1]}` }}>
                    <input type="checkbox" checked={marcado} onChange={() => setSelCal(p => { const n = new Set(p); n.has(c.lead_id) ? n.delete(c.lead_id) : n.add(c.lead_id); return n; })}
                      style={{ width: 17, height: 17, cursor: 'pointer', accentColor: CS[1] }} />
                    <div style={{ flex: 1, minWidth: 190 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{c.nome} <span style={{ fontWeight: 600, fontSize: 11.5, color: 'var(--muted)' }}>· {c.idade_txt}</span></div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        <b style={{ color: CS[1] }}>{CS[2]} {c.marco}</b> ({c.quando}) · 💉 {c.vacinas}
                      </div>
                    </div>
                    {temTel(c.telefone)
                      ? <a href={wa(c.telefone, `Oi! 💙 Aqui é da Vittalis Saúde 😊 ${String(c.nome).split(' ')[0]} já está na idade das vacinas de ${c.marco} (${c.vacinas}). Quer que eu reserve um horário pra vocês?`)} target="_blank" rel="noreferrer"
                          className="btn btn-sm" style={{ gap: 5, background: '#25D366', color: '#fff', border: 'none', fontWeight: 800 }}><MessageCircle size={13} /> WhatsApp</a>
                      : <span style={{ fontSize: 11, color: 'var(--light)', fontWeight: 600 }}>sem telefone</span>}
                  </div>
                );
              })}
            </>
          ))}

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

          {/* ✉️ Mensagem livre — pra quem ela quiser */}
          {aba === 'enviar' && (
            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Pra quem?</div>
                {dest ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--tq3)', border: '1.5px solid var(--tq)', borderRadius: 12, padding: '8px 12px' }}>
                    <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--tq2)' }}>{dest.nome}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{dest.telefone}</span>
                    <button onClick={() => setDest(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}><X size={14} /></button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input value={buscaQ} onChange={e => setBuscaQ(e.target.value)} placeholder="Busque por nome ou telefone (clientes e conversas)…"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 11, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)', fontSize: 13.5, outline: 'none' }} />
                    {buscaRes.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,.12)', zIndex: 20, maxHeight: 240, overflowY: 'auto' }}>
                        {buscaRes.map((it, i) => (
                          <button key={i} onClick={() => { setDest(it); setBuscaQ(''); setBuscaRes([]); }}
                            style={{ display: 'flex', justifyContent: 'space-between', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', color: 'var(--txt)' }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{it.nome}</span>
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{it.telefone || 'sem telefone'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>…ou digite o número direto:
                      <input value={telLivre} onChange={e => setTelLivre(e.target.value)} placeholder="(98) 99999-9999" inputMode="numeric"
                        style={{ marginLeft: 8, padding: '5px 10px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)', fontSize: 12.5, outline: 'none', width: 160 }} />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Mensagem</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {[['🎂 Aniversário', () => msgNiver(dest?.nome || '')], ['🎁 Indicação', () => msgInd(dest?.nome || '')], ['💙 Bom dia', () => `Bom dia${dest?.nome ? ', ' + String(dest.nome).split(' ')[0] : ''}! 💙 Aqui é da Vittalis Saúde. Passando pra lembrar que estamos à disposição pra cuidar de quem você ama. 😊`]].map(([rot, fn]) => (
                    <button key={rot} onClick={() => setMsgLivre(fn())} className="btn btn-sm" style={{ fontSize: 11, background: 'var(--bg2)', color: 'var(--txt2)', border: '1px solid var(--border)' }}>{rot}</button>
                  ))}
                </div>
                <textarea value={msgLivre} onChange={e => setMsgLivre(e.target.value)} rows={4} maxLength={3000} placeholder="Escreva aqui a mensagem do seu jeito…"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)', fontSize: 13.5, outline: 'none', resize: 'vertical', lineHeight: 1.5 }} />
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {telFinal.length >= 10 && msgLivre.trim() && (
                  <a href={wa(telFinal, msgLivre)} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ gap: 5, background: '#25D366', color: '#fff', border: 'none', fontWeight: 800 }}>
                    <MessageCircle size={13} /> Enviar pelo meu WhatsApp
                  </a>
                )}
                {dados.whatsapp && (
                  <button onClick={enviarLivre} disabled={enviando || telFinal.length < 10 || !msgLivre.trim()} className="btn btn-p btn-sm" style={{ gap: 6 }}>
                    <Send size={13} /> {enviando ? 'Enviando…' : 'Enviar pelo WhatsApp da clínica'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 📝 Meus lembretes — pessoais */}
          {aba === 'meus' && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input value={novoMeu} onChange={e => setNovoMeu(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMeu()} maxLength={200}
                  placeholder="Ex.: 🎯 Bater a meta de hoje · retornar pra Dona Ana · cobrar comprovante…"
                  style={{ flex: 1, padding: '11px 14px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)', fontSize: 13.5, outline: 'none' }} />
                <button onClick={addMeu} disabled={!novoMeu.trim()} className="btn btn-p btn-sm" style={{ gap: 5 }}>+ Anotar</button>
              </div>
              {meus.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '26px 10px', color: 'var(--muted)', fontSize: 13 }}>
                  <StickyNote size={26} color="var(--border)" style={{ marginBottom: 6 }} />
                  <div style={{ fontWeight: 700 }}>Nada anotado ainda.</div>
                  <div style={{ fontSize: 12, marginTop: 3 }}>Anote qualquer coisa importante: meta do dia, retornos, recados… Só você vê (aparece também no seu Meu Painel).</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {meus.map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 11, background: 'var(--bg2)', opacity: m.concluido ? .55 : 1 }}>
                      <input type="checkbox" checked={!!m.concluido} onChange={async () => { try { await api.put(`/extras/painel/${m.id}`, { concluido: !m.concluido }); loadMeus(); } catch {} }}
                        style={{ width: 16, height: 16, accentColor: 'var(--tq)' }} />
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, textDecoration: m.concluido ? 'line-through' : 'none' }}>{m.titulo || m.conteudo}</span>
                      <button onClick={async () => { try { await api.del(`/extras/painel/${m.id}`); loadMeus(); } catch {} }}
                        title="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#111827', color: '#fff', padding: '12px 20px', borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,.35)', fontSize: 13.5, fontWeight: 600, zIndex: 1000 }}>{toast}</div>}
      {/* ✏️ Editor do calendário vacinal — espelho do esquema do Vittasys */}
      {editCal !== null && (
        <div onClick={e => e.target === e.currentTarget && setEditCal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(3,43,48,.55)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 620, padding: '20px 22px' }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>💉 Calendário vacinal (rede privada)</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12 }}>
              Uma linha por marco, no formato <b>meses | nome | vacinas</b>. Deixe igual ao esquema cadastrado no Vittasys.<br />
              Exemplo: <code>2 | 2 meses | Hexavalente, Rotavírus, Pneumo 15</code>
            </div>
            <textarea value={editCal} onChange={e => setEditCal(e.target.value)} rows={14}
              style={{ width: '100%', padding: 12, borderRadius: 12, border: '1.5px solid var(--border)', fontSize: 12.5, fontFamily: 'monospace', lineHeight: 1.7, background: 'var(--card)', color: 'var(--txt)', boxSizing: 'border-box', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setEditCal(null)} className="btn btn-s">Cancelar</button>
              <button onClick={async () => {
                const marcos = editCal.split('\n').map(l => l.split('|').map(x => x.trim()))
                  .filter(p2 => p2.length >= 3 && p2[1] && p2[2])
                  .map(p2 => ({ mes: parseInt(p2[0]) || 0, nome: p2[1], vacinas: p2[2] }));
                if (!marcos.length) return showToast('⚠️ Nenhuma linha válida (use: meses | nome | vacinas)');
                try { await api.put('/lembretes/calendario-config', { marcos }); setEditCal(null); showToast('✓ Calendário salvo 💙'); loadCal(); }
                catch (e) { showToast('⚠️ ' + (e.message || 'Erro ao salvar')); }
              }} className="btn btn-p">Salvar calendário</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
