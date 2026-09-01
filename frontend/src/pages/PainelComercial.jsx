import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useApi } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* 🧭 PAINEL COMERCIAL (ordem do master, 28/08: "quero todas as funções dentro do
   usuário dela — que ela gerencie os seus atendimentos e os de cada colaborador
   que está debaixo da cobertura dela").

   01/09, ordem do master: "do lado esquerdo o nome de cada uma das meninas, onde
   ela pode olhar tudo — com quem está conversando, quem já agendou, relatórios
   de produtividade do dia". Então a tela virou duas partes:

   · ESQUERDA, sempre visível: a casa e o nome de cada colaboradora, com o sinal
     de presença e o que está pegando fogo (clientes esperando resposta).
   · DIREITA: ou a visão da casa, ou o DOSSIÊ da pessoa escolhida — com quem ela
     está conversando agora, o que agendou, o que vendeu, o que está parado e o
     ritmo dos últimos 14 dias.

   Nada de tela nova: ela clica no nome e o painel troca do lado. */

const CORPRES = { online: '#22c55e', ausente: '#f59e0b', offline: '#64748b' };
const ROTPRES = { online: 'online agora', ausente: 'ausente', offline: 'fora do sistema' };
const NIVEL = { alto: ['#dc2626', '#fee2e2'], medio: ['#b45309', '#fef3c7'], baixo: ['#5a6b7b', '#eef2f6'] };
const PERIODOS = [['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Mês']];
/* Ordem FIXA (a mesma que o servidor devolve): cor amarrada ao significado. */
const COR_SITUACAO = ['var(--viz-espera)', 'var(--viz-conversa)', 'var(--viz-parado)'];
const COR_SETOR = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)'];
const ROTULO_SETOR = { vacinas: 'Vacinas', consultas: 'Consultas', terapias: 'Terapias' };

// Nome de gente, nunca o pronome de tratamento (ordem do master, 01/09)
const primeiro = (n) => fmt.primeiroNome(n);

/* 🥧 PIZZA DOS ATENDIMENTOS (ordem do master, 01/09: "uma pizza de gráfico
   contendo todos atendimentos").

   É uma rosca, não um disco cheio: o buraco do meio guarda o TOTAL, que é a
   primeira coisa que ela quer saber. Escolhas que valem a pena registrar:
   · a cor de cada fatia sai do significado (esperando / em conversa / parado;
     vacinas / consultas / terapias), nunca da posição no ranking — senão a
     mesma cor mudaria de dono quando o número virasse;
   · 2px de respiro entre as fatias, pra vizinhas não colarem numa mancha só;
   · a legenda SEMPRE aparece, com rótulo, número e porcentagem — quem não
     distingue as cores lê os números do mesmo jeito;
   · fatias em ordem fixa, e nenhuma some: fatia zerada é filtrada no servidor. */
function Pizza({ titulo, dados, cores, total, rotuloCentro }) {
  const soma = total != null ? total : (dados || []).reduce((t, x) => t + x.n, 0);
  if (!soma) return null;
  const R = 54, r = 33, C = 62;              // raio externo, interno, centro
  const GAP = 0.030;                          // respiro entre fatias (radianos)
  let ang = -Math.PI / 2;                     // começa no topo
  const arcos = dados.map((x, i) => {
    const fatia = (x.n / soma) * Math.PI * 2;
    const a0 = ang + (dados.length > 1 ? GAP / 2 : 0);
    const a1 = ang + fatia - (dados.length > 1 ? GAP / 2 : 0);
    ang += fatia;
    const grande = (a1 - a0) > Math.PI ? 1 : 0;
    const p = (raio, a) => `${(C + raio * Math.cos(a)).toFixed(2)} ${(C + raio * Math.sin(a)).toFixed(2)}`;
    return {
      ...x, cor: cores[i % cores.length],
      pct: Math.round((x.n / soma) * 100),
      d: `M ${p(R, a0)} A ${R} ${R} 0 ${grande} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${grande} 0 ${p(r, a0)} Z`,
    };
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px 15px', flexWrap: 'wrap' }}>
      <svg width={124} height={124} viewBox="0 0 124 124" role="img" aria-label={titulo} style={{ flexShrink: 0 }}>
        {arcos.map(a => <path key={a.fatia} d={a.d} fill={a.cor}><title>{`${a.fatia}: ${a.n} (${a.pct}%)`}</title></path>)}
        <text x={C} y={C - 2} textAnchor="middle" style={{ fontSize: 21, fontWeight: 900, fill: 'var(--txt)' }}>{soma}</text>
        <text x={C} y={C + 13} textAnchor="middle" style={{ fontSize: 8.5, fontWeight: 700, fill: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .6 }}>
          {rotuloCentro || 'no total'}
        </text>
      </svg>
      <div style={{ flex: 1, minWidth: 132 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .6, marginBottom: 7 }}>{titulo}</div>
        {arcos.map(a => (
          <div key={a.fatia} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: a.cor, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: 'var(--txt2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.fatia}</span>
            <b style={{ fontSize: 11.5, color: 'var(--txt)' }}>{a.n}</b>
            <span style={{ fontSize: 10.5, color: 'var(--muted)', width: 30, textAlign: 'right' }}>{a.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
// "há quanto tempo" curtinho — o painel é de relance, não de leitura
const desde = (min) => (min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h` : `${Math.floor(min / 1440)} d`);

export default function PainelComercial() {
  const api = useApi();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [params, setParams] = useSearchParams();
  /* A pessoa aberta mora na URL (?pessoa=): assim a barra lateral e o chat
     mandam direto pro painel dela, e o link pode ser guardado. */
  const sel = params.get('pessoa') || null;
  const setSel = (id) => {
    const p = new URLSearchParams(params);
    if (id) p.set('pessoa', String(id)); else p.delete('pessoa');
    setParams(p, { replace: true });
  };
  const [pessoa, setPessoa] = useState(null);    // dossiê carregado
  const [pErro, setPErro] = useState('');
  const [periodo, setPeriodo] = useState('hoje');

  const carregar = () => {
    setErro('');
    api.get('/extras/painel-comercial').then(setD).catch(e => setErro(e.message));
  };
  // Atualiza sozinho: é um painel de acompanhamento, não um relatório parado
  useEffect(() => { carregar(); const t = setInterval(carregar, 60000); return () => clearInterval(t); }, []); // eslint-disable-line

  /* Abriu uma pessoa (ou trocou o período): busca o dossiê dela e fica
     RELENDO a cada 30s — o master pediu "uma fileira olhando em tempo real",
     então a lista de quem está esperando resposta não pode envelhecer na tela. */
  useEffect(() => {
    if (!sel) { setPessoa(null); setPErro(''); return; }
    let vivo = true;
    const ler = () => {
      api.get(`/extras/painel-comercial/pessoa/${sel}?periodo=${periodo}`)
        .then(r => { if (vivo) { setPessoa(r); setPErro(''); } })
        .catch(e => { if (vivo) setPErro(e.message); });
    };
    setPessoa(null); setPErro(''); ler();
    const t = setInterval(ler, 30000);
    return () => { vivo = false; clearInterval(t); };
  }, [sel, periodo]); // eslint-disable-line

  const Kpi = ({ v, l, s, cor }) => (
    <div className="card" style={{ padding: '13px 15px' }}>
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -.6, color: cor || 'var(--txt)' }}>{v}</div>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginTop: 2 }}>{l}</div>
      {s && <div style={{ fontSize: 10.5, color: 'var(--light)', marginTop: 2 }}>{s}</div>}
    </div>
  );

  const Bloco = ({ titulo, sub, children, vazio }) => (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ padding: '12px 16px 9px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--txt)' }}>{titulo}</span>
        {sub && <span style={{ fontSize: 10.5, color: 'var(--muted)', marginLeft: 8 }}>{sub}</span>}
      </div>
      {vazio ? <div style={{ padding: '13px 16px', fontSize: 12, color: 'var(--muted)' }}>{vazio}</div> : children}
    </div>
  );

  const maxDist = Math.max(1, ...((d?.distribuicao_hoje || []).map(x => x.n)));
  /* A coluna da esquerda é ordenada por URGÊNCIA, não pelo alfabeto: quem tem
     mais cliente esperando resposta sobe. É o que a gestora precisa ver antes
     de qualquer outra coisa; empate volta pra ordem do nome. */
  const eq = [...(d?.equipe || [])].sort((a, b) =>
    (b.sem_resposta || 0) - (a.sem_resposta || 0) || String(a.nome).localeCompare(String(b.nome)));
  // A soma da casa, pra fechar a tabela da equipe com o número do time inteiro
  const totalEq = eq.reduce((t, u) => ({
    recebeu_hoje: t.recebeu_hoje + (u.recebeu_hoje || 0),
    abertas: t.abertas + (u.abertas || 0),
    sem_resposta: t.sem_resposta + (u.sem_resposta || 0),
    atendeu_hoje: t.atendeu_hoje + (u.atendeu_hoje || 0),
    agendou_hoje: t.agendou_hoje + (u.agendou_hoje || 0),
    vendeu_hoje: t.vendeu_hoje + (u.vendeu_hoje || 0),
  }), { recebeu_hoje: 0, abertas: 0, sem_resposta: 0, atendeu_hoje: 0, agendou_hoje: 0, vendeu_hoje: 0 });
  const aberta = eq.find(u => String(u.id) === String(sel)) || null;

  return (
    <div style={{ padding: '20px 22px 40px', maxWidth: 1400, margin: '0 auto' }}>
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
        <div className="vh-painel-wrap" style={{ display: 'grid', gridTemplateColumns: '236px minmax(0,1fr)', gap: 14, alignItems: 'start' }}>

          {/* ═══ ESQUERDA: a casa + o nome de cada uma (ordem do master, 01/09) ═══ */}
          <div className="vh-painel-equipe" style={{ position: 'sticky', top: 12, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }}>
            <button onClick={() => setSel(null)}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 8,
                border: sel === null ? '1.5px solid var(--gold,#C4973B)' : '1.5px solid var(--border)',
                background: sel === null ? 'rgba(196,151,59,.10)' : 'var(--card)',
                borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--txt)' }}>🏠 Visão da casa</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>
                {d.fila.n} na fila · {d.sem_resposta.n} esperando
              </div>
            </button>

            <div className="vh-hide-mobile" style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: 'var(--muted)',
              textTransform: 'uppercase', padding: '4px 4px 6px' }}>A equipe</div>

            {eq.map(u => {
              const on = String(u.id) === String(sel);
              return (
                <button key={u.id} onClick={() => setSel(u.id)}
                  style={{ width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 7,
                    border: on ? `1.5px solid ${u.cor || 'var(--tq)'}` : '1.5px solid var(--border)',
                    background: on ? 'var(--bg)' : 'var(--card)',
                    borderRadius: 12, padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ position: 'relative', flexShrink: 0 }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', background: u.cor || 'var(--tq)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900 }}>
                      {fmt.initials(u.nome)}
                    </span>
                    <span title={ROTPRES[u.presenca]} style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10,
                      borderRadius: '50%', background: CORPRES[u.presenca], border: '2px solid var(--card)' }} />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ fontSize: 12.5, color: 'var(--txt)', display: 'block', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primeiro(u.nome)}</b>
                    <span style={{ fontSize: 9.5, color: 'var(--muted)', display: 'block', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.abertas} na mão · {u.agendou_hoje} agendou</span>
                  </span>
                  {u.sem_resposta > 0 && (
                    <span title={`${u.sem_resposta} cliente(s) esperando resposta`}
                      style={{ fontSize: 10, fontWeight: 900, borderRadius: 99, padding: '2px 7px', flexShrink: 0,
                        background: u.sem_resposta > 2 ? '#fee2e2' : 'var(--bg2)',
                        color: u.sem_resposta > 2 ? '#dc2626' : 'var(--muted)' }}>
                      {u.sem_resposta}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ═══ DIREITA: a casa OU o dossiê da pessoa ═══════════════════════ */}
          <div>
            {sel === null ? (
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

                {/* 💎 MINHAS NEGOCIAÇÕES — a carteira dela, em dinheiro por etapa.
                    Vem antes da equipe de propósito: ela é fechadora primeiro,
                    gestora depois (ordem do master, 28/08). */}
                {(d.minhas_negociacoes || []).length > 0 && (
                  <div className="card" style={{ padding: '13px 16px 15px', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 10 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--txt)' }}>💎 Minhas negociações</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>o que está na sua mão, por etapa</span>
                      <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 900, color: 'var(--gold,#C4973B)' }}>
                        {fmt.brl((d.minhas_negociacoes || []).reduce((t, x) => t + x.valor, 0))} em jogo
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(148px,1fr))', gap: 9 }}>
                      {d.minhas_negociacoes.map(e => (
                        <div key={e.etapa} onClick={() => nav('/inbox?minhas=1')}
                          style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
                            background: e.parados ? 'rgba(232,153,26,.06)' : 'var(--bg)' }}>
                          <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase',
                            letterSpacing: .4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.etapa}</div>
                          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--txt)', letterSpacing: -.5, marginTop: 2 }}>{e.n}</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: e.valor ? 'var(--tq2)' : 'var(--light)' }}>
                            {e.valor ? fmt.brl(e.valor) : 'sem valor lançado'}
                          </div>
                          {e.parados > 0 && (
                            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--warn,#e8991a)', marginTop: 3 }}>
                              ⏳ {e.parados} parado{e.parados > 1 ? 's' : ''} há +3 dias
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 14, alignItems: 'start' }} className="vh-painel-cols">
                  {/* A equipe agora */}
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '13px 16px 9px', fontSize: 12.5, fontWeight: 800, color: 'var(--txt)', borderBottom: '1px solid var(--border)' }}>
                      👥 A equipe agora — clique no nome para abrir o dossiê
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
                          {eq.map(u => (
                            <tr key={u.id} onClick={() => setSel(u.id)} style={{ cursor: 'pointer' }}
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
                                        background: CORPRES[u.presenca], marginRight: 5 }} />{primeiro(u.nome)}
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
                        <tfoot>
                          <tr style={{ background: 'var(--bg)' }}>
                            <td style={{ padding: '9px 12px', borderTop: '2px solid var(--border)', fontSize: 11, fontWeight: 900, color: 'var(--txt)' }}>A casa</td>
                            {[totalEq.recebeu_hoje, totalEq.abertas, totalEq.sem_resposta, totalEq.atendeu_hoje, totalEq.agendou_hoje].map((v2, i) => (
                              <td key={i} style={{ padding: '9px 12px', borderTop: '2px solid var(--border)', textAlign: 'right',
                                fontSize: 12.5, fontWeight: 900, color: i === 2 && v2 > 0 ? 'var(--err)' : 'var(--txt)' }}>{v2}</td>
                            ))}
                            <td style={{ padding: '9px 12px', borderTop: '2px solid var(--border)', textAlign: 'right',
                              fontSize: 12.5, fontWeight: 900, color: 'var(--gold,#C4973B)' }}>{fmt.brl(totalEq.vendeu_hoje)}</td>
                            <td style={{ borderTop: '2px solid var(--border)' }} />
                          </tr>
                        </tfoot>
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
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primeiro(x.nome)}</span>
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
                          <div key={i} onClick={() => (a.quem ? setSel(a.quem) : nav('/inbox'))}
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
            ) : (
              /* ═══ DOSSIÊ DA COLABORADORA ═══════════════════════════════════ */
              <>
                <div className="card" style={{ padding: '13px 16px', marginBottom: 14, display: 'flex',
                  alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
                  <span style={{ width: 38, height: 38, borderRadius: '50%', color: '#fff', flexShrink: 0,
                    background: (pessoa?.pessoa?.cor || aberta?.cor || 'var(--tq)'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 }}>
                    {fmt.initials(pessoa?.pessoa?.nome || aberta?.nome || '?')}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--txt)', letterSpacing: -.3 }}>
                      {primeiro(pessoa?.pessoa?.nome || aberta?.nome)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {(pessoa?.pessoa?.titulo || aberta?.titulo || aberta?.setor || 'atendimento')}
                      {aberta && <> · <span style={{ color: CORPRES[aberta.presenca], fontWeight: 700 }}>{ROTPRES[aberta.presenca]}</span></>}
                    </div>
                  </div>
                  <span title="A lista se atualiza sozinha a cada 30 segundos"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800,
                      color: '#0fb07a', background: 'rgba(15,176,122,.10)', borderRadius: 99, padding: '3px 9px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0fb07a' }} /> AO VIVO
                  </span>
                  <div style={{ display: 'flex', gap: 5, background: 'var(--bg2)', borderRadius: 10, padding: 3 }}>
                    {PERIODOS.map(([k, l]) => (
                      <button key={k} onClick={() => setPeriodo(k)}
                        style={{ border: 'none', cursor: 'pointer', borderRadius: 8, padding: '5px 11px', fontSize: 11, fontWeight: 800,
                          background: periodo === k ? 'var(--card)' : 'transparent',
                          color: periodo === k ? 'var(--txt)' : 'var(--muted)',
                          boxShadow: periodo === k ? '0 1px 4px rgba(0,0,0,.10)' : 'none' }}>{l}</button>
                    ))}
                  </div>
                  <button onClick={() => nav(`/inbox?responsavel=${sel}`)}
                    style={{ border: 'none', borderRadius: 10, padding: '8px 13px', cursor: 'pointer', fontSize: 11.5, fontWeight: 800,
                      background: 'linear-gradient(135deg,#12a5ad,#0d8b92)', color: '#fff' }}>
                    💬 Abrir as conversas dela
                  </button>
                </div>

                {pErro && <div className="card" style={{ padding: 14, color: 'var(--err)', fontSize: 12.5 }}>{pErro}</div>}
                {!pessoa && !pErro && <div className="card" style={{ padding: 20, color: 'var(--muted)', fontSize: 12.5 }}>Lendo o dia de {primeiro(aberta?.nome)}…</div>}

                {pessoa && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(132px,1fr))', gap: 10, marginBottom: 14 }}>
                      <Kpi v={pessoa.resumo.recebeu} l="recebeu" s="leads entregues" />
                      <Kpi v={pessoa.resumo.atendeu} l="atendeu" s={`${pessoa.resumo.mensagens} mensagem(ns)`} cor="var(--tq2)" />
                      <Kpi v={pessoa.resumo.agendou} l="agendou" cor="var(--ok,#0fb07a)" />
                      <Kpi v={fmt.brl(pessoa.resumo.vendeu)} l="vendeu" s={`${pessoa.resumo.n_vendas} venda(s)`} cor="var(--gold,#C4973B)" />
                      <Kpi v={pessoa.resumo.esperando} l="esperando" s="clientes sem resposta"
                        cor={pessoa.resumo.esperando > 2 ? 'var(--err)' : 'var(--txt)'} />
                      <Kpi v={pessoa.resumo.pct_meta == null ? '—' : `${pessoa.resumo.pct_meta}%`} l="meta do mês"
                        s={pessoa.resumo.pct_meta == null ? 'sem meta' : fmt.brl(pessoa.resumo.vendeu_mes)}
                        cor={pessoa.resumo.pct_meta >= 80 ? 'var(--ok,#0fb07a)' : 'var(--txt)'} />
                    </div>

                    {/* 🥧 A carteira dela em pizza: por situação e por setor */}
                    {((pessoa.pizza_situacao || []).length > 0 || (pessoa.pizza_setor || []).length > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 14, marginBottom: 14 }}>
                        {(pessoa.pizza_situacao || []).length > 0 && (
                          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <Pizza titulo="Atendimentos por situação" dados={pessoa.pizza_situacao}
                              cores={COR_SITUACAO} rotuloCentro="na mão dela" />
                          </div>
                        )}
                        {(pessoa.pizza_setor || []).length > 0 && (
                          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <Pizza titulo="Atendimentos por setor" rotuloCentro="conversas"
                              dados={pessoa.pizza_setor.map(x => ({ ...x, fatia: ROTULO_SETOR[x.fatia] || x.fatia }))}
                              cores={COR_SETOR} />
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)', gap: 14, alignItems: 'start' }} className="vh-painel-cols">
                      <div>
                        {/* 💬 Com quem ela está conversando — o que o master pediu primeiro */}
                        <Bloco titulo="💬 Conversando agora"
                          sub="quem está esperando resposta vem primeiro"
                          vazio={!pessoa.conversas.length ? 'Nenhuma conversa na mão dela.' : null}>
                          {pessoa.conversas.map(c => (
                            <div key={c.id} onClick={() => nav(`/inbox?conv=${c.id}`)}
                              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 16px',
                                borderTop: '1px solid var(--border)', cursor: 'pointer',
                                background: c.esperando && c.min > 30 ? 'rgba(220,38,38,.05)' : 'transparent' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                                background: c.esperando ? (c.min > 30 ? '#dc2626' : '#e8991a') : '#22c55e' }} />
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <b style={{ fontSize: 12, color: 'var(--txt)', display: 'block', overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome || 'sem nome'}</b>
                                <span style={{ fontSize: 10.5, color: 'var(--muted)', display: 'block', overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {c.esperando ? '⏳ esperando resposta' : '✓ ela respondeu'}
                                  {c.ultima ? ` · ${String(c.ultima).slice(0, 60)}` : ''}
                                </span>
                              </span>
                              <span style={{ fontSize: 10.5, fontWeight: 800, color: c.esperando && c.min > 30 ? '#dc2626' : 'var(--muted)', flexShrink: 0 }}>
                                {desde(c.min)}
                              </span>
                            </div>
                          ))}
                        </Bloco>

                        {/* 📈 Ritmo dos últimos 14 dias — relatório de produtividade */}
                        {(pessoa.dias || []).length > 0 && (() => {
                          const maxA = Math.max(1, ...pessoa.dias.map(x => x.atendeu));
                          return (
                            <Bloco titulo="📈 Ritmo dos últimos 14 dias" sub="conversas atendidas por dia · 📅 agendou · 💰 vendeu">
                              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, padding: '14px 16px 6px', height: 96 }}>
                                {pessoa.dias.map(x => (
                                  <div key={x.rotulo} title={`${x.rotulo}: ${x.atendeu} atendida(s) · ${x.agendou} agendamento(s) · ${fmt.brl(x.vendeu)}`}
                                    style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 3, height: '100%' }}>
                                    {x.vendeu > 0 && <span style={{ fontSize: 9 }}>💰</span>}
                                    <div style={{ width: '100%', height: `${(x.atendeu / maxA) * 100}%`, minHeight: x.atendeu ? 4 : 2,
                                      borderRadius: '4px 4px 0 0', background: x.atendeu ? (pessoa.pessoa.cor || 'var(--tq)') : 'var(--bg2)' }} />
                                  </div>
                                ))}
                              </div>
                              <div style={{ display: 'flex', gap: 4, padding: '0 16px 12px' }}>
                                {pessoa.dias.map(x => (
                                  <div key={x.rotulo} style={{ flex: 1, textAlign: 'center', fontSize: 8.5, color: 'var(--muted)' }}>
                                    {x.rotulo.slice(0, 2)}
                                  </div>
                                ))}
                              </div>
                            </Bloco>
                          );
                        })()}

                        {/* 📋 RELATÓRIO DE PRODUTIVIDADE DIÁRIA (ordem do master,
                            01/09). O gráfico mostra o ritmo; a tabela dá o número
                            exato de cada dia, que é o que se leva pra conversa.
                            Do mais recente pro mais antigo, sem os dias vazios. */}
                        {(pessoa.dias || []).some(x => x.atendeu || x.agendou || x.vendeu) && (
                          <Bloco titulo="📋 Produtividade dia a dia" sub="os últimos 14 dias, do mais recente">
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 300 }}>
                                <thead>
                                  <tr>{['Dia', 'Atendeu', 'Agendou', 'Vendeu'].map((h, i) => (
                                    <th key={h} style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--muted)',
                                      textAlign: i ? 'right' : 'left', padding: '7px 16px', fontWeight: 800 }}>{h}</th>
                                  ))}</tr>
                                </thead>
                                <tbody>
                                  {[...pessoa.dias].reverse().filter(x => x.atendeu || x.agendou || x.vendeu).map(x => (
                                    <tr key={x.rotulo}>
                                      <td style={{ padding: '7px 16px', borderTop: '1px solid var(--border)', fontSize: 11.5, fontWeight: 700, color: 'var(--txt2)' }}>{x.rotulo}</td>
                                      <td style={{ padding: '7px 16px', borderTop: '1px solid var(--border)', fontSize: 11.5, fontWeight: 800, textAlign: 'right', color: 'var(--txt2)' }}>{x.atendeu}</td>
                                      <td style={{ padding: '7px 16px', borderTop: '1px solid var(--border)', fontSize: 11.5, fontWeight: 800, textAlign: 'right', color: x.agendou ? 'var(--ok,#0fb07a)' : 'var(--muted)' }}>{x.agendou}</td>
                                      <td style={{ padding: '7px 16px', borderTop: '1px solid var(--border)', fontSize: 11.5, fontWeight: 800, textAlign: 'right', color: x.vendeu ? 'var(--gold,#C4973B)' : 'var(--muted)' }}>{x.vendeu ? fmt.brl(x.vendeu) : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </Bloco>
                        )}
                      </div>

                      <div>
                        {/* 📅 Quem ela já agendou */}
                        <Bloco titulo="📅 Agendou"
                          sub={pessoa.periodo === 'hoje' ? 'hoje' : pessoa.periodo === '7d' ? 'nos 7 dias' : 'no mês'}
                          vazio={!pessoa.agendamentos.length ? 'Nenhum agendamento no período.' : null}>
                          {pessoa.agendamentos.map(a => (
                            <div key={a.id} onClick={() => nav('/agenda')}
                              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 16px',
                                borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                              <span style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--tq2)', flexShrink: 0, width: 42 }}>{a.hora}</span>
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <b style={{ fontSize: 11.5, color: 'var(--txt)', display: 'block', overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.paciente}</b>
                                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{a.servico || a.setor}</span>
                              </span>
                              <span style={{ fontSize: 9, fontWeight: 800, borderRadius: 99, padding: '2px 7px', flexShrink: 0,
                                background: /confirm/i.test(a.status || '') ? '#dcfce7' : 'var(--bg2)',
                                color: /confirm/i.test(a.status || '') ? '#15803d' : 'var(--muted)' }}>{a.status || 'Agendado'}</span>
                            </div>
                          ))}
                        </Bloco>

                        {/* 💰 O que ela fechou */}
                        <Bloco titulo="💰 Vendas registradas"
                          sub={pessoa.resumo.n_vendas ? fmt.brl(pessoa.resumo.vendeu) : null}
                          vazio={!pessoa.vendas.length ? 'Nenhuma venda no período.' : null}>
                          {pessoa.vendas.map(v => (
                            <div key={v.id} onClick={() => nav('/caixa')}
                              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 16px',
                                borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <b style={{ fontSize: 11.5, color: 'var(--txt)', display: 'block', overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.cliente || 'cliente'}</b>
                                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                                  {v.servico || '—'}{v.comprovante ? ' · 🧾 comprovante' : ''}
                                </span>
                              </span>
                              <b style={{ fontSize: 12, color: 'var(--gold,#C4973B)', flexShrink: 0 }}>{fmt.brl(v.valor)}</b>
                            </div>
                          ))}
                        </Bloco>

                        {/* ⏳ Onde o dinheiro está esfriando */}
                        <Bloco titulo="⏳ Parados há 3 dias ou mais" sub="precisam de retomada"
                          vazio={!pessoa.parados.length ? 'Nada parado 🎉' : null}>
                          {pessoa.parados.map(c => (
                            <div key={c.id} onClick={() => nav(`/inbox?conv=${c.id}`)}
                              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 16px',
                                borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <b style={{ fontSize: 11.5, color: 'var(--txt)', display: 'block', overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome || 'sem nome'}</b>
                                {c.etapa && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{c.etapa}</span>}
                              </span>
                              <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--warn,#e8991a)', flexShrink: 0 }}>{c.dias} dias</span>
                            </div>
                          ))}
                        </Bloco>

                        {/* 🎯 O funil dela */}
                        {(pessoa.etapas || []).length > 0 && (
                          <Bloco titulo="🎯 O funil dela" sub="onde está cada conversa">
                            {pessoa.etapas.map(e => (
                              <div key={e.etapa} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 16px',
                                borderTop: '1px solid var(--border)' }}>
                                <span style={{ fontSize: 11.5, color: 'var(--txt2)', flex: 1, overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.etapa}</span>
                                {e.valor > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--tq2)' }}>{fmt.brl(e.valor)}</span>}
                                <b style={{ fontSize: 12, color: 'var(--txt)' }}>{e.n}</b>
                              </div>
                            ))}
                          </Bloco>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
