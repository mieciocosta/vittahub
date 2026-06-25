import React, { useEffect, useState } from 'react';
import { Bot, MessageSquare, Plus, Trash2, Save, Users, ExternalLink, Pencil, X, Check, UserPlus } from 'lucide-react';
import { mask } from '../hooks/utils.js';
import { useApi, useAuth } from '../context/AuthContext.jsx';

export default function Configuracoes() {
  const api = useApi();
  const { isMaster } = useAuth();
  const [qr, setQr] = useState([]);
  const [bot, setBot] = useState(null);
  const [users, setUsers] = useState([]);
  const [newQR, setNewQR] = useState({ titulo:'', texto:'' });
  const [editQR, setEditQR] = useState(null); // { id, titulo, texto } — edição em linha
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // edição de usuário (master): CPF, nova senha, ativo
  const [editUser, setEditUser] = useState(null); // { id, cpf, senha, ativo }
  const [userErr, setUserErr] = useState('');
  const [novoUser, setNovoUser] = useState(null); // { nome, cpf, senha, role }
  const [killing, setKilling] = useState(false); // desligar todos os bots (precisa ficar antes do early-return de isMaster)
  const [metaAg, setMetaAg] = useState({ vacinas:'', consultas:'', terapias:'' }); // alvos por setor
  const [exemplos, setExemplos] = useState([]);  // exemplos de conversa pra IA
  const delExemplo = async (id) => {
    if (!window.confirm('Remover este exemplo? A IA deixa de estudá-lo.')) return;
    setExemplos(p=>p.filter(e=>e.id!==id));
    try { await api.del(`/inbox/exemplos/${id}`); } catch {}
  };
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaSaved, setMetaSaved] = useState(false);
  const [diag, setDiag] = useState(null);        // resultado do diagnóstico do bot
  const [diagLoad, setDiagLoad] = useState(false);
  const diagnosticarBot = async () => {
    setDiagLoad(true); setDiag(null);
    try { setDiag(await api.get('/inbox/whatsapp/diag-bot')); }
    catch (e) { setDiag({ veredito: 'Erro ao diagnosticar: ' + e.message, passos: [] }); }
    setDiagLoad(false);
  };
  const criarUsuario = async () => {
    setUserErr('');
    try {
      const u = await api.post('/auth/usuarios', { ...novoUser, cpf: mask.digits(novoUser.cpf) });
      setUsers(p => [...p, u].sort((a,b)=>a.nome.localeCompare(b.nome)));
      setNovoUser(null);
    } catch (e) { setUserErr(e.message); }
  };
  const maskCpf = v => v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/,'.$1-$2');
  const salvarUsuario = async () => {
    if (!editUser) return;
    setUserErr('');
    // Mesmas validações do cadastro: CPF completo e senha mínima
    const cpfDig = mask.digits(editUser.cpf);
    if (editUser.cpf && cpfDig.length !== 11) return setUserErr('CPF incompleto — precisa de 11 dígitos.');
    if (editUser.senha && editUser.senha.length < 8) return setUserErr('A nova senha precisa de pelo menos 8 caracteres.');
    try {
      const payload = { cpf: cpfDig, ativo: editUser.ativo, setor: editUser.setor || null, setores: (editUser.setores || []).length ? editUser.setores : null };
      if (editUser.senha) payload.senha = editUser.senha;
      const upd = await api.put(`/auth/usuarios/${editUser.id}`, payload);
      setUsers(prev => prev.map(u => u.id === upd.id ? { ...u, ...upd } : u));
      setEditUser(null);
    } catch (e) { setUserErr(e.message); }
  };

  useEffect(() => {
    api.get('/inbox/quick-replies').then(setQr);
    api.get('/inbox/bot-config').then(setBot);
    api.get('/auth/usuarios').then(setUsers).catch(()=>{});
    api.get('/inbox/exemplos').then(d=>setExemplos(Array.isArray(d)?d:[])).catch(()=>{});
    api.get('/extras/agenda/meta').then(d=>{
      const s = d?.setores || {};
      setMetaAg({ vacinas: s.vacinas?.alvo || '', consultas: s.consultas?.alvo || '', terapias: s.terapias?.alvo || '' });
    }).catch(()=>{});
  }, []);

  const salvarMetaAg = async () => {
    setMetaSaving(true);
    try { await api.put('/extras/agenda/meta', { vacinas: parseInt(metaAg.vacinas)||0, consultas: parseInt(metaAg.consultas)||0, terapias: parseInt(metaAg.terapias)||0 }); setMetaSaved(true); setTimeout(()=>setMetaSaved(false), 2000); }
    catch (e) { window.alert('Erro: ' + e.message); }
    setMetaSaving(false);
  };

  if (!isMaster) return <div style={{padding:40,textAlign:'center',color:'var(--muted)'}}>Acesso restrito ao Master.</div>;

  const saveBot = async () => {
    setSaving(true);
    await api.put('/inbox/bot-config', bot);
    setSaving(false); setSaved(true);
    setTimeout(()=>setSaved(false), 2000);
  };

  const desligarTodos = async () => {
    if (!window.confirm('Desligar TODOS os bots AGORA?\n\nA Vitta para de responder em todas as conversas até você religar aqui em Configurações.')) return;
    setKilling(true);
    try {
      const r = await api.post('/inbox/bot/desligar-todos', {});
      setBot(p => ({ ...(p||{}), ativo:false }));
      window.alert(`✅ Pronto! ${r.desligados ?? 0} conversa(s) com bot foram desligadas e o bot global está OFF.`);
    } catch (e) { window.alert('Erro ao desligar: ' + e.message); }
    setKilling(false);
  };

  const addQR = async () => {
    if (!newQR.titulo||!newQR.texto) return;
    const q = await api.post('/inbox/quick-replies', newQR);
    setQr(p=>[...p,q]); setNewQR({titulo:'',texto:''});
  };

  const delQR = async (q) => {
    if (!window.confirm(`Apagar a resposta rápida "${q.titulo}"?\n\nIsso remove o atalho do chat. Não dá pra desfazer.`)) return;
    await api.del(`/inbox/quick-replies/${q.id}`);
    setQr(p=>p.filter(x=>x.id!==q.id));
    if (editQR?.id === q.id) setEditQR(null);
  };

  const saveEditQR = async () => {
    const titulo = (editQR.titulo||'').trim(), texto = (editQR.texto||'').trim();
    if (!titulo || !texto) return;
    const upd = await api.put(`/inbox/quick-replies/${editQR.id}`, { titulo, texto });
    setQr(p=>p.map(x=>x.id===editQR.id ? upd : x));
    setEditQR(null);
  };

  return (
    <div style={{ padding:'28px' }}>
      <h1 style={{ fontSize:30, marginBottom:6 }}>Configurações</h1>
      <p style={{ color:'var(--muted)', fontSize:13.5, marginBottom:28 }}>Gerencie bot, respostas rápidas e usuários</p>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {/* Bot Config */}
        <div className="card" style={{ padding:'22px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:18 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'var(--ok2)', display:'flex', alignItems:'center', justifyContent:'center' }}><Bot size={18} color="var(--ok)"/></div>
            <div><h2 style={{ fontSize:16, fontWeight:800 }}>Bot de Atendimento</h2><p style={{ fontSize:12, color:'var(--muted)', marginTop:1 }}>A Vitta responde sozinha enquanto a equipe não assume. Apenas o master (Miécio ou Nágila) liga ou desliga o bot.</p></div>
          </div>

          {bot && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                <input type="checkbox" checked={bot.ativo} onChange={e=>setBot(p=>({...p,ativo:e.target.checked}))} style={{ width:16, height:16, accentColor:'var(--tq)' }}/>
                <span style={{ fontWeight:600 }}>Bot ativo para TODOS (liga/desliga geral)</span>
              </label>

              <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', background:'var(--tq3)', padding:'10px 12px', borderRadius:10 }}>
                <input type="checkbox" checked={bot.consultaIA !== false} onChange={e=>setBot(p=>({...p,consultaIA:e.target.checked}))} style={{ width:16, height:16, accentColor:'var(--tq)', marginTop:1 }}/>
                <span>
                  <span style={{ fontWeight:700, display:'block' }}>IA de Consultas (assume sozinha)</span>
                  <span style={{ fontSize:11.5, color:'var(--muted)' }}>Quando ligada, a IA atende automaticamente tudo que NÃO é vacina (consultas e terapias) — mesmo com o bot geral desligado. Vacina fica com a equipe.</span>
                </span>
              </label>

              <div className="field">
                <label>Mensagem de boas-vindas</label>
                <textarea value={bot.mensagemBoasVindas} onChange={e=>setBot(p=>({...p,mensagemBoasVindas:e.target.value}))} rows={5} style={{ resize:'vertical' }} />
              </div>

              <div className="field">
                <label>Transferir para atendente após N mensagens do cliente</label>
                <input type="number" min={1} max={10} value={bot.transferirApos} onChange={e=>setBot(p=>({...p,transferirApos:+e.target.value}))} />
              </div>

              <div className="field" style={{ background:'var(--bg2,#f8fafc)', padding:'10px 12px', borderRadius:10 }}>
                <label>🎯 Meta de agendamentos do mês — por setor</label>
                <div style={{ display:'flex', gap:8 }}>
                  <div style={{ flex:1 }}><span style={{ fontSize:11, color:'var(--muted)' }}>💉 Vacinas</span><input type="number" min={0} value={metaAg.vacinas} onChange={e=>setMetaAg(p=>({...p,vacinas:e.target.value}))} placeholder="0" /></div>
                  <div style={{ flex:1 }}><span style={{ fontSize:11, color:'var(--muted)' }}>🩺 Consultas</span><input type="number" min={0} value={metaAg.consultas} onChange={e=>setMetaAg(p=>({...p,consultas:e.target.value}))} placeholder="0" /></div>
                  <div style={{ flex:1 }}><span style={{ fontSize:11, color:'var(--muted)' }}>🧩 Terapias</span><input type="number" min={0} value={metaAg.terapias} onChange={e=>setMetaAg(p=>({...p,terapias:e.target.value}))} placeholder="0" /></div>
                </div>
                <button onClick={salvarMetaAg} disabled={metaSaving} className="btn btn-sm" style={{ fontWeight:700, marginTop:8, width:'100%' }}>{metaSaving?'…':metaSaved?'✅ Salvo!':'Salvar metas por setor'}</button>
                <span style={{ fontSize:11, color:'var(--muted)', display:'block', marginTop:6 }}>Cada "Agendar" no chat abate da meta do setor. O Dashboard mostra feito/alvo e quanto falta.</span>
              </div>

              <button onClick={saveBot} disabled={saving} className="btn btn-p" style={{ width:'100%' }}>
                {saving?<span className="spin" style={{width:14,height:14}}/>:saved?'✅ Salvo!':'💾 Salvar configurações'}
              </button>

              {/* Botão de emergência: desliga todos os bots de uma vez */}
              <div style={{ borderTop:'1px solid var(--border)', marginTop:4, paddingTop:14 }}>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>
                  Bot global agora: {bot.ativo
                    ? <strong style={{ color:'var(--ok)' }}>LIGADO</strong>
                    : <strong style={{ color:'var(--err,#dc2626)' }}>DESLIGADO</strong>}
                </div>
                <button onClick={desligarTodos} disabled={killing} className="btn"
                  style={{ width:'100%', background:'#fee2e2', color:'#dc2626', border:'1.5px solid #fecaca', fontWeight:800 }}>
                  {killing ? <span className="spin" style={{width:14,height:14}}/> : '🔌 Desligar TODOS os bots agora'}
                </button>
              </div>

              {/* Diagnóstico: descobre por que o bot (não) responde */}
              <div style={{ borderTop:'1px solid var(--border)', marginTop:4, paddingTop:14 }}>
                <button onClick={diagnosticarBot} disabled={diagLoad} className="btn"
                  style={{ width:'100%', fontWeight:700 }}>
                  {diagLoad ? <span className="spin" style={{width:14,height:14}}/> : '🔍 Diagnosticar bot (por que não responde?)'}
                </button>
                {diag && (
                  <div style={{ marginTop:10, fontSize:12.5, background:'var(--bg2,#f8fafc)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
                    <div style={{ fontWeight:800, marginBottom:8 }}>{diag.veredito}</div>
                    {(diag.passos||[]).map((p,i)=>(
                      <div key={i} style={{ display:'flex', gap:7, alignItems:'flex-start', padding:'3px 0', color:p.ok?'var(--ok,#16a34a)':'var(--err,#dc2626)' }}>
                        <span>{p.ok?'✅':'⛔'}</span><span style={{ color:'var(--text)' }}>{p.msg}</span>
                      </div>
                    ))}
                    {diag.versao_backend && <div style={{ marginTop:8, fontSize:10.5, color:'var(--muted)', borderTop:'1px solid var(--border)', paddingTop:6 }}>versão do backend: {diag.versao_backend}</div>}
                  </div>
                )}
              </div>

              {/* Exemplos de conversa que a IA estuda (treino) */}
              <div style={{ borderTop:'1px solid var(--border)', marginTop:4, paddingTop:14 }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:3 }}>⭐ Exemplos de conversa da IA</div>
                <div style={{ fontSize:11.5, color:'var(--muted)', marginBottom:10 }}>Conversas que converteram, marcadas no chat. A IA estuda o jeito delas pra copiar o tom campeão.</div>
                {exemplos.length === 0
                  ? <div style={{ fontSize:12, color:'var(--muted)' }}>Nenhum exemplo ainda. No chat, abra um atendimento de sucesso → painel Info → "⭐ Usar como exemplo da IA".</div>
                  : exemplos.map(e=>(
                    <div key={e.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:12.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.titulo}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{e.setor} · {e.criado_por || 'gestão'}</div>
                      </div>
                      <button onClick={()=>delExemplo(e.id)} style={{ padding:5, background:'var(--err2)', color:'var(--err)', borderRadius:6, flexShrink:0 }}><Trash2 size={12}/></button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick Replies */}
        <div className="card" style={{ padding:'22px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:18 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'var(--tq3)', display:'flex', alignItems:'center', justifyContent:'center' }}><MessageSquare size={18} color="var(--tq)"/></div>
            <div><h2 style={{ fontSize:16, fontWeight:800 }}>Respostas Rápidas</h2><p style={{ fontSize:12, color:'var(--muted)', marginTop:1 }}>{qr.length} atalhos — aparecem no botão de respostas do chat</p></div>
          </div>

          <div style={{ maxHeight:280, overflowY:'auto', marginBottom:14 }}>
            {qr.map(q=> editQR?.id===q.id ? (
              <div key={q.id} style={{ display:'flex', flexDirection:'column', gap:7, padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                <div className="field" style={{ margin:0 }}><label>Título</label><input value={editQR.titulo} onChange={e=>setEditQR(p=>({...p,titulo:e.target.value}))} /></div>
                <div className="field" style={{ margin:0 }}><label>Texto</label><textarea value={editQR.texto} onChange={e=>setEditQR(p=>({...p,texto:e.target.value}))} rows={3} style={{ resize:'vertical' }} /></div>
                <div style={{ display:'flex', gap:7 }}>
                  <button onClick={saveEditQR} disabled={!editQR.titulo?.trim()||!editQR.texto?.trim()} className="btn btn-p btn-sm" style={{ gap:4 }}><Check size={13}/> Salvar</button>
                  <button onClick={()=>setEditQR(null)} className="btn btn-sm" style={{ gap:4 }}><X size={13}/> Cancelar</button>
                </div>
              </div>
            ) : (
              <div key={q.id} style={{ display:'flex', gap:8, padding:'9px 0', borderBottom:'1px solid var(--border)', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{q.titulo}</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:2, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{q.texto}</div>
                </div>
                <button onClick={()=>setEditQR({ id:q.id, titulo:q.titulo, texto:q.texto })} title="Editar" style={{ padding:5, background:'var(--tq3)', color:'var(--tq)', borderRadius:6, flexShrink:0 }}><Pencil size={12}/></button>
                <button onClick={()=>delQR(q)} title="Apagar" style={{ padding:5, background:'var(--err2)', color:'var(--err)', borderRadius:6, flexShrink:0 }}><Trash2 size={12}/></button>
              </div>
            ))}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
            <div className="field"><label>Título</label><input value={newQR.titulo} onChange={e=>setNewQR(p=>({...p,titulo:e.target.value}))} placeholder="Ex: Boas-vindas"/></div>
            <div className="field"><label>Texto do template</label><textarea value={newQR.texto} onChange={e=>setNewQR(p=>({...p,texto:e.target.value}))} rows={2} placeholder="Olá! Seja bem-vindo..." style={{ resize:'vertical' }}/></div>
            <button onClick={addQR} className="btn btn-p btn-sm" disabled={!newQR.titulo||!newQR.texto}><Plus size={14}/> Adicionar template</button>
          </div>
        </div>

        {/* Users */}
        <div className="card" style={{ padding:'22px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:18 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'var(--pet)', display:'flex', alignItems:'center', justifyContent:'center' }}><Users size={18} color="#fff"/></div>
            <div style={{ flex:1 }}><h2 style={{ fontSize:16, fontWeight:800 }}>Usuários</h2><p style={{ fontSize:12, color:'var(--muted)', marginTop:1 }}>Login por CPF · somente o master cria usuários e troca senhas</p></div>
            {isMaster && (
              <button onClick={()=>{setUserErr('');setNovoUser(novoUser?null:{ nome:'', cpf:'', senha:'', role:'atendente' });}} className="btn btn-p btn-sm" style={{ gap:5 }}>
                {novoUser ? <X size={12}/> : <UserPlus size={12}/>}{novoUser ? 'Cancelar' : 'Novo usuário'}
              </button>
            )}
          </div>
          {novoUser && (
            <div style={{ padding:'12px 0 14px', borderBottom:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:9 }}>
              <div className="field">
                <label>Nome completo</label>
                <input value={novoUser.nome} maxLength={80} onChange={e=>setNovoUser({...novoUser, nome:e.target.value})} placeholder="Ex: Maria Souza" />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
                <div className="field">
                  <label>CPF (login)</label>
                  <input inputMode="numeric" value={novoUser.cpf} onChange={e=>setNovoUser({...novoUser, cpf:mask.cpf(e.target.value)})} placeholder="000.000.000-00" />
                </div>
                <div className="field">
                  <label>Senha inicial</label>
                  <input type="password" value={novoUser.senha} onChange={e=>setNovoUser({...novoUser, senha:e.target.value})} placeholder="mín. 8 caracteres" />
                </div>
              </div>
              <div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap' }}>
                {['atendente','supervisor','master'].map(rr=>(
                  <button key={rr} onClick={()=>setNovoUser({...novoUser, role:rr})}
                    style={{ padding:'5px 13px', borderRadius:9, fontSize:12, fontWeight:700, cursor:'pointer',
                      border:`1.5px solid ${novoUser.role===rr?'var(--tq)':'var(--border)'}`,
                      background: novoUser.role===rr?'var(--tq3)':'var(--card)',
                      color: novoUser.role===rr?'var(--tq2)':'var(--muted)' }}>
                    {rr==='master'?'Master':rr==='supervisor'?'Supervisora':'Atendente'}
                  </button>
                ))}
                <select value={novoUser.setor||''} onChange={e=>setNovoUser({...novoUser, setor:e.target.value})}
                  style={{ padding:'6px 10px', borderRadius:9, border:'1.5px solid var(--border)', fontSize:12, fontWeight:600, background:'var(--card)', color:'var(--txt)' }}>
                  {[['','—'],['vacinas','Vacinas'],['consultas','Consultas'],['terapias','Terapias']].map(([v,l])=><option key={v} value={v}>{v?`Setor: ${l}`:'Sem setor'}</option>)}
                </select>
              </div>
              {userErr && <div style={{ fontSize:12, color:'var(--err)', fontWeight:600 }}>{userErr}</div>}
              {(() => {
                const falta = [];
                if (!novoUser.nome.trim()) falta.push('nome');
                if (mask.digits(novoUser.cpf).length !== 11) falta.push('CPF completo (11 dígitos)');
                if (novoUser.senha.length < 8) falta.push('senha de 8+ caracteres');
                return falta.length ? <div style={{ fontSize:11.5, color:'var(--gold,#C4973B)', fontWeight:600 }}>Falta preencher: {falta.join(' · ')}</div> : null;
              })()}
              <button onClick={criarUsuario} disabled={!novoUser.nome.trim()||mask.digits(novoUser.cpf).length!==11||novoUser.senha.length<8}
                className="btn btn-p btn-sm" style={{ alignSelf:'flex-start', gap:5, opacity:(!novoUser.nome.trim()||mask.digits(novoUser.cpf).length!==11||novoUser.senha.length<8)?.5:1 }}>
                <Check size={13}/> Criar usuário
              </button>
            </div>
          )}

          {users.map(u=>(
            <div key={u.id} style={{ borderBottom:'1px solid var(--border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', opacity:u.ativo?1:.5 }}>
                {u.avatar ? (
                  <img src={u.avatar} alt="" style={{ width:34, height:34, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
                ) : (
                  <div style={{ width:34, height:34, borderRadius:'50%', background:u.cor||'var(--tq)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff', flexShrink:0 }}>
                    {u.nome.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
                  </div>
                )}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{u.nome}{!u.ativo && <span style={{ fontSize:10, color:'var(--err)', fontWeight:800, marginLeft:6 }}>INATIVO</span>}</div>
                  <div style={{ fontSize:11.5, color:'var(--muted)' }}>{u.cpf ? `CPF ${maskCpf(u.cpf)}` : 'Sem CPF cadastrado — entra pelo e-mail'}{(() => {
                    const labs = { vacinas:'Vacinas', consultas:'Consultas', terapias:'Terapias' };
                    const ss = (Array.isArray(u.setores) && u.setores.length) ? u.setores : (u.setor ? [u.setor] : []);
                    return ss.length ? ` · ${ss.map(s=>labs[s]||s).join(', ')}` : '';
                  })()}</div>
                </div>
                <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:12, background:u.role==='master'?'var(--gold2)':'var(--tq3)', color:u.role==='master'?'var(--gold)':'var(--tq)', flexShrink:0 }}>
                  {u.role==='master'?'Master':u.role==='supervisor'?'Supervisora':'Atendente'}
                </span>
                {isMaster && (
                  <button onClick={()=>{setUserErr('');setEditUser(editUser?.id===u.id?null:{ id:u.id, cpf:maskCpf(u.cpf||''), senha:'', ativo:u.ativo, setor:u.setor||'', setores:Array.isArray(u.setores)?u.setores:[] });}}
                    style={{ width:26, height:26, borderRadius:8, border:'1.5px solid var(--border)', background:'var(--card)', color:'var(--muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {editUser?.id===u.id?<X size={12}/>:<Pencil size={12}/>}
                  </button>
                )}
              </div>
              {editUser?.id===u.id && (
                <div style={{ padding:'4px 0 13px 44px', display:'flex', flexDirection:'column', gap:9 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
                    <div className="field">
                      <label>CPF (login)</label>
                      <input inputMode="numeric" value={editUser.cpf} onChange={e=>setEditUser({...editUser, cpf:maskCpf(e.target.value)})} placeholder="000.000.000-00" />
                    </div>
                    <div className="field">
                      <label>Nova senha (opcional)</label>
                      <input type="password" value={editUser.senha} onChange={e=>setEditUser({...editUser, senha:e.target.value})} placeholder="mín. 8 caracteres" />
                    </div>
                  </div>
                  <div className="field">
                    <label>Setor principal</label>
                    <select value={editUser.setor||''} onChange={e=>setEditUser({...editUser, setor:e.target.value})}
                      style={{ width:'100%', padding:'8px 10px', borderRadius:10, border:'1.5px solid var(--border)', fontSize:12.5, background:'var(--card)', color:'var(--txt)' }}>
                      {[['','—'],['vacinas','Vacinas'],['consultas','Consultas'],['terapias','Terapias']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Setores que enxerga (acesso)</label>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {[['vacinas','💉 Vacinas'],['consultas','🩺 Consultas'],['terapias','🧩 Terapias']].map(([v,l])=>{
                        const on = (editUser.setores||[]).includes(v);
                        return (
                          <button key={v} type="button" onClick={()=>setEditUser(eu=>({...eu, setores: on ? (eu.setores||[]).filter(x=>x!==v) : [...(eu.setores||[]), v]}))}
                            style={{ padding:'7px 12px', borderRadius:9, border:`1.5px solid ${on?'var(--tq)':'var(--border)'}`, cursor:'pointer', fontSize:12.5, fontWeight:700,
                              background:on?'var(--tq3)':'var(--card)', color:on?'var(--tq)':'var(--muted)' }}>{on?'✓ ':''}{l}</button>
                        );
                      })}
                    </div>
                    <span style={{ fontSize:11, color:'var(--muted)', display:'block', marginTop:5 }}>Marque pra esta pessoa ver mais de um setor (ex.: vacinas + consultas). Em branco = regra normal pelo setor principal.</span>
                  </div>
                  <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:12.5, fontWeight:600, color:'var(--txt2)', cursor:'pointer' }}>
                    <input type="checkbox" checked={editUser.ativo} onChange={e=>setEditUser({...editUser, ativo:e.target.checked})} style={{ width:15, height:15 }} />
                    Usuário ativo (pode entrar no sistema)
                  </label>
                  {userErr && <div style={{ fontSize:12, color:'var(--err)', fontWeight:600 }}>{userErr}</div>}
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={salvarUsuario} className="btn btn-p btn-sm"><Check size={13}/> Salvar usuário</button>
                    <button onClick={()=>setEditUser(null)} className="btn btn-s btn-sm">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* VittaSys Integration */}
        <div className="card" style={{ padding:'22px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:18 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'var(--gold2)', display:'flex', alignItems:'center', justifyContent:'center' }}><ExternalLink size={18} color="var(--gold)"/></div>
            <div><h2 style={{ fontSize:16, fontWeight:800 }}>Integração VittaSys</h2><p style={{ fontSize:12, color:'var(--muted)', marginTop:1 }}>Sistema de gestão clínica</p></div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ padding:'12px 14px', background:'var(--ok2)', borderRadius:10, display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--ok)' }}/>
              <span style={{ fontSize:13, fontWeight:600, color:'#065f46' }}>Integração configurada</span>
            </div>
            <div className="field"><label>URL do VittaSys</label><input defaultValue="https://vittasys.vittalissaude.com.br" readOnly style={{ background:'var(--bg)' }}/></div>
            <div style={{ fontSize:12.5, color:'var(--muted)', lineHeight:1.6 }}>
              O VittaHub busca automaticamente planos vacinais e vacinas avulsas do VittaSys ao enviar propostas no chat.
            </div>
            <a href="https://vittasys.vittalissaude.com.br" target="_blank" rel="noreferrer" className="btn btn-s btn-sm" style={{ textDecoration:'none', display:'inline-flex', width:'fit-content' }}>
              <ExternalLink size={13}/> Abrir VittaSys
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
