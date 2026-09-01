import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* 🧭 PAINEL COMERCIAL (ordem do master, 28/08: "quero todas as funções dentro do
   usuário dela — que ela gerencie os seus atendimentos e os de cada colaborador
   que está debaixo da cobertura dela").

   A tela responde três perguntas, nesta ordem: como está o dia da casa, o que
   cada pessoa está fazendo agora, e o que precisa da mão dela agora. Cada linha
   leva pra ação: clicou na pessoa, vai pras conversas dela. */

const CORPRES = { online: '#22c55e', ausente: '#f59e0b', offline: '#64748b' };
const NIVEL = { alto: ['#dc2626', '#fee2e2'], medio: ['#b45309', '#fef3c7'], baixo: ['#5a6b7b', '#eef2f6'] };

export default function PainelComercial() {
  const api = useApi();
  const nav = useNavigate();
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = () => {
    setErro('');
    api.get('/extras/painel-comercial').then(setD).catch(e => setErro(e.message));
  };
  // Atualiza sozinho: é um painel de acompanhamento, não um relatório parado
  useEffect(() => { carregar(); const t = setInterval(carregar, 60000); return () => clearInterval(t); }, []); // eslint-disable-line

  const Kpi = ({ v, l, s, cor }) => (
    <div className="card" style={{ padding: '13px 15px' }}>
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -.6, color: cor || 'var(--txt)' }}>{v}</div>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginTop: 2 }}>{l}</div>
      {s && <div style={{ fontSize: 10.5, color: 'var(--light)', marginTop: 2 }}>{s}</div>}
    </div>
  );

  const maxDist = Math.max(1, ...((d?.distribuicao_hoje || []).map(x => x.n)));

  return (
    <div style={{ padding: '20px 22px 40px', maxWidth: 1240, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 230 }}>
          <h1 style={{ fontSize: 19, fontWeight: 800, letterSpacing: -.5, margin: 0, color: 'var(--txt)' }}>
            🧭 Painel Comercial
          </h1>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
            O dia da casa, o que cada pessoa está fazendo e o que precisa de você agora.
          </div>
        </div>
        {d?.fila?.n > 0 && (
          <button onClick={() => nav('/inbox')}
            style={{ border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer',
              background: 'linear-gradient(135deg,#E3B95C,#C4973B)', color: '#fff', fontSize: 12.5, fontWeight: 800,
              boxShadow: '0 3px 12px rgba(196,151,59,.4)' }}>
            📥 Distribuir {d.fila.n} lead{d.fila.n === 1 ? '' : 's'}
          </button>
        )}
        <button onClick={carregar} title="Atualizar agora"
          style={{ border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 9, padding: '8px 10px', cursor: 'pointer', color: 'var(--txt2)' }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {erro && <div className="card" style={{ padding: 14, color: 'var(--err)', fontSize: 12.5 }}>{erro}</div>}
      {!d && !erro && <div className="card" style={{ padding: 20, color: 'var(--muted)', fontSize: 12.5 }}>Lendo o dia da casa…</div>}

      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
            <Kpi v={d.fila.n} l="na fila" cor="var(--gold,#C4973B)"
              s={d.fila.n ? `mais antigo: ${d.fila.espera_max} min` : 'fila zerada 🎉'} />
            <Kpi v={d.sem_resposta.n} l="sem resposta" cor={d.sem_resposta.n ? 'var(--err)' : 'var(--txt)'}
              s={d.sem_resposta.n ? `o mais antigo: ${d.sem_resposta.espera_max} min` : 'ninguém esperando'} />
            <Kpi v={d.agendamentos_hoje} l="agendamentos" s="hoje" cor="var(--ok,#0fb07a)" />
            <Kpi v={fmt.brl(d.vendas_hoje.total)} l="vendido hoje" s={`${d.vendas_hoje.n} venda(s)`} cor="var(--gold,#C4973B)" />
            <Kpi v={d.paradas} l="paradas há 3 dias" s="precisam de retomada" cor={d.paradas ? 'var(--warn,#e8991a)' : 'var(--txt)'} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 14, alignItems: 'start' }} className="vh-painel-cols">
            {/* A equipe agora */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '13px 16px 9px', fontSize: 12.5, fontWeight: 800, color: 'var(--txt)', borderBottom: '1px solid var(--border)' }}>
                👥 A equipe agora — clique para ver as conversas de cada uma
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                  <thead>
                    <tr>{['Pessoa', 'Recebeu', 'Abertas', 'Sem resp.', 'Atendeu', 'Agendou', 'Vendeu hoje', 'Meta do mês'].map((h, i) => (
                      <th key={h} style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--muted)',
                        textAlign: i ? 'right' : 'left', padding: '7px 12px', fontWeight: 800 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {d.equipe.map(u => (
                      <tr key={u.id} onClick={() => nav(`/inbox?responsavel=${u.id}`)} style={{ cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <td style={{ padding: '9px 12px', borderTop: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 27, height: 27, borderRadius: '50%', background: u.cor || 'var(--tq)', color: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 900, flexShrink: 0 }}>
                              {fmt.initials(u.nome)}
                            </span>
                            <span style={{ minWidth: 0 }}>
                              <b style={{ fontSize: 12, color: 'var(--txt)', display: 'block' }}>
                                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                                  background: CORPRES[u.presenca], marginRight: 5 }} />{String(u.nome).split(' ')[0]}
                              </b>
                              <span style={{ fontSize: 9.5, color: 'var(--muted)' }}>{u.titulo || u.setor || ''}</span>
                            </span>
                          </div>
                        </td>
                        {[[u.recebeu_hoje, 'var(--txt2)'], [u.abertas, 'var(--txt2)'],
                          [u.sem_resposta, u.sem_resposta > 2 ? 'var(--err)' : 'var(--muted)'],
                          [u.atendeu_hoje, 'var(--txt2)'], [u.agendou_hoje, 'var(--txt2)']].map(([v, c], i) => (
                          <td key={i} style={{ padding: '9px 12px', borderTop: '1px solid var(--border)', textAlign: 'right',
                            fontSize: 12.5, fontWeight: 800, color: c }}>{v}</td>
                        ))}
                        <td style={{ padding: '9px 12px', borderTop: '1px solid var(--border)', textAlign: 'right',
                          fontSize: 12.5, fontWeight: 800, color: u.vendeu_hoje > 0 ? 'var(--gold,#C4973B)' : 'var(--muted)' }}>
                          {u.vendeu_hoje > 0 ? fmt.brl(u.vendeu_hoje) : '—'}
                        </td>
                        <td style={{ padding: '9px 12px', borderTop: '1px solid var(--border)', width: 108 }}>
                          {u.pct_meta == null ? (
                            <span style={{ fontSize: 10.5, color: 'var(--light)' }}>sem meta</span>
                          ) : (
                            <>
                              <div style={{ fontSize: 10.5, fontWeight: 800, textAlign: 'right', color: 'var(--txt2)' }}>{u.pct_meta}%</div>
                              <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 99, overflow: 'hidden', marginTop: 3 }}>
                                <div style={{ width: `${Math.min(u.pct_meta, 100)}%`, height: '100%', borderRadius: 99,
                                  background: u.pct_meta >= 80 ? 'var(--ok,#0fb07a)' : u.pct_meta >= 50 ? 'var(--warn,#e8991a)' : 'var(--err)' }} />
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              {/* Justiça da distribuição */}
              <div className="card" style={{ padding: '13px 16px 15px', marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--txt)' }}>⚖️ Distribuição de hoje</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 10 }}>quem recebeu quantos leads</div>
                {!(d.distribuicao_hoje || []).length && (
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nenhum lead distribuído hoje ainda.</div>
                )}
                {(d.distribuicao_hoje || []).map(x => (
                  <div key={x.responsavel_id} style={{ display: 'grid', gridTemplateColumns: '86px 1fr 24px',
                    alignItems: 'center', gap: 9, marginBottom: 7 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--txt2)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(x.nome).split(' ')[0]}</span>
                    <div style={{ height: 9, background: 'var(--bg2)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${(x.n / maxDist) * 100}%`, height: '100%', borderRadius: 99, background: x.cor || 'var(--tq)' }} />
                    </div>
                    <b style={{ fontSize: 12, textAlign: 'right', color: 'var(--txt)' }}>{x.n}</b>
                  </div>
                ))}
              </div>

              {/* O que pede ação */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '13px 16px 9px', fontSize: 12.5, fontWeight: 800, color: 'var(--txt)' }}>🚨 Precisa da sua atenção</div>
                {!(d.alertas || []).length && (
                  <div style={{ padding: '10px 16px 16px', fontSize: 12, color: 'var(--ok,#0fb07a)', fontWeight: 700 }}>
                    Tudo em dia por aqui 🎉
                  </div>
                )}
                {(d.alertas || []).map((a, i) => {
                  const [cor, bg] = NIVEL[a.nivel] || NIVEL.baixo;
                  return (
                    <div key={i} onClick={() => (a.quem ? nav(`/inbox?responsavel=${a.quem}`) : nav('/inbox'))}
                      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 16px',
                        borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                      <span style={{ fontSize: 11.5, color: 'var(--txt2)', flex: 1 }}>{a.txt}</span>
                      <span style={{ fontSize: 9.5, fontWeight: 800, borderRadius: 99, padding: '2px 9px', background: bg, color: cor }}>
                        {a.acao === 'distribuir' ? 'distribuir' : 'ver'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
