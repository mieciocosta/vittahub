import React, { useEffect, useState } from 'react';
import { Download, BarChart2, TrendingUp, Users } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt, COLORS } from '../hooks/utils.js';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

// Cor da nota de qualidade (0-100): verde bom, amarelo médio, vermelho ruim
function qScore(v) { if (v == null) return 'var(--muted)'; return v >= 75 ? '#16a34a' : v >= 50 ? '#d97706' : '#dc2626'; }

function gerarPDF(data) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Relatório Comercial — Vittalis Saúde</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Plus Jakarta Sans',sans-serif;color:#0a1520;background:#fff;}
  .faixa{height:7px;background:linear-gradient(90deg,#00B8C0,#0E8C96);}
  .pagina{padding:36px 44px;}
  .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
  .header img{height:92px;}
  .header .tit{text-align:right;}
  .header .tit h1{font-size:23px;font-weight:800;letter-spacing:-.5px;color:#06424A;}
  .header .tit .sub{font-size:13px;color:#5a7285;margin-top:3px;font-weight:600;}
  .header .tit .quando{display:inline-block;margin-top:8px;background:#e5f8f9;color:#007d83;padding:4px 13px;border-radius:20px;font-size:11px;font-weight:700;}
  .divisor{height:1.5px;background:#e3ebf1;margin:20px 0 26px;}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:30px;}
  .kpi{background:linear-gradient(165deg,#f7fbfc,#eef5f8);border:1px solid #e3ebf1;border-radius:14px;padding:16px 18px;}
  .kpi .val{font-size:25px;font-weight:800;letter-spacing:-.5px;color:#06424A;}
  .kpi .lbl{font-size:11px;color:#5a7285;margin-top:4px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;}
  .kpi.destaque{background:linear-gradient(135deg,#06424A,#0E8C96);border:none;}
  .kpi.destaque .val{color:#fff;}
  .kpi.destaque .lbl{color:rgba(255,255,255,.65);}
  .kpi.destaque .val{font-size:19px;white-space:nowrap;}
  .section{margin-bottom:26px;}
  .section h2{font-size:14px;font-weight:800;letter-spacing:-.2px;color:#06424A;margin-bottom:11px;display:flex;align-items:center;gap:8px;}
  .section h2::before{content:'';width:4px;height:15px;border-radius:3px;background:#00B8C0;display:inline-block;}
  table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #e3ebf1;border-radius:12px;overflow:hidden;}
  th{background:#06424A;color:#fff;padding:9px 14px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;}
  td{padding:10px 14px;font-size:12.5px;border-top:1px solid #eef3f7;}
  tr:nth-child(even) td{background:#f8fbfc;}
  td.num{font-weight:700;}
  .ok{color:#0fb07a;font-weight:800;}
  .gold{color:#C4973B;font-weight:800;}
  .footer{margin-top:36px;padding-top:14px;border-top:1.5px solid #e3ebf1;font-size:10.5px;color:#8fa3b3;display:flex;justify-content:space-between;font-weight:600;}
  @media print{.pagina{padding:24px 30px;}}
</style>
</head>
<body>
<div class="faixa"></div>
<div class="pagina">
  <div class="header">
    <img src="${window.location.origin}/logos/logo-v-color.png" alt="Vittalis Saúde" />
    <div class="tit">
      <h1>Relatório Comercial</h1>
      <div class="sub">VittaHub CRM — ${data.periodo}</div>
      <div class="quando">Gerado em ${data.geradoEm}</div>
    </div>
  </div>
  <div class="divisor"></div>

  <div class="kpis">
    <div class="kpi"><div class="val">${data.totalLeads}</div><div class="lbl">Total de leads</div></div>
    <div class="kpi"><div class="val">${data.fechados}</div><div class="lbl">Fechados</div></div>
    <div class="kpi"><div class="val">${data.totalLeads>0?((data.fechados/data.totalLeads)*100).toFixed(1):0}%</div><div class="lbl">Conversão</div></div>
    <div class="kpi destaque"><div class="val">${fmt.brl(data.totalVendido)}</div><div class="lbl">Faturado</div></div>
  </div>

  <div class="section">
    <h2>Leads por canal de origem</h2>
    <table>
      <tr><th>Canal</th><th>Total</th><th>Fechados</th><th>Taxa</th></tr>
      ${Object.entries(data.porOrigem||{}).map(([k,v])=>`<tr><td>${k}</td><td class="num">${v.total}</td><td class="ok">${v.fechados}</td><td class="num">${v.total>0?((v.fechados/v.total)*100).toFixed(0):0}%</td></tr>`).join('')}
    </table>
  </div>

  <div class="section">
    <h2>Desempenho por atendente</h2>
    <table>
      <tr><th>Atendente</th><th>Leads</th><th>Fechados</th><th>Faturado</th><th>Taxa</th></tr>
      ${Object.entries(data.porResponsavel||{}).sort((a,b)=>b[1].valor-a[1].valor).map(([k,v])=>`<tr><td>${k}</td><td class="num">${v.leads}</td><td class="ok">${v.fechados}</td><td class="gold">${fmt.brl(v.valor)}</td><td class="num">${v.leads>0?((v.fechados/v.leads)*100).toFixed(0):0}%</td></tr>`).join('')}
    </table>
  </div>

  <div class="footer">
    <span>Vittalis Saúde · Business Center Renascença · São Luís, MA</span>
    <span>vittalissaude.com.br · (98) 98422-1002</span>
  </div>
</div>
</body>
</html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

export default function Relatorios() {
  const api = useApi();
  const { isMaster } = useAuth();
  const [data, setData] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [dias, setDias] = useState(7); // período dos gráficos diários: 7 | 30 | 90

  useEffect(() => { setData(null); api.get(`/reports/dashboard?days=${dias}`).then(setData); }, [dias]); // eslint-disable-line
  const [vendasR, setVendasR] = useState(null);
  const [perdasR, setPerdasR] = useState(null);
  const [qual, setQual] = useState(null);          // qualidade de atendimento (IA)
  const [analisando, setAnalisando] = useState(false);
  useEffect(() => {
    if (!isMaster) return; // painel comercial + qualidade é só do master
    api.get('/extras/vendas/resumo').then(setVendasR).catch(()=>{});
    api.get('/extras/perdas/resumo').then(setPerdasR).catch(()=>{});
    api.get('/inbox/qualidade/resumo').then(setQual).catch(()=>{});
  }, [isMaster]); // eslint-disable-line

  const analisarQualidade = async () => {
    setAnalisando(true);
    try {
      const r = await api.post('/inbox/qualidade/analisar', { limite: 6 });
      const d = await api.get('/inbox/qualidade/resumo'); setQual(d);
      if (!r.analisadas) window.alert(r.tentadas ? 'Nada novo para analisar (as conversas recentes já foram avaliadas nos últimos 7 dias).' : 'Não há conversas com mensagens da equipe para avaliar ainda.');
    } catch (e) { window.alert('Erro na análise: ' + (e.message || e)); }
    finally { setAnalisando(false); }
  };

  const handlePDF = async () => {
    setPdfLoading(true);
    try { const d = await api.get('/reports/pdf-data'); gerarPDF(d); }
    finally { setPdfLoading(false); }
  };

  // Exporta os leads em CSV (Excel abre direto) — separador ; e BOM p/ acentuação
  const handleCSV = async () => {
    const d = await api.get('/leads?limit=1000');
    const rows = d.data || [];
    const cab = ['Nome','Telefone','E-mail','Origem','Interesse','Etapa','Responsável','Valor proposta','Serviço','Entrada','Retorno','Tags','Observações'];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = rows.map(l => [
      l.nome, l.telefone, l.email, l.origem, l.interesse, l.status,
      l.responsavel_nome || '', l.valor_proposta ?? '', l.servico || '',
      String(l.data_entrada || '').slice(0, 10), String(l.data_retorno || '').slice(0, 10),
      (l.tags || []).join(' '), l.observacoes || '',
    ].map(esc).join(';'));
    const csv = '\ufeff' + [cab.map(esc).join(';'), ...linhas].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leads-vittahub-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!data) return <div style={{padding:40,display:'flex',justifyContent:'center'}}><span className="spin" style={{width:28,height:28}}/></div>;

  const { resumo, porOrigem, porStatus, motivosPerda, porResponsavel } = data;
  // API devolve arrays (não objetos) — leitura corrigida
  const origemData = (porOrigem||[]).map(v=>({name:v.origem||'—', total:+v.total, fechados:+v.fechados, taxa:v.total>0?+((v.fechados/v.total)*100).toFixed(0):0}));
  const statusData = (porStatus||[]).map(v=>({name:v.status, value:+v.n}));
  const respData   = (porResponsavel||[]).map(v=>({...v, leads:+v.leads, fechados:+v.fechados, valor:+v.valor||0})).sort((a,b)=>b.valor-a.valor);
  const perdaData  = (motivosPerda||[]).map(v=>({name:v.motivo_perda, value:+v.n}));

  return (
    <div style={{ padding:'28px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:30 }}>Relatórios</h1>
          <p style={{ color:'var(--muted)', fontSize:13, marginTop:2 }}>Análise completa do funil comercial</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', background:'var(--card)', borderRadius:10, border:'1.5px solid var(--border)', overflow:'hidden' }}>
            {[[7,'7 dias'],[30,'30 dias'],[90,'90 dias']].map(([d,l])=>(
              <button key={d} onClick={()=>setDias(d)}
                style={{ padding:'7px 13px', fontSize:12, fontWeight:700, border:'none', cursor:'pointer',
                  background: dias===d?'var(--tq)':'transparent', color: dias===d?'#fff':'var(--muted)' }}>{l}</button>
            ))}
          </div>
          <button onClick={handleCSV} className="btn btn-s" style={{ gap:7 }}>
            <Download size={14}/> CSV
          </button>
        {isMaster && (
          <button onClick={handlePDF} disabled={pdfLoading} className="btn btn-p" style={{ gap:7 }}>
            {pdfLoading?<span className="spin" style={{width:15,height:15}}/>:<Download size={15}/>}
            Exportar PDF
          </button>
        )}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12, marginBottom:20 }}>
        {[
          {l:'Total Leads',v:resumo.totalLeads},
          {l:'Hoje',v:resumo.leadsHoje},
          {l:'Em atendimento',v:resumo.emAtendimento,c:'var(--org)'},
          {l:'Fechados',v:resumo.fechados,c:'var(--ok)'},
          {l:'Perdidos',v:resumo.perdidos,c:'var(--err)'},
          {l:'Conversão',v:`${resumo.taxaConversao}%`,c:'var(--pet)'},
          ...(isMaster?[{l:'Faturado',v:fmt.brl(resumo.totalVendido),c:'var(--gold)'},{l:'Ticket Médio',v:fmt.brl(resumo.ticket),c:'var(--gold)'}]:[]),
        ].map(k=>(
          <div key={k.l} className="card" style={{padding:'13px 15px'}}>
            <div style={{fontSize:10.5,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>{k.l}</div>
            <div style={{fontFamily:'Syne',fontWeight:800,fontSize:20,color:k.c||'var(--txt)'}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Comercial do mês: vendas (4 camadas) + perdas por motivo — só master */}
      {isMaster && (vendasR || perdasR) && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
          {vendasR && (
            <div className="card" style={{ padding:'17px 19px' }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>💰 Vendas do mês ({vendasR.mes})</div>
              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                {[['Confirmado', vendasR.total?.confirmado, 'var(--ok)'],['Agendado', vendasR.total?.agendado, '#2563eb'],['Pendente', vendasR.total?.pendente, '#d97706']].map(([l,v,c])=>(
                  <div key={l} style={{ flex:1, background:'var(--bg2)', borderRadius:9, padding:'8px 10px' }}>
                    <div style={{ fontSize:10.5, color:'var(--muted)', fontWeight:600 }}>{l}</div>
                    <div style={{ fontSize:15, fontWeight:800, color:c }}>{fmt.brl(v)}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:11.5, fontWeight:700, color:'var(--muted)', marginBottom:6 }}>Por categoria</div>
              {(vendasR.porCategoria||[]).slice(0,6).map((c,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:12.5 }}>
                  <span>{c.categoria || '—'} <span style={{ color:'var(--muted)' }}>({c.n})</span></span>
                  <b style={{ color:'var(--ok)' }}>{fmt.brl(c.confirmado)}</b>
                </div>
              ))}
              {(vendasR.porCategoria||[]).length===0 && <div style={{ fontSize:12, color:'var(--muted)' }}>Sem vendas neste mês.</div>}
            </div>
          )}
          {perdasR && (
            <div className="card" style={{ padding:'17px 19px' }}>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:4 }}>❌ Perdas do mês</div>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:12 }}>{perdasR.total} perdas · potencial perdido <b style={{ color:'var(--err)' }}>{fmt.brl(perdasR.valorPerdido)}</b></div>
              <div style={{ fontSize:11.5, fontWeight:700, color:'var(--muted)', marginBottom:6 }}>Principais motivos</div>
              {(perdasR.porMotivo||[]).slice(0,8).map((m,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:12.5 }}>
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginRight:8 }}>{m.motivo}</span>
                  <b style={{ color:'var(--err)' }}>{m.n}</b>
                </div>
              ))}
              {(perdasR.porMotivo||[]).length===0 && <div style={{ fontSize:12, color:'var(--muted)' }}>Nenhuma perda registrada. 🎉</div>}
            </div>
          )}
        </div>
      )}

      {/* Meta geral por setor + Vendas por atendente — mês corrente — só master */}
      {isMaster && vendasR && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
          <div className="card" style={{ padding:'17px 19px' }}>
            <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>🎯 Meta por setor ({vendasR.mes})</div>
            {[['vacinas','💉 Vacinas','#7c5cbf'],['consultas','🩺 Consultas','#00B8C0'],['terapias','🧩 Terapias','#C4973B']].map(([k,rotulo,cor])=>{
              const s = vendasR.setores?.[k] || { confirmado:0, meta:0, pct:null, falta:0 };
              const pct = Math.min(s.pct||0,100);
              return (
                <div key={k} style={{ marginBottom:13 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12.5, marginBottom:4 }}>
                    <span style={{ fontWeight:700 }}>{rotulo}</span>
                    <span style={{ fontWeight:800, color:cor }}>{fmt.brl(s.confirmado)}{s.meta>0?` / ${fmt.brl(s.meta)}`:''}</span>
                  </div>
                  <div style={{ height:8, borderRadius:5, background:'var(--bg2)', overflow:'hidden' }}>
                    <div style={{ width:`${pct}%`, height:'100%', borderRadius:5, background:(s.meta>0&&s.falta===0)?'var(--ok)':cor }}/>
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>{s.meta>0?(s.falta===0?'🏆 Meta batida!':`Faltam ${fmt.brl(s.falta)} · ${s.pct}%`):'Sem meta definida'}</div>
                </div>
              );
            })}
            <div style={{ marginTop:6, paddingTop:10, borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', fontSize:13 }}>
              <span style={{ fontWeight:800 }}>Total geral</span>
              <span style={{ fontWeight:800, color:'var(--ok)' }}>{fmt.brl(vendasR.total?.confirmado)}{vendasR.total?.meta>0?` / ${fmt.brl(vendasR.total.meta)} (${vendasR.total.pct??0}%)`:''}</span>
            </div>
          </div>

          <div className="card" style={{ padding:'17px 19px' }}>
            <div style={{ fontWeight:800, fontSize:14, marginBottom:12 }}>💰 Vendas por atendente ({vendasR.mes})</div>
            {(vendasR.porAtendente||[]).slice(0,8).map((a,i)=>{
              const max = Math.max(...(vendasR.porAtendente||[]).map(x=>x.confirmado||0),1);
              const pct = Math.min(((a.confirmado||0)/max)*100,100);
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:i<Math.min((vendasR.porAtendente||[]).length,8)-1?'1px solid var(--border)':'none' }}>
                  <span style={{ fontFamily:'Syne', fontWeight:800, fontSize:14, color:i===0?'var(--gold)':'var(--muted)', minWidth:20 }}>{i+1}º</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontWeight:700, fontSize:12.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{(a.nome||'—').split(' ')[0]}</span>
                      <span style={{ fontWeight:800, fontSize:12.5, color:'var(--ok)' }}>{fmt.brl(a.confirmado)}</span>
                    </div>
                    <div style={{ height:6, borderRadius:5, background:'var(--bg2)', overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%', borderRadius:5, background:i===0?'var(--gold)':'var(--tq)' }}/>
                    </div>
                  </div>
                  <span style={{ fontSize:10.5, color:'var(--muted)', minWidth:42, textAlign:'right' }}>{a.n} venda{a.n===1?'':'s'}</span>
                </div>
              );
            })}
            {(vendasR.porAtendente||[]).length===0 && <div style={{ fontSize:12, color:'var(--muted)' }}>Sem vendas neste mês.</div>}
          </div>
        </div>
      )}

      {/* Qualidade do Atendimento (IA) — nota 0-100 — só master */}
      {isMaster && (
        <div className="card" style={{ padding:'18px 20px', marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, marginBottom:14 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:14 }}>🤖 Qualidade do Atendimento (IA)</div>
              <div style={{ fontSize:11.5, color:'var(--muted)', marginTop:2 }}>
                Nota de 0 a 100 que a IA dá para a forma como cada atendente conduz as conversas.
                {qual?.geral?.n>0 && <> Média geral <b style={{color:qScore(qual.geral.media)}}>{qual.geral.media}</b> em {qual.geral.n} atendimentos.</>}
              </div>
            </div>
            <button onClick={analisarQualidade} disabled={analisando} className="btn btn-p" style={{ gap:7 }}>
              {analisando ? <span className="spin" style={{width:15,height:15}}/> : '✨'} {analisando ? 'Analisando…' : 'Analisar conversas recentes'}
            </button>
          </div>

          {(!qual || (qual.porAtendente||[]).length===0) ? (
            <div style={{ fontSize:12.5, color:'var(--muted)', padding:'8px 0' }}>
              Ainda não há análises. Clique em <b>“Analisar conversas recentes”</b> — a IA avalia as últimas conversas e monta a média por atendente. (Custo controlado: até 6 conversas por clique.)
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'minmax(260px,1fr) minmax(260px,1.2fr)', gap:18 }}>
              {/* Média por atendente */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>Média por atendente</div>
                {(qual.porAtendente||[]).map((a,i)=>(
                  <div key={i} style={{ padding:'8px 0', borderBottom:i<qual.porAtendente.length-1?'1px solid var(--border)':'none' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                      <span style={{ fontWeight:700, fontSize:13 }}>{(a.nome||'—').split(' ')[0]} <span style={{ color:'var(--muted)', fontWeight:500, fontSize:11 }}>· {a.n} atend.</span></span>
                      <span style={{ fontWeight:800, fontSize:15, color:qScore(a.media) }}>{a.media}</span>
                    </div>
                    <div style={{ height:7, borderRadius:5, background:'var(--bg2)', overflow:'hidden' }}>
                      <div style={{ width:`${a.media}%`, height:'100%', borderRadius:5, background:qScore(a.media) }}/>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
                      {[['Agilidade',a.agilidade],['Cordialidade',a.cordialidade],['Clareza',a.clareza],['Condução',a.conducao],['Fechamento',a.fechamento]].map(([l,v])=>(
                        <span key={l} style={{ fontSize:10, color:'var(--muted)' }}>{l} <b style={{ color:qScore(v) }}>{v??'—'}</b></span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {/* Análises recentes */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>Análises recentes</div>
                <div style={{ maxHeight:300, overflowY:'auto' }}>
                  {(qual.recentes||[]).map(rrec=>(
                    <div key={rrec.id} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ minWidth:38, height:38, borderRadius:9, background:qScore(rrec.score)+'22', color:qScore(rrec.score), display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14 }}>{rrec.score}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:700 }}>{(rrec.atendente_nome||'—').split(' ')[0]} <span style={{ color:'var(--muted)', fontWeight:500 }}>· {rrec.cliente_nome||'cliente'}</span></div>
                        <div style={{ fontSize:11.5, color:'var(--txt2)' }}>{rrec.resumo}</div>
                        {rrec.pontos_fracos && <div style={{ fontSize:11, color:'var(--err)', marginTop:2 }}>⚠ {rrec.pontos_fracos}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <Card title="Leads por Canal">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={origemData}>
              <XAxis dataKey="name" tick={{fontSize:11.5}}/>
              <YAxis tick={{fontSize:11}}/>
              <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
              <Bar dataKey="total" fill="var(--pet)" radius={[4,4,0,0]} name="Total"/>
              <Bar dataKey="fechados" fill="var(--tq)" radius={[4,4,0,0]} name="Fechados"/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Por Status">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72} innerRadius={36}>
                {statusData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Pie>
              <Legend iconType="circle" iconSize={9} wrapperStyle={{fontSize:11}}/>
              <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <Card title="Taxa de Conversão por Canal">
          {origemData.map(o=>(
            <div key={o.name} style={{marginBottom:13}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:5}}>
                <span style={{fontWeight:600}}>{o.name}</span>
                <span style={{color:'var(--muted)'}}>{o.fechados}/{o.total} · <strong style={{color:o.taxa>=50?'var(--ok)':o.taxa>=25?'var(--warn)':'var(--err)'}}>{o.taxa}%</strong></span>
              </div>
              <div style={{height:7,background:'var(--bg2)',borderRadius:4,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${o.taxa}%`,background:o.taxa>=50?'var(--ok)':o.taxa>=25?'var(--warn)':'var(--err)',borderRadius:4,transition:'width .6s'}}/>
              </div>
            </div>
          ))}
        </Card>

        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <Card title="Motivos de Perda">
            {perdaData.length===0?<div style={{color:'var(--light)',fontSize:13,textAlign:'center',padding:'10px 0'}}>Nenhuma perda registrada</div>
              :perdaData.map((p,i)=>(
                <div key={p.name} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:i<perdaData.length-1?'1px solid var(--border)':'none',fontSize:13}}>
                  <span>{p.name}</span><span style={{fontWeight:700,color:'var(--err)'}}>{p.value}</span>
                </div>
              ))}
          </Card>

          {isMaster && (porResponsavel||[]).length>0 && (
            <Card title="👏 Atividade por atendente">
              {respData.slice(0,5).map((rv,i)=>(
                <div key={rv.id||rv.nome} style={{display:'flex',alignItems:'center',gap:9,padding:'8px 0',borderBottom:i<Math.min(respData.length,5)-1?'1px solid var(--border)':'none'}}>
                  <div style={{width:26,height:26,borderRadius:'50%',background:rv.cor||'var(--tq)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:'#fff'}}>{fmt.initials(rv.nome)}</div>
                  <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{rv.nome}</div><div style={{fontSize:11,color:'var(--muted)'}}>{rv.leads} conversas · {rv.fechados} venda{rv.fechados===1?'':'s'} no mês</div></div>
                  <div style={{fontWeight:800,color:rv.valor>0?'var(--ok)':'var(--muted)',fontSize:13}}>{fmt.brl(rv.valor)}</div>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({title,children}){
  return <div className="card" style={{padding:'18px 20px'}}><h3 style={{fontSize:11.5,fontWeight:700,color:'var(--muted)',marginBottom:14,textTransform:'uppercase',letterSpacing:.5}}>{title}</h3>{children}</div>;
}
