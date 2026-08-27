import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, RefreshCw, Filter, MessageSquare } from 'lucide-react';
import { useApi } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* 📊 CARTEIRA DE LEADS — pedido do José, repassado pelo master (27/08):
   "todos os nossos Leads juntos em uma única carteira, com filtro por mês e por
   dia; quero medir se o marketing realmente está convertendo lead".

   A tela responde na ordem em que a pergunta é feita:
   1) quantos leads chegaram (por mês, clicável);
   2) dentro do mês, em que DIA e em que DIA DA SEMANA eles chegaram;
   3) o que aconteceu com eles: respondemos? agendaram? compraram? quanto?
   Só o master enxerga (ordem do master: "deixa somente o master ver por
   enquanto"). Cores calmas — o destaque é o número, não o fundo. */

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const n0 = (v) => new Intl.NumberFormat('pt-BR').format(v || 0);
const pct = (v) => `${String(v ?? 0).replace('.', ',')}%`;
const tempoTxt = (min) => {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} d`;
};

const Caixa = ({ children, style }) => (
  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--s1)', ...style }}>
    {children}
  </div>
);
const Titulo = ({ children, dica }) => (
  <div style={{ padding: '13px 16px 0' }}>
    <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--txt)' }}>{children}</div>
    {dica && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{dica}</div>}
  </div>
);

/* Barra de proporção — a leitura de conversão é visual antes de ser numérica */
function Barra({ valor, total, cor }) {
  const p = total ? Math.min(100, (valor / total) * 100) : 0;
  return (
    <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 99, overflow: 'hidden', minWidth: 46 }}>
      <div style={{ width: `${p}%`, height: '100%', background: cor || 'var(--tq)', borderRadius: 99 }} />
    </div>
  );
}

function Kpi({ rot, val, sub, cor }) {
  return (
    <Caixa style={{ padding: '13px 15px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .6 }}>{rot}</div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -.6, color: cor || 'var(--txt)', marginTop: 4 }}>{val}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </Caixa>
  );
}

/* Tabela de recorte (origem, setor, equipe) — mesma leitura nas três */
function Quadro({ titulo, dica, linhas, rotulo }) {
  const maior = Math.max(1, ...linhas.map(l => l.leads));
  return (
    <Caixa>
      <Titulo dica={dica}>{titulo}</Titulo>
      <div style={{ padding: '8px 10px 10px' }}>
        {!linhas.length && <div style={{ padding: '14px 6px', fontSize: 12, color: 'var(--muted)' }}>Sem leads neste recorte.</div>}
        {linhas.map(l => (
          <div key={l.chave} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 60px 60px 92px', alignItems: 'center', gap: 8, padding: '7px 6px', borderTop: '1px solid var(--border)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {rotulo ? rotulo(l.chave) : l.chave}
              </div>
              <div style={{ marginTop: 4 }}><Barra valor={l.leads} total={maior} /></div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, textAlign: 'right', color: 'var(--txt)' }}>{n0(l.leads)}</div>
            <div style={{ fontSize: 11.5, textAlign: 'right', color: 'var(--muted)' }} title="Agendaram">{pct(l.txAgenda)}</div>
            <div style={{ fontSize: 11.5, textAlign: 'right', fontWeight: 700, color: l.txVenda > 0 ? 'var(--tq2)' : 'var(--muted)' }} title="Compraram">{pct(l.txVenda)}</div>
            <div style={{ fontSize: 11.5, textAlign: 'right', color: 'var(--muted)' }}>{fmt.brl(l.valor)}</div>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 60px 60px 92px', gap: 8, padding: '6px 6px 0', borderTop: '1px solid var(--border)', fontSize: 9.5, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: .5, fontWeight: 700 }}>
          <div /><div style={{ textAlign: 'right' }}>Leads</div><div style={{ textAlign: 'right' }}>Agenda</div><div style={{ textAlign: 'right' }}>Venda</div><div style={{ textAlign: 'right' }}>R$</div>
        </div>
      </div>
    </Caixa>
  );
}

export default function LeadsRelatorio() {
  const api = useApi();
  const nav = useNavigate();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  // Filtros (o mês manda; dia e dia-da-semana refinam dentro dele)
  const [meses, setMeses] = useState(6);
  const [mes, setMes] = useState('');
  const [dia, setDia] = useState('');
  const [dow, setDow] = useState(null);
  const [setor, setSetor] = useState('');
  const [origem, setOrigem] = useState('');
  const [entrada, setEntrada] = useState(true);   // só quem NOS procurou primeiro
  const [busca, setBusca] = useState('');

  const carregar = () => {
    setCarregando(true); setErro('');
    const q = new URLSearchParams({ meses, entrada: entrada ? '1' : '0' });
    if (mes) q.set('mes', mes);
    if (dia) q.set('dia', dia);
    if (dow !== null) q.set('dow', dow);
    if (setor) q.set('setor', setor);
    if (origem) q.set('origem', origem);
    api.get(`/reports/leads-novos?${q}`)
      .then(d => { setDados(d); setCarregando(false); })
      .catch(e => { setErro(e.message); setCarregando(false); });
  };
  useEffect(carregar, [meses, mes, dia, dow, setor, origem, entrada]); // eslint-disable-line

  const t = dados?.totais;
  const listaFiltrada = useMemo(() => {
    const l = dados?.lista || [];
    const b = busca.trim().toLowerCase();
    if (!b) return l;
    return l.filter(i => `${i.nome} ${i.telefone || ''}`.toLowerCase().includes(b));
  }, [dados, busca]);

  // Exportar o recorte pro Excel (o José pediu pra cruzar com o investimento)
  const baixarCSV = () => {
    const cab = ['Nome', 'Telefone', 'Chegou em', 'Dia da semana', 'Setor', 'Origem', 'Responsavel',
      'Respondido', 'Tempo 1a resposta (min)', 'Agendou', 'Data agenda', 'Comprou', 'Valor'];
    const linhas = (dados?.lista || []).map(l => [
      l.nome, l.telefone || '', l.chegou, l.dowNome, l.setor, l.origem, l.responsavel || '',
      l.respondido ? 'sim' : 'nao', l.respMin ?? '', l.agendou ? 'sim' : 'nao', l.agendaData || '',
      l.vendeu ? 'sim' : 'nao', String(l.valor || 0).replace('.', ','),
    ]);
    const csv = [cab, ...linhas].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `leads-vittalis-${mes || 'periodo'}${dia ? '-' + dia : ''}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const limpar = () => { setMes(''); setDia(''); setDow(null); setSetor(''); setOrigem(''); };
  const temFiltro = mes || dia || dow !== null || setor || origem;

  const btn = (ativo) => ({
    border: `1px solid ${ativo ? 'var(--tq)' : 'var(--border)'}`,
    background: ativo ? 'var(--tq3)' : 'var(--card)',
    color: ativo ? 'var(--tq2)' : 'var(--txt2)',
    borderRadius: 9, padding: '5px 11px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
  });

  return (
    <div style={{ padding: '18px 20px 40px', maxWidth: 1280, margin: '0 auto' }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: 19, fontWeight: 800, letterSpacing: -.5, color: 'var(--txt)', margin: 0 }}>Carteira de Leads</h1>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
            Todo mundo que nos mandou a primeira mensagem, junto num lugar só — e o que virou agenda e venda depois.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {[3, 6, 12].map(m => (
            <button key={m} onClick={() => { setMeses(m); setMes(''); setDia(''); setDow(null); }} style={btn(meses === m)}>
              {m} meses
            </button>
          ))}
          <button onClick={carregar} title="Atualizar" style={{ ...btn(false), padding: '5px 9px' }}><RefreshCw size={13} /></button>
          <button onClick={baixarCSV} style={{ ...btn(false), display: 'flex', alignItems: 'center', gap: 5 }}><Download size={13} /> Excel</button>
        </div>
      </div>

      {erro && <Caixa style={{ padding: 14, marginBottom: 12, color: 'var(--err)', fontSize: 12.5 }}>{erro}</Caixa>}

      {/* Mês: o primeiro clique do José */}
      <Caixa style={{ marginBottom: 12 }}>
        <Titulo dica="Clique no mês para ver só os leads que chegaram nele.">Leads por mês</Titulo>
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px 14px', overflowX: 'auto' }}>
          {(dados?.meses || []).map(m => {
            const ativo = mes === m.chave;
            return (
              <button key={m.chave} onClick={() => { setMes(ativo ? '' : m.chave); setDia(''); setDow(null); }}
                style={{ flexShrink: 0, minWidth: 118, textAlign: 'left', cursor: 'pointer', borderRadius: 12, padding: '10px 12px',
                  border: `1.5px solid ${ativo ? 'var(--tq)' : 'var(--border)'}`, background: ativo ? 'var(--tq4)' : 'var(--bg)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5 }}>{m.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt)', letterSpacing: -.6, marginTop: 2 }}>{n0(m.leads)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>{m.agendados} agendaram · {m.vendas} compraram</div>
                <div style={{ marginTop: 6 }}><Barra valor={m.vendas} total={m.leads || 1} cor="var(--tq2)" /></div>
              </button>
            );
          })}
          {!carregando && !(dados?.meses || []).length && (
            <div style={{ padding: '10px 2px', fontSize: 12.5, color: 'var(--muted)' }}>Nenhum lead no período.</div>
          )}
        </div>
      </Caixa>

      {/* Dia da semana + dia exato */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12, marginBottom: 12 }}>
        <Caixa>
          <Titulo dica={mes ? 'Dentro do mês escolhido. Clique num dia da semana ou numa data.' : 'Do período inteiro. Escolha um mês acima para afinar.'}>
            Chegada por dia
          </Titulo>

          {/* Dia da semana — o exemplo do José: "os leads que chegaram na segunda" */}
          <div style={{ display: 'flex', gap: 6, padding: '10px 14px 4px', flexWrap: 'wrap' }}>
            {(dados?.semana || []).map(s => (
              <button key={s.dow} onClick={() => { setDow(dow === s.dow ? null : s.dow); setDia(''); }}
                disabled={!s.leads}
                style={{ ...btn(dow === s.dow), opacity: s.leads ? 1 : .45, cursor: s.leads ? 'pointer' : 'default', display: 'flex', gap: 6, alignItems: 'baseline' }}>
                {DOW[s.dow]} <b style={{ fontSize: 12.5 }}>{n0(s.leads)}</b>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{s.vendas ? `${s.vendas} venda${s.vendas > 1 ? 's' : ''}` : ''}</span>
              </button>
            ))}
          </div>

          {/* Dias corridos */}
          <div style={{ display: 'flex', gap: 5, padding: '8px 14px 14px', overflowX: 'auto' }}>
            {(dados?.dias || []).map(d => {
              const ativo = dia === d.dia;
              const alt = Math.max(1, ...(dados?.dias || []).map(x => x.leads));
              return (
                <button key={d.dia} onClick={() => { setDia(ativo ? '' : d.dia); setDow(null); }}
                  title={`${d.dowNome} · ${d.leads} leads · ${d.agendados} agendaram · ${d.vendas} compraram`}
                  style={{ flexShrink: 0, width: 44, cursor: 'pointer', borderRadius: 10, padding: '6px 3px 5px', textAlign: 'center',
                    border: `1.5px solid ${ativo ? 'var(--tq)' : 'var(--border)'}`, background: ativo ? 'var(--tq4)' : 'var(--card)' }}>
                  <div style={{ height: 34, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div style={{ width: 12, borderRadius: 3, background: d.vendas ? 'var(--tq2)' : 'var(--bord2)',
                      height: `${Math.max(4, (d.leads / alt) * 34)}px` }} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt)', marginTop: 3 }}>{n0(d.leads)}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)' }}>{d.label}</div>
                </button>
              );
            })}
            {!(dados?.dias || []).length && <div style={{ padding: '6px 0', fontSize: 12.5, color: 'var(--muted)' }}>Sem dias com lead.</div>}
          </div>
        </Caixa>
      </div>

      {/* Recorte ativo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: 'var(--muted)' }}>
          <Filter size={12} /> Vendo:
        </span>
        <span style={{ fontSize: 12, color: 'var(--txt)', fontWeight: 700 }}>
          {dia ? `dia ${fmt.date(dia)}` : dow !== null ? `toda ${DOW[dow]}` : mes ? 'mês inteiro' : 'período inteiro'}
          {mes && !dia ? ` · ${(dados?.meses || []).find(m => m.chave === mes)?.label || mes}` : ''}
          {setor ? ` · ${setor}` : ''}{origem ? ` · ${origem}` : ''}
        </span>
        {temFiltro && <button onClick={limpar} style={btn(false)}>limpar filtros</button>}
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={entrada} onChange={e => setEntrada(e.target.checked)} />
          Só quem nos procurou primeiro
          {!!t?.prospeccao && <span style={{ color: 'var(--light)' }}>({n0(t.prospeccao)} fora)</span>}
        </label>
      </div>

      {/* KPIs do recorte */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Kpi rot="Leads que chegaram" val={n0(t?.leads)} sub={`${n0(t?.semResposta)} sem resposta nossa`} />
        <Kpi rot="Respondemos" val={pct(t?.txResposta)} sub={`1ª resposta em ${tempoTxt(t?.respostaMediana)} (mediana)`} />
        <Kpi rot="Viraram agendamento" val={pct(t?.txAgenda)} sub={`${n0(t?.agendados)} de ${n0(t?.leads)}`} />
        <Kpi rot="Viraram venda" val={pct(t?.txVenda)} sub={`${n0(t?.vendas)} clientes`} cor="var(--tq2)" />
        <Kpi rot="Faturamento dos leads" val={fmt.brl(t?.valor)} sub={`ticket ${fmt.brl(t?.ticket)}`} cor="var(--gold)" />
      </div>

      {/* Funil do recorte — a resposta curta pro "o marketing está convertendo?" */}
      <Caixa style={{ marginBottom: 12, padding: '13px 16px 16px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--txt)', marginBottom: 10 }}>Do primeiro "oi" até a venda</div>
        {[
          { rot: 'Mandaram mensagem', v: t?.leads || 0, cor: 'var(--bord2)' },
          { rot: 'Nós respondemos', v: t?.respondidos || 0, cor: 'var(--tq)' },
          { rot: 'Agendaram', v: t?.agendados || 0, cor: 'var(--pet)' },
          { rot: 'Compraram', v: t?.vendas || 0, cor: 'var(--tq2)' },
        ].map((e, i, arr) => (
          <div key={e.rot} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 96px', alignItems: 'center', gap: 10, marginBottom: 7 }}>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>{e.rot}</div>
            <div style={{ height: 16, background: 'var(--bg2)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ width: `${arr[0].v ? Math.min(100, (e.v / arr[0].v) * 100) : 0}%`, height: '100%', background: e.cor, borderRadius: 6 }} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--txt)' }}>
              {n0(e.v)} <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)' }}>
                {i > 0 && arr[0].v ? `· ${Math.round((e.v / arr[0].v) * 100)}%` : ''}
              </span>
            </div>
          </div>
        ))}
      </Caixa>

      {/* Cortes de análise */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 12 }}>
        <Quadro titulo="Por origem" dica="De onde o lead veio (campanha, indicação, site)." linhas={dados?.origens || []} />
        <Quadro titulo="Por setor" dica="Vacinas, consultas ou terapias." linhas={dados?.setores || []} />
        <Quadro titulo="Por atendente" dica="Quem recebeu o lead na mão." linhas={dados?.equipe || []} />
      </div>

      {/* Lista do recorte */}
      <Caixa>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px 0', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--txt)' }}>Leads deste recorte</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {n0(listaFiltrada.length)} na tela{dados?.truncada ? ` · de ${n0(dados.truncada)} no total (baixe o Excel pra ver todos)` : ''} · clique para abrir a conversa
            </div>
          </div>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou telefone…"
            style={{ border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 9, padding: '6px 11px', fontSize: 12, color: 'var(--txt)', minWidth: 180 }} />
        </div>

        <div style={{ padding: '10px 10px 12px' }}>
          {!listaFiltrada.length && (
            <div style={{ padding: '18px 8px', fontSize: 12.5, color: 'var(--muted)' }}>
              {carregando ? 'Carregando…' : 'Nenhum lead neste recorte.'}
            </div>
          )}
          {listaFiltrada.map(l => (
            <div key={l.id} onClick={() => nav(`/inbox?conv=${l.id}`)}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) 118px 92px minmax(0,1fr) 30px', alignItems: 'center', gap: 10,
                padding: '9px 8px', borderTop: '1px solid var(--border)', cursor: 'pointer', borderRadius: 8 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt.phone(l.telefone)} · {l.setor}{l.responsavel ? ` · ${l.responsavel}` : ''}</div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {fmt.date(l.dia)}<br /><span style={{ fontSize: 10.5, color: 'var(--light)' }}>{DOW[l.dow]} · {l.chegou.slice(11)}</span>
              </div>
              <div style={{ fontSize: 11, color: l.respondido ? 'var(--muted)' : 'var(--err)', fontWeight: l.respondido ? 600 : 800 }}>
                {l.respondido ? `resp. ${tempoTxt(l.respMin)}` : 'sem resposta'}
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {l.agendou && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--tq3)', color: 'var(--tq2)' }}>agendou</span>}
                {l.vendeu && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--ok2)', color: 'var(--ok)' }}>{fmt.brl(l.valor)}</span>}
                {!l.agendou && !l.vendeu && <span style={{ fontSize: 10.5, color: 'var(--light)' }}>{l.origem}</span>}
              </div>
              <MessageSquare size={14} style={{ color: 'var(--light)' }} />
            </div>
          ))}
        </div>
      </Caixa>

      <div style={{ fontSize: 10.5, color: 'var(--light)', marginTop: 12, lineHeight: 1.6 }}>
        Como a conta é feita: o lead entra no dia da PRIMEIRA mensagem que ele nos mandou (horário de São Luís) e cada
        conversa conta uma vez só. Agendamento e venda só entram como conversão se aconteceram DEPOIS dessa chegada —
        agenda antiga do mesmo telefone não vira mérito da campanha do mês.
      </div>
    </div>
  );
}
