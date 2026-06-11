import React, { useEffect, useState } from 'react';
import { TrendingUp, Users, CheckCircle, XCircle, DollarSign, Target, MessageSquare, Calendar, AlertTriangle, ArrowRight } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt, COLORS, STATUS_CLR } from '../hooks/utils.js';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, LineChart, Line, CartesianGrid, AreaChart, Area } from 'recharts';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const api = useApi();
  const { isMaster, user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);

  const [colunas, setColunas] = useState([]);
  useEffect(() => {
    api.get('/reports/dashboard').then(setData);
    api.get('/leads/colunas').then(setColunas).catch(()=>{});
  }, []);
  if (!data) return <div style={{padding:40,display:'flex',justifyContent:'center'}}><span className="spin" style={{width:28,height:28}} /></div>;

  const { resumo, porOrigem, porResponsavel, porStatus, motivosPerda, porDia } = data;
  // A API devolve ARRAYS ({origem,total,fechados}...) — antes era lido com
  // Object.entries e os gráficos saíam com "0, 1, 2" no lugar dos nomes
  const origemData = (porOrigem||[]).map(v=>({name:v.origem||'—', total:+v.total, fechados:+v.fechados, taxa:v.total>0?+((v.fechados/v.total)*100).toFixed(0):0}));
  const statusData = (porStatus||[]).map(v=>({name:v.status, value:+v.n}));
  const respData   = (porResponsavel||[]).map(v=>({...v, leads:+v.leads, fechados:+v.fechados, valor:+v.valor||0})).sort((a,b)=>b.valor-a.valor);
  const diaData    = (porDia||[]).map(d=>({...d, leads:+d.leads, fechados:+d.fechados, name:new Date(d.data+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}));
  const corDaEtapa = (nome) => colunas.find(c=>c.nome===nome)?.cor || 'var(--tq)';
  const funilTotal = statusData.reduce((sum,x)=>sum+x.value,0);
  const saudacao = (() => { const h = new Date().getHours(); return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'; })();

  return (
    <div style={{ padding:'28px' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:30 }}>{isMaster ? 'Dashboard' : `${saudacao}, ${user?.nome?.split(' ')[0]}`}</h1>
          <p style={{ color:'var(--muted)', fontSize:13.5, marginTop:3 }}>{isMaster?'Visão geral do comercial Vittalis':'Seus leads e conversas de hoje'}</p>
        </div>
        <div style={{ fontSize:12, color:'var(--muted)', background:'var(--card)', padding:'7px 14px', borderRadius:8, boxShadow:'var(--sh1)' }}>
          {new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}
        </div>
      </div>

      {/* Alerts */}
      {(resumo.retornosHoje>0 || resumo.retornosVencidos>0) && (
        <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
          {resumo.retornosVencidos>0 && (
            <div onClick={()=>nav('/retornos')} style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 16px', borderRadius:10, background:'#fff7ed', border:'1.5px solid #fed7aa', cursor:'pointer' }}>
              <AlertTriangle size={15} color="#f97316" />
              <span style={{ fontSize:13, fontWeight:600, color:'#c2410c' }}>{resumo.retornosVencidos} retorno{resumo.retornosVencidos>1?'s':''} vencido{resumo.retornosVencidos>1?'s':''}</span>
              <ArrowRight size={13} color="#f97316" />
            </div>
          )}
          {resumo.retornosHoje>0 && (
            <div onClick={()=>nav('/retornos')} style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 16px', borderRadius:10, background:'var(--warn2)', border:'1.5px solid #fcd34d', cursor:'pointer' }}>
              <Calendar size={15} color="var(--warn)" />
              <span style={{ fontSize:13, fontWeight:600, color:'#92400e' }}>{resumo.retornosHoje} retorno{resumo.retornosHoje>1?'s':''} para hoje</span>
              <ArrowRight size={13} color="var(--warn)" />
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(165px,1fr))', gap:12, marginBottom:22 }}>
        <KPI icon={Users}        label="Total Leads"    value={resumo.totalLeads}           color="var(--pet)" />
        <KPI icon={TrendingUp}   label="Hoje"           value={resumo.leadsHoje}             color="var(--tq)" />
        <KPI icon={CheckCircle}  label="Fechados"       value={resumo.fechados}              color="var(--ok)" />
        <KPI icon={Target}       label="Conversão"      value={`${resumo.taxaConversao}%`}   color="var(--pet)" />
        {isMaster && <KPI icon={DollarSign}  label="Faturado"     value={fmt.brl(resumo.totalVendido)} color="var(--gold)" large />}
        {isMaster && <KPI icon={TrendingUp}  label="Pipeline em aberto" value={fmt.brl(resumo.pipeline)} color="var(--pet)" />}
        {isMaster && resumo.ticket && <KPI icon={ArrowRight} label="Ticket Médio" value={fmt.brl(resumo.ticket)} color="var(--gold)" />}
        <KPI icon={MessageSquare} label="Msgs. Novas"   value={resumo.totalUnread}           color={resumo.totalUnread>0?'var(--wa)':'var(--muted)'} onClick={()=>nav('/inbox')} />
        <KPI icon={Calendar}     label="Retornos Hoje"  value={resumo.retornosHoje}          color={resumo.retornosHoje>0?'var(--warn)':'var(--muted)'} />
      </div>

      {/* Funil visual — etapas com as cores reais do Kanban */}
      {funilTotal > 0 && (
        <div className="card" style={{ padding:'18px 20px', marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <h2 style={{ fontSize:14.5, fontWeight:800 }}>Funil agora</h2>
            <button onClick={()=>nav('/funil')} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 11px', borderRadius:8, background:'var(--tq3)', color:'var(--tq2)', fontSize:11.5, fontWeight:700, border:'none', cursor:'pointer' }}>
              Abrir Kanban <ArrowRight size={11}/>
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
            {(colunas.length ? colunas.map(c=>({ name:c.nome, cor:c.cor, value: statusData.find(x=>x.name===c.nome)?.value || 0 })) : statusData.map(x=>({ ...x, cor:'var(--tq)' })))
              .map(et => (
              <div key={et.name} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:138, fontSize:12, fontWeight:700, color:'var(--txt2)', textAlign:'right', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{et.name}</div>
                <div style={{ flex:1, height:20, background:'var(--bg2)', borderRadius:7, overflow:'hidden' }}>
                  <div style={{ width:`${funilTotal>0?Math.max(et.value/funilTotal*100, et.value>0?4:0):0}%`, height:'100%', background:et.cor, borderRadius:7, transition:'width .4s ease' }}/>
                </div>
                <div style={{ width:34, fontSize:12.5, fontWeight:800, color:et.value>0?'var(--txt)':'var(--light)', flexShrink:0 }}>{et.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts row 1 */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:16 }}>
        <Card title="Leads × Fechados — Últimos 7 dias">
          <ResponsiveContainer width="100%" height={185}>
            <AreaChart data={diaData}>
              <defs>
                <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--tq)" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="var(--tq)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{fontSize:11.5}} />
              <YAxis tick={{fontSize:11}} />
              <Tooltip contentStyle={{borderRadius:8,fontSize:12}} />
              <Area type="monotone" dataKey="leads" stroke="var(--tq)" fill="url(#gl)" name="Leads" strokeWidth={2} />
              <Line type="monotone" dataKey="fechados" stroke="var(--ok)" strokeWidth={2} name="Fechados" dot={{r:3}} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Status atual">
          <ResponsiveContainer width="100%" height={185}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                {statusData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{borderRadius:8,fontSize:12}} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11}} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <Card title="Por canal de origem">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={origemData}>
              <XAxis dataKey="name" tick={{fontSize:11}} />
              <YAxis tick={{fontSize:11}} />
              <Tooltip contentStyle={{borderRadius:8,fontSize:12}} />
              <Bar dataKey="total" fill="var(--pet)" radius={[4,4,0,0]} name="Total" />
              <Bar dataKey="fechados" fill="var(--tq)" radius={[4,4,0,0]} name="Fechados" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {isMaster && respData.length>0 ? (
          <Card title="🏆 Ranking de atendentes">
            {respData.slice(0,4).map((rv,i) => (
              <div key={rv.nome} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:i<3?'1px solid var(--border)':'none' }}>
                <div style={{ fontFamily:'Syne', fontWeight:800, fontSize:18, color:i===0?'var(--gold)':i===1?'var(--muted)':'var(--light)', minWidth:24 }}>{i+1}°</div>
                <div style={{ width:28, height:28, borderRadius:'50%', background:rv.cor||'var(--tq)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:'#fff' }}>{fmt.initials(rv.nome)}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{rv.nome}</div>
                  <div style={{ fontSize:11.5, color:'var(--muted)' }}>{rv.leads} leads · {rv.taxa}% conv.</div>
                </div>
                <div style={{ fontWeight:800, color:'var(--ok)', fontSize:13 }}>{fmt.brl(rv.valor)}</div>
              </div>
            ))}
          </Card>
        ) : (
          <Card title="Conversão por canal">
            {origemData.map(o=>(
              <div key={o.name} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                  <span style={{ fontWeight:600 }}>{o.name}</span>
                  <span style={{ color:'var(--muted)' }}>{o.fechados}/{o.total} · <strong style={{ color:o.taxa>=50?'var(--ok)':o.taxa>=25?'var(--warn)':'var(--err)' }}>{o.taxa}%</strong></span>
                </div>
                <div style={{ height:6, background:'var(--bg2)', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${o.taxa}%`, background:o.taxa>=50?'var(--ok)':o.taxa>=25?'var(--warn)':'var(--err)', borderRadius:4, transition:'width .6s' }} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

function KPI({ icon:Icon, label, value, color, large, onClick }) {
  return (
    <div className="card" onClick={onClick} style={{ padding:'15px 17px', display:'flex', alignItems:'center', gap:11, cursor:onClick?'pointer':'default', transition:'transform .15s' }}
      onMouseEnter={e=>{if(onClick)e.currentTarget.style.transform='translateY(-2px)'}}
      onMouseLeave={e=>{if(onClick)e.currentTarget.style.transform=''}}>
      <div style={{ background:`${color}18`, borderRadius:10, padding:9, flexShrink:0 }}><Icon size={17} color={color} /></div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:large?17:21, fontWeight:800, lineHeight:1.1, fontFamily:'Syne', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{value}</div>
        <div style={{ color:'var(--muted)', fontSize:11.5, marginTop:1 }}>{label}</div>
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="card" style={{ padding:'18px 20px' }}>
      <h3 style={{ fontSize:11.5, fontWeight:700, color:'var(--muted)', marginBottom:14, textTransform:'uppercase', letterSpacing:.5 }}>{title}</h3>
      {children}
    </div>
  );
}
