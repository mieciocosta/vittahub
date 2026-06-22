import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Phone, MessageSquare, Check, X as XIcon, CalendarClock, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* ─── Agenda — controle de consultas, vacinas, terapias e retornos ─────────── */

const ICONES = { vacinas: '💉', consultas: '🩺', terapias: '🧩' };
const COR_BOLHA = ['#e0f4f5', '#ede4f7', '#fdeede', '#fde4ee', '#e4f0fd'];
const ST_CLR = { Agendado: ['#e8f4fd', '#1d6fb8'], Confirmado: ['#e2f8ef', '#0a8f5b'], Realizado: ['#eef2f6', '#5a6b7b'], Cancelado: ['#fdecec', '#c0392b'], Reagendado: ['#fdf3e2', '#a07514'] };

const hojeISO = () => new Date().toISOString().slice(0, 10);

export default function Agenda() {
  const api = useApi();
  const { user } = useAuth();
  const [data, setData] = useState(hojeISO());
  const [eventos, setEventos] = useState([]);
  const [modal, setModal] = useState(null); // {} novo · {id...} edição
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const load = useCallback(() => {
    api.get(`/extras/agenda?data=${data}`).then(setEventos).catch(() => {});
  }, [data]); // eslint-disable-line
  useEffect(load, [load]);

  const mudaDia = (n) => {
    const d = new Date(data + 'T12:00:00');
    d.setDate(d.getDate() + n);
    setData(d.toISOString().slice(0, 10));
  };

  const salvar = async () => {
    if (salvando) return;
    setErro('');
    const m = modal;
    if (!m.paciente?.trim()) return setErro('Informe o nome do paciente.');
    if (!/^\d{2}:\d{2}$/.test(m.hora || '')) return setErro('Hora no formato HH:MM.');
    // Anti-choque do MOTORISTA ÚNICO — só vacinas: avisa se já tem agendamento
    // de vacinas no mesmo dia e horário (conta até o "Reservado" das colegas).
    if ((m.setor || 'vacinas') === 'vacinas') {
      const dia = m.data || data;
      let doDia = dia === data ? eventos : [];
      if (dia !== data) { try { doDia = await api.get(`/extras/agenda?data=${dia}`); } catch { doDia = []; } }
      const choque = (doDia || []).find(ev => ev.id !== m.id && ev.hora === m.hora && (ev.setor || 'vacinas') === 'vacinas' && ev.status !== 'Cancelado');
      if (choque && !window.confirm(`⚠️ Já existe um agendamento de VACINAS às ${m.hora} neste dia — o motorista é único. Agendar mesmo assim?`)) return;
    }
    setSalvando(true);
    try {
      if (m.local_link && !/^https?:\/\//i.test(m.local_link.trim())) { setErro('O link da localização precisa começar com http:// ou https://'); setSalvando(false); return; }
      if (m.email && !/.+@.+\..+/.test(m.email.trim())) { setErro('E-mail inválido.'); setSalvando(false); return; }
      const body = { paciente: m.paciente.trim(), responsavel_nome: m.responsavel_nome || '', servico: m.servico || '', data: m.data || data, hora: m.hora, profissional: m.profissional || '', telefone: m.telefone || '', observacoes: m.observacoes || '', setor: m.setor || 'vacinas', endereco: m.endereco || '', local_link: (m.local_link || '').trim(), email: (m.email || '').trim(), valor: m.valor ?? '', forma_pagamento: m.forma_pagamento || '', parcelas: m.parcelas || '' };
      if (m.id) await api.put(`/extras/agenda/${m.id}`, body);
      else await api.post('/extras/agenda', body);
      setModal(null); load();
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  };

  const mudaStatus = async (ev, status) => {
    setEventos(p => p.map(x => x.id === ev.id ? { ...x, status } : x));
    try { await api.put(`/extras/agenda/${ev.id}`, { status }); } catch { load(); }
  };

  const excluir = async (ev) => {
    if (!window.confirm(`Excluir o agendamento de ${ev.paciente}?`)) return;
    setEventos(p => p.filter(x => x.id !== ev.id));
    try { await api.delete(`/extras/agenda/${ev.id}`); } catch { load(); }
  };

  const ehHoje = data === hojeISO();
  const rotuloDia = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800 }}>📅 Agenda</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>Consultas, vacinas, terapias, retornos e pós-vacinais</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => mudaDia(-1)} className="btn btn-s" style={{ padding: '8px 10px' }}><ChevronLeft size={15} /></button>
          <input type="date" value={data} onChange={e => setData(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, fontWeight: 700, background: 'var(--card)', color: 'var(--txt)' }} />
          <button onClick={() => mudaDia(1)} className="btn btn-s" style={{ padding: '8px 10px' }}><ChevronRight size={15} /></button>
          {!ehHoje && <button onClick={() => setData(hojeISO())} className="btn btn-s" style={{ fontSize: 12 }}>Hoje</button>}
          <button onClick={() => baixarPDF(eventos, data, rotuloDia)} className="btn btn-s" style={{ gap: 6 }} title="Gera o PDF da agenda do dia pra imprimir ou salvar">
            ⬇ Baixar PDF
          </button>
          <button onClick={() => setModal({ data, hora: '', setor: 'vacinas' })} className="btn btn-p" style={{ gap: 6 }}>
            <Plus size={14} /> Novo agendamento
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'var(--card)' }}>
        <div style={{ padding: '13px 20px', background: 'linear-gradient(90deg,var(--tq),#0aa6ae)', color: '#fff', fontWeight: 800, fontSize: 14, textTransform: 'capitalize' }}>
          {ehHoje ? `Hoje · ${rotuloDia}` : rotuloDia}
        </div>

        {eventos.length === 0 && (
          <div style={{ padding: '46px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5 }}>
            Nenhum agendamento neste dia.<br />
            <span style={{ fontSize: 12 }}>Clique em “Novo agendamento” pra começar. 😊</span>
          </div>
        )}

        {eventos.map((ev, i) => {
          const [bg, cor] = ST_CLR[ev.status] || ST_CLR.Agendado;
          return (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < eventos.length - 1 ? '1px solid var(--border)' : 'none', opacity: ev.status === 'Cancelado' ? .55 : 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--tq2)', minWidth: 48 }}>{ev.hora}</div>
              <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: COR_BOLHA[i % COR_BOLHA.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                {ICONES[ev.setor] || '📌'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{ev.paciente}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {ev.servico || 'Atendimento'}{ev.responsavel_nome ? ` · Resp.: ${ev.responsavel_nome}` : ''}{ev.profissional ? ` · ${ev.profissional}` : ''}
                </div>
                {(ev.endereco || ev.email || ev.local_link || ev.valor != null) && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {ev.valor != null && <span style={{ fontWeight: 800, color: 'var(--tq2)' }}>💰 {fmt.brl(parseFloat(ev.valor))}{ev.forma_pagamento ? ` · ${ev.forma_pagamento}${ev.parcelas > 1 ? ` ${ev.parcelas}x de ${fmt.brl(parseFloat(ev.valor) / ev.parcelas)}` : ''}` : ''}</span>}
                    {ev.endereco && <span title="Atendimento domiciliar">📍 {ev.endereco}</span>}
                    {ev.email && <span>✉️ {ev.email}</span>}
                    {ev.local_link && (
                      <a href={ev.local_link} target="_blank" rel="noreferrer"
                        style={{ color: 'var(--tq2)', fontWeight: 800, textDecoration: 'none' }}>🗺️ Abrir localização</a>
                    )}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', minWidth: 70, textAlign: 'center' }}>{ev.resp_nome ? ev.resp_nome.split(' ')[0] : ''}</div>
              <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 10.5, fontWeight: 800, background: bg, color: cor, minWidth: 86, textAlign: 'center' }}>{ev.status}</span>
              <div style={{ display: 'flex', gap: 5 }}>
                {ev.telefone && (
                  <>
                    <a href={`tel:+55${ev.telefone}`} title="Ligar" style={btnAcao}><Phone size={13} /></a>
                    <a href={`https://wa.me/55${ev.telefone}`} target="_blank" rel="noreferrer" title="WhatsApp" style={{ ...btnAcao, color: '#1da955', borderColor: '#bfe8cf', background: '#eafbf1' }}><MessageSquare size={13} /></a>
                  </>
                )}
                {ev.status !== 'Confirmado' && ev.status !== 'Realizado' && (
                  <button onClick={() => mudaStatus(ev, 'Confirmado')} title="Confirmar" style={{ ...btnAcao, color: 'var(--ok)', borderColor: '#bfe8cf', background: '#eafbf1' }}><Check size={13} /></button>
                )}
                {ev.status === 'Confirmado' && (
                  <button onClick={() => mudaStatus(ev, 'Realizado')} title="Marcar como realizado" style={{ ...btnAcao, color: 'var(--tq2)' }}><Check size={13} /></button>
                )}
                <button onClick={() => setModal({ ...ev, data: typeof ev.data === 'string' ? ev.data.slice(0, 10) : data })} title="Reagendar / editar" style={btnAcao}><CalendarClock size={13} /></button>
                <button onClick={() => mudaStatus(ev, 'Cancelado')} title="Cancelar" style={{ ...btnAcao, color: 'var(--err)', borderColor: '#f3cccc', background: '#fdf0f0' }}><XIcon size={13} /></button>
                <button onClick={() => excluir(ev)} title="Excluir" style={{ ...btnAcao, color: 'var(--light)' }}><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal novo/editar */}
      {modal && (
        <div onClick={e => e.target === e.currentTarget && setModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(3,43,48,.55)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 480, background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--s4)', padding: '18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{modal.id ? 'Editar agendamento' : 'Novo agendamento'}</div>
              <button onClick={() => setModal(null)} style={{ ...btnAcao, width: 28, height: 28 }}><X size={14} /></button>
            </div>
            {erro && <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 9, background: 'var(--err2)', color: 'var(--err)', fontSize: 12, fontWeight: 600 }}>{erro}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Paciente *</label>
                <input value={modal.paciente || ''} maxLength={80} onChange={e => setModal({ ...modal, paciente: e.target.value })} placeholder="Nome do paciente" />
              </div>
              <div className="field"><label>Responsável (família)</label>
                <input value={modal.responsavel_nome || ''} maxLength={80} onChange={e => setModal({ ...modal, responsavel_nome: e.target.value })} placeholder="Ex: Maria Silva" /></div>
              <div className="field"><label>E-mail</label>
                <input type="email" value={modal.email || ''} maxLength={120} onChange={e => setModal({ ...modal, email: e.target.value })} placeholder="email@exemplo.com" /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Endereço (atendimento domiciliar)</label>
                <input value={modal.endereco || ''} maxLength={160} onChange={e => setModal({ ...modal, endereco: e.target.value })} placeholder="Rua, nº, bairro — São Luís/MA" /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Link da localização (Google Maps)</label>
                <input value={modal.local_link || ''} maxLength={300} onChange={e => setModal({ ...modal, local_link: e.target.value })} placeholder="https://maps.app.goo.gl/…" /></div>
              <div className="field"><label>Telefone</label>
                <input value={modal.telefone || ''} maxLength={15} onChange={e => setModal({ ...modal, telefone: e.target.value.replace(/[^\d() -]/g, '') })} placeholder="(98) 9...." /></div>
              <div className="field"><label>Data *</label>
                <input type="date" value={modal.data || data} onChange={e => setModal({ ...modal, data: e.target.value })} /></div>
              <div className="field"><label>Hora *</label>
                <input type="time" value={modal.hora || ''} onChange={e => setModal({ ...modal, hora: e.target.value })} /></div>
              <div className="field"><label>Serviço</label>
                <input value={modal.servico || ''} maxLength={80} onChange={e => setModal({ ...modal, servico: e.target.value })} placeholder="Ex: Vacina 6 meses" /></div>
              <div className="field"><label>Profissional</label>
                <input value={modal.profissional || ''} maxLength={80} onChange={e => setModal({ ...modal, profissional: e.target.value })} placeholder="Ex: Dra. Luisa" /></div>
              <div className="field"><label>Valor (R$)</label>
                <input type="number" min="0" step="0.01" value={modal.valor ?? ''} onChange={e => setModal({ ...modal, valor: e.target.value })} placeholder="0,00" /></div>
              <div className="field"><label>Pagamento</label>
                <select value={modal.forma_pagamento || ''} onChange={e => setModal({ ...modal, forma_pagamento: e.target.value, parcelas: e.target.value === 'Crédito' ? (modal.parcelas || 1) : '' })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)' }}>
                  <option value="">—</option>
                  <option>À vista</option><option>Pix</option><option>Débito</option><option>Crédito</option>
                </select></div>
              {modal.forma_pagamento === 'Crédito' && (
                <div className="field"><label>Parcelamento</label>
                  <select value={modal.parcelas || 1} onChange={e => setModal({ ...modal, parcelas: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)' }}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n}x{modal.valor && !isNaN(parseFloat(modal.valor)) ? ` de ${(parseFloat(modal.valor) / n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}</option>
                    ))}
                  </select></div>
              )}
              <div className="field"><label>Setor</label>
                <select value={modal.setor || 'vacinas'} onChange={e => setModal({ ...modal, setor: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)' }}>
                  <option value="vacinas">💉 Vacinas</option>
                  <option value="consultas">🩺 Consultas</option>
                  <option value="terapias">🧩 Terapias</option>
                </select></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label>Observações</label>
                <input value={modal.observacoes || ''} maxLength={300} onChange={e => setModal({ ...modal, observacoes: e.target.value })} placeholder="Anotações do agendamento…" /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => setModal(null)} className="btn btn-s">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="btn btn-p" style={{ opacity: salvando ? .6 : 1 }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnAcao = {
  width: 30, height: 30, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)',
  color: 'var(--tq2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
};


/* ── PDF da agenda do dia: janela de impressão brandada (salvar como PDF) ──── */
function baixarPDF(eventos, dataISO, rotuloDia) {
  const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = (t) => String(t || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const SET_ICO = { vacinas: '💉', consultas: '🩺', terapias: '🤲' };
  const linhas = eventos.map(ev => `
    <tr>
      <td><b>${esc(ev.hora)}</b></td>
      <td>${SET_ICO[ev.setor] || ''} <b>${esc(ev.paciente)}</b>${ev.responsavel_nome ? `<br><small>Resp.: ${esc(ev.responsavel_nome)}</small>` : ''}</td>
      <td>${esc(ev.servico || '—')}${ev.profissional ? `<br><small>${esc(ev.profissional)}</small>` : ''}</td>
      <td>${ev.telefone ? esc(ev.telefone) : '—'}${ev.email ? `<br><small>${esc(ev.email)}</small>` : ''}</td>
      <td>${ev.valor != null ? `<b>${brl(ev.valor)}</b>${ev.forma_pagamento ? `<br><small>${esc(ev.forma_pagamento)}${ev.parcelas > 1 ? ` ${ev.parcelas}x de ${brl(ev.valor / ev.parcelas)}` : ''}</small>` : ''}` : '—'}</td>
      <td>${esc(ev.status)}</td>
    </tr>
    ${ev.endereco || ev.observacoes ? `<tr class="sub"><td></td><td colspan="5">${ev.endereco ? `📍 ${esc(ev.endereco)} ` : ''}${ev.observacoes ? `· ${esc(ev.observacoes)}` : ''}</td></tr>` : ''}
  `).join('');

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>Agenda Vittalis — ${esc(dataISO.split('-').reverse().join('/'))}</title>
  <style>
    * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
    body { margin: 0; padding: 26px 30px; color: #133; }
    .topo { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #00B8C0; padding-bottom: 12px; margin-bottom: 16px; }
    .topo img { height: 52px; }
    .topo .tit { text-align: right; }
    .topo h1 { margin: 0; font-size: 20px; color: #0E8C96; }
    .topo small { color: #557; text-transform: capitalize; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #00B8C0; color: #fff; padding: 7px 9px; text-align: left; font-size: 11px; letter-spacing: .4px; }
    td { padding: 7px 9px; border-bottom: 1px solid #e3eced; vertical-align: top; }
    tr.sub td { border-bottom: 1px solid #e3eced; color: #567; font-size: 11px; padding-top: 0; }
    small { color: #678; }
    .rodape { margin-top: 18px; font-size: 10.5px; color: #789; display: flex; justify-content: space-between; }
    @media print { body { padding: 10px 14px; } }
  </style></head><body>
    <div class="topo">
      <img src="${location.origin}/logos/logo-h-color.png" alt="Vittalis Saúde" onerror="this.style.display='none'">
      <div class="tit"><h1>Agenda do Dia</h1><small>${esc(rotuloDia)}</small></div>
    </div>
    ${eventos.length === 0 ? '<p>Nenhum agendamento neste dia.</p>' : `
    <table>
      <thead><tr><th>Hora</th><th>Paciente</th><th>Serviço / Profissional</th><th>Contato</th><th>Valor</th><th>Status</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>`}
    <div class="rodape">
      <span>Vittalis Saúde · VittaHub CRM 💎</span>
      <span>Gerado em ${new Date().toLocaleString('pt-BR')}</span>
    </div>
    <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { window.alert('O navegador bloqueou a janela do PDF — libere pop-ups pro VittaHub.'); return; }
  w.document.write(html);
  w.document.close();
}
