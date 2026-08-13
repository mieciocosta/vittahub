import React, { useEffect, useState } from 'react';
import { Wallet, ChevronLeft, ChevronRight, Printer, AlertTriangle, Check } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';
import { useNavigate } from 'react-router-dom';

/* 👛 MINHA CARTEIRA — o ano inteiro de quem fechou comigo.
   Um quadro por mês, e dentro dele os clientes daquele fechamento. O que a tela
   existe pra responder não é "quanto vendi", é "quem eu preciso trazer de
   volta": cliente de plano/pacote tem que voltar todo mês, e some sem avisar. */

const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default function MinhaCarteira() {
  const api = useApi();
  const navigate = useNavigate();
  const { user } = useAuth();
  const gestao = ['master', 'supervisor'].includes(user?.role);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [quem, setQuem] = useState('');
  const [equipe, setEquipe] = useState([]);
  const [d, setD] = useState(null);
  const [aberto, setAberto] = useState(null);   // ref do mês expandido
  const [erro, setErro] = useState('');

  const carregar = (a = ano, q = quem) => {
    setD(null); setErro('');
    api.get(`/extras/carteira/anual?ano=${a}${q ? `&usuario_id=${q}` : ''}`)
      .then(r => { setD(r); if (!aberto) setAberto(r.mes_atual); })
      .catch(e => setErro(e.message));
  };

  useEffect(() => { carregar(); }, []);            // eslint-disable-line
  useEffect(() => {
    if (gestao) api.get('/auth/usuarios').then(u => setEquipe((u || []).filter(x => x.ativo !== false))).catch(() => {});
  }, [gestao]);                                    // eslint-disable-line

  const imprimir = () => {
    if (!d) return;
    const w = window.open('', '_blank'); if (!w) return;
    const esc = (t) => String(t ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const blocos = d.meses.filter(m => m.n > 0).map(m => `
      <section class="mes">
        <div class="cab"><b>${esc(m.nome)}</b><span>${m.n} cliente(s) · ${fmt.brl(m.valor)}</span></div>
        <table><thead><tr><th>Cliente</th><th>Serviço</th><th style="width:92px">Fechou em</th>
          <th style="width:96px">Recorrente</th><th style="width:88px;text-align:right">Valor</th></tr></thead>
        <tbody>${m.clientes.map(c => `<tr>
          <td><b>${esc(c.nome)}</b></td><td>${esc(c.servico || '—')}</td>
          <td>${esc((c.data_venda || '').split('-').reverse().join('/'))}</td>
          <td>${c.recorrente ? (c.retomado_no_mes ? '✔ retomado' : '● a retomar') : '—'}</td>
          <td style="text-align:right">${fmt.brl(c.valor)}</td></tr>`).join('')}</tbody></table>
      </section>`).join('');
    w.document.write(`<html><head><meta charset="utf-8"><title>Minha Carteira ${d.ano}</title><style>
      *{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;margin:0;font-size:12px}
      .topo{background:linear-gradient(120deg,#0E8C96,#3fc9b8);color:#fff;padding:22px 30px}
      .topo h1{margin:4px 0 0;font-size:23px} .marca{font-size:10px;letter-spacing:2.2px;text-transform:uppercase;opacity:.85}
      .topo .sub{font-size:11.5px;opacity:.92;margin-top:5px}
      .pag{padding:20px 30px 30px}
      .kpis{display:flex;gap:10px;margin-bottom:20px}
      .kpi{flex:1;border:1px solid #e2e8f0;border-radius:11px;padding:11px 13px}
      .kpi b{display:block;font-size:20px;color:#0E8C96} .kpi span{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;font-weight:700}
      .mes{margin-bottom:15px;page-break-inside:avoid;border:1px solid #e2e8f0;border-radius:11px;overflow:hidden}
      .cab{background:#E6F7F8;padding:8px 13px;display:flex;justify-content:space-between;color:#0a6b73;font-size:13px}
      .cab span{font-weight:600;font-size:11px;color:#4d8d92}
      table{width:100%;border-collapse:collapse;font-size:11.5px}
      th{background:#fafcfc;color:#5b7276;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;padding:6px 12px;text-align:left;border-bottom:1px solid #e2e8f0}
      td{padding:6px 12px;border-bottom:1px solid #f1f5f9}
      tbody tr:nth-child(even) td{background:#fcfdfd}
      .rod{margin-top:20px;font-size:9.5px;color:#94a3b8;text-align:center}
    </style></head><body>
      <div class="topo"><div class="marca">Vittalis Saúde · São Luís / MA</div>
        <h1>Minha Carteira — ${d.ano}</h1>
        <div class="sub">${esc(d.usuario?.nome || '')} · emitido em ${new Date().toLocaleString('pt-BR')}</div></div>
      <div class="pag">
        <div class="kpis">
          <div class="kpi"><b>${d.resumo.clientes}</b><span>Clientes no ano</span></div>
          <div class="kpi"><b>${fmt.brl(d.resumo.valor)}</b><span>Valor fechado</span></div>
          <div class="kpi"><b>${d.resumo.recorrentes}</b><span>Recorrentes</span></div>
          <div class="kpi"><b>${d.resumo.a_retomar}</b><span>A retomar este mês</span></div>
        </div>
        ${blocos || '<p>Nenhum cliente fechado neste ano.</p>'}
        <div class="rod">VittaHub CRM · Vittalis Saúde</div>
      </div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  const maxMes = Math.max(...(d?.meses || []).map(m => m.n), 1);

  return (
    <div style={{ padding: '20px 22px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
            <Wallet size={20} color="var(--tq2)" /> Minha Carteira
          </h1>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
            Quem fechou com você no ano — e quem precisa voltar este mês.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => { const a = ano - 1; setAno(a); carregar(a); }} className="btn btn-s btn-sm btn-ico"><ChevronLeft size={14} /></button>
          <span style={{ fontWeight: 800, fontSize: 15, minWidth: 52, textAlign: 'center' }}>{ano}</span>
          <button onClick={() => { const a = ano + 1; setAno(a); carregar(a); }} className="btn btn-s btn-sm btn-ico"><ChevronRight size={14} /></button>
        </div>
        <button onClick={imprimir} disabled={!d} className="btn btn-s btn-sm" style={{ gap: 6, fontWeight: 700 }}>
          <Printer size={14} /> Relatório
        </button>
      </div>

      {gestao && equipe.length > 0 && (
        <select value={quem} onChange={e => { setQuem(e.target.value); carregar(ano, e.target.value); }}
          style={{ marginBottom: 14, padding: '8px 11px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, fontWeight: 700, background: 'var(--card)', color: 'var(--txt)' }}>
          <option value="">Minha carteira</option>
          {equipe.map(u => <option key={u.id} value={u.id}>Carteira de {u.nome}</option>)}
        </select>
      )}

      {erro && <div className="card" style={{ padding: 16, color: 'var(--err)', fontWeight: 600 }}>⚠️ {erro}</div>}
      {!d && !erro && <div className="card" style={{ padding: 30, color: 'var(--muted)' }}>Carregando…</div>}

      {d && (<>
        {/* Resumo do ano */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 18 }}>
          {[['Clientes no ano', d.resumo.clientes, 'var(--tq2)'],
            ['Valor fechado', fmt.brl(d.resumo.valor), 'var(--ok,#16a34a)'],
            ['Recorrentes', d.resumo.recorrentes, '#8b5cf6'],
            ['A retomar este mês', d.resumo.a_retomar, d.resumo.a_retomar ? '#ea580c' : 'var(--muted)']].map(([r, v, c]) => (
            <div key={r} className="card" style={{ padding: '13px 15px' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: c, lineHeight: 1.15 }}>{v}</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, marginTop: 2 }}>{r}</div>
            </div>
          ))}
        </div>

        {d.resumo.a_retomar > 0 && (
          <div style={{ marginBottom: 16, padding: '12px 15px', borderRadius: 11, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 13, fontWeight: 600, display: 'flex', gap: 9, alignItems: 'center' }}>
            <AlertTriangle size={16} />
            {d.resumo.a_retomar} cliente(s) de plano/pacote ainda não voltaram este mês. Abra os meses e chame um por um.
          </div>
        )}

        {/* Calendário: 12 quadradinhos, o do mês corrente já aberto */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(88px,1fr))', gap: 8, marginBottom: 16 }}>
          {d.meses.map((m, i) => {
            const ativo = aberto === m.ref;
            const atual = d.mes_atual === m.ref;
            return (
              <button key={m.ref} onClick={() => setAberto(ativo ? null : m.ref)}
                style={{ padding: '10px 6px', borderRadius: 11, cursor: 'pointer', textAlign: 'center',
                  border: `1.5px solid ${ativo ? 'var(--tq)' : atual ? '#a5b4fc' : 'var(--border)'}`,
                  background: ativo ? 'var(--tq)' : 'var(--card)', color: ativo ? '#fff' : 'var(--txt)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: ativo ? .9 : .65 }}>{MESES_CURTO[i]}</div>
                <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{m.n}</div>
                <div style={{ height: 4, borderRadius: 3, marginTop: 5, background: ativo ? 'rgba(255,255,255,.45)' : 'var(--bg2)' }}>
                  <div style={{ width: `${(m.n / maxMes) * 100}%`, height: '100%', borderRadius: 3, background: ativo ? '#fff' : 'var(--tq)' }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Clientes do mês escolhido */}
        {(() => {
          const m = d.meses.find(x => x.ref === aberto);
          if (!m) return <div className="card" style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Escolha um mês acima.</div>;
          if (!m.n) return <div className="card" style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Nenhum cliente fechou em {m.nome}.</div>;
          return (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <b style={{ fontSize: 14 }}>{m.nome} de {d.ano}</b>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{m.n} cliente(s) · {fmt.brl(m.valor)}</span>
              </div>
              {m.clientes.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 16px', borderBottom: i < m.clientes.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.nome}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                      {c.servico || 'Serviço não informado'} · fechou {(c.data_venda || '').split('-').reverse().join('/')}
                    </div>
                  </div>
                  {c.recorrente && (
                    <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap',
                      background: c.retomado_no_mes ? '#dcfce7' : '#fff7ed', color: c.retomado_no_mes ? '#166534' : '#9a3412' }}>
                      {c.retomado_no_mes ? <><Check size={10} style={{ verticalAlign: -1 }} /> retomado</> : '● a retomar'}
                    </span>
                  )}
                  <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--ok,#16a34a)', whiteSpace: 'nowrap' }}>{fmt.brl(c.valor)}</span>
                  {c.conversa_id && (
                    <button onClick={() => navigate(`/inbox?conv=${c.conversa_id}`)} className="btn btn-s btn-sm" style={{ fontSize: 11.5, fontWeight: 700 }}>
                      Abrir
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </>)}
    </div>
  );
}
