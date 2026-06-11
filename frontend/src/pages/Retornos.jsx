import React, { useEffect, useState, useCallback } from 'react';
import { CalendarClock, AlertTriangle, CalendarCheck, MessageCircle, Check, Pencil, RotateCcw } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt, openWA, avatarGrad } from '../hooks/utils.js';
import LeadModal from '../components/LeadModal.jsx';

/* ─── Retornos — agenda de follow-up ──────────────────────────────────────────
   O dinheiro da clínica está no retorno: "vou pensar", "falo com meu marido".
   Esta tela junta tudo que precisa de contato: vencidos, hoje e próximos 7 dias.
   Concluir limpa a data; reagendar abre um seletor inline.                    */

const GRUPOS = [
  { k: 'vencidos', titulo: 'Vencidos',        sub: 'Deviam ter sido contatados', Icon: AlertTriangle, cor: 'var(--err)',  bg: 'var(--err2)'  },
  { k: 'hoje',     titulo: 'Para hoje',       sub: 'Contatar ainda hoje',        Icon: CalendarClock, cor: 'var(--warn)', bg: 'var(--warn2)' },
  { k: 'proximos', titulo: 'Próximos 7 dias', sub: 'Programados',                Icon: CalendarCheck, cor: 'var(--tq2)',  bg: 'var(--tq3)'   },
];

function diasAtraso(iso) {
  const d = Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 86400000);
  return d <= 0 ? '' : d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

export default function Retornos() {
  const api = useApi();
  const { isMaster } = useAuth();
  const [data, setData] = useState(null);
  const [modal, setModal] = useState(null);
  const [reag, setReag] = useState(null); // { id, data }
  const [erro, setErro] = useState('');

  const load = useCallback(() => api.get('/leads/retornos').then(setData).catch(e => setErro(e.message)), []); // eslint-disable-line
  useEffect(() => { load(); }, []); // eslint-disable-line

  const concluir = async (lead) => {
    setData(p => {
      const rm = (arr) => arr.filter(l => l.id !== lead.id);
      return { vencidos: rm(p.vencidos), hoje: rm(p.hoje), proximos: rm(p.proximos) };
    });
    try { await api.patch(`/leads/${lead.id}/retorno`, { data_retorno: null }); }
    catch (e) { setErro(e.message); load(); }
  };

  const reagendar = async () => {
    if (!reag?.data) { setReag(null); return; }
    try { await api.patch(`/leads/${reag.id}/retorno`, { data_retorno: reag.data }); setReag(null); load(); }
    catch (e) { setErro(e.message); }
  };

  const salvarLead = async (form) => { await api.put(`/leads/${form.id}`, form); load(); };

  if (!data) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><span className="spin" style={{ width: 28, height: 28 }} /></div>;
  const total = data.vencidos.length + data.hoje.length + data.proximos.length;
  const hojeISO = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ padding: '26px 28px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 27, fontWeight: 800 }}>Retornos</h1>
        <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>
          Agenda de follow-up · {total === 0 ? 'nenhum retorno pendente' : `${total} lead${total > 1 ? 's' : ''} para contatar`}
        </p>
      </div>

      {erro && <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 10, background: 'var(--err2)', color: 'var(--err)', fontSize: 12.5, fontWeight: 600 }}>{erro}</div>}

      {total === 0 && (
        <div className="card" style={{ padding: '46px 20px', textAlign: 'center' }}>
          <CalendarCheck size={34} color="var(--ok)" style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Tudo em dia</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhum retorno vencido ou agendado para os próximos 7 dias. Defina datas de retorno nos leads para alimentar esta agenda.</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14, alignItems: 'start' }}>
        {GRUPOS.map(({ k, titulo, sub, Icon, cor, bg }) => {
          const items = data[k];
          if (!items.length && total > 0) return null;
          if (!items.length) return null;
          return (
            <div key={k} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10, background: bg, borderBottom: '1px solid var(--border)' }}>
                <Icon size={16} color={cor} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: cor }}>{titulo}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{sub}</div>
                </div>
                <span style={{ background: 'var(--card)', borderRadius: 10, padding: '2px 10px', fontSize: 12.5, fontWeight: 800, color: cor }}>{items.length}</span>
              </div>

              <div>
                {items.map((l, i) => (
                  <div key={l.id} style={{ padding: '11px 14px', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarGrad(l.telefone || l.nome), color: '#fff', fontWeight: 800, fontSize: 11.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {fmt.initials(l.nome)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                          {l.interesse} · {l.status}
                          {k === 'vencidos' && <span style={{ color: 'var(--err)', fontWeight: 700 }}> · {diasAtraso(String(l.data_retorno).slice(0, 10))}</span>}
                          {k === 'proximos' && <span style={{ fontWeight: 700 }}> · {fmt.date(String(l.data_retorno).slice(0, 10))}</span>}
                        </div>
                      </div>
                      {isMaster && parseFloat(l.valor_proposta) > 0 && (
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ok)', flexShrink: 0 }}>{fmt.brl(parseFloat(l.valor_proposta))}</div>
                      )}
                    </div>

                    {reag?.id === l.id ? (
                      <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                        <input type="date" min={hojeISO} value={reag.data} onChange={e => setReag({ ...reag, data: e.target.value })}
                          style={{ flex: 1, padding: '6px 9px', borderRadius: 8, border: '1.5px solid var(--tq)', fontSize: 12.5, outline: 'none' }} />
                        <button onClick={reagendar} className="btn btn-p btn-sm"><Check size={12} /> Salvar</button>
                        <button onClick={() => setReag(null)} className="btn btn-s btn-sm">Cancelar</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 5, marginTop: 9 }}>
                        {l.telefone && (
                          <button onClick={() => openWA(l.telefone, l.nome)}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '6px', borderRadius: 8, background: 'var(--wa2)', color: 'var(--wa)', fontSize: 11.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                            <MessageCircle size={11} /> Chamar
                          </button>
                        )}
                        <button onClick={() => concluir(l)} title="Marca o retorno como feito"
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '6px', borderRadius: 8, background: 'var(--ok2)', color: 'var(--ok)', fontSize: 11.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                          <Check size={11} /> Concluir
                        </button>
                        <button onClick={() => setReag({ id: l.id, data: hojeISO })} title="Reagendar retorno"
                          style={{ width: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', borderRadius: 8, background: 'var(--bg2)', color: 'var(--muted)', border: 'none', cursor: 'pointer' }}>
                          <RotateCcw size={11} />
                        </button>
                        <button onClick={() => setModal(l)} title="Editar lead"
                          style={{ width: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', borderRadius: 8, background: 'var(--tq3)', color: 'var(--tq2)', border: 'none', cursor: 'pointer' }}>
                          <Pencil size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {modal && <LeadModal lead={modal} onClose={() => setModal(null)} onSave={salvarLead} />}
    </div>
  );
}
