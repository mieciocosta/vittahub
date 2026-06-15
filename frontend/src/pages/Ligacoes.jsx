import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Phone, PhoneIncoming, PhoneOutgoing, Trash2, X } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* ─── Registro de Ligações ─────────────────────────────────────────────────── */
const STATUS = ['Atendida', 'Não atendida', 'Caixa postal', 'Retornar'];
const ST_CLR = { Atendida: ['#e2f8ef', '#0a8f5b'], 'Não atendida': ['#fdecec', '#c0392b'], 'Caixa postal': ['#eef2f6', '#5a6b7b'], Retornar: ['#fdf3e2', '#a07514'] };

export default function Ligacoes() {
  const api = useApi();
  const { isMaster } = useAuth();
  const [lista, setLista] = useState([]);
  const [novo, setNovo] = useState(null);
  const [erro, setErro] = useState('');

  const load = useCallback(() => { api.get('/extras/ligacoes').then(setLista).catch(() => {}); }, []); // eslint-disable-line
  useEffect(load, [load]);

  const salvar = async () => {
    setErro('');
    const tel = (novo.telefone || '').replace(/\D/g, '');
    if (!novo.contato_nome?.trim()) return setErro('Informe o contato.');
    if (tel.length < 10) return setErro('Telefone com DDD, por favor.');
    try { await api.post('/extras/ligacoes', { ...novo, telefone: tel }); setNovo(null); load(); }
    catch (e) { setErro(e.message); }
  };

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800 }}>📞 Ligações</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>Registro de chamadas realizadas e recebidas</p>
        </div>
        <button onClick={() => setNovo({ direcao: 'realizada', status: 'Atendida' })} className="btn btn-p" style={{ gap: 6 }}><Plus size={14} /> Registrar ligação</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'var(--card)' }}>
        {lista.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5 }}>Nenhuma ligação registrada ainda.</div>}
        {lista.map((lg, i) => {
          const [bg, cor] = ST_CLR[lg.status] || ST_CLR.Atendida;
          return (
            <div key={lg.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 20px', borderBottom: i < lista.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: lg.direcao === 'recebida' ? '#e8f4fd' : 'var(--tq4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {lg.direcao === 'recebida' ? <PhoneIncoming size={15} color="#1d6fb8" /> : <PhoneOutgoing size={15} color="var(--tq2)" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{lg.contato_nome} <span style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 11.5 }}>· {fmt.phone(lg.telefone)}</span></div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {fmt.relTime(lg.created_at)} · {lg.usuario_nome ? lg.usuario_nome.split(' ')[0] : '—'}{lg.duracao_min ? ` · ${lg.duracao_min} min` : ''}{lg.observacoes ? ` · ${lg.observacoes}` : ''}
                </div>
              </div>
              <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 10.5, fontWeight: 800, background: bg, color: cor }}>{lg.status}</span>
              <a href={`tel:+55${lg.telefone}`} title="Ligar de novo" style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--tq2)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}><Phone size={13} /></a>
              {isMaster && (
                <button onClick={async () => { if (window.confirm('Excluir registro?')) { await api.delete(`/extras/ligacoes/${lg.id}`); load(); } }}
                  style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--light)', cursor: 'pointer' }}><Trash2 size={13} /></button>
              )}
            </div>
          );
        })}
      </div>

      {novo && (
        <div onClick={e => e.target === e.currentTarget && setNovo(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(3,43,48,.55)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--s4)', padding: '18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Registrar ligação</div>
              <button onClick={() => setNovo(null)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer' }}><X size={14} /></button>
            </div>
            {erro && <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 9, background: 'var(--err2)', color: 'var(--err)', fontSize: 12, fontWeight: 600 }}>{erro}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>Contato *</label>
                <input value={novo.contato_nome || ''} maxLength={80} onChange={e => setNovo({ ...novo, contato_nome: e.target.value })} /></div>
              <div className="field"><label>Telefone *</label>
                <input value={novo.telefone || ''} maxLength={15} onChange={e => setNovo({ ...novo, telefone: e.target.value.replace(/[^\d() -]/g, '') })} placeholder="(98) 9...." /></div>
              <div className="field"><label>Direção</label>
                <select value={novo.direcao} onChange={e => setNovo({ ...novo, direcao: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)' }}>
                  <option value="realizada">Realizada</option><option value="recebida">Recebida</option>
                </select></div>
              <div className="field"><label>Resultado</label>
                <select value={novo.status} onChange={e => setNovo({ ...novo, status: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)' }}>
                  {STATUS.map(st => <option key={st}>{st}</option>)}
                </select></div>
              <div className="field"><label>Duração (min)</label>
                <input type="number" min={0} max={600} value={novo.duracao_min || ''} onChange={e => setNovo({ ...novo, duracao_min: e.target.value })} /></div>
              <div className="field"><label>Observações</label>
                <input value={novo.observacoes || ''} maxLength={300} onChange={e => setNovo({ ...novo, observacoes: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 13 }}>
              <button onClick={() => setNovo(null)} className="btn btn-s">Cancelar</button>
              <button onClick={salvar} className="btn btn-p">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
