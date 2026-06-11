import React, { useEffect, useState } from 'react';
import { Download, BarChart2, TrendingUp, Users } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt, COLORS } from '../hooks/utils.js';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

function gerarPDF(data) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Relatório VittaHub — ${data.periodo}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600;700&family=Syne:wght@700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Instrument Sans',sans-serif;color:#0c1a27;background:#fff;padding:40px;}
  .header{display:flex;justify-content:space-between;align-items:center;padding-bottom:24px;border-bottom:3px solid #00B8C0;margin-bottom:32px;}
  .brand{display:flex;flex-direction:column;}
  .brand .nome{font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:#207898;}
  .brand .sub{font-size:13px;color:#607080;margin-top:2px;}
  .badge{background:#00B8C0;color:#fff;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px;}
  .kpi{background:#f2f5f8;border-radius:12px;padding:18px;border-left:4px solid #00B8C0;}
  .kpi .val{font-family:'Syne',sans-serif;font-size:24px;font-weight:800;color:#0c1a27;}
  .kpi .lbl{font-size:12px;color:#607080;margin-top:3px;font-weight:600;}
  .section{margin-bottom:28px;}
  .section h2{font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:#207898;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;padding-bottom:6px;border-bottom:2px solid #e1e8ee;}
  table{width:100%;border-collapse:collapse;}
  th{background:#e1e8ee;padding:9px 12px;text-align:left;font-size:11.5px;font-weight:700;color:#607080;text-transform:uppercase;letter-spacing:.4px;}
  td{padding:10px 12px;border-bottom:1px solid #f2f5f8;font-size:13px;}
  tr:hover td{background:#f8fafb;}
  .ok{color:#10b981;font-weight:700;}
  .footer{margin-top:40px;padding-top:16px;border-top:2px solid #e1e8ee;font-size:11.5px;color:#8fa0b0;display:flex;justify-content:space-between;}
</style>
</head>
<body>
<div class="header">
    <img src="${window.location.origin}/logos/logo-v-black.png" alt="Vittalis Saúde" style="height:74px;display:block;margin:0 auto 12px;" />
  <div class="brand">
    <div class="nome">VittaHub · Vittalis Saúde</div>
    <div class="sub">Relatório Comercial — ${data.periodo}</div>
  </div>
  <div class="badge">Gerado em ${data.geradoEm}</div>
</div>

<div class="kpis">
  <div class="kpi"><div class="val">${data.totalLeads}</div><div class="lbl">Total de Leads</div></div>
  <div class="kpi"><div class="val">${data.fechados}</div><div class="lbl">Fechados</div></div>
  <div class="kpi"><div class="val">${data.totalLeads>0?((data.fechados/data.totalLeads)*100).toFixed(1):0}%</div><div class="lbl">Taxa de Conversão</div></div>
  <div class="kpi" style="border-color:#C4973B"><div class="val" style="color:#C4973B">${fmt.brl(data.totalVendido)}</div><div class="lbl">Total Faturado</div></div>
</div>

<div class="section">
  <h2>Leads por Canal de Origem</h2>
  <table>
    <tr><th>Canal</th><th>Total</th><th>Fechados</th><th>Taxa %</th></tr>
    ${Object.entries(data.porOrigem||{}).map(([k,v])=>`<tr><td>${k}</td><td>${v.total}</td><td class="ok">${v.fechados}</td><td>${v.total>0?((v.fechados/v.total)*100).toFixed(0):0}%</td></tr>`).join('')}
  </table>
</div>

<div class="section">
  <h2>Desempenho por Atendente</h2>
  <table>
    <tr><th>Atendente</th><th>Leads</th><th>Fechados</th><th>Faturado</th><th>Taxa %</th></tr>
    ${Object.entries(data.porResponsavel||{}).sort((a,b)=>b[1].valor-a[1].valor).map(([k,v])=>`<tr><td>${k}</td><td>${v.leads}</td><td class="ok">${v.fechados}</td><td class="ok">${fmt.brl(v.valor)}</td><td>${v.leads>0?((v.fechados/v.leads)*100).toFixed(0):0}%</td></tr>`).join('')}
  </table>
</div>

<div class="footer">
  <span>VittaHub CRM · Vittalis Saúde · São Luís, MA</span>
  <span>Relatório gerado automaticamente pelo sistema</span>
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

          {isMaster&&respData.length>0&&(
            <Card title="🏆 Ranking de Atendentes">
              {respData.slice(0,4).map((rv,i)=>(
                <div key={rv.nome} style={{display:'flex',alignItems:'center',gap:9,padding:'8px 0',borderBottom:i<3?'1px solid var(--border)':'none'}}>
                  <span style={{fontFamily:'Syne',fontWeight:800,fontSize:16,color:i===0?'var(--gold)':i===1?'#94a3b8':'var(--light)',minWidth:22}}>{i+1}°</span>
                  <div style={{width:26,height:26,borderRadius:'50%',background:rv.cor||'var(--tq)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:'#fff'}}>{fmt.initials(rv.nome)}</div>
                  <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{rv.nome}</div><div style={{fontSize:11,color:'var(--muted)'}}>{rv.leads} leads · {rv.taxa}% conv.</div></div>
                  <div style={{fontWeight:800,color:'var(--ok)',fontSize:13}}>{fmt.brl(rv.valor)}</div>
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
