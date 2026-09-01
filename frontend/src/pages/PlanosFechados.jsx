import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, RefreshCw } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* 📋 PLANOS FECHADOS (ordem do master, 28/08: "já que ela fica com planos
   vacinais e planos terapêuticos, é importante um histórico separado — uma aba
   com todos os planos que foram fechados").

   Plano não é venda avulsa: é contrato. Aqui a pessoa vê o que construiu — o
   que fechou, de quem é, quanto vale e se o dinheiro entrou. Cada uma vê os
   seus; a gestão vê de todo mundo e filtra por pessoa. */

const TIPOS = [
  ['', 'Todos os planos'],
  ['vacinal', '💉 Plano Vacinal'],
  ['terapeutico', '🧩 Plano Terapêutico'],
  ['fidelidade', '💛 Fidelidade Mensal'],
];
const CORCAT = { 'Plano Vacinal': '#3b82f6', Terapia: '#a855f7', 'Fidelidade Mensal': '#C4973B' };
const ST = {
  pago: ['Pago', '#0a8f5b', '#e2f8ef'], cortesia: ['Cortesia', '#5a6b7b', '#eef2f6'],
  sinal: ['Sinal', '#a07514', '#fdf3e2'], parcelado: ['Parcelado', '#0e7490', '#e0f7fa'],
  aguardando: ['Aguardando', '#c0392b', '#fdecec'], pendente: ['Pendente', '#c0392b', '#fdecec'],
};
const anoAtual = () => String(new Date(Date.now() - 3 * 3600 * 1000).getFullYear());
const mesRotulo = (m) => {
  const N = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${N[parseInt(String(m).slice(5), 10) - 1]}/${String(m).slice(2, 4)}`;
};

export default function PlanosFechados() {
  const api = useApi();
  const nav = useNavigate();
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [tipo, setTipo] = useState('');
  const [ano, setAno] = useState(anoAtual());
  const [pessoa, setPessoa] = useState('');
  const [equipe, setEquipe] = useState([]);
  const [busca, setBusca] = useState('');

  const carregar = () => {
    setD(null); setErro('');
    const q = new URLSearchParams({ ano });
    if (tipo) q.set('tipo', tipo);
    if (pessoa) q.set('pessoa', pessoa);
    api.get(`/extras/planos-fechados?${q}`).then(setD).catch(e => setErro(e.message));
  };
  useEffect(carregar, [tipo, ano, pessoa]); // eslint-disable-line
  useEffect(() => {
    if (!['master', 'supervisor'].includes(user?.role)) return;
    api.get('/inbox/atendentes').then(x => setEquipe(Array.isArray(x) ? x : [])).catch(() => {});
  }, [user]); // eslint-disable-line

  const lista = useMemo(() => {
    const itens = d?.itens || [];
    const b = busca.trim().toLowerCase();
    return b ? itens.filter(v => `${v.cliente_nome} ${v.paciente_nome} ${v.servico}`.toLowerCase().includes(b)) : itens;
  }, [d, busca]);

  const maiorMes = Math.max(1, ...((d?.por_mes || []).map(m => m.total)));
  const sel = { border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 9,
    padding: '6px 11px', fontSize: 12, fontWeight: 700, color: 'var(--txt)', cursor: 'pointer' };

  return (
    <div style={{ padding: '20px 22px 40px', maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 230 }}>
          <h1 style={{ fontSize: 19, fontWeight: 800, letterSpacing: -.5, margin: 0, color: 'var(--txt)' }}>📋 Planos fechados</h1>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
            O histórico dos contratos: plano vacinal, plano terapêutico e fidelidade. Aqui é a carteira que você construiu.
          </div>
        </div>
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={sel}>
          {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={ano} onChange={e => setAno(e.target.value)} style={sel}>
          {[0, 1, 2].map(i => { const a = String(Number(anoAtual()) - i); return <option key={a} value={a}>{a}</option>; })}
        </select>
        {d?.pode_filtrar_pessoa && (
          <select value={pessoa} onChange={e => setPessoa(e.target.value)} style={sel}>
            <option value="">Toda a equipe</option>
            {equipe.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        )}
        <button onClick={carregar} title="Atualizar" style={{ ...sel, padding: '6px 9px' }}><RefreshCw size={13} /></button>
      </div>

      {erro && <div className="card" style={{ padding: 14, color: 'var(--err)', fontSize: 12.5 }}>{erro}</div>}
      {!d && !erro && <div className="card" style={{ padding: 20, color: 'var(--muted)', fontSize: 12.5 }}>Somando os planos…</div>}

      {d && (
        <>
          {/* O que foi construído: por tipo e o total */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10, marginBottom: 14 }}>
            {(d.resumo || []).map(r => (
              <div key={r.categoria} className="card" style={{ padding: '13px 15px', borderTop: `3px solid ${CORCAT[r.categoria] || 'var(--tq)'}` }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5 }}>{r.categoria}</div>
                <div style={{ fontSize: 21, fontWeight: 900, color: 'var(--txt)', letterSpacing: -.6, marginTop: 2 }}>{r.n}</div>
                <div style={{ fontSize: 12, color: 'var(--txt2)', fontWeight: 700 }}>{fmt.brl(r.total)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>ticket {fmt.brl(r.ticket)}</div>
              </div>
            ))}
            <div className="card" style={{ padding: '13px 15px', background: 'linear-gradient(135deg,#06424A,#0E8C96)', color: '#fff' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, opacity: .85, textTransform: 'uppercase', letterSpacing: .5 }}>Total no ano</div>
              <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: -.6, marginTop: 2 }}>{d.total.n} planos</div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{fmt.brl(d.total.total)}</div>
              <div style={{ fontSize: 10.5, opacity: .85, marginTop: 2 }}>recebido {fmt.brl(d.total.recebido)}</div>
            </div>
          </div>

          {/* Linha do tempo: como a carteira cresceu mês a mês */}
          {(d.por_mes || []).length > 1 && (
            <div className="card" style={{ padding: '13px 16px', marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--txt)', marginBottom: 10 }}>Planos fechados mês a mês</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', overflowX: 'auto' }}>
                {d.por_mes.map(m => (
                  <div key={m.mes} title={`${m.n} plano(s) · ${fmt.brl(m.total)}`} style={{ flexShrink: 0, width: 46, textAlign: 'center' }}>
                    <div style={{ height: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div style={{ width: 20, borderRadius: 5, background: 'linear-gradient(180deg,var(--tq),var(--pet))',
                        height: `${Math.max(5, (m.total / maiorMes) * 70)}px` }} />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt)', marginTop: 4 }}>{m.n}</div>
                    <div style={{ fontSize: 9, color: 'var(--muted)' }}>{mesRotulo(m.mes)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Um por um */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px 10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 170 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--txt)' }}>Contratos</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{lista.length} na tela · clique para abrir a conversa</div>
              </div>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, paciente ou serviço…"
                style={{ border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 9, padding: '6px 11px', fontSize: 12, color: 'var(--txt)', minWidth: 200 }} />
            </div>
            {!lista.length && (
              <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
                Nenhum plano fechado neste recorte.
              </div>
            )}
            {lista.map(v => {
              const st = ST[v.status_pagamento] || [v.status_pagamento || '—', 'var(--muted)', 'var(--bg2)'];
              return (
                <div key={v.id} onClick={() => v.conversa_id && nav(`/inbox?conv=${v.conversa_id}`)}
                  style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) 128px 108px 110px 26px', gap: 10,
                    alignItems: 'center', padding: '10px 16px', borderTop: '1px solid var(--border)',
                    cursor: v.conversa_id ? 'pointer' : 'default' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.cliente_nome || v.paciente_nome || 'Cliente'}
                      {v.paciente_nome && v.paciente_nome !== v.cliente_nome && (
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}> · {v.paciente_nome}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.servico || '—'}{v.atendente_nome ? ` · ${String(v.atendente_nome).split(' ')[0]}` : ''}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 9.5, fontWeight: 800, borderRadius: 99, padding: '2px 9px',
                      background: CORCAT[v.categoria] || 'var(--bord2)', color: '#fff' }}>{v.categoria}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{fmt.date(String(v.data_venda).slice(0, 10))}</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--txt)' }}>{fmt.brl(v.valor)}</div>
                    <span style={{ fontSize: 9.5, fontWeight: 800, borderRadius: 99, padding: '1px 8px',
                      background: st[2], color: st[1] }}>{st[0]}{v.tem_comprovante ? ' 📎' : ''}</span>
                  </div>
                  <MessageSquare size={14} style={{ color: 'var(--light)' }} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
