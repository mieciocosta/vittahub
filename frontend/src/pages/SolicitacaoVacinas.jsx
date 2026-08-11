import React, { useEffect, useState } from 'react';
import { Syringe, Check, X, Printer, AlertTriangle, RefreshCw } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* 💉 SOLICITAÇÃO DE VACINAS — CONFORME A AGENDA
   A equipe abre, vê os atendimentos dos próximos dias e pede as doses de cada
   um. O consolidado mostra quanto de cada vacina separar em cada data — é o
   que se leva pro fornecedor / estoque. */

const STATUS = {
  solicitada: ['Solicitada', '#d97706', '#fffbeb'],
  pedida: ['Pedida ao fornecedor', '#2563eb', '#eff6ff'],
  disponivel: ['Disponível', '#16a34a', '#f0fdf4'],
  aplicada: ['Aplicada', '#64748b', '#f8fafc'],
  cancelada: ['Cancelada', '#dc2626', '#fef2f2'],
};
const PROXIMO = { solicitada: 'pedida', pedida: 'disponivel', disponivel: 'aplicada' };
// Formatação de data à prova de bala: se vier vazia, fora do padrão ou já como
// texto do Postgres, mostra um rótulo legível em vez do temido "Invalid Date".
const soISO = (d) => (String(d || '').match(/\d{4}-\d{2}-\d{2}/) || [])[0] || null;
const fmtData = (d, opts, semData = 'Sem data definida') => {
  const iso = soISO(d);
  if (!iso) return semData;
  const dt = new Date(iso + 'T12:00:00');
  return isNaN(dt) ? semData : dt.toLocaleDateString('pt-BR', opts);
};
const fmtD = (d) => fmtData(d, { weekday: 'short', day: '2-digit', month: '2-digit' });

export default function SolicitacaoVacinas() {
  const api = useApi();
  const { user } = useAuth();
  const gestao = ['master', 'supervisor'].includes(user?.role);
  const [aba, setAba] = useState('agenda');
  const [dados, setDados] = useState(null);
  const [pedidos, setPedidos] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null);   // { agenda_id, paciente, data, hora, itens:[{vacina,qtd}] }
  const [salvando, setSalvando] = useState(false);
  const [vacinasConhecidas, setVacinasConhecidas] = useState([]);
  // 📋 Relatório da SEMANA: agenda + doses de cada atendimento + total por vacina
  const [sem, setSem] = useState(null);
  const [semIni, setSemIni] = useState('');
  const loadSemana = (ini) => {
    setSem({ carregando: true });
    api.get(`/extras/vacinas/relatorio-semana${ini ? `?inicio=${ini}` : ''}`)
      .then(d => { setSem(d); setSemIni(d.inicio); })
      .catch(e => setSem({ erro: e.message }));
  };
  const andarSemana = (n) => {
    const d = new Date((semIni || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
    d.setDate(d.getDate() + n * 7);
    loadSemana(d.toISOString().slice(0, 10));
  };

  // Antes o erro era engolido e a tela ficava VAZIA sem explicar nada — foi o
  // que escondeu a falha na leitura da agenda. Agora o motivo aparece na tela.
  const [erro, setErro] = useState('');
  const load = () => {
    setCarregando(true); setErro('');
    Promise.all([
      api.get('/extras/vacinas/agenda?dias=15').catch(e => { setErro(`Não consegui ler a agenda: ${e.message}`); return { eventos: [] }; }),
      api.get('/extras/vacinas/solicitacoes').catch(e => { setErro(p => p || `Não consegui ler os pedidos: ${e.message}`); return { solicitacoes: [], consolidado: [] }; }),
    ]).then(([a, p]) => { setDados(a); setPedidos(p); }).finally(() => setCarregando(false));
  };

  // Puxa da agenda os atendimentos de vacina que ficaram sem pedido nenhum
  const [puxando, setPuxando] = useState(false);
  const puxarDaAgenda = async () => {
    setPuxando(true);
    try {
      const d = await api.post('/extras/vacinas/puxar-da-agenda', { dias: 15 });
      window.alert(d.criadas
        ? `✅ ${d.criadas} solicitação(ões) criada(s) a partir de ${d.atendimentos} atendimento(s) da agenda.`
        : '✅ Todos os atendimentos de vacina da agenda já têm pedido.');
      load();
    } catch (e) { window.alert('Erro: ' + e.message); }
    setPuxando(false);
  };
  useEffect(() => {
    load();
    // Sugestões de nomes de vacina: tabela de preços já cadastrada
    api.get('/inbox/proposta/precos')
      .then(d => setVacinasConhecidas((Array.isArray(d) ? d : []).map(v => v.nome).filter(Boolean).slice(0, 120)))
      .catch(() => {});
  }, []); // eslint-disable-line

  const abrirPedido = (ev) => setForm({
    agenda_id: ev?.id || null, paciente: ev?.paciente || '', data_prevista: ev?.data || '',
    hora: ev?.hora || '', setor: ev?.setor || 'vacinas', conversa_id: ev?.conversa_id || null,
    urgente: false, observacao: '', itens: [{ vacina: '', quantidade: 1 }],
  });

  const salvar = async () => {
    const itens = (form.itens || []).filter(i => String(i.vacina || '').trim());
    if (!itens.length) return window.alert('Informe ao menos uma vacina.');
    setSalvando(true);
    try { await api.post('/extras/vacinas/solicitacoes', { ...form, itens }); setForm(null); load(); }
    catch (e) { window.alert('Erro: ' + e.message); }
    setSalvando(false);
  };

  const mudarStatus = async (so, status) => {
    try { await api.patch(`/extras/vacinas/solicitacoes/${so.id}`, { status }); load(); }
    catch (e) { window.alert('Erro: ' + e.message); }
  };

  const imprimir = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const blocos = (pedidos?.consolidado || []).map(c => `
      <h3>${fmtD(c.data)}</h3>
      <table><thead><tr><th>Vacina</th><th style="width:90px;text-align:center">Doses</th></tr></thead>
      <tbody>${c.itens.map(i => `<tr><td>${i.vacina}</td><td style="text-align:center"><b>${i.qtd}</b></td></tr>`).join('')}</tbody></table>`).join('');
    w.document.write(`<html><head><title>Solicitação de vacinas</title><meta charset="utf-8">
      <style>body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:26px}
      h1{color:#0E8C96;margin:0 0 4px}h3{margin:18px 0 6px;color:#0f172a;text-transform:capitalize}
      .sub{color:#555;font-size:13px;margin-bottom:10px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #ddd;padding:7px 9px;text-align:left}th{background:#f0fdf9;color:#0E8C96}</style></head><body>
      <h1>Solicitação de vacinas — Vittalis Saúde</h1>
      <div class="sub">Conforme a agenda · gerado em ${new Date().toLocaleString('pt-BR')}</div>
      ${blocos || '<p>Nenhuma vacina solicitada no período.</p>'}
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  const pendentes = (dados?.eventos || []).filter(e => !e.solicitacoes.length);
  const ativos = (pedidos?.solicitacoes || []).filter(s => s.status !== 'cancelada');

  return (
    <div style={{ padding: '20px 22px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
            <Syringe size={20} color="var(--tq2)" /> Solicitação de Vacinas
          </h1>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
            Conforme a agenda dos próximos 15 dias — ninguém aplica sem dose reservada.
          </div>
        </div>
        <button onClick={puxarDaAgenda} disabled={puxando} className="btn btn-s btn-sm" style={{ gap: 6, fontWeight: 700 }}>
          <RefreshCw size={14} style={puxando ? { animation: 'spin 1s linear infinite' } : undefined} /> {puxando ? 'Puxando…' : 'Puxar da agenda'}
        </button>
        <button onClick={imprimir} className="btn btn-s btn-sm" style={{ gap: 6, fontWeight: 700 }}><Printer size={14} /> Imprimir lista</button>
        <button onClick={() => abrirPedido(null)} className="btn btn-p btn-sm" style={{ gap: 6, fontWeight: 700 }}>+ Pedido avulso</button>
      </div>

      {erro && (
        <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: '#fef2f2',
          border: '1px solid #fecaca', color: '#991b1b', fontSize: 13, fontWeight: 600 }}>
          ⚠️ {erro}
          <button onClick={load} style={{ marginLeft: 10, padding: '4px 12px', borderRadius: 8, border: 'none',
            background: '#991b1b', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Tentar de novo</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['agenda', `📅 Agenda (${pendentes.length} sem pedido)`], ['pedidos', `💉 Pedidos (${ativos.length})`], ['semana', '📋 Relatório da semana'], ['consolidado', '📦 Consolidado']].map(([k, l]) => (
          <button key={k} onClick={() => { setAba(k); if (k === 'semana' && !sem) loadSemana(); }}
            style={{ padding: '7px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
              border: `1.5px solid ${aba === k ? 'var(--tq)' : 'var(--border)'}`,
              background: aba === k ? 'var(--tq)' : 'var(--card)', color: aba === k ? '#fff' : 'var(--muted)' }}>{l}</button>
        ))}
      </div>

      {carregando ? <div className="card" style={{ padding: 30, color: 'var(--muted)' }}>Carregando…</div> : (<>

        {/* AGENDA — cada atendimento com o que já foi pedido */}
        {aba === 'agenda' && ((dados?.eventos || []).length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            Nenhum atendimento agendado nos próximos 15 dias.
          </div>
        ) : (dados.eventos.map(ev => (
          <div key={ev.id} className="card" style={{ padding: '12px 16px', marginBottom: 8, borderLeft: `4px solid ${ev.solicitacoes.length ? '#16a34a' : '#f59e0b'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--tq2)', minWidth: 96, textTransform: 'capitalize' }}>{fmtD(ev.data)}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 44 }}>{ev.hora}</span>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{ev.paciente}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{ev.servico || (ev.setor === 'consultas' ? 'Consulta' : ev.setor === 'terapias' ? 'Terapia' : 'Vacinação')}</div>
              </div>
              <button onClick={() => abrirPedido(ev)} className="btn btn-sm" style={{ fontWeight: 800, background: ev.solicitacoes.length ? 'var(--bg2)' : 'var(--tq)', color: ev.solicitacoes.length ? 'var(--txt2)' : '#fff', border: 'none' }}>
                {ev.solicitacoes.length ? '+ Adicionar' : '💉 Solicitar vacinas'}
              </button>
            </div>
            {ev.solicitacoes.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                {ev.solicitacoes.map(so => {
                  const st = STATUS[so.status] || STATUS.solicitada;
                  return (
                    <span key={so.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: st[2], color: st[1], border: `1px solid ${st[1]}44`, borderRadius: 20, padding: '4px 11px', fontSize: 11.5, fontWeight: 700 }}>
                      {so.urgente && <AlertTriangle size={11} />}{so.quantidade}x {so.vacina} · {st[0]}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))))}

        {/* PEDIDOS — fila de status */}
        {aba === 'pedidos' && (ativos.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Nenhum pedido em aberto.</div>
        ) : ativos.map(so => {
          const st = STATUS[so.status] || STATUS.solicitada;
          return (
            <div key={so.id} className="card" style={{ padding: '11px 16px', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap', borderLeft: `4px solid ${st[1]}` }}>
              <span style={{ fontWeight: 800, fontSize: 12, color: 'var(--tq2)', minWidth: 92, textTransform: 'capitalize' }}>{so.data_prevista ? fmtD(so.data_prevista) : '—'}{so.hora ? ` ${so.hora}` : ''}</span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>
                  {so.urgente && <span title="Urgente" style={{ color: '#dc2626' }}>⚠ </span>}
                  {so.quantidade}x {so.vacina}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {so.paciente}{so.solicitante_nome ? ` · pedido por ${String(so.solicitante_nome).split(' ')[0]}` : ''}
                </div>
              </div>
              <span style={{ background: st[2], color: st[1], borderRadius: 20, padding: '3px 11px', fontSize: 11, fontWeight: 800 }}>{st[0]}</span>
              {PROXIMO[so.status] && (
                <button onClick={() => mudarStatus(so, PROXIMO[so.status])} className="btn btn-sm" style={{ gap: 5, fontWeight: 800, background: st[1], color: '#fff', border: 'none' }}>
                  <Check size={12} /> {STATUS[PROXIMO[so.status]][0]}
                </button>
              )}
              <button onClick={() => { if (window.confirm('Cancelar este pedido?')) mudarStatus(so, 'cancelada'); }}
                title="Cancelar pedido" className="btn btn-sm" style={{ color: 'var(--err)', border: '1px solid var(--err)', background: 'transparent' }}><X size={12} /></button>
            </div>
          );
        }))}

        {/* 📋 RELATÓRIO DA SEMANA — agenda + doses por atendimento + totais */}
        {aba === 'semana' && <RelatorioSemana sem={sem} andar={andarSemana} recarregar={() => loadSemana(semIni)} />}

        {/* CONSOLIDADO — o que separar/pedir em cada dia */}
        {aba === 'consolidado' && ((pedidos?.consolidado || []).length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Nada solicitado ainda.</div>
        ) : pedidos.consolidado.map(c => (
          <div key={c.data} className="card" style={{ padding: '13px 17px', marginBottom: 9 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8, textTransform: 'capitalize', color: 'var(--tq2)' }}>📦 {fmtD(c.data)}</div>
            {c.itens.map(i => (
              <div key={i.vacina} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ flex: 1, fontSize: 13 }}>{i.vacina}</span>
                <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--tq2)' }}>{i.qtd} {i.qtd === 1 ? 'dose' : 'doses'}</span>
              </div>
            ))}
          </div>
        )))}
      </>)}

      {/* MODAL do pedido */}
      {form && (
        <div onClick={e => e.target === e.currentTarget && setForm(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(3,43,48,.55)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, padding: '20px 22px', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>💉 Solicitar vacinas</div>

            <div className="field"><label>Paciente *</label>
              <input value={form.paciente} onChange={e => setForm({ ...form, paciente: e.target.value })} placeholder="Nome do paciente" /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}><label>Data prevista *</label>
                <input type="date" value={form.data_prevista} onChange={e => setForm({ ...form, data_prevista: e.target.value })} /></div>
              <div className="field" style={{ width: 110 }}><label>Hora</label>
                <input value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} placeholder="14:00" /></div>
            </div>

            <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4 }}>Vacinas</label>
            <datalist id="vacinas-lista">{vacinasConhecidas.map(v => <option key={v} value={v} />)}</datalist>
            {form.itens.map((it, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 7, marginTop: 6, alignItems: 'center' }}>
                <input list="vacinas-lista" value={it.vacina} placeholder="Ex.: Pneumo 15"
                  onChange={e => setForm(f => ({ ...f, itens: f.itens.map((x, i2) => i2 === idx ? { ...x, vacina: e.target.value } : x) }))}
                  style={{ flex: 1, padding: '8px 11px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)' }} />
                <input type="number" min={1} max={50} value={it.quantidade}
                  onChange={e => setForm(f => ({ ...f, itens: f.itens.map((x, i2) => i2 === idx ? { ...x, quantidade: e.target.value } : x) }))}
                  style={{ width: 68, padding: '8px 9px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)' }} />
                {form.itens.length > 1 && (
                  <button onClick={() => setForm(f => ({ ...f, itens: f.itens.filter((_, i2) => i2 !== idx) }))}
                    style={{ border: 'none', background: 'none', color: 'var(--err)', cursor: 'pointer', fontSize: 16 }}>×</button>
                )}
              </div>
            ))}
            <button onClick={() => setForm(f => ({ ...f, itens: [...f.itens, { vacina: '', quantidade: 1 }] }))}
              style={{ marginTop: 7, border: '1.5px dashed var(--tq)', background: 'var(--tq4)', color: 'var(--tq2)', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              + Outra vacina
            </button>

            <div className="field" style={{ marginTop: 12 }}><label>Observação</label>
              <input value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} placeholder="Ex.: aplicar em domicílio, trazer gelox…" /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
              <input type="checkbox" checked={form.urgente} onChange={e => setForm({ ...form, urgente: e.target.checked })} style={{ width: 16, height: 16, accentColor: '#dc2626' }} />
              ⚠ Urgente
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setForm(null)} className="btn btn-s">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="btn btn-p" style={{ opacity: salvando ? .6 : 1 }}>{salvando ? 'Enviando…' : 'Solicitar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* 📋 RELATÓRIO DA SEMANA — a agenda inteira com as doses de cada atendimento
   e, no fim, o total de cada vacina. É o documento que vai pro estoque. */
function RelatorioSemana({ sem, andar, recarregar }) {
  if (!sem) return null;
  if (sem.carregando) return <div className="card" style={{ padding: 30, color: 'var(--muted)' }}>Montando o relatório da semana…</div>;
  if (sem.erro) return <div className="card" style={{ padding: 24, color: 'var(--err)', fontWeight: 600 }}>⚠️ {sem.erro}</div>;

  const diaLongo = (d) => fmtData(d, { weekday: 'long', day: '2-digit', month: '2-digit' });
  const r = sem.resumo || {};

  const imprimir = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const esc = (t) => String(t ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const blocos = (sem.dias || []).filter(d => d.eventos.length || d.avulsas.length).map(d => `
      <h3>${esc(diaLongo(d.data))} <small>${d.atendimentos} atendimento(s) &middot; ${d.doses} dose(s)</small></h3>
      <table><thead><tr><th style="width:52px">Hora</th><th>Paciente</th><th>Vacinas do atendimento</th><th style="width:52px" class="c">Doses</th></tr></thead>
      <tbody>${d.eventos.map(e => `<tr>
        <td class="c">${esc(e.hora || '')}</td><td>${esc(e.paciente)}</td>
        <td>${e.doses.length ? e.doses.map(x => `${x.quantidade > 1 ? x.quantidade + 'x ' : ''}${esc(x.vacina)}`).join(', ') : '<i>sem doses lançadas</i>'}</td>
        <td class="c"><b>${e.doses.reduce((n, x) => n + (x.quantidade || 1), 0)}</b></td></tr>`).join('')}
      ${d.avulsas.map(x => `<tr><td class="c">—</td><td>${esc(x.paciente)} <i>(avulso)</i></td><td>${esc(x.vacina)}</td><td class="c"><b>${x.quantidade || 1}</b></td></tr>`).join('')}
      </tbody></table>`).join('');
    const totais = (sem.totais || []).map(t => `<tr><td>${esc(t.vacina)}</td><td class="c"><b>${t.qtd}</b></td></tr>`).join('');
    w.document.write(`<html><head><title>Solicitações da semana</title><meta charset="utf-8">
      <style>@page{size:A4;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;color:#14202b;margin:0;font-size:11.5px}
      h1{color:#0E8C96;margin:0 0 2px;font-size:20px}
      h3{margin:14px 0 5px;font-size:13px;color:#0f172a;text-transform:capitalize;page-break-after:avoid}
      h3 small{font-weight:normal;color:#64748b;font-size:10.5px;text-transform:none}
      .sub{color:#64748b;font-size:12px;margin-bottom:12px}
      .box{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      .box div{border:1px solid #cbd5e1;border-radius:8px;padding:6px 12px;font-size:10.5px;color:#64748b}
      .box b{display:block;font-size:16px;color:#0E8C96}
      table{width:100%;border-collapse:collapse;font-size:11px;page-break-inside:avoid}
      th{background:#0E8C96;color:#fff;padding:5px 8px;text-align:left;font-size:9.5px}
      td{border:1px solid #dbe3ea;padding:4px 8px}td.c{text-align:center}
      .tot{margin-top:16px;page-break-inside:avoid}
      .tot th{background:#123240}
      .rod{margin-top:16px;border-top:1px solid #dbe3ea;padding-top:7px;font-size:9.5px;color:#94a3b8}</style></head><body>
      <h1>Solicitação de Vacinas — Semana</h1>
      <div class="sub">${sem.inicio.split('-').reverse().join('/')} a ${sem.fim.split('-').reverse().join('/')} &middot; Vittalis Saúde</div>
      <div class="box">
        <div>Atendimentos<b>${r.atendimentos || 0}</b></div>
        <div>Doses<b>${r.doses || 0}</b></div>
        <div>Vacinas diferentes<b>${r.vacinas_diferentes || 0}</b></div>
        ${r.sem_definir ? `<div>A definir<b>${r.sem_definir}</b></div>` : ''}
      </div>
      ${blocos || '<p>Nenhum atendimento nesta semana.</p>'}
      <div class="tot">
        <h3>Total de cada vacina na semana</h3>
        <table><thead><tr><th>Vacina</th><th style="width:70px" class="c">Doses</th></tr></thead>
        <tbody>${totais || '<tr><td colspan="2">Nenhuma dose solicitada.</td></tr>'}
        <tr><td style="background:#f0fdf9"><b>TOTAL GERAL</b></td><td class="c" style="background:#f0fdf9"><b>${r.doses || 0}</b></td></tr>
        </tbody></table>
      </div>
      <div class="rod">Emitido em ${new Date().toLocaleString('pt-BR')} · VittaHub CRM</div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <>
      {/* Navegação da semana + números */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => andar(-1)} className="btn btn-sm" style={{ padding: '5px 10px' }}>◀</button>
        <span style={{ fontWeight: 800, fontSize: 13.5, minWidth: 168, textAlign: 'center' }}>
          {sem.inicio.split('-').reverse().slice(0, 2).join('/')} a {sem.fim.split('-').reverse().slice(0, 2).join('/')}
        </span>
        <button onClick={() => andar(1)} className="btn btn-sm" style={{ padding: '5px 10px' }}>▶</button>
        <div style={{ flex: 1 }} />
        {[['Atendimentos', r.atendimentos], ['Doses', r.doses], ['Vacinas', r.vacinas_diferentes]].map(([l, v]) => (
          <div key={l} style={{ textAlign: 'center', minWidth: 74 }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>{l}</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--tq2)' }}>{v || 0}</div>
          </div>
        ))}
        {r.sem_definir > 0 && (
          <span style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#b45309', borderRadius: 20, padding: '4px 11px', fontSize: 11, fontWeight: 800 }}>
            {r.sem_definir} a definir
          </span>
        )}
        <button onClick={recarregar} className="btn btn-s btn-sm" title="Atualizar">🔄</button>
        <button onClick={imprimir} className="btn btn-p btn-sm" style={{ gap: 6, fontWeight: 800 }}><Printer size={13} /> Imprimir</button>
      </div>

      {/* Dia a dia com as doses de cada atendimento */}
      {(sem.dias || []).filter(d => d.eventos.length || d.avulsas.length).length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Nenhum atendimento nesta semana.</div>
      ) : (sem.dias || []).filter(d => d.eventos.length || d.avulsas.length).map(d => (
        <div key={d.data} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 16px', background: 'var(--bg2)' }}>
            <span style={{ fontWeight: 800, fontSize: 13, textTransform: 'capitalize', flex: 1 }}>{diaLongo(d.data)}</span>
            <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>{d.atendimentos} atend.</span>
            <span style={{ fontSize: 12.5, fontWeight: 900, color: 'var(--tq2)' }}>{d.doses} dose(s)</span>
          </div>
          {d.eventos.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '9px 16px', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--tq2)', minWidth: 42 }}>{e.hora}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{e.paciente}</div>
                <div style={{ fontSize: 11.5, color: e.doses.length ? 'var(--txt2)' : '#b45309', lineHeight: 1.5 }}>
                  {e.doses.length
                    ? e.doses.map(x => `${x.quantidade > 1 ? `${x.quantidade}x ` : ''}${x.vacina}`).join(' · ')
                    : '⚠️ sem doses lançadas'}
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--tq2)', minWidth: 24, textAlign: 'right' }}>
                {e.doses.reduce((n, x) => n + (x.quantidade || 1), 0) || '—'}
              </span>
            </div>
          ))}
          {d.avulsas.map(x => (
            <div key={`a-${x.id}`} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 42 }}>avulso</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{x.paciente}</div>
                <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>{x.vacina}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--tq2)' }}>{x.quantidade || 1}</span>
            </div>
          ))}
        </div>
      ))}

      {/* 🧮 Total de cada vacina na semana */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '11px 16px', background: 'linear-gradient(90deg,#123240,#0E8C96)', color: '#fff', fontWeight: 800, fontSize: 13.5 }}>
          🧮 Total de cada vacina na semana
        </div>
        {(sem.totais || []).length === 0 ? (
          <div style={{ padding: 22, textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>Nenhuma dose solicitada nesta semana.</div>
        ) : (<>
          {sem.totais.map(t => (
            <div key={t.vacina} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 13 }}>{t.vacina}</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--tq2)' }}>{t.qtd} {t.qtd === 1 ? 'dose' : 'doses'}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: '2px solid var(--tq)', background: 'var(--bg2)' }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 900 }}>TOTAL GERAL</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--tq2)' }}>{r.doses || 0} doses</span>
          </div>
        </>)}
      </div>
    </>
  );
}
