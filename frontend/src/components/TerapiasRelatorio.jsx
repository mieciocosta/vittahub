import React, { useEffect, useState } from 'react';
import { Printer, AlertTriangle, TrendingUp } from 'lucide-react';
import { useApi } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* 📊 RELATÓRIO DA ÁREA DE TERAPIAS — gráficos + impressão + alertas.
   Os gráficos são SVG escrito à mão de propósito: não vale carregar uma
   biblioteca de 300kB no celular da equipe pra desenhar três barras. */

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const CORES = ['#7c5cbf', '#0E8C96', '#C4973B', '#e11d48', '#0ea5e9', '#16a34a', '#f97316', '#8b5cf6'];
const ST_NOME = { avaliacao: 'Em avaliação', em_terapia: 'Em terapia', pausado: 'Pausado', alta: 'Alta' };
const ST_COR = { avaliacao: '#C4973B', em_terapia: '#7c5cbf', pausado: '#a07514', alta: '#0a8f5b' };

export default function TerapiasRelatorio({ mes }) {
  const api = useApi();
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setD(null); setErro('');
    api.get(`/terapias/relatorio${mes ? `?mes=${mes}` : ''}`).then(setD).catch(e => setErro(e.message));
  }, [mes]); // eslint-disable-line

  const imprimir = () => {
    if (!d) return;
    const w = window.open('', '_blank'); if (!w) return;
    const esc = t => String(t ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const [a, m] = d.mes.split('-').map(Number);
    const maxEvo = Math.max(...d.evolucao.map(x => x.n), 1);
    const maxTer = Math.max(...d.por_terapia.map(x => x.n), 1);
    w.document.write(`<html><head><meta charset="utf-8"><title>Terapias ${d.mes}</title><style>
      *{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;margin:0;font-size:12px}
      .topo{background:linear-gradient(120deg,#7c5cbf,#a78bfa);color:#fff;padding:22px 30px}
      .topo h1{margin:4px 0 0;font-size:23px}
      .marca{font-size:10px;letter-spacing:2.2px;text-transform:uppercase;opacity:.85}
      .sub{font-size:11.5px;opacity:.92;margin-top:5px}
      .pag{padding:20px 30px 30px}
      .kpis{display:flex;gap:10px;margin-bottom:20px}
      .kpi{flex:1;border:1px solid #e2e8f0;border-radius:11px;padding:11px 13px}
      .kpi b{display:block;font-size:20px;color:#7c5cbf}
      .kpi span{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;font-weight:700}
      h2{font-size:14px;color:#7c5cbf;margin:20px 0 8px}
      .barra{display:flex;align-items:center;gap:9px;margin-bottom:5px;font-size:11.5px}
      .barra .nm{width:150px;font-weight:600}
      .barra .bg{flex:1;height:14px;background:#f1f5f9;border-radius:7px;overflow:hidden}
      .barra .fl{height:100%;background:linear-gradient(90deg,#7c5cbf,#a78bfa);border-radius:7px}
      .barra .vl{width:74px;text-align:right;font-weight:800}
      table{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:6px}
      th{background:#faf9fd;color:#5b5276;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;padding:6px 10px;text-align:left;border-bottom:1px solid #e2e8f0}
      td{padding:6px 10px;border-bottom:1px solid #f1f5f9}
      .rod{margin-top:22px;font-size:9.5px;color:#94a3b8;text-align:center}
    </style></head><body>
      <div class="topo"><div class="marca">Vittalis Saúde · São Luís / MA</div>
        <h1>Relatório de Terapias</h1>
        <div class="sub">${MESES[m - 1]} de ${a} · emitido em ${new Date().toLocaleString('pt-BR')}</div></div>
      <div class="pag">
        <div class="kpis">
          <div class="kpi"><b>${d.resumo.feitos}/${d.resumo.meta}</b><span>Planos no mês</span></div>
          <div class="kpi"><b>${d.recorrente.planos}</b><span>Planos ativos</span></div>
          <div class="kpi"><b>${fmt.brl(d.recorrente.mrr)}</b><span>Receita recorrente</span></div>
          <div class="kpi"><b>${d.recorrente.sessoes_semana}</b><span>Sessões por semana</span></div>
        </div>

        <h2>Evolução dos últimos 6 meses</h2>
        ${d.evolucao.map(x => `<div class="barra"><span class="nm">${esc(x.rotulo)}/${x.mes.slice(2, 4)}</span>
          <span class="bg"><span class="fl" style="width:${Math.round((x.n / maxEvo) * 100)}%"></span></span>
          <span class="vl">${x.n} plano(s)</span></div>`).join('')}

        <h2>Planos ativos por terapia</h2>
        ${d.por_terapia.length ? d.por_terapia.map(x => `<div class="barra"><span class="nm">${esc(x.nome)}</span>
          <span class="bg"><span class="fl" style="width:${Math.round((x.n / maxTer) * 100)}%"></span></span>
          <span class="vl">${x.n} · ${fmt.brl(x.valor)}</span></div>`).join('') : '<p>Nenhum plano ativo.</p>'}

        <h2>Pacientes por situação</h2>
        <table><thead><tr><th>Situação</th><th style="width:90px;text-align:right">Pacientes</th></tr></thead>
        <tbody>${d.por_status.map(x => `<tr><td>${esc(ST_NOME[x.status] || x.status)}</td>
          <td style="text-align:right"><b>${x.n}</b></td></tr>`).join('')}</tbody></table>

        ${(d.alertas.parados.length || d.alertas.sem_horario.length) ? `<h2>Pede ação</h2>
        <table><thead><tr><th>O quê</th><th>Paciente</th><th style="width:110px">Situação</th></tr></thead><tbody>
        ${d.alertas.parados.map(x => `<tr><td>Em avaliação sem plano</td><td>${esc(x.nome)}</td><td>há ${x.dias} dias</td></tr>`).join('')}
        ${d.alertas.sem_horario.map(x => `<tr><td>Plano sem dia/horário</td><td>${esc(x.paciente)}</td><td>${esc(x.especialidade || '—')}</td></tr>`).join('')}
        </tbody></table>` : ''}

        <div class="rod">VittaHub CRM · Vittalis Saúde</div>
      </div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  if (erro) return <div className="card" style={{ padding: 20, color: 'var(--err)', fontWeight: 600 }}>⚠️ {erro}</div>;
  if (!d) return <div className="card" style={{ padding: 30, color: 'var(--muted)' }}>Carregando relatório…</div>;

  const maxEvo = Math.max(...d.evolucao.map(x => x.n), 1);
  const maxTer = Math.max(...d.por_terapia.map(x => x.n), 1);
  const totalStatus = d.por_status.reduce((s, x) => s + x.n, 0) || 1;
  const nAlertas = d.alertas.parados.length + d.alertas.sem_horario.length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={imprimir} className="btn btn-s btn-sm" style={{ gap: 6, fontWeight: 700 }}>
          <Printer size={14} /> Gerar relatório
        </button>
      </div>

      {/* Números do mês */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        {[['Planos no mês', `${d.resumo.feitos}/${d.resumo.meta}`, '#7c5cbf'],
          ['Planos ativos', d.recorrente.planos, '#0E8C96'],
          ['Receita recorrente', fmt.brl(d.recorrente.mrr), 'var(--ok,#16a34a)'],
          ['Sessões por semana', d.recorrente.sessoes_semana, '#C4973B']].map(([r, v, c]) => (
          <div key={r} className="card" style={{ padding: '13px 15px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: c, lineHeight: 1.15 }}>{v}</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, marginTop: 2 }}>{r}</div>
          </div>
        ))}
      </div>

      {/* Alertas — é o que pede ação hoje */}
      {nAlertas > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16, border: '1.5px solid #fed7aa' }}>
          <div style={{ padding: '11px 16px', background: '#fff7ed', borderBottom: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} color="#ea580c" />
            <b style={{ fontSize: 13.5, color: '#9a3412' }}>Pede ação ({nAlertas})</b>
          </div>
          {d.alertas.parados.map(x => (
            <div key={`p${x.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
              <span style={{ fontSize: 14 }}>🕐</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{x.nome}</b> está em avaliação há <b>{x.dias} dias</b> e ainda não tem plano.
              </div>
            </div>
          ))}
          {d.alertas.sem_horario.map(x => (
            <div key={`h${x.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
              <span style={{ fontSize: 14 }}>📅</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{x.paciente}</b> — plano de {x.especialidade || 'terapia'} <b>sem dia e horário</b>, então não entra na grade.
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Evolução — barras dos 6 meses */}
      <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <TrendingUp size={15} color="#7c5cbf" />
          <b style={{ fontSize: 13.5 }}>Planos novos nos últimos 6 meses</b>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 130 }}>
          {d.evolucao.map((x, i) => (
            <div key={x.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#7c5cbf' }}>{x.n}</div>
              <div title={`${x.n} plano(s) · ${fmt.brl(x.valor)}`}
                style={{ width: '100%', height: `${Math.max((x.n / maxEvo) * 88, 3)}px`, borderRadius: '7px 7px 0 0',
                  background: i === d.evolucao.length - 1
                    ? 'linear-gradient(180deg,#a78bfa,#7c5cbf)' : 'linear-gradient(180deg,#c4b5fd,#a78bfa)' }} />
              <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700 }}>{x.rotulo}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
        {/* Por terapia */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <b style={{ fontSize: 13.5, display: 'block', marginBottom: 13 }}>Planos ativos por terapia</b>
          {!d.por_terapia.length ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nenhum plano ativo ainda.</div>
            : d.por_terapia.map((x, i) => (
              <div key={x.nome} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                <span style={{ width: 118, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.nome}</span>
                <span style={{ flex: 1, height: 13, background: 'var(--bg2)', borderRadius: 7, overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: `${(x.n / maxTer) * 100}%`, height: '100%', borderRadius: 7, background: CORES[i % CORES.length] }} />
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 800, minWidth: 84, textAlign: 'right' }}>{x.n} · {fmt.brl(x.valor)}</span>
              </div>
            ))}
        </div>

        {/* Situação dos pacientes */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <b style={{ fontSize: 13.5, display: 'block', marginBottom: 13 }}>Pacientes por situação</b>
          <div style={{ display: 'flex', height: 16, borderRadius: 9, overflow: 'hidden', marginBottom: 12 }}>
            {d.por_status.map(x => (
              <div key={x.status} title={`${ST_NOME[x.status] || x.status}: ${x.n}`}
                style={{ width: `${(x.n / totalStatus) * 100}%`, background: ST_COR[x.status] || '#94a3b8' }} />
            ))}
          </div>
          {d.por_status.map(x => (
            <div key={x.status} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12.5 }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: ST_COR[x.status] || '#94a3b8', flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{ST_NOME[x.status] || x.status}</span>
              <b>{x.n}</b>
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>{Math.round((x.n / totalStatus) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
