import React, { useEffect, useState } from 'react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* 📄 RELATÓRIO INDIVIDUAL DA LÍDER — modelo definido pelo Dr. Miécio.
   O sistema preenche "Realizado" e "Faltam" com os números reais do dia;
   o campo "Resultado do dia" fica em branco pra assinar à mão. */

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function RelatorioLider({ onClose }) {
  const api = useApi();
  const { user } = useAuth();
  const gestao = ['master', 'supervisor'].includes(user?.role);
  const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const [dia, setDia] = useState(hojeISO());
  const [quem, setQuem] = useState(user?.id || '');
  const [equipe, setEquipe] = useState([]);
  const [rel, setRel] = useState(null);
  // ✍️ Assinatura que sai no rodapé — nome completo, guardado por pessoa
  const [assinatura, setAssinatura] = useState('');
  useEffect(() => {
    if (!rel?.usuario) return;
    const salva = localStorage.getItem(`vh_assin_${rel.usuario.id}`);
    setAssinatura(salva || rel.usuario.nome || '');
  }, [rel?.usuario?.id]); // eslint-disable-line

  const carregar = (d, q) => {
    setRel({ carregando: true });
    api.get(`/extras/relatorio-lider?data=${d}${q ? `&usuario_id=${q}` : ''}`)
      .then(setRel).catch(e => setRel({ erro: e.message }));
  };
  useEffect(() => { carregar(dia, quem); }, []); // eslint-disable-line
  useEffect(() => {
    if (gestao) api.get('/auth/usuarios').then(u => setEquipe((u || []).filter(x => x.ativo !== false))).catch(() => {});
  }, []); // eslint-disable-line

  const imprimir = () => {
    if (!rel || rel.carregando || rel.erro) return;
    const w = window.open('', '_blank'); if (!w) return;
    const esc = (t) => String(t ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const nome = esc(rel.usuario?.nome || '');
    const setorTxt = rel.usuario?.setor === 'consultas' ? 'Consultas' : rel.usuario?.setor === 'terapias' ? 'Terapias' : 'Vacinas';
    const linhasCat = (rel.categorias || []).map(c => `<tr>
      <td>${esc(c.rotulo)}</td><td class="c">${c.meta}</td>
      <td class="c ${c.realizado >= c.meta ? 'ok' : ''}">${c.realizado}</td>
      <td class="c ${c.faltam ? 'falta' : 'ok'}">${c.faltam || '✔'}</td></tr>`).join('');
    const tc = rel.total_categorias || {};
    const linhasFin = (rel.financeiro || []).map(f => `<tr>
      <td>${esc(f.indicador)}</td><td class="r">${brl(f.meta)}</td>
      <td class="r ${f.realizado >= f.meta ? 'ok' : ''}">${brl(f.realizado)}</td>
      <td class="r ${f.faltam ? 'falta' : 'ok'}">${f.faltam ? brl(f.faltam) : '✔ batida'}</td></tr>`).join('');

    w.document.write(`<html><head><title>Relatório Individual - ${nome}</title><meta charset="utf-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap" rel="stylesheet">
      <style>
        @page{size:A4;margin:14mm}
        *{box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;color:#1a2b33;margin:0;font-size:12px}
        .marca{text-align:right;color:#0E8C96;font-size:11px;margin-bottom:6px}
        h1{text-align:center;font-size:25px;color:#123240;margin:0}
        .sub{text-align:center;color:#12889a;font-size:13px;margin:6px 0 18px}
        .cab{width:100%;border-collapse:collapse;margin-bottom:18px}
        .cab td{padding:6px 12px;font-weight:bold}
        .cab tr:nth-child(odd){background:#eaf6f8}
        .cab td.v{text-align:right;color:#12889a}
        .cab tr:first-child td.v{color:#b8912f}
        h2{color:#123240;font-size:17px;margin:16px 0 7px}
        p{line-height:1.55;margin:0 0 6px}
        ul{margin:0 0 6px 4px;padding-left:16px}
        li{margin-bottom:4px;line-height:1.5}
        table.d{width:100%;border-collapse:collapse;font-size:11.5px}
        table.d th{background:#123240;color:#fff;padding:6px 9px;font-size:11px;text-align:center}
        table.d th:first-child{text-align:left}
        table.d td{padding:6px 9px;border-bottom:1px solid #e6edf0}
        table.d tr:nth-child(even) td{background:#f6f9fa}
        table.d td.c{text-align:center}table.d td.r{text-align:right}
        table.d td.ok{color:#15803d;font-weight:bold}
        table.d td.falta{color:#b45309;font-weight:bold}
        table.d tr.tot td{background:#eef3f5;font-weight:bold}
        .res{margin-top:8px;line-height:2.2;font-size:12.5px}
        .lin{display:inline-block;border-bottom:1px solid #64748b;min-width:230px}
        .assin{margin-top:34px;text-align:center}
        .assin .nome{font-family:'Great Vibes','Segoe Script','Brush Script MT','Lucida Handwriting','Apple Chancery',cursive;
          font-size:40px;color:#123240;line-height:1.1;transform:rotate(-2deg);margin-bottom:0}
        .assin .linha{width:290px;margin:0 auto;border-bottom:1px solid #64748b}
        .assin .cargo{margin-top:5px;font-size:11px;font-weight:bold;color:#123240}
        .assin .cargo2{font-size:10px;color:#64748b}
        .rod{margin-top:22px;text-align:center;color:#64748b;font-size:10.5px}
      </style></head><body>
      <div class="marca">Vittalis Saúde | Setor de ${setorTxt}</div>
      <h1>Relatório Individual - ${rel.usuario?.lider ? 'Líder ' : ''}${nome}</h1>
      <div class="sub">Acompanhamento diário de desempenho e conversão</div>

      <table class="cab">
        <tr><td>Destinado à líder</td><td class="v">${rel.usuario?.lider ? 'Líder ' : ''}${nome}</td></tr>
        <tr><td>Meta global mensal do setor</td><td class="v">${brl(rel.metas?.global_mes)}</td></tr>
        <tr><td>Meta diária do setor</td><td class="v">${brl(rel.metas?.dia_setor)}</td></tr>
        <tr><td>Meta individual</td><td class="v">${brl(rel.metas?.individual)}</td></tr>
      </table>

      <h2>Responsabilidade da líder</h2>
      <p>A ${rel.usuario?.lider ? 'Líder ' : ''}${nome} deve acompanhar diariamente a produção da equipe, garantir o padrão de atendimento, estimular
      ligações estratégicas e conduzir a equipe até o alcance da meta individual e da meta do setor.</p>

      <h2>Checklist diário da liderança</h2>
      <ul>
        <li>Conferir leads novos e oportunidades do dia.</li>
        <li>Garantir que todos os atendimentos sigam o padrão Vittalis.</li>
        <li>Orientar a equipe a criar vínculo com nome, acolhimento e segurança.</li>
        <li>Selecionar clientes quentes para ligação durante o atendimento.</li>
        <li>Cobrar follow-up dos clientes que receberam proposta.</li>
        <li>Acompanhar valor vendido e quanto falta para ${brl(rel.metas?.individual)} no dia.</li>
      </ul>

      <h2>Acompanhamento por categoria</h2>
      <table class="d"><thead><tr><th>Categoria</th><th>Meta do dia</th><th>Realizado</th><th>Faltam</th></tr></thead>
      <tbody>${linhasCat}
        <tr class="tot"><td>Total Geral</td><td class="c">${tc.meta || 0}</td><td class="c">${tc.realizado || 0}</td><td class="c">${tc.faltam || 0}</td></tr>
      </tbody></table>

      <h2>Acompanhamento financeiro individual</h2>
      <table class="d"><thead><tr><th>Indicador</th><th>Meta</th><th>Realizado</th><th>Faltam</th></tr></thead>
      <tbody>${linhasFin}</tbody></table>

      <h2>Resultado do dia</h2>
      <div class="res">
        Data: ${rel.data.split('-').reverse().join(' / ')}<br/>
        Meta individual batida: ( ${rel.resultado?.bateu ? 'X' : '&nbsp;&nbsp;'} ) Sim &nbsp;&nbsp; ( ${rel.resultado?.bateu ? '&nbsp;&nbsp;' : 'X'} ) Não<br/>
        Valor vendido por sua liderança: <b>${brl(rel.resultado?.valor)}</b> (${rel.resultado?.vendas || 0} venda(s))<br/>
        Clientes para follow-up amanhã: <span class="lin"></span>
      </div>

      <div class="assin">
        <div class="nome">${esc(assinatura || nome)}</div>
        <div class="linha"></div>
        <div class="cargo">${esc(assinatura || nome)}${rel.usuario?.lider ? ` &middot; Líder do Setor de ${setorTxt}` : ` &middot; Setor de ${setorTxt}`}</div>
        <div class="cargo2">Vittalis Saúde &middot; ${rel.data.split('-').reverse().join('/')}</div>
      </div>
      <div class="rod">Relatório de Agendamentos e Metas - Liderança</div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose?.()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(3,43,48,.55)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '92vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '13px 20px', background: 'linear-gradient(120deg,#123240,#12889a)', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 17 }}>📄</span>
          <div style={{ flex: 1, minWidth: 130 }}>
            <div style={{ fontWeight: 800, fontSize: 14.5 }}>Relatório individual</div>
            <div style={{ fontSize: 11, opacity: .9 }}>Desempenho e conversão do dia</div>
          </div>
          <input type="date" value={dia} onChange={e => { setDia(e.target.value); carregar(e.target.value, quem); }}
            style={{ padding: '5px 9px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700 }} />
          <button onClick={() => onClose?.()} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 9px', cursor: 'pointer' }}>✕</button>
        </div>

        {gestao && equipe.length > 0 && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
            <select value={quem} onChange={e => { setQuem(e.target.value); carregar(dia, e.target.value); }}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 12.5, fontWeight: 700, background: 'var(--card)', color: 'var(--txt)' }}>
              {equipe.map(u => <option key={u.id} value={u.id}>{u.nome}{u.lider ? ' · líder' : ''}{u.setor ? ` · ${u.setor}` : ''}</option>)}
            </select>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {!rel || rel.carregando ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Montando o relatório…</div>
          : rel.erro ? <div style={{ color: 'var(--err)', fontSize: 13, fontWeight: 600 }}>⚠️ {rel.erro}</div>
          : (<>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{rel.usuario?.lider ? 'Líder ' : ''}{rel.usuario?.nome}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 12, textTransform: 'capitalize' }}>Setor de {rel.usuario?.setor}</div>

            {/* Metas */}
            <div style={{ background: '#eaf6f8', borderRadius: 10, padding: '8px 12px', marginBottom: 14 }}>
              {[['Meta global mensal do setor', rel.metas?.global_mes], ['Meta diária do setor', rel.metas?.dia_setor], ['Meta individual', rel.metas?.individual]].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700, padding: '3px 0' }}>
                  <span style={{ color: '#123240' }}>{l}</span><span style={{ color: '#12889a' }}>{brl(v)}</span>
                </div>
              ))}
            </div>

            {/* Por categoria */}
            <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--muted)', marginBottom: 6 }}>Acompanhamento por categoria</div>
            {(rel.categorias || []).map(c => (
              <div key={c.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ flex: 1, fontSize: 12.5 }}>{c.rotulo}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 52, textAlign: 'center' }}>meta {c.meta}</span>
                <span style={{ fontSize: 13.5, fontWeight: 800, minWidth: 30, textAlign: 'center', color: c.realizado >= c.meta ? 'var(--ok,#16a34a)' : 'var(--txt)' }}>{c.realizado}</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, minWidth: 62, textAlign: 'right', color: c.faltam ? '#b45309' : 'var(--ok,#16a34a)' }}>
                  {c.faltam ? `faltam ${c.faltam}` : '✔ ok'}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, padding: '7px 0', fontWeight: 800, fontSize: 12.5 }}>
              <span style={{ flex: 1 }}>Total Geral</span>
              <span style={{ minWidth: 52, textAlign: 'center', color: 'var(--muted)' }}>{rel.total_categorias?.meta}</span>
              <span style={{ minWidth: 30, textAlign: 'center' }}>{rel.total_categorias?.realizado}</span>
              <span style={{ minWidth: 62, textAlign: 'right', color: rel.total_categorias?.faltam ? '#b45309' : 'var(--ok,#16a34a)' }}>{rel.total_categorias?.faltam || '✔'}</span>
            </div>

            {/* Financeiro */}
            <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--muted)', margin: '14px 0 6px' }}>Acompanhamento financeiro</div>
            {(rel.financeiro || []).map(f => (
              <div key={f.indicador} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span>{f.indicador}</span>
                  <span style={{ fontWeight: 800, color: f.realizado >= f.meta ? 'var(--ok,#16a34a)' : 'var(--txt)' }}>{brl(f.realizado)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
                  <span>meta {brl(f.meta)}</span>
                  <span style={{ color: f.faltam ? '#b45309' : 'var(--ok,#16a34a)', fontWeight: 700 }}>{f.faltam ? `faltam ${brl(f.faltam)}` : '✔ meta batida'}</span>
                </div>
              </div>
            ))}

            {/* Resultado */}
            <div style={{ marginTop: 14, padding: '11px 14px', borderRadius: 11, background: rel.resultado?.bateu ? '#f0fdf4' : 'var(--bg2)', border: `1px solid ${rel.resultado?.bateu ? '#86efac' : 'var(--border)'}` }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: rel.resultado?.bateu ? '#15803d' : 'var(--txt2)' }}>
                {rel.resultado?.bateu ? '🏆 Meta individual batida!' : '🎯 Meta individual ainda não batida'}
              </div>
              <div style={{ fontSize: 12.5, marginTop: 3 }}>
                Vendido hoje: <b>{brl(rel.resultado?.valor)}</b> · {rel.resultado?.vendas || 0} venda(s)
              </div>
            </div>
          </>)}
        </div>

        {rel && !rel.carregando && !rel.erro && (
          <div style={{ padding: '10px 20px 0' }}>
            <label style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4 }}>✍️ Assinatura do relatório</label>
            <input value={assinatura} onChange={e => { setAssinatura(e.target.value); if (rel.usuario) localStorage.setItem(`vh_assin_${rel.usuario.id}`, e.target.value); }}
              placeholder="Nome completo (ex.: Raylane Moraes)"
              style={{ width: '100%', padding: '8px 11px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)', boxSizing: 'border-box', marginTop: 4 }} />
            <div style={{ textAlign: 'center', marginTop: 8, marginBottom: 2 }}>
              <div style={{ fontFamily: "'Great Vibes','Segoe Script','Brush Script MT','Lucida Handwriting','Apple Chancery',cursive", fontSize: 32, color: 'var(--txt)', transform: 'rotate(-2deg)', lineHeight: 1.2 }}>
                {assinatura || rel.usuario?.nome}
              </div>
              <div style={{ width: 220, margin: '2px auto 0', borderBottom: '1px solid var(--muted)' }} />
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>como vai sair no papel</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, padding: '13px 20px', borderTop: '1px solid var(--border)' }}>
          <button onClick={imprimir} disabled={!rel || rel.carregando || rel.erro} className="btn btn-p" style={{ gap: 6, fontWeight: 800, flex: 1 }}>🖨️ Imprimir relatório</button>
          <button onClick={() => onClose?.()} className="btn btn-s">Fechar</button>
        </div>
      </div>
    </div>
  );
}
