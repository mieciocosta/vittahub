import React, { useEffect, useState, useRef } from 'react';
import { Stethoscope, Plus, Pencil, Trash2, X, Check, Phone, Clock, Camera, Paperclip, FileText, Download } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* Painel de Profissionais — cadastro de médicos/especialistas + disponibilidade.
   Restrito ao setor de Consultas (e à gestão). */

const DIAS = [['seg','Seg'],['ter','Ter'],['qua','Qua'],['qui','Qui'],['sex','Sex'],['sab','Sáb'],['dom','Dom']];
const SETORES = [['vacinas','Vacinas'],['consultas','Consultas'],['terapias','Terapias']];
const CORES = ['#00B8C0','#7c5cbf','#C4973B','#0fb07a','#e8671a','#3b82f6','#ec4899','#0E8C96'];
const vazio = { nome:'', especialidade:'', setor:'consultas', cor:'#00B8C0', telefone:'', ativo:true, disponibilidade:{}, observacoes:'', foto:null, documentos:[] };
const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

export default function Profissionais() {
  const api = useApi();
  const { user } = useAuth();
  // Painel é do setor de Consultas (e da gestão). Os demais setores não veem.
  const podeVer = ['master','supervisor'].includes(user?.role) || user?.setor === 'consultas';
  const ehGestao = podeVer;
  const fotoRef = useRef(null);
  const docRef = useRef(null);
  const [lista, setLista] = useState([]);
  const [modal, setModal] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const load = () => api.get('/extras/profissionais').then(d => setLista(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line

  const salvar = async () => {
    if (!modal.nome?.trim()) { setErro('Informe o nome.'); return; }
    setSalvando(true); setErro('');
    try {
      if (modal.id) await api.put(`/extras/profissionais/${modal.id}`, modal);
      else await api.post('/extras/profissionais', modal);
      setModal(null); load();
    } catch (e) { setErro(e.message); }
    setSalvando(false);
  };
  const excluir = async (p) => {
    if (!window.confirm(`Remover ${p.nome}?`)) return;
    setLista(l => l.filter(x => x.id !== p.id));
    try { await api.del(`/extras/profissionais/${p.id}`); } catch { load(); }
  };

  const escolherFoto = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErro('A foto precisa ser uma imagem.'); return; }
    const url = await fileToDataUrl(f);
    if (url.length > 2_400_000) { setErro('Foto muito grande (máx. ~2MB). Tente outra.'); return; }
    setErro(''); setModal(m => ({ ...m, foto: url }));
  };
  const anexarDocs = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = '';
    const novos = [];
    for (const f of files) {
      const url = await fileToDataUrl(f);
      if (url.length > 11_000_000) { setErro(`"${f.name}" é muito grande (máx. ~8MB).`); continue; }
      novos.push({ nome: f.name, arquivo: url, mimetype: f.type });
    }
    if (novos.length) setModal(m => ({ ...m, documentos: [...(m.documentos || []), ...novos].slice(0, 10) }));
  };
  const removerDoc = (idx) => setModal(m => ({ ...m, documentos: (m.documentos || []).filter((_, i) => i !== idx) }));

  const setDispDia = (dia, campo, valor) => setModal(m => ({
    ...m, disponibilidade: { ...m.disponibilidade, [dia]: { ...(m.disponibilidade?.[dia] || {}), [campo]: valor } },
  }));
  const resumoDisp = (disp) => {
    const ds = DIAS.filter(([k]) => disp?.[k]?.inicio && disp?.[k]?.fim);
    if (!ds.length) return 'Sem horário definido';
    return ds.map(([k, lbl]) => `${lbl} ${disp[k].inicio}-${disp[k].fim}`).join(' · ');
  };

  if (!podeVer) return <div style={{ padding:40, color:'var(--muted)' }}>🔒 O Painel de Profissionais é do setor de Consultas.</div>;

  return (
    <div style={{ padding:'28px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:18 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:42, height:42, borderRadius:12, background:'var(--tq3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Stethoscope size={22} color="var(--tq)"/>
          </div>
          <div>
            <h1 style={{ fontSize:27, fontWeight:800 }}>Painel de Profissionais</h1>
            <p style={{ color:'var(--muted)', fontSize:13 }}>Cadastro de médicos e especialistas + disponibilidade semanal.</p>
          </div>
        </div>
        {ehGestao && <button onClick={()=>{setErro('');setModal({...vazio});}} className="btn btn-p" style={{ gap:6 }}><Plus size={15}/> Novo profissional</button>}
      </div>

      {lista.length === 0 ? (
        <div className="card" style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>
          <Stethoscope size={34} color="var(--border)" style={{ marginBottom:10 }}/>
          <div style={{ fontWeight:700, marginBottom:4 }}>Nenhum profissional cadastrado ainda.</div>
          {ehGestao && <div style={{ fontSize:12.5 }}>Clique em “Novo profissional” pra começar.</div>}
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
          {lista.map(p => (
            <div key={p.id} className="card" style={{ padding:'16px 18px', opacity:p.ativo?1:.55 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:11 }}>
                {p.foto
                  ? <img src={p.foto} alt={p.nome} style={{ width:42, height:42, borderRadius:'50%', objectFit:'cover', flexShrink:0, border:`2px solid ${p.cor||'var(--tq)'}` }} />
                  : <div style={{ width:42, height:42, borderRadius:'50%', background:p.cor||'var(--tq)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, flexShrink:0 }}>{fmt.initials(p.nome)}</div>}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:800, fontSize:15 }}>{p.nome}{!p.ativo && <span style={{ fontSize:10, color:'var(--err)', fontWeight:800, marginLeft:6 }}>INATIVO</span>}</div>
                  <div style={{ fontSize:12.5, color:'var(--muted)' }}>{p.especialidade || '—'}</div>
                  <div style={{ fontSize:11, color:'var(--tq2)', fontWeight:700, marginTop:2, textTransform:'capitalize' }}>{p.setor}</div>
                </div>
                {ehGestao && (
                  <div style={{ display:'flex', gap:5 }}>
                    <button onClick={()=>{setErro('');setModal({ ...vazio, ...p, disponibilidade:p.disponibilidade||{} });}} title="Editar" style={{ padding:5, background:'var(--tq3)', color:'var(--tq)', borderRadius:6 }}><Pencil size={12}/></button>
                    <button onClick={()=>excluir(p)} title="Remover" style={{ padding:5, background:'var(--err2)', color:'var(--err)', borderRadius:6 }}><Trash2 size={12}/></button>
                  </div>
                )}
              </div>
              {p.telefone && <div style={{ fontSize:12, color:'var(--muted)', marginTop:10, display:'flex', alignItems:'center', gap:6 }}><Phone size={12}/> {fmt.phone(p.telefone)}</div>}
              <div style={{ fontSize:11.5, color:'var(--txt2,var(--muted))', marginTop:8, display:'flex', alignItems:'flex-start', gap:6, lineHeight:1.5 }}>
                <Clock size={12} style={{ marginTop:2, flexShrink:0 }}/>
                <span>{resumoDisp(p.disponibilidade)}</span>
              </div>
              {Array.isArray(p.documentos) && p.documentos.length > 0 && (
                <div style={{ marginTop:9, paddingTop:9, borderTop:'1px solid var(--border)', display:'flex', flexWrap:'wrap', gap:6 }}>
                  {p.documentos.map((d, i) => (
                    <a key={i} href={d.arquivo} download={d.nome} title={d.nome}
                      style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700, color:'var(--tq2)', background:'var(--tq4)', border:'1px solid var(--tq3)', borderRadius:8, padding:'4px 8px', textDecoration:'none', maxWidth:160 }}>
                      <FileText size={12} style={{ flexShrink:0 }}/>
                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.nome}</span>
                      <Download size={11} style={{ flexShrink:0, opacity:.7 }}/>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div onClick={()=>setModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e=>e.stopPropagation()} className="card" style={{ width:480, maxWidth:'100%', maxHeight:'88vh', overflowY:'auto', padding:22 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <h3 style={{ fontSize:16, fontWeight:800 }}>{modal.id ? 'Editar profissional' : 'Novo profissional'}</h3>
              <button onClick={()=>setModal(null)} style={{ padding:4, background:'none', border:'none', cursor:'pointer', color:'var(--muted)' }}><X size={16}/></button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
              {/* Foto do profissional */}
              <div className="field" style={{ margin:0 }}>
                <label>Foto do profissional</label>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  {modal.foto
                    ? <img src={modal.foto} alt="" style={{ width:60, height:60, borderRadius:'50%', objectFit:'cover', border:'2px solid var(--tq)' }} />
                    : <div style={{ width:60, height:60, borderRadius:'50%', background:'var(--bg2)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}><Camera size={22}/></div>}
                  <input ref={fotoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={escolherFoto}/>
                  <button type="button" onClick={()=>fotoRef.current?.click()} className="btn btn-s btn-sm" style={{ gap:6 }}><Camera size={14}/> {modal.foto?'Trocar foto':'Anexar foto'}</button>
                  {modal.foto && <button type="button" onClick={()=>setModal({...modal,foto:null})} className="btn btn-sm" style={{ color:'var(--err)' }}>Remover</button>}
                </div>
              </div>
              <div className="field" style={{ margin:0 }}><label>Nome *</label><input value={modal.nome} onChange={e=>setModal({...modal,nome:e.target.value})} placeholder="Ex: Dra. Helena Brandão"/></div>
              <div className="field" style={{ margin:0 }}><label>Especialidade</label><input value={modal.especialidade} onChange={e=>setModal({...modal,especialidade:e.target.value})} placeholder="Ex: Neuropediatra"/></div>
              <div style={{ display:'flex', gap:10 }}>
                <div className="field" style={{ flex:1, margin:0 }}><label>Setor</label>
                  <select value={modal.setor} onChange={e=>setModal({...modal,setor:e.target.value})} style={{ width:'100%' }}>
                    {SETORES.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex:1, margin:0 }}><label>Telefone</label><input value={modal.telefone} onChange={e=>setModal({...modal,telefone:e.target.value})} placeholder="(98) 9...."/></div>
              </div>
              <div className="field" style={{ margin:0 }}>
                <label>Cor</label>
                <div style={{ display:'flex', gap:7 }}>
                  {CORES.map(c => <button key={c} onClick={()=>setModal({...modal,cor:c})} style={{ width:24, height:24, borderRadius:'50%', background:c, border:modal.cor===c?'3px solid var(--txt)':'2px solid #fff', cursor:'pointer', boxShadow:'0 0 0 1px var(--border)' }}/>)}
                </div>
              </div>

              <div className="field" style={{ margin:0 }}>
                <label>Disponibilidade (deixe vazio o dia que não atende)</label>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {DIAS.map(([k,lbl]) => (
                    <div key={k} style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:34, fontSize:12, fontWeight:700, color:'var(--muted)' }}>{lbl}</span>
                      <input type="time" value={modal.disponibilidade?.[k]?.inicio || ''} onChange={e=>setDispDia(k,'inicio',e.target.value)} style={{ flex:1 }}/>
                      <span style={{ color:'var(--muted)' }}>às</span>
                      <input type="time" value={modal.disponibilidade?.[k]?.fim || ''} onChange={e=>setDispDia(k,'fim',e.target.value)} style={{ flex:1 }}/>
                    </div>
                  ))}
                </div>
              </div>

              {/* Documentos complementares (diploma, registro, etc.) */}
              <div className="field" style={{ margin:0 }}>
                <label>Documentos complementares (diploma, registro…)</label>
                <input ref={docRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx" style={{ display:'none' }} onChange={anexarDocs}/>
                <button type="button" onClick={()=>docRef.current?.click()} className="btn btn-s btn-sm" style={{ gap:6 }}><Paperclip size={14}/> Anexar documento</button>
                {(modal.documentos || []).length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:8 }}>
                    {(modal.documentos || []).map((d, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:8, background:'var(--bg2)', borderRadius:8, padding:'6px 10px' }}>
                        <FileText size={14} style={{ flexShrink:0, color:'var(--tq2)' }}/>
                        <span style={{ flex:1, minWidth:0, fontSize:12.5, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.nome}</span>
                        <button type="button" onClick={()=>removerDoc(i)} title="Remover" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--err)' }}><X size={14}/></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label style={{ display:'flex', alignItems:'center', gap:9, cursor:'pointer' }}>
                <input type="checkbox" checked={modal.ativo} onChange={e=>setModal({...modal,ativo:e.target.checked})} style={{ width:15, height:15 }}/>
                <span style={{ fontSize:13 }}>Profissional ativo</span>
              </label>

              {erro && <div style={{ fontSize:12, color:'var(--err)', fontWeight:600 }}>{erro}</div>}
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button onClick={salvar} disabled={salvando} className="btn btn-p" style={{ flex:1, gap:5 }}><Check size={14}/> {salvando?'Salvando…':'Salvar'}</button>
                <button onClick={()=>setModal(null)} className="btn">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
