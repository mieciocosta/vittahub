import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Search, MessageCircle, Pencil, Trash2, ExternalLink, Filter, X } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { STATUS_CLS, fmt, openWA, isToday, isPast } from '../hooks/utils.js';
import LeadModal from '../components/LeadModal.jsx';

const STATUS = ['Novo lead','Em atendimento','Orçamento enviado','Aguardando retorno','Fechado','Perdido'];
const ORIGENS = ['Instagram','Google','WhatsApp','Indicação','Facebook','Tráfego Pago','Orgânico','Outro'];

export default function Leads() {
  const api = useApi();
  const { isMaster } = useAuth();
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [fSt, setFSt] = useState('');
  const [fOr, setFOr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit:100, ...(fSt&&{status:fSt}), ...(fOr&&{origem:fOr}), ...(search&&{search}) });
      const d = await api.get(`/leads?${q}`);
      setLeads(d.data||[]); setTotal(d.total||0);
    } finally { setLoading(false); }
  }, [fSt,fOr,search]);

  useEffect(() => { const t=setTimeout(load,250); return()=>clearTimeout(t); }, [load]);

  const save = async (form) => {
    if (form.id) await api.put(`/leads/${form.id}`, form);
    else await api.post('/leads', form);
    load();
  };
  const del = async (id) => { if(!confirm('Excluir este lead?'))return; await api.del(`/leads/${id}`); load(); };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div style={{ padding:'28px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:30 }}>Leads</h1>
          <p style={{ color:'var(--muted)', fontSize:13, marginTop:2 }}>{total} lead{total!==1?'s':''} {(fSt||fOr||search)?'(filtrado)':''}</p>
        </div>
        <button onClick={()=>setModal('new')} className="btn btn-p"><Plus size={15} /> Novo Lead</button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome, telefone, e-mail..."
            style={{ width:'100%', padding:'9px 36px 9px 32px', border:'1.5px solid var(--border)', borderRadius:8, outline:'none', background:'var(--card)' }} />
          {search && <button onClick={()=>setSearch('')} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', color:'var(--muted)', padding:2 }}><X size={13} /></button>}
        </div>
        <select value={fSt} onChange={e=>setFSt(e.target.value)} style={{ padding:'9px 12px', border:'1.5px solid var(--border)', borderRadius:8, background:'var(--card)', outline:'none', minWidth:160 }}>
          <option value="">Todos os status</option>
          {STATUS.map(s=><option key={s}>{s}</option>)}
        </select>
        <select value={fOr} onChange={e=>setFOr(e.target.value)} style={{ padding:'9px 12px', border:'1.5px solid var(--border)', borderRadius:8, background:'var(--card)', outline:'none', minWidth:130 }}>
          <option value="">Todas as origens</option>
          {ORIGENS.map(o=><option key={o}>{o}</option>)}
        </select>
        {(fSt||fOr||search)&&<button onClick={()=>{setFSt('');setFOr('');setSearch('');}} className="btn btn-s btn-sm">Limpar</button>}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign:'center', padding:48 }}><span className="spin" style={{width:28,height:28}} /></div>
      ) : (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1.5px solid var(--border)', background:'var(--bg)' }}>
                  {['Lead','Contato','Canal','Interesse','Status','Responsável',isMaster&&'Proposta','Retorno',''].filter(Boolean).map(h=>(
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10.5, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.5, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.length===0&&<tr><td colSpan={9} style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Nenhum lead encontrado</td></tr>}
                {leads.map(l=>(
                  <tr key={l.id} style={{ borderBottom:'1px solid var(--border)', transition:'background .1s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#f8fafb'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <td style={{ padding:'11px 14px', maxWidth:180 }}>
                      <div style={{ fontWeight:700, fontSize:13.5 }}>{l.nome}</div>
                      {l.servico&&<div style={{ color:'var(--muted)', fontSize:11.5, marginTop:1 }}>{l.servico}</div>}
                      {l.tags?.length>0&&<div style={{ display:'flex', gap:3, flexWrap:'wrap', marginTop:4 }}>{l.tags.slice(0,3).map(t=><span key={t} className={`tag tag-${t}`}>#{t}</span>)}</div>}
                    </td>
                    <td style={{ padding:'11px 14px', fontSize:12.5, color:'var(--muted)' }}>
                      <div>{fmt.phone(l.telefone)}</div>
                      {l.email&&<div style={{ fontSize:11.5, marginTop:1 }}>{l.email}</div>}
                    </td>
                    <td style={{ padding:'11px 14px' }}>
                      <span style={{ fontSize:12, fontWeight:700, color:l.origem==='Instagram'?'var(--ig)':l.origem==='WhatsApp'?'var(--wa)':l.origem==='Google'?'#4285f4':'var(--pet)' }}>{l.origem}</span>
                    </td>
                    <td style={{ padding:'11px 14px', fontSize:12.5 }}>{l.interesse}</td>
                    <td style={{ padding:'11px 14px' }}><span className={`badge ${STATUS_CLS[l.status]}`}>{l.status}</span></td>
                    <td style={{ padding:'11px 14px' }}>
                      {l.responsavelNome?(
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ width:22, height:22, borderRadius:'50%', background:l.responsavelCor||'var(--tq)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#fff' }}>{fmt.initials(l.responsavelNome)}</div>
                          <span style={{ fontSize:12.5 }}>{l.responsavelNome.split(' ')[0]}</span>
                        </div>
                      ):<span style={{ color:'var(--light)', fontSize:12, fontStyle:'italic' }}>Não atribuído</span>}
                    </td>
                    {isMaster&&<td style={{ padding:'11px 14px', fontSize:13, fontWeight:l.valorProposta>0?700:400, color:l.valorProposta>0?'var(--ok)':'var(--light)', whiteSpace:'nowrap' }}>{l.valorProposta>0?fmt.brl(l.valorProposta):'—'}</td>}
                    <td style={{ padding:'11px 14px', fontSize:12.5, whiteSpace:'nowrap', color:isToday(l.dataRetorno)?'var(--warn)':isPast(l.dataRetorno)?'var(--err)':'var(--muted)', fontWeight:isToday(l.dataRetorno)||isPast(l.dataRetorno)?700:400 }}>
                      {isToday(l.dataRetorno)?'⚠️ Hoje':isPast(l.dataRetorno)?`❗ ${fmt.date(l.dataRetorno)}`:fmt.date(l.dataRetorno)}
                    </td>
                    <td style={{ padding:'11px 14px' }}>
                      <div style={{ display:'flex', gap:5 }}>
                        {l.telefone&&<AB title="WhatsApp" color="var(--wa)" onClick={()=>openWA(l.telefone,l.nome)}><MessageCircle size={13} /></AB>}
                        <AB title="Editar" color="var(--tq)" onClick={()=>setModal(l)}><Pencil size={13} /></AB>
                        {isMaster&&<AB title="Excluir" color="var(--err)" onClick={()=>del(l.id)}><Trash2 size={13} /></AB>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {modal&&<LeadModal lead={modal==='new'?null:modal} onClose={()=>setModal(null)} onSave={save} />}
    </div>
  );
}

function AB({children,title,color,onClick}){
  return <button onClick={onClick} title={title} style={{padding:'5px 7px',borderRadius:6,background:`${color}12`,color,border:`1px solid ${color}25`,transition:'all .1s'}} onMouseEnter={e=>e.currentTarget.style.background=`${color}22`} onMouseLeave={e=>e.currentTarget.style.background=`${color}12`}>{children}</button>;
}
