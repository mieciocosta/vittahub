import React, { useEffect, useState } from 'react';
import { Bot, MessageSquare, Plus, Trash2, Save, Users, ExternalLink, Pencil, X, Check, UserPlus } from 'lucide-react';
import { mask, tituloUsuario } from '../hooks/utils.js';
import { useApi, useAuth } from '../context/AuthContext.jsx';

export default function Configuracoes() {
  const api = useApi();
  const { isMaster, user } = useAuth();
  const ehDono = user?.dono === true || /mi[eé]cio/i.test(`${user?.nome || ''} ${user?.email || ''}`); // servidor decide; regex é reserva
  const [qr, setQr] = useState([]);
  const [bot, setBot] = useState(null);
  const [users, setUsers] = useState([]);
  const [newQR, setNewQR] = useState({ titulo:'', texto:'' });
  const [editQR, setEditQR] = useState(null); // { id, titulo, texto } — edição em linha
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // edição de usuário (master): CPF, nova senha, ativo
  const [editUser, setEditUser] = useState(null); // { id, cpf, senha, ativo }
  /* 🚫 Cancelar acesso 100% (ordem do master, 24/08): popup próprio, porque
     window.confirm falha na webview do celular. Exige digitar CANCELAR. */
  const [cancelUser, setCancelUser] = useState(null);
  const [cancelTxt, setCancelTxt] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  /* 👁 O QUE ELA ENXERGA (28/08): a Gabriellen foi criada e já apareceram 5
     conversas na tela dela. As regras de visibilidade viraram muitas (carteira
     fechada, fila de leads, conversa com dona, setor, exceção da casa) — em vez
     de adivinhar, o master abre aqui a lista do que a pessoa vê e o MOTIVO de
     cada linha ter passado. Só master. */
  const [visao, setVisao] = useState(null);      // { alvo, dados } | { alvo, erro }
  const [visaoBusy, setVisaoBusy] = useState(false);
  const verVisao = async (u) => {
    setVisao({ alvo: u }); setVisaoBusy(true);
    try { setVisao({ alvo: u, dados: await api.get(`/inbox/diagnostico/visao/${u.id}`) }); }
    catch (e) { setVisao({ alvo: u, erro: e.message || 'Não consegui ler.' }); }
    finally { setVisaoBusy(false); }
  };
  const cancelarAcesso = async () => {
    if (!cancelUser || cancelTxt.trim().toUpperCase() !== 'CANCELAR') return;
    setCancelBusy(true);
    try {
      const d = await api.post(`/auth/usuarios/${cancelUser.id}/cancelar-acesso`, {});
      setUsers(prev => prev.map(u => u.id === cancelUser.id ? { ...u, ativo: false, setor: null, lider: false, ia_consultas: false } : u));
      window.alert(`Acesso de ${d.nome} cancelado. ${d.conversas_liberadas} conversa(s) voltaram pro time.`);
      setCancelUser(null); setCancelTxt('');
    } catch (e) { window.alert('Erro: ' + e.message); }
    setCancelBusy(false);
  };
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
  const [metasFat, setMetasFat] = useState(null); // metas de faturamento por setor {minimas, globais}
  const [fatSaving, setFatSaving] = useState(false);
  const [fatSaved, setFatSaved] = useState(false);
  const salvarMetasFat = async () => {
    setFatSaving(true);
    try { await api.put('/extras/vendas/metas-faturamento', metasFat); setFatSaved(true); setTimeout(()=>setFatSaved(false), 2000); }
    catch (e) { window.alert('Erro: ' + e.message); }
    setFatSaving(false);
  };
  const setFat = (grupo, setor, v) => setMetasFat(p => ({ ...p, [grupo]: { ...(p?.[grupo]||{}), [setor]: v } }));
  // ⭐ Link de avaliação no Google (pós-venda automático pede a avaliação)
  const [reviewUrl, setReviewUrl] = useState('');
  const [clin, setClin] = useState({});          // 📍 dados da clínica (protocolo)
  const [protoPassos, setProtoPassos] = useState([]);
  const [reviewSaved, setReviewSaved] = useState(false);
  const salvarReview = async () => {
    try { await api.put('/extras/config-review', { url: reviewUrl.trim() }); setReviewSaved(true); setTimeout(()=>setReviewSaved(false), 2000); }
    catch (e) { window.alert('Erro: ' + e.message); }
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
  // 👤 Entrar como outro usuário (impersonação) — guarda o token do master pra voltar
  const entrarComo = async (u) => {
    if (!window.confirm(`Entrar como ${u.nome}?\n\nVocê verá e operará o sistema exatamente como este usuário. Pra voltar, use a barra roxa "Voltar ao meu usuário" no topo.`)) return;
    try {
      const r = await api.post(`/auth/impersonar/${u.id}`, {});
      if (!localStorage.getItem('vh_token_master')) localStorage.setItem('vh_token_master', localStorage.getItem('vh_token') || '');
      localStorage.setItem('vh_token', r.token);
      window.location.href = '/';
    } catch (e) { window.alert('Erro: ' + e.message); }
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
      const payload = { cpf: cpfDig, ativo: editUser.ativo, setor: editUser.setor || null, setores: (editUser.setores || []).length ? editUser.setores : null, lider: !!editUser.lider,
        pode_impersonar: !!editUser.pode_impersonar,
        so_carteira: !!editUser.so_carteira,
        so_fidelidade: !!editUser.so_fidelidade,
        ia_consultas: !!editUser.ia_consultas,
        supervisor_id: editUser.supervisor_id || null,
        meta_individual: parseFloat(editUser.meta_individual) || 0,
        meta_tipo: editUser.meta_tipo || 'valor',
        meta_qtd_dia: parseInt(editUser.meta_qtd_dia) || 0,
        meta_dias_uteis: parseInt(editUser.meta_dias_uteis) || 26 };
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
    api.get('/extras/vendas/metas-faturamento').then(setMetasFat).catch(()=>{});
    api.get('/extras/config-review').then(d=>setReviewUrl(d?.url||'')).catch(()=>{});
    api.get('/inbox/protocolo/config').then(d=>{ setClin(d?.clinica||{}); setProtoPassos(d?.passos||[]); }).catch(()=>{});
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
      setBot(p => ({ ...(p||{}), ativo:false, consultaIA:false }));
      window.alert(`✅ Pronto! ${r.desligados ?? 0} conversa(s) com bot foram desligadas.\n\nBot geral E IA de Consultas estão OFF — a IA não responde mais NENHUM cliente até você religar aqui.`);
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
            <div><h2 style={{ fontSize:16, fontWeight:800 }}>Bot de Atendimento</h2><p style={{ fontSize:12, color:'var(--muted)', marginTop:1 }}>A Vitta responde sozinha enquanto a equipe não assume. Somente o master (Miécio) liga ou desliga. O botão BOT de cada conversa é soberano: com os interruptores gerais desligados, só respondem as conversas que você ligar na mão.</p></div>
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
                  <span style={{ fontSize:11.5, color:'var(--muted)' }}>Quando ligada, a IA atende automaticamente tudo que NÃO é vacina (consultas e terapias) — mesmo com o bot geral desligado.</span>
                </span>
              </label>

              <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', background:'var(--tq3)', padding:'10px 12px', borderRadius:10 }}>
                <input type="checkbox" checked={bot.vacinasIA !== false} onChange={e=>setBot(p=>({...p,vacinasIA:e.target.checked}))} style={{ width:16, height:16, accentColor:'var(--tq)', marginTop:1 }}/>
                <span>
                  <span style={{ fontWeight:700, display:'block' }}>IA de Vacinas (Vitta vende vacinação)</span>
                  <span style={{ fontSize:11.5, color:'var(--muted)' }}>Quando ligada, a Vitta responde quem escolhe Vacinação — com calendário, pacotes, preços e proposta em PDF. Desligada, vacinação vai direto pro atendimento humano (rodízio).</span>
                </span>
              </label>

              <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', background:'#fff7ed', border:'1px solid #fed7aa', padding:'10px 12px', borderRadius:10 }}>
                <input type="checkbox" checked={bot.followup === true} onChange={e=>setBot(p=>({...p,followup:e.target.checked}))} style={{ width:16, height:16, accentColor:'#ea580c', marginTop:1 }}/>
                <span>
                  <span style={{ fontWeight:700, display:'block' }}>♻️ Follow-up automático (recupera quem sumiu)</span>
                  <span style={{ fontSize:11.5, color:'var(--muted)' }}>A Vitta retoma sozinha conversas onde ELA falou por último e o cliente silenciou: lembretes em 2h → 1 dia → 3 dias (máx. 3), só em horário comercial (8h-20h), com mensagem personalizada pela IA. É a venda quase fechada voltando sozinha.</span>
                </span>
              </label>

              <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', background:'#eff6ff', border:'1px solid #bfdbfe', padding:'10px 12px', borderRadius:10 }}>
                <input type="checkbox" checked={bot.resgateIA === true} onChange={e=>setBot(p=>({...p,resgateIA:e.target.checked}))} style={{ width:16, height:16, accentColor:'#2563eb', marginTop:1 }}/>
                <span>
                  <span style={{ fontWeight:700, display:'block' }}>🤖 Resgate de leads SEM VENDA (tentativas em dias diferentes)</span>
                  <span style={{ fontSize:11.5, color:'var(--muted)' }}>
                    Cuida de quem a EQUIPE atendeu e não fechou — o follow-up acima só age quando a Vitta falou por último.
                    Antes de cada tentativa, a IA deixa um <b>resumo interno</b> na conversa (balão amarelo, o cliente não vê) dizendo onde parou e o que travou.
                    São 3 tentativas em <b>3, 7 e 14 dias</b>, cada uma por um ângulo diferente (retomada leve → facilidade de pagamento → porta aberta),
                    nunca duas no mesmo dia, só em horário comercial. Para na hora em que o cliente responde ou a venda é registrada.
                  </span>
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

              {metasFat && (
                <div className="field" style={{ background:'var(--bg2,#f8fafc)', padding:'10px 12px', borderRadius:10 }}>
                  <label>💰 Metas de FATURAMENTO do mês — por setor (R$)</label>
                  {[['minimas','Meta mínima'],['globais','Meta global'],['premiosMin','🎁 Prêmio ao bater a MÍNIMA'],['premios','🎁 Prêmio ao bater a GLOBAL']].map(([g, rotulo]) => (
                    <div key={g} style={{ marginTop:6 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'var(--muted)' }}>{rotulo}</span>
                      <div style={{ display:'flex', gap:8, marginTop:3 }}>
                        {[['vacinas','💉 Vacinas'],['consultas','🩺 Consultas'],['terapias','🧩 Terapias']].map(([st, lb]) => (
                          <div key={st} style={{ flex:1 }}>
                            <span style={{ fontSize:10.5, color:'var(--muted)' }}>{lb}</span>
                            <input type="number" min={0} step={1000} value={metasFat[g]?.[st] ?? ''} onChange={e=>setFat(g, st, e.target.value)} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button onClick={salvarMetasFat} disabled={fatSaving} className="btn btn-sm" style={{ fontWeight:700, marginTop:10, width:'100%' }}>{fatSaving?'…':fatSaved?'✅ Salvo!':'Salvar metas de faturamento'}</button>
                  <span style={{ fontSize:11, color:'var(--muted)', display:'block', marginTop:6 }}>Aparecem no placar do topo e no Caixa: "falta R$X p/ mínima · R$Y p/ global", por setor.</span>
                </div>
              )}

              {/* 📜 MENSAGENS DO PROTOCOLO (pedido do master: "deixe a
                  possibilidade de alterarem o texto") — cada passo editável. */}
              {protoPassos.length > 0 && (
                <div className="field" style={{ background:'var(--bg2,#f8fafc)', padding:'10px 12px', borderRadius:10 }}>
                  <label>📜 Mensagens do Protocolo (editáveis)</label>
                  <span style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:8 }}>
                    Os textos prontos que a equipe usa em cada passo. Escritos no estilo dos Cases de Sucesso — ajuste à vontade.
                    Curingas: {'{ATENDENTE}'}, {'{PACIENTE}'}, {'{INSTAGRAM}'}, {'{ENDERECO}'}, {'{MAPA}'}, {'{LINK_AGENDAR}'}.
                  </span>
                  {protoPassos.map((p2, i) => (
                    <div key={p2.k} style={{ marginBottom:10 }}>
                      <div style={{ fontSize:11.5, fontWeight:800, marginBottom:3 }}>{p2.emoji} {p2.nome}</div>
                      {p2.k === 'significado_nome' || p2.k === 'preco' ? (
                        <span style={{ fontSize:10.5, color:'var(--muted)' }}>
                          {p2.k === 'significado_nome' ? 'Gerado pela IA na hora (botão ✨ Gerar e enviar).' : 'O investimento é apresentado com a Tabela de Preços — sem texto fixo.'}
                        </span>
                      ) : (
                        <textarea value={p2.modelo || ''} rows={3}
                          onChange={e => setProtoPassos(prev => prev.map((x, j) => j === i ? { ...x, modelo: e.target.value } : x))}
                          style={{ width:'100%', boxSizing:'border-box', padding:'8px 10px', borderRadius:9, border:'1.5px solid var(--border)', fontSize:12, lineHeight:1.55, resize:'vertical', background:'var(--card)', color:'var(--txt)', fontFamily:'inherit' }} />
                      )}
                    </div>
                  ))}
                  <button onClick={async () => {
                    try { await api.put('/inbox/protocolo/config', { passos: protoPassos, clinica: clin }); window.alert('✅ Mensagens salvas! Já valem pra toda a equipe.'); }
                    catch (e) { window.alert('Erro: ' + e.message); }
                  }} className="btn btn-sm" style={{ fontWeight:700, width:'100%' }}>Salvar mensagens do protocolo</button>
                </div>
              )}

              <div className="field" style={{ background:'var(--bg2,#f8fafc)', padding:'10px 12px', borderRadius:10 }}>
                <label>📍 Dados da clínica (usados no protocolo de atendimento)</label>
                <span style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:6 }}>Entram automaticamente na mensagem de agendamento que a equipe envia.</span>
                <input value={clin.endereco||''} onChange={e=>setClin(p2=>({...p2, endereco:e.target.value}))} placeholder="Endereço completo da clínica" style={{ marginBottom:6 }} />
                <input value={clin.mapa||''} onChange={e=>setClin(p2=>({...p2, mapa:e.target.value}))} placeholder="Link do Google Maps (como chegar)" style={{ marginBottom:6 }} />
                <input value={clin.instagram||''} onChange={e=>setClin(p2=>({...p2, instagram:e.target.value}))} placeholder="instagram.com/vittalissaude" style={{ marginBottom:6 }} />
                <input value={clin.link_agendar||''} onChange={e=>setClin(p2=>({...p2, link_agendar:e.target.value}))} placeholder="Link público de agendamento (…/agendar)" />
                <button onClick={async () => {
                  try { await api.put('/inbox/protocolo/config', { passos: protoPassos, clinica: clin }); window.alert('✅ Dados salvos! Já valem nas próximas mensagens.'); }
                  catch (e) { window.alert('Erro: ' + e.message); }
                }} className="btn btn-sm" style={{ fontWeight:700, marginTop:8, width:'100%' }}>Salvar dados da clínica</button>
              </div>

              <div className="field" style={{ background:'var(--bg2,#f8fafc)', padding:'10px 12px', borderRadius:10 }}>
                <label>🔔 Notificações no celular (app fechado)</label>
                <span style={{ fontSize:11.5, color:'var(--muted)', display:'block', marginBottom:8, lineHeight:1.5 }}>
                  Instale o VittaHub na tela inicial do celular, permita as notificações e clique abaixo pra testar.
                </span>
                <button onClick={async () => {
                  try {
                    if (window.Notification && Notification.permission !== 'granted') {
                      const p2 = await Notification.requestPermission();
                      if (p2 !== 'granted') return window.alert('Permissão negada. Libere as notificações do navegador e tente de novo.');
                      window.location.reload(); return;
                    }
                    await api.post('/extras/push/testar', {});
                    window.alert('✅ Enviei uma notificação de teste! Se não aparecer em alguns segundos, confira as permissões do navegador.');
                  } catch (e) { window.alert('Erro: ' + e.message); }
                }} className="btn btn-sm" style={{ fontWeight:700, width:'100%' }}>🔔 Testar notificação neste aparelho</button>
              </div>

              <div className="field" style={{ background:'var(--bg2,#f8fafc)', padding:'10px 12px', borderRadius:10 }}>
                <label>⭐ Link de avaliação no Google</label>
                <input value={reviewUrl} onChange={e=>setReviewUrl(e.target.value)} placeholder="https://g.page/r/… (link 'Avalie-nos' do Google Maps)" />
                <button onClick={salvarReview} className="btn btn-sm" style={{ fontWeight:700, marginTop:8, width:'100%' }}>{reviewSaved?'✅ Salvo!':'Salvar link'}</button>
                <span style={{ fontSize:11, color:'var(--muted)', display:'block', marginTop:6 }}>Com o link salvo, 4 dias após cada venda a Vitta pede a avaliação no Google automaticamente. Vazio = desativado.</span>
              </div>

              <button onClick={saveBot} disabled={saving} className="btn btn-p" style={{ width:'100%' }}>
                {saving?<span className="spin" style={{width:14,height:14}}/>:saved?'✅ Salvo!':'💾 Salvar configurações'}
              </button>

              {/* Botão de emergência: desliga todos os bots de uma vez */}
              <div style={{ borderTop:'1px solid var(--border)', marginTop:4, paddingTop:14 }}>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>
                  Bot geral: {bot.ativo
                    ? <strong style={{ color:'var(--ok)' }}>LIGADO</strong>
                    : <strong style={{ color:'var(--err,#dc2626)' }}>DESLIGADO</strong>}
                  {' · '}IA de Consultas: {bot.consultaIA !== false
                    ? <strong style={{ color:'var(--ok)' }}>LIGADA</strong>
                    : <strong style={{ color:'var(--err,#dc2626)' }}>DESLIGADA</strong>}
                  {bot.ativo === false && bot.consultaIA === false && (
                    <div style={{ marginTop:4, fontWeight:800, color:'var(--err,#dc2626)' }}>⛔ IA totalmente desligada — nenhum cliente recebe resposta automática.</div>
                  )}
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
                    const sup = u.supervisor_id ? users.find(x=>x.id===u.supervisor_id) : null;
                    return `${ss.length ? ` · ${ss.map(s=>labs[s]||s).join(', ')}` : ''}${sup ? ` · 👥 Equipe de ${String(sup.nome).split(' ')[0]}` : ''}`;
                  })()}</div>
                </div>
                <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:12, background:u.role==='master'?'var(--gold2)':'var(--tq3)', color:u.role==='master'?'var(--gold)':'var(--tq)', flexShrink:0 }}>
                  {tituloUsuario(u)}
                </span>
                {isMaster && (
                  <button onClick={()=>{setUserErr('');setEditUser(editUser?.id===u.id?null:{ id:u.id, cpf:maskCpf(u.cpf||''), senha:'', ativo:u.ativo, setor:u.setor||'', setores:Array.isArray(u.setores)?u.setores:[], lider:!!u.lider, pode_impersonar:!!u.pode_impersonar, so_carteira:!!u.so_carteira, so_fidelidade:!!u.so_fidelidade, ia_consultas:!!u.ia_consultas, supervisor_id:u.supervisor_id||'', meta_individual:u.meta_individual||'', meta_tipo:u.meta_tipo||'valor', meta_qtd_dia:u.meta_qtd_dia||'', meta_dias_uteis:u.meta_dias_uteis||26 });}}
                    style={{ width:26, height:26, borderRadius:8, border:'1.5px solid var(--border)', background:'var(--card)', color:'var(--muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {editUser?.id===u.id?<X size={12}/>:<Pencil size={12}/>}
                  </button>
                )}
                {isMaster && u.role !== 'master' && u.ativo !== false && (
                  <button onClick={()=>{ setCancelUser(u); setCancelTxt(''); }}
                    title={`Cancelar 100% o acesso de ${u.nome}: não entra mais, nem com a senha antiga`}
                    style={{ height:26, padding:'0 9px', borderRadius:8, border:'1.5px solid #fecaca', background:'#fef2f2', color:'#dc2626', cursor:'pointer', fontSize:10.5, fontWeight:800, flexShrink:0 }}>
                    🚫 Cancelar acesso
                  </button>
                )}
                {isMaster && (
                  <button onClick={()=>verVisao(u)} title={`Ver o que ${String(u.nome).split(' ')[0]} enxerga — e o motivo de cada conversa aparecer`}
                    style={{ height:26, padding:'0 9px', borderRadius:8, border:'1.5px solid #bae6fd', background:'#f0f9ff', color:'#0369a1', cursor:'pointer', fontSize:10.5, fontWeight:800, flexShrink:0 }}>
                    👁 O que ela vê
                  </button>
                )}
                {isMaster && ehDono && (
                  <button onClick={()=>entrarComo(u)} title={`Entrar como ${u.nome} — ver o sistema como este usuário`}
                    style={{ height:26, padding:'0 9px', borderRadius:8, border:'1.5px solid #c4b5fd', background:'#f5f3ff', color:'#7c3aed', cursor:'pointer', fontSize:10.5, fontWeight:800, flexShrink:0 }}>
                    👤 Entrar como
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
                  {/* 👥 Debaixo de qual supervisora essa pessoa trabalha (pedido do
                      master): com equipe cadastrada, a supervisora recebe TODOS os
                      leads do setor e distribui pra quem ela escolher. */}
                  <div className="field">
                    <label>👥 Trabalha na equipe de (supervisora)</label>
                    <select value={editUser.supervisor_id||''} onChange={e=>setEditUser({...editUser, supervisor_id:e.target.value})}
                      style={{ width:'100%', padding:'8px 10px', borderRadius:10, border:'1.5px solid var(--border)', fontSize:12.5, background:'var(--card)', color:'var(--txt)' }}>
                      <option value="">— ninguém (fora de equipe)</option>
                      {users.filter(s=>s.role==='supervisor' && s.ativo!==false && s.id!==u.id).map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                    <span style={{ fontSize:11, color:'var(--muted)', display:'block', marginTop:5 }}>
                      Quando uma supervisora tem equipe, os leads novos do setor dela caem primeiro com ela — ela olha e transfere pra quem escolher.
                    </span>
                  </div>
                  <div className="field">
                    {/* 🎯 Duas unidades de meta: quem é cobrada em R$ no mês e
                        quem é cobrada em consultas por dia. */}
                    <label>🎯 Meta individual</label>
                    <div style={{ display:'flex', gap:7, marginBottom:8 }}>
                      {[['valor','R$ por mês'],['consultas','Consultas por dia']].map(([v,l])=>{
                        const on = (editUser.meta_tipo || 'valor') === v;
                        return (
                          <button key={v} type="button" onClick={()=>setEditUser({...editUser, meta_tipo:v})}
                            style={{ padding:'6px 12px', borderRadius:9, cursor:'pointer', fontSize:12, fontWeight:700,
                              border:`1.5px solid ${on?'var(--tq)':'var(--border)'}`,
                              background:on?'var(--tq3)':'var(--card)', color:on?'var(--tq)':'var(--muted)' }}>{on?'✓ ':''}{l}</button>
                        );
                      })}
                    </div>
                    {(editUser.meta_tipo || 'valor') === 'consultas' ? (
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
                        <div className="field">
                          <label>Consultas por dia</label>
                          <input type="number" min={0} step={1} value={editUser.meta_qtd_dia ?? ''} onChange={e=>setEditUser({...editUser, meta_qtd_dia:e.target.value})} placeholder="ex: 10" />
                        </div>
                        <div className="field">
                          <label>Dias úteis no mês</label>
                          <input type="number" min={1} max={31} step={1} value={editUser.meta_dias_uteis ?? 26} onChange={e=>setEditUser({...editUser, meta_dias_uteis:e.target.value})} placeholder="26" />
                        </div>
                        <span style={{ gridColumn:'1 / -1', fontSize:11, color:'var(--muted)' }}>
                          Meta do mês: <b>{(parseInt(editUser.meta_qtd_dia)||0) * (parseInt(editUser.meta_dias_uteis)||26)}</b> consultas marcadas.
                        </span>
                      </div>
                    ) : (
                      <input type="number" min={0} step={1000} value={editUser.meta_individual ?? ''} onChange={e=>setEditUser({...editUser, meta_individual:e.target.value})} placeholder="ex: 100000 (0 = sem meta própria)" />
                    )}
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
                  <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:12.5, fontWeight:600, color:'var(--txt2)', cursor:'pointer' }}>
                    <input type="checkbox" checked={!!editUser.lider} onChange={e=>setEditUser({...editUser, lider:e.target.checked})} style={{ width:15, height:15 }} />
                    🚀 Líder de equipe (ganha a tela de Planejamento)
                  </label>
                  {/* Permissão poderosa: quem tem isso opera o sistema como
                      outra pessoa. Fica com o master, e só ele muda aqui. */}
                  <label style={{ display:'flex', alignItems:'flex-start', gap:7, fontSize:12.5, fontWeight:600, color:'var(--txt2)', cursor:'pointer', background:'#f5f3ff', border:'1px solid #ddd6fe', padding:'9px 11px', borderRadius:10 }}>
                    <input type="checkbox" checked={!!editUser.pode_impersonar} onChange={e=>setEditUser({...editUser, pode_impersonar:e.target.checked})} style={{ width:15, height:15, accentColor:'#7c3aed', marginTop:1 }} />
                    <span>
                      <span style={{ display:'block' }}>👤 Pode entrar como outro usuário</span>
                      <span style={{ fontSize:11, color:'var(--muted)', fontWeight:500 }}>
                        Vê e opera o sistema pelos olhos de qualquer pessoa da equipe. Toda visita fica registrada na Auditoria.
                        Entrar na conta de um <b>master</b> continua sendo só do dono.
                      </span>
                    </span>
                  </label>
                  {/* 🤖 Vitta nas consultas (pedido do master): quem tem esta
                      chave vê o convite roxo no Chat e solta a IA na conversa. */}
                  <label style={{ display:'flex', alignItems:'flex-start', gap:7, fontSize:12.5, fontWeight:600, color:'var(--txt2)', cursor:'pointer', background:'#f5f3ff', border:'1px solid #c4b5fd', padding:'9px 11px', borderRadius:10 }}>
                    <input type="checkbox" checked={!!editUser.ia_consultas} onChange={e=>setEditUser({...editUser, ia_consultas:e.target.checked})} style={{ width:15, height:15, accentColor:'#7c3aed', marginTop:1 }} />
                    <span>
                      <span style={{ display:'block' }}>🤖 Vitta nas consultas — IA que conduz e fecha</span>
                      <span style={{ fontSize:11, color:'var(--muted)', fontWeight:500 }}>
                        Vê o convite da Vitta nas conversas de consultas/terapias e ativa a IA com um toque.
                        Hoje: Danielle, Stefany e Mayara.
                      </span>
                    </span>
                  </label>
                  {/* 🏠 Perfil home office por produção (pedido do master): a
                      pessoa só enxerga os leads/conversas TRANSFERIDOS pra ela.
                      Nem o pool de leads novos sem dono aparece. */}
                  <label style={{ display:'flex', alignItems:'flex-start', gap:7, fontSize:12.5, fontWeight:600, color:'var(--txt2)', cursor:'pointer', background:'#ecfeff', border:'1px solid #a5f3fc', padding:'9px 11px', borderRadius:10 }}>
                    <input type="checkbox" checked={!!editUser.so_carteira} onChange={e=>setEditUser({...editUser, so_carteira:e.target.checked})} style={{ width:15, height:15, accentColor:'#0E8C96', marginTop:1 }} />
                    <span>
                      <span style={{ display:'block' }}>🏠 Home office — só a carteira transferida</span>
                      <span style={{ fontSize:11, color:'var(--muted)', fontWeight:500 }}>
                        Vê apenas os leads e conversas que a gestão transferir pra ela (botão ⇄ na conversa ou no lead).
                        Não enxerga o pool de leads novos nem as conversas das colegas — ideal pra quem trabalha por produção.
                      </span>
                    </span>
                  </label>
                  {/* 💛 Carteira de Fidelidade (pedido do master, 24/08): o funil
                      principal dela é a pasta Fidelidade, e só ela. */}
                  <label style={{ display:'flex', alignItems:'flex-start', gap:7, fontSize:12.5, fontWeight:600, color:'var(--txt2)', cursor:'pointer', background:'#fdf6e7', border:'1px solid #C4973B', padding:'9px 11px', borderRadius:10 }}>
                    <input type="checkbox" checked={!!editUser.so_fidelidade} onChange={e=>setEditUser({...editUser, so_fidelidade:e.target.checked})} style={{ width:15, height:15, accentColor:'#C4973B', marginTop:1 }} />
                    <span>
                      <span style={{ display:'block' }}>💛 Só a carteira de Fidelidade</span>
                      <span style={{ fontSize:11, color:'var(--muted)', fontWeight:500 }}>
                        O funil principal dela passa a ser a pasta Fidelidade. Além dela, aparecem também os atendimentos que a equipe
                        transferir pra ela, que entram direto na grade principal. Nenhuma outra carteira da casa fica visível.
                      </span>
                    </span>
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

      {/* 🚫 CONFIRMAÇÃO DE CANCELAMENTO — popup próprio (o confirm do navegador
          falha na webview do celular) e com palavra de segurança. */}
      {cancelUser && (
        <div onClick={e => e.target === e.currentTarget && setCancelUser(null)}
          style={{ position:'fixed', inset:0, background:'rgba(3,43,48,.65)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div className="card" style={{ width:'100%', maxWidth:440, padding:0, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', background:'linear-gradient(120deg,#7f1d1d,#dc2626)', color:'#fff' }}>
              <div style={{ fontWeight:900, fontSize:15 }}>🚫 Cancelar acesso de {cancelUser.nome}</div>
              <div style={{ fontSize:11.5, opacity:.92, marginTop:3 }}>Esta ação tira a pessoa do VittaHub por completo.</div>
            </div>
            <div style={{ padding:'16px 18px' }}>
              <div style={{ fontSize:12.5, color:'var(--txt2)', lineHeight:1.6 }}>
                O que acontece:<br />
                • Não entra mais, nem com a senha antiga (a senha é embaralhada)<br />
                • O CPF e o e-mail saem de circulação, então não dá login por eles<br />
                • Todos os poderes são zerados (IA, liderança, ver tudo, baixa manual)<br />
                • As conversas e os leads dela voltam para o time<br />
                • Se estiver logada agora, a sessão cai na hora<br /><br />
                O cadastro fica guardado sem acesso, porque as <b>vendas, o caixa e as metas antigas</b> apontam para ele. Apagar de vez quebraria o histórico da casa.
              </div>
              <div className="field" style={{ marginTop:14 }}>
                <label>Para confirmar, digite CANCELAR</label>
                <input value={cancelTxt} onChange={e => setCancelTxt(e.target.value)} placeholder="CANCELAR" autoFocus />
              </div>
              <div style={{ display:'flex', gap:8, marginTop:14, justifyContent:'flex-end' }}>
                <button onClick={() => setCancelUser(null)} className="btn btn-sm"
                  style={{ background:'var(--bg2)', color:'var(--muted)', border:'1.5px solid var(--border)' }}>Voltar</button>
                <button onClick={cancelarAcesso} disabled={cancelBusy || cancelTxt.trim().toUpperCase() !== 'CANCELAR'} className="btn btn-sm"
                  style={{ background:'#dc2626', color:'#fff', border:'none', fontWeight:800,
                    opacity:(cancelBusy || cancelTxt.trim().toUpperCase() !== 'CANCELAR') ? .45 : 1 }}>
                  {cancelBusy ? 'Cancelando…' : 'Cancelar acesso agora'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 👁 DIAGNÓSTICO DE VISÃO — a régua de acesso explicada linha por linha */}
      {visao && (
        <div onClick={e => e.target === e.currentTarget && setVisao(null)}
          style={{ position:'fixed', inset:0, background:'rgba(3,43,48,.65)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div className="card" style={{ width:'100%', maxWidth:620, maxHeight:'88vh', padding:0, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'14px 18px', background:'linear-gradient(120deg,#075985,#0891b2)', color:'#fff', flexShrink:0 }}>
              <div style={{ fontWeight:900, fontSize:15 }}>👁 O que {String(visao.alvo?.nome || '').split(' ')[0]} enxerga hoje</div>
              <div style={{ fontSize:11.5, opacity:.92, marginTop:3 }}>Cada conversa com o motivo que a deixou passar pela trava.</div>
            </div>
            <div style={{ padding:'16px 18px', overflowY:'auto' }}>
              {visaoBusy && <div style={{ fontSize:12.5, color:'var(--muted)' }}>Conferindo…</div>}
              {visao.erro && <div style={{ fontSize:12.5, color:'var(--err)' }}>{visao.erro}</div>}
              {visao.dados && (() => {
                const d = visao.dados;
                const perfis = [
                  d.usuario.role !== 'atendente' && `cargo ${d.usuario.role}`,
                  d.usuario.ve_tudo && 've tudo',
                  d.usuario.so_carteira && 'só carteira',
                  d.usuario.so_fidelidade && 'só fidelidade',
                  d.usuario.distribuidor && 'distribuidora dos leads',
                ].filter(Boolean);
                return (
                  <>
                    <div style={{ fontSize:12.5, color:'var(--txt2)', lineHeight:1.7, marginBottom:12 }}>
                      Setores: <b>{(d.usuario.setores && d.usuario.setores.length ? d.usuario.setores : [d.usuario.setor || '—']).join(', ')}</b>
                      {perfis.length ? <> · Perfil: <b>{perfis.join(' · ')}</b></> : null}
                      <br />Enxerga <b style={{ color:d.enxerga ? '#0369a1' : '#16a34a' }}>{d.enxerga}</b> de {d.total_no_sistema} conversas do sistema.
                    </div>
                    {d.enxerga === 0 && (
                      <div style={{ fontSize:12.5, color:'#16a34a', fontWeight:700 }}>✅ Nenhuma conversa — é exatamente o esperado para quem ainda não recebeu nada da distribuição.</div>
                    )}
                    {d.por_motivo.length > 0 && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
                        {d.por_motivo.map(m => (
                          <span key={m.motivo} style={{ fontSize:11, fontWeight:800, padding:'4px 10px', borderRadius:12, background:'var(--bg2)', color:'var(--txt2)', border:'1.5px solid var(--border)' }}>
                            {m.motivo} · {m.n}
                          </span>
                        ))}
                      </div>
                    )}
                    {d.exemplos.map(c => (
                      <div key={c.id} style={{ padding:'8px 0', borderTop:'1px solid var(--border)', fontSize:12.5 }}>
                        <b>{c.nome || 'sem nome'}</b>
                        <span style={{ color:'var(--muted)' }}>{c.setor ? ` · ${c.setor}` : ' · sem setor'}{c.responsavel ? ` · de ${String(c.responsavel).split(' ')[0]}` : ' · sem dona'}</span>
                        <div style={{ fontSize:11.5, color:'#0369a1', fontWeight:700 }}>↳ {c.motivo}</div>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
            <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end', flexShrink:0 }}>
              <button onClick={() => setVisao(null)} className="btn btn-sm"
                style={{ background:'var(--bg2)', color:'var(--muted)', border:'1.5px solid var(--border)' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>

  );
}
