import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { Toast } from '../hooks/toast.js';
import { fmt } from '../hooks/utils.js';

/* 👶 FIDELIDADE DO MÊS (ordem do master, 24/08: "o VittaHub da Poliana voltado
   100% pros clientes fidelidade — são bebês que precisam ser agendados
   mensalmente"). A tela responde UMA pergunta: quem já tem horário este mês e
   quem ainda falta. A lista já vem na ordem de trabalho: atrasado primeiro,
   depois quem falta, e por último quem está resolvido. */

const STATUS = {
  atrasado: { rot: 'Atrasado', cor: '#dc2626', bg: '#fee2e2', ic: '🔴' },
  falta:    { rot: 'Falta agendar', cor: '#a16207', bg: '#fef3c7', ic: '🟡' },
  agendado: { rot: 'Agendado', cor: '#0E8C96', bg: '#e4f6f7', ic: '📅' },
  atendido: { rot: 'Atendido', cor: '#15803d', bg: '#dcfce7', ic: '✅' },
};

const mesAtual = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);
const rotuloMes = (m) => {
  const [a, s] = String(m).split('-');
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${nomes[parseInt(s, 10) - 1] || ''} de ${a}`;
};
const idadeTxt = (m) => {
  if (m == null) return null;
  if (m < 24) return `${m} ${m === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(m / 12);
  return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
};

export default function FidelidadeMes() {
  const api = useApi();
  const { user } = useAuth();
  const nav = useNavigate();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [mes, setMes] = useState(mesAtual());
  const [filtro, setFiltro] = useState('pendentes');
  const [busca, setBusca] = useState('');

  const carregar = () => {
    setDados(null); setErro('');
    api.get(`/inbox/fidelidade/mes?mes=${mes}`).then(setDados).catch(e => setErro(e.message));
  };
  useEffect(carregar, [mes]); // eslint-disable-line

  const lista = useMemo(() => {
    const itens = dados?.itens || [];
    const t = busca.trim().toLowerCase();
    return itens.filter(i => {
      if (filtro === 'pendentes' && !['falta', 'atrasado'].includes(i.status)) return false;
      if (filtro === 'agendados' && i.status !== 'agendado') return false;
      if (filtro === 'atendidos' && i.status !== 'atendido') return false;
      if (t && !String(i.nome).toLowerCase().includes(t)) return false;
      return true;
    });
  }, [dados, filtro, busca]);

  const r = dados?.resumo;
  const pct = r?.total ? Math.round(((r.atendidos + r.agendados) / r.total) * 100) : 0;

  // Abre a conversa já com a mensagem do mês pronta na caixa de digitação
  const chamarPraAgendar = (item) => {
    const primeiro = String(item.nome || '').trim().split(/\s+/)[0];
    const texto = `Oi${primeiro ? `, ${primeiro}` : ''}! 💙 Aqui é da Vittalis Saúde 😊 Chegou o mês de cuidar do nosso pequeno de novo. Já separei os melhores horários pra vocês. Fica melhor de manhã ou à tarde?`;
    try { sessionStorage.setItem(`vh_rascunho_${item.id}`, texto); } catch { /* ok */ }
    nav(`/inbox?conv=${item.id}`);
  };

  return (
    <div className="vh-page-pad" style={{ padding: 26, maxWidth: 1080, margin: '0 auto' }}>

      {/* Cabeçalho: o mês e o quanto da carteira já está resolvido */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
            👶 Fidelidade do mês
          </h1>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            Cada bebê da carteira precisa de um horário em {rotuloMes(mes)}. A lista já vem na ordem de quem chamar primeiro.
          </div>
        </div>
        <input type="month" value={mes} onChange={e => setMes(e.target.value || mesAtual())}
          style={{ padding: '8px 11px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)', fontSize: 13 }} />
        <button onClick={carregar} className="btn btn-sm"
          style={{ background: 'var(--bg2)', color: 'var(--muted)', border: '1.5px solid var(--border)' }}>↻ Atualizar</button>
      </div>

      {erro && <div className="card" style={{ padding: 16, color: 'var(--err)', fontWeight: 600 }}>⚠️ {erro}</div>}
      {!dados && !erro && <div className="card" style={{ padding: 26, color: 'var(--muted)' }}>Carregando a carteira…</div>}

      {dados && !erro && (<>
        {/* Placar do mês */}
        <div className="card" style={{ padding: '16px 18px', marginTop: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              ['Bebês na carteira', r.total, 'var(--txt)'],
              ['Já atendidos', r.atendidos, '#15803d'],
              ['Com horário marcado', r.agendados, '#0E8C96'],
              ['Falta agendar', r.faltam, r.faltam ? '#a16207' : 'var(--muted)'],
              ['Atrasados', r.atrasados, r.atrasados ? '#dc2626' : 'var(--muted)'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ flex: '1 1 140px', background: 'var(--bg2)', borderRadius: 11, padding: '10px 12px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 21, fontWeight: 900, color: c, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ flex: 1, height: 10, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 99,
                background: 'linear-gradient(90deg,#0E8C96,#00B8C0)' }} />
            </span>
            <b style={{ fontSize: 13, color: 'var(--tq2)', fontVariantNumeric: 'tabular-nums' }}>{pct}% do mês resolvido</b>
          </div>
          {r.faturado_mes > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
              💰 A carteira já trouxe <b style={{ color: 'var(--ok,#16a34a)' }}>{fmt.brl(r.faturado_mes)}</b> em {rotuloMes(mes)}.
            </div>
          )}
        </div>

        {/* Filtros de trabalho */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          {[['pendentes', `🎯 Pra chamar (${r.faltam})`], ['agendados', `📅 Agendados (${r.agendados})`], ['atendidos', `✅ Atendidos (${r.atendidos})`], ['todos', `Todos (${r.total})`]].map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)}
              style={{ padding: '6px 13px', borderRadius: 99, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                border: `1.5px solid ${filtro === k ? 'var(--tq)' : 'var(--border)'}`,
                background: filtro === k ? 'var(--tq3,#e6fffb)' : 'var(--card)',
                color: filtro === k ? 'var(--tq2)' : 'var(--muted)' }}>{l}</button>
          ))}
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Procurar pelo nome…"
            style={{ marginLeft: 'auto', minWidth: 190, padding: '7px 11px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)', fontSize: 13 }} />
        </div>

        {/* A carteira, um bebê por linha */}
        {!lista.length && (
          <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6 }}>
            {filtro === 'pendentes'
              ? <>🎉 Nenhum bebê pendente em {rotuloMes(mes)}. Carteira em dia!</>
              : <>Nada nesta lista por enquanto.</>}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lista.map(i => {
            const st = STATUS[i.status] || STATUS.falta;
            return (
              <div key={i.id} className="card" style={{ padding: '13px 15px', display: 'flex', gap: 13, alignItems: 'center', flexWrap: 'wrap',
                borderLeft: `3px solid ${st.cor}` }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14.5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {i.nome}
                    <span style={{ fontSize: 10, fontWeight: 800, borderRadius: 8, padding: '2px 9px', background: st.bg, color: st.cor }}>
                      {st.ic} {st.rot}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {idadeTxt(i.idade_meses) && <span>👶 {idadeTxt(i.idade_meses)}</span>}
                    {i.dia_mes && <span>🗓️ costuma vacinar dia {i.dia_mes}</span>}
                    {i.proxima && <span style={{ color: 'var(--tq2)', fontWeight: 700 }}>📅 {String(i.proxima).split('-').reverse().join('/')}{i.hora ? ` às ${i.hora}` : ''}</span>}
                    {i.atendido_em && <span style={{ color: '#15803d', fontWeight: 700 }}>✅ atendido em {String(i.atendido_em).split('-').reverse().join('/')}</span>}
                    {i.vendeu_mes > 0 && <span>💰 {fmt.brl(i.vendeu_mes)} este mês</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                  {i.status !== 'atendido' && (
                    <button onClick={() => chamarPraAgendar(i)} className="btn btn-sm"
                      title="Abre a conversa com a mensagem do mês pronta"
                      style={{ background: 'linear-gradient(120deg,#0E8C96,#00B8C0)', color: '#fff', border: 'none', fontWeight: 800 }}>
                      💬 Chamar pra agendar
                    </button>
                  )}
                  <button onClick={() => nav(`/inbox?conv=${i.id}`)} className="btn btn-sm"
                    style={{ background: 'var(--bg2)', color: 'var(--muted)', border: '1.5px solid var(--border)' }}>
                    Abrir conversa
                  </button>
                  {i.telefone && (
                    <button onClick={() => window.open(`tel:+55${String(i.telefone).replace(/\D/g, '')}`)} className="btn btn-sm"
                      title="Ligar para a família"
                      style={{ background: 'var(--bg2)', color: 'var(--muted)', border: '1.5px solid var(--border)' }}>📞</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6 }}>
          <b style={{ color: 'var(--txt2)' }}>Como a lista se organiza:</b> quem já passou do dia habitual e não tem horário aparece como
          <b> atrasado</b>, no topo. Quem ainda não tem horário no mês fica em <b>falta agendar</b>. Marcou horário, vira <b>agendado</b>.
          E quando o atendimento é dado como Realizado na agenda, o bebê sai da sua fila do mês.
        </div>
      </>)}
    </div>
  );
}
