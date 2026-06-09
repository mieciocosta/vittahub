import React, { useEffect, useState } from 'react';
import { MessageCircle, Pencil } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt, openWA } from '../hooks/utils.js';
import LeadModal from '../components/LeadModal.jsx';

const COLS = [
  {k:'Novo lead',c:'#3b82f6',bg:'#eff6ff'},{k:'Em atendimento',c:'#f97316',bg:'#fff7ed'},
  {k:'Orçamento enviado',c:'#8b5cf6',bg:'#faf5ff'},{k:'Aguardando retorno',c:'#f59e0b',bg:'#fffbeb'},
  {k:'Fechado',c:'#10b981',bg:'#ecfdf5'},{k:'Perdido',c:'#ef4444',bg:'#fef2f2'},
];

export default function Funil() {
  const api = useApi();
  const { isMaster } = useAuth();
  const [leads, setLeads] = useState([]);
  const [modal, setModal] = useState(null);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);

  useEffect(() => { api.get('/leads?limit=200').then(d=>setLeads(d.data||[])); }, []);

  const drop = async (e,status) => {
    e.preventDefault(); setOver(null);
    if(!drag||drag.status===status){setDrag(null);return;}
    setLeads(prev=>prev.map(l=>l.id===drag.id?{...l,status}:l));
    await api.patch(`/leads/${drag.id}/status`,{status});
    setDrag(null);
  };

  const save = async (form) => {
    await api.put(`/leads/${form.id}`,form);
    const d = await api.get('/leads?limit=200');
    setLeads(d.data||[]);
  };

  return (
    <div style={{ padding:'28px', height:'100vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
      <div style={{ marginBottom:18 }}>
        <h1 style={{ fontSize:30 }}>Funil de Vendas</h1>
        <p style={{ color:'var(--muted)', fontSize:13, marginTop:2 }}>Arraste os cards entre as etapas · {leads.length} leads</p>
      </div>
      <div style={{ display:'flex', gap:11, flex:1, overflowX:'auto', paddingBottom:16 }}>
        {COLS.map(col => {
          const items = leads.filter(l=>l.status===col.k);
          const total = isMaster?items.reduce((s,l)=>s+(l.valorProposta||0),0):null;
          return (
            <div key={col.k} onDragOver={e=>{e.preventDefault();setOver(col.k);}} onDragLeave={()=>setOver(null)} onDrop={e=>drop(e,col.k)}
              style={{ minWidth:238, flex:'0 0 238px', display:'flex', flexDirection:'column', background:over===col.k?col.bg:'var(--bg2)', borderRadius:14, border:`2px solid ${over===col.k?col.c:'transparent'}`, transition:'all .15s', padding:'10px 9px', maxHeight:'100%' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:9, flexShrink:0 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:9, height:9, borderRadius:'50%', background:col.c }} />
                    <span style={{ fontWeight:700, fontSize:13 }}>{col.k}</span>
                  </div>
                  {total!==null&&total>0&&<div style={{ fontSize:11.5, color:'var(--ok)', fontWeight:700, marginTop:1 }}>{fmt.brl(total)}</div>}
                </div>
                <span style={{ background:'#fff', borderRadius:10, padding:'2px 8px', fontSize:12, fontWeight:800, color:col.c, border:`1px solid ${col.c}30` }}>{items.length}</span>
              </div>
              <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:7 }}>
                {items.map(l=>(
                  <div key={l.id} draggable onDragStart={()=>setDrag(l)} onDragEnd={()=>setDrag(null)}
                    style={{ background:'#fff', borderRadius:10, padding:'11px', boxShadow:drag?.id===l.id?'var(--sh3)':'var(--sh1)', cursor:'grab', opacity:drag?.id===l.id?.5:1, borderLeft:`3px solid ${col.c}` }}>
                    <div style={{ fontWeight:700, fontSize:13, marginBottom:3 }}>{l.nome}</div>
                    <div style={{ fontSize:11.5, color:'var(--muted)', marginBottom:6 }}>{l.interesse} · {l.origem}</div>
                    {isMaster&&l.valorProposta>0&&<div style={{ fontSize:13, fontWeight:800, color:'var(--ok)', marginBottom:5 }}>{fmt.brl(l.valorProposta)}</div>}
                    {l.responsavelNome&&<div style={{ fontSize:11, color:'var(--light)', marginBottom:5 }}>👤 {l.responsavelNome.split(' ')[0]}</div>}
                    {l.dataRetorno&&<div style={{ fontSize:11, color:'var(--warn)', fontWeight:600, marginBottom:5 }}>📅 {fmt.date(l.dataRetorno)}</div>}
                    {l.tags?.length>0&&<div style={{ display:'flex', gap:3, flexWrap:'wrap', marginBottom:7 }}>{l.tags.slice(0,2).map(t=><span key={t} className={`tag tag-${t}`}>#{t}</span>)}</div>}
                    {l.observacoes&&<div style={{ fontSize:11, color:'var(--muted)', background:'var(--bg)', borderRadius:6, padding:'5px 7px', marginBottom:7, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{l.observacoes}</div>}
                    <div style={{ display:'flex', gap:5 }}>
                      {l.telefone&&<button onClick={()=>openWA(l.telefone,l.nome)} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding:'5px', borderRadius:6, background:'#f0fdf4', color:'var(--wa)', fontSize:12, fontWeight:600 }}><MessageCircle size={12} /> WA</button>}
                      <button onClick={()=>setModal(l)} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding:'5px', borderRadius:6, background:'var(--tq3)', color:'var(--tq2)', fontSize:12, fontWeight:600 }}><Pencil size={12} /> Editar</button>
                    </div>
                  </div>
                ))}
                {items.length===0&&<div style={{ textAlign:'center', padding:'18px 0', color:'var(--light)', fontSize:12 }}>Nenhum lead</div>}
              </div>
            </div>
          );
        })}
      </div>
      {modal&&<LeadModal lead={modal} onClose={()=>setModal(null)} onSave={save} />}
    </div>
  );
}
