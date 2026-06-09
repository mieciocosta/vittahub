import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Send, Paperclip, Mic, MicOff, Sparkles, Search, RefreshCw, X, UserPlus, Hash, Bot, FileText, Volume2, File, ChevronDown, MessageCircle, Phone, Star, Tag } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt, openWA } from '../hooks/utils.js';
import PropostaModal from '../components/PropostaModal.jsx';

const WA = ({s=14})=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.556 4.118 1.523 5.847L0 24l6.302-1.496A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.807 9.807 0 01-5.032-1.388l-.361-.214-3.741.888.948-3.651-.235-.374A9.786 9.786 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>;
const IG = ({s=14})=><svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>;

/* ── AI Panel ────────────────────────────────────────────────────────────────── */
function AIPanel({ messages, contactName, token, convId, onUseSuggestion, onClose }) {
  const [mode, setMode] = useState(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async (m) => {
    setMode(m); setResult(''); setLoading(true);
    const transcript = messages.filter(x=>x.type==='text'&&x.from!=='system').slice(-20).map(x=>`${x.from==='me'?`Atendente(${x.senderNome||'Equipe'})`:x.from==='bot'?'Bot':contactName}: ${x.content}`).join('\n');

    const systemPrompt = `Você é assistente comercial sênior da Vittalis Saúde, clínica de vacinas e bem-estar em São Luís-MA. Tom de voz da marca: humano, empático, leve, confiável. Slogan: "Sua vida é preciosa." Proposta de valor: tratar cada paciente como uma joia rara.`;

    const prompts = {
      summary: `${systemPrompt}\n\nAnalise esta conversa e gere resumo comercial CONCISO:\n◆ Interesse demonstrado\n◆ Objeções identificadas\n◆ Intenção de compra (baixa/média/alta🔥)\n◆ Sentimento do cliente\n◆ Próximo passo recomendado\n\nConversa:\n${transcript}\n\nResponda em pt-BR, markdown simples, máx 180 palavras.`,
      suggest: `${systemPrompt}\n\nCom base nesta conversa, sugira a MELHOR estratégia de fechamento agora. Seja ultra-específico: qual produto/plano recomendar, qual objeção trabalhar, qual gatilho emocional usar. Max 120 palavras.\n\nConversa:\n${transcript}`,
      reply: `${systemPrompt}\n\nEscreva a PRÓXIMA MENSAGEM perfeita para enviar ao cliente ${contactName}. Aplique o tom da marca Vittalis: acolhedor, empático, leve. Crie conexão genuína. RETORNE APENAS O TEXTO DA MENSAGEM, sem explicações.\n\nConversa:\n${transcript}`,
      qualify: `${systemPrompt}\n\nAvalie o lead ${contactName} com score de 1-10 e justificativa em 3 linhas. Inclua: potencial de compra, urgência, budget aparente, next step ideal.\n\nConversa:\n${transcript}`,
    };

    try {
      const resp = await fetch('/api/inbox/ai-assist', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}, body: JSON.stringify({ prompt: prompts[m], convId }) });
      const d = await resp.json();
      setResult(d.text || d.error || 'Sem resposta');
    } catch(e) { setResult('Erro: ' + e.message); }
    setLoading(false);
  };

  const BTNS = [
    { k:'summary',  label:'📋 Resumo',      desc:'Analisa a conversa' },
    { k:'qualify',  label:'⭐ Score',        desc:'Qualifica o lead' },
    { k:'suggest',  label:'💡 Estratégia',   desc:'Como fechar' },
    { k:'reply',    label:'✍️ Resposta',     desc:'Próxima mensagem' },
  ];

  return (
    <div style={{ background:'#071e2c', padding:'14px 18px', flexShrink:0 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <Sparkles size={13} color="#00B8C0"/>
          <span style={{ color:'#00B8C0', fontWeight:700, fontSize:12.5 }}>IA Vittalis</span>
          <span style={{ fontSize:10.5, color:'rgba(255,255,255,0.3)', marginLeft:2 }}>Powered by Claude</span>
        </div>
        <div style={{ display:'flex', gap:5, alignItems:'center' }}>
          {BTNS.map(({k,label})=>(
            <button key={k} onClick={()=>run(k)} disabled={loading}
              style={{ padding:'4px 10px', borderRadius:20, fontSize:11.5, fontWeight:600, cursor:'pointer', border:`1px solid ${mode===k&&result?'#00B8C0':'rgba(255,255,255,0.12)'}`, background:mode===k&&result?'rgba(0,184,192,.2)':'rgba(255,255,255,.06)', color:mode===k&&result?'#00B8C0':'rgba(255,255,255,.55)', transition:'all .15s' }}>
              {loading&&mode===k?<span className="spin" style={{width:10,height:10,borderColor:'rgba(255,255,255,.2)',borderTopColor:'#fff'}}/>:label}
            </button>
          ))}
          <button onClick={onClose} style={{ padding:'3px 6px', background:'none', color:'rgba(255,255,255,0.3)', borderRadius:6, cursor:'pointer', border:'none' }}><X size={12}/></button>
        </div>
      </div>

      {result && (
        <div style={{ background:'rgba(255,255,255,.07)', borderRadius:8, padding:'11px 13px', fontSize:12.5, color:'rgba(255,255,255,.85)', lineHeight:1.7, whiteSpace:'pre-wrap', maxHeight:130, overflowY:'auto' }}>
          {result}
          {mode === 'reply' && (
            <button onClick={()=>{ onUseSuggestion(result); onClose(); }}
              style={{ display:'flex', alignItems:'center', gap:6, marginTop:9, padding:'6px 14px', background:'#00B8C0', color:'#fff', borderRadius:8, fontSize:12.5, fontWeight:700, cursor:'pointer', border:'none' }}>
              <Send size={11}/> Usar esta resposta
            </button>
          )}
        </div>
      )}
      {!result && !loading && (
        <div style={{ fontSize:11.5, color:'rgba(255,255,255,.28)', fontStyle:'italic' }}>
          Clique em uma opção para analisar com IA · Funciona sem API key (modo demo)
        </div>
      )}
    </div>
  );
}

/* ── Contact Info Sidebar ─────────────────────────────────────────────────── */
function ContactPanel({ conv, lead, onClose }) {
  if (!conv) return null;
  return (
    <div style={{ width:260, flexShrink:0, borderLeft:'1px solid var(--border)', background:'#fff', display:'flex', flexDirection:'column', overflowY:'auto' }}>
      <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:13, fontWeight:700 }}>Info do contato</span>
        <button onClick={onClose} className="btn btn-g btn-ico" style={{ padding:5 }}><X size={14}/></button>
      </div>
      <div style={{ padding:'16px' }}>
        {/* Avatar big */}
        <div style={{ textAlign:'center', marginBottom:16 }}>
          <div style={{ width:60, height:60, borderRadius:'50%', background:conv.channel==='whatsapp'?'#d4f7e0':'#fce4ef', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:700, color:conv.channel==='whatsapp'?'#0a7a40':'#9a1050', marginBottom:10, boxShadow:'0 2px 12px rgba(0,0,0,.1)' }}>
            {(conv.contactName||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
          </div>
          <div style={{ fontWeight:700, fontSize:15 }}>{conv.contactName}</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:2, display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
            {conv.channel==='whatsapp'?<WA s={11}/>:<IG s={11}/>}
            {conv.channel==='whatsapp'?'WhatsApp':'Instagram'}
          </div>
        </div>

        {/* Contact details */}
        {conv.phone && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:10.5, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.6, marginBottom:5 }}>Telefone</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:13.5 }}>{fmt.phone(conv.phone)}</span>
              <button onClick={()=>openWA(conv.phone, conv.contactName)} style={{ padding:'3px 8px', borderRadius:6, background:'var(--wa2)', color:'var(--wa)', border:'none', fontSize:11.5, fontWeight:700, cursor:'pointer' }}>WA</button>
            </div>
          </div>
        )}

        {/* Lead info */}
        {lead && (
          <div style={{ background:'var(--tq4)', borderRadius:10, padding:'12px' }}>
            <div style={{ fontSize:10.5, fontWeight:700, color:'var(--tq2)', textTransform:'uppercase', letterSpacing:.6, marginBottom:8 }}>Lead no Funil</div>
            {[
              ['Origem', lead.origem],
              ['Interesse', lead.interesse],
              ['Status', lead.status],
              ['Proposta', lead.valorProposta > 0 ? `R$ ${lead.valorProposta?.toFixed(2)?.replace('.',',')}` : '—'],
            ].map(([k,v])=>(
              <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:12.5 }}>
                <span style={{ color:'var(--muted)' }}>{k}</span>
                <span style={{ fontWeight:600 }}>{v}</span>
              </div>
            ))}
            {lead.observacoes && <div style={{ marginTop:8, fontSize:11.5, color:'var(--muted)', lineHeight:1.5, borderTop:'1px solid var(--border)', paddingTop:8 }}>{lead.observacoes}</div>}
          </div>
        )}

        {/* Messages stats */}
        <div style={{ marginTop:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {[
            ['Mensagens', (conv.messages||[]).length],
            ['Bot', conv.botAtivo?'Ativo':'Inativo'],
          ].map(([k,v])=>(
            <div key={k} style={{ background:'var(--bg)', borderRadius:8, padding:'10px', textAlign:'center' }}>
              <div style={{ fontWeight:800, fontSize:18 }}>{v}</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>{k}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main Inbox ────────────────────────────────────────────────────────────── */
export default function Inbox({ onUnreadChange }) {
  const api = useApi();
  const { user, token, isMaster } = useAuth();
  const [convos, setConvos] = useState([]);
  const [sel, setSel] = useState(null);
  const [selFull, setSelFull] = useState(null); // full conv with messages
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder] = useState(null);
  const [showAI, setShowAI] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [qr, setQr] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [showProposta, setShowProposta] = useState(false);
  const [leadData, setLeadData] = useState(null);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const textRef = useRef(null);

  useEffect(() => { loadConvos(); api.get('/inbox/quick-replies').then(setQr); }, [filter]);
  useEffect(() => { endRef.current?.scrollIntoView({behavior:'smooth'}); }, [msgs]);

  const loadConvos = async () => {
    const url = filter==='all'?'/inbox/conversations':`/inbox/conversations?channel=${filter}`;
    const data = await api.get(url);
    setConvos(data);
    onUnreadChange?.(data.reduce((s,c)=>s+(c.unread||0),0));
  };

  const openConvo = async (c) => {
    setSel(c); setShowAI(false); setShowProposta(false); setLeadData(null);
    const data = await api.get(`/inbox/conversations/${c.id}`);
    setSelFull(data);
    setMsgs(data.messages || []);
    if (data.leadId) api.get(`/leads/${data.leadId}`).then(setLeadData).catch(()=>{});
    fetch(`/api/inbox/conversations/${c.id}/read`, { method:'PATCH', headers:{Authorization:`Bearer ${token}`} });
    setConvos(prev => prev.map(x => x.id===c.id ? {...x,unread:0} : x));
  };

  const send = async (text) => {
    const t = (text||input).trim(); if(!t||!sel) return;
    setInput('');
    const msg = { id:Date.now(), from:'me', type:'text', content:t, timestamp:new Date().toISOString(), status:'sent', senderNome:user?.nome };
    setMsgs(p=>[...p,msg]);
    fetch(`/api/inbox/conversations/${sel.id}/send`, { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}, body:JSON.stringify({content:t}) });
    setConvos(p=>p.map(c=>c.id===sel.id?{...c,lastMessage:t,lastMessageTime:new Date().toISOString()}:c));
  };

  const handleFile = async (e) => {
    const f=e.target.files[0]; if(!f||!sel) return;
    const fd=new FormData(); fd.append('file',f);
    const m = await api.upload(`/inbox/conversations/${sel.id}/upload`, fd);
    setMsgs(p=>[...p,m]); e.target.value='';
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      const mr = new MediaRecorder(stream); const ch=[];
      mr.ondataavailable = e=>ch.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(ch, {type:'audio/webm'});
        const fd = new FormData(); fd.append('file', blob, 'audio.webm');
        const m = await api.upload(`/inbox/conversations/${sel.id}/upload`, fd);
        setMsgs(p=>[...p,m]); stream.getTracks().forEach(t=>t.stop());
      };
      mr.start(); setRecorder(mr); setRecording(true);
    } catch { alert('Microfone indisponível'); }
  };
  const stopRec = () => { recorder?.stop(); setRecording(false); setRecorder(null); };

  const toLead = async () => {
    const d = await fetch(`/api/inbox/conversations/${sel.id}/to-lead`, { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}, body:'{}' }).then(r=>r.json());
    if(d.created) { alert(`✅ Lead criado: ${d.lead.nome}`); setLeadData(d.lead); }
    else { alert(`ℹ️ Lead já existe: ${d.lead.nome}`); setLeadData(d.lead); }
  };

  const toggleBot = async () => {
    const d = await fetch(`/api/inbox/conversations/${sel.id}/bot`, { method:'PATCH', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}, body:JSON.stringify({ativo:!sel.botAtivo}) }).then(r=>r.json());
    setSel(p=>({...p,botAtivo:d.botAtivo}));
  };

  const totalUnread = convos.reduce((s,c)=>s+(c.unread||0),0);
  const filtered = convos.filter(c => !search || c.contactName?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      {/* ── List ── */}
      <div style={{ width:290, flexShrink:0, background:'#fff', display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)' }}>
        <div style={{ padding:'16px 14px 12px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:11 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <h2 style={{ fontSize:18, fontWeight:700 }}>Inbox</h2>
              {totalUnread > 0 && <span style={{ background:'var(--tq)', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:11, fontWeight:800, boxShadow:'0 2px 6px rgba(0,184,192,.35)' }}>{totalUnread}</span>}
            </div>
            <button onClick={loadConvos} className="btn btn-g btn-ico"><RefreshCw size={14}/></button>
          </div>
          <div style={{ display:'flex', gap:4, marginBottom:9 }}>
            {[['all','Todos'],['whatsapp','WA'],['instagram','IG']].map(([ch,l])=>(
              <button key={ch} onClick={()=>setFilter(ch)} style={{ flex:1, padding:'6px 2px', borderRadius:8, fontSize:11.5, fontWeight:600, cursor:'pointer', border:'1.5px solid', transition:'all .13s',
                background: filter===ch?(ch==='whatsapp'?'var(--wa2)':ch==='instagram'?'var(--ig2)':'var(--tq3)'):'#fff',
                color: filter===ch?(ch==='whatsapp'?'var(--wa)':ch==='instagram'?'var(--ig)':'var(--tq)'):'var(--muted)',
                borderColor: filter===ch?'currentColor':'var(--border)'
              }}>{l}</button>
            ))}
          </div>
          <div style={{ position:'relative' }}>
            <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar contato…"
              style={{ width:'100%', padding:'7px 10px 7px 28px', border:'1.5px solid var(--border)', borderRadius:8, outline:'none', fontSize:13, background:'var(--bg)' }}
              onFocus={e=>e.target.style.borderColor='var(--tq)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto' }}>
          {filtered.map(c => (
            <div key={c.id} onClick={()=>openConvo(c)}
              style={{ display:'flex', gap:10, padding:'10px 13px', cursor:'pointer', borderBottom:'1px solid var(--border)', borderLeft:`3px solid ${sel?.id===c.id?'var(--tq)':'transparent'}`, background:sel?.id===c.id?'var(--tq4)':'transparent', transition:'background .1s' }}
              onMouseEnter={e=>{if(sel?.id!==c.id)e.currentTarget.style.background='var(--bg)'}}
              onMouseLeave={e=>{if(sel?.id!==c.id)e.currentTarget.style.background='transparent'}}>
              <div style={{ width:38, height:38, borderRadius:'50%', flexShrink:0, background:c.channel==='whatsapp'?'#d4f7e0':'#fce4ef', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, color:c.channel==='whatsapp'?'#0a7a40':'#9a1050', position:'relative' }}>
                {(c.contactName||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
                <span style={{ position:'absolute', bottom:-1, right:-1, width:14, height:14, borderRadius:'50%', background:c.channel==='whatsapp'?'var(--wa)':'var(--ig)', display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid #fff' }}>
                  {c.channel==='whatsapp'?<WA s={7}/>:<IG s={7}/>}
                </span>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontWeight:600, fontSize:13.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.contactName}</span>
                  <span style={{ fontSize:10.5, color:'var(--light)', flexShrink:0 }}>{fmt.relTime(c.lastMessageTime)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:2 }}>
                  <span style={{ fontSize:12, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{c.lastMessage}</span>
                  {c.unread>0&&<span style={{ background:'var(--tq)', color:'#fff', borderRadius:10, padding:'1px 6px', fontSize:10.5, fontWeight:800, marginLeft:5, flexShrink:0 }}>{c.unread}</span>}
                </div>
                {c.botAtivo&&<span style={{ fontSize:10, color:'var(--ok)', fontWeight:700 }}>◆ Bot</span>}
                {c.leadId&&<span style={{ fontSize:10, color:'var(--tq)', fontWeight:700, marginLeft:c.botAtivo?8:0 }}>◆ Lead</span>}
              </div>
            </div>
          ))}
          {filtered.length===0&&<div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:13 }}>Nenhuma conversa</div>}
        </div>
      </div>

      {/* ── Chat ── */}
      {!sel ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
          <img src="/logos/logo-icon-color.png" alt="" style={{ width:52, opacity:.12, marginBottom:16 }}/>
          <p style={{ color:'var(--light)', fontSize:13.5 }}>Selecione uma conversa para começar</p>
          <p style={{ color:'var(--light)', fontSize:12, marginTop:4 }}>{convos.length} conversa{convos.length!==1?'s':''} · {totalUnread} não lida{totalUnread!==1?'s':''}</p>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
          {/* Header */}
          <div style={{ background:'#fff', padding:'11px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <div style={{ width:34, height:34, borderRadius:'50%', background:sel.channel==='whatsapp'?'#d4f7e0':'#fce4ef', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, color:sel.channel==='whatsapp'?'#0a7a40':'#9a1050', position:'relative', flexShrink:0 }}>
              {(sel.contactName||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
              <span style={{ position:'absolute', bottom:-1, right:-1, width:12, height:12, borderRadius:'50%', background:sel.channel==='whatsapp'?'var(--wa)':'var(--ig)', display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid #fff' }}>{sel.channel==='whatsapp'?<WA s={5}/>:<IG s={5}/>}</span>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:600, fontSize:14, display:'flex', alignItems:'center', gap:7, overflow:'hidden' }}>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sel.contactName}</span>
                {sel.botAtivo&&<span style={{ display:'inline-flex', alignItems:'center', gap:3, background:'var(--ok2)', color:'var(--ok)', borderRadius:6, padding:'2px 7px', fontSize:10, fontWeight:700, flexShrink:0 }}><Bot size={8}/>Bot</span>}
                {leadData&&<span style={{ display:'inline-flex', alignItems:'center', gap:3, background:'var(--tq3)', color:'var(--tq2)', borderRadius:6, padding:'2px 7px', fontSize:10, fontWeight:700, flexShrink:0 }}>◆ Lead</span>}
              </div>
              {sel.phone&&<div style={{ fontSize:11, color:'var(--muted)' }}>{fmt.phone(sel.phone)}</div>}
            </div>
            <div style={{ display:'flex', gap:5, flexShrink:0 }}>
              <button onClick={toggleBot} className="btn btn-sm" style={{ background:sel.botAtivo?'var(--ok2)':'var(--bg2)', color:sel.botAtivo?'var(--ok)':'var(--muted)', border:`1.5px solid ${sel.botAtivo?'var(--ok)':'var(--border)'}`, fontSize:11.5 }}>
                <Bot size={11}/> {sel.botAtivo?'Bot ON':'Bot'}
              </button>
              <button onClick={()=>setShowProposta(true)} className="btn btn-sm" style={{ background:'linear-gradient(135deg,#071e2c,#207898)', color:'#fff', fontSize:11.5 }}>
                <FileText size={11}/> Proposta
              </button>
              <button onClick={toLead} className="btn btn-s btn-sm" style={{ fontSize:11.5 }}><UserPlus size={11}/> Lead</button>
              <button onClick={()=>setShowAI(p=>!p)} className="btn btn-sm" style={{ background:showAI?'#071e2c':'var(--bg2)', color:showAI?'#00B8C0':'var(--muted)', border:`1.5px solid ${showAI?'rgba(0,184,192,.4)':'var(--border)'}`, fontSize:11.5 }}>
                <Sparkles size={11}/> IA
              </button>
              <button onClick={()=>setShowInfo(p=>!p)} className="btn btn-g btn-ico" style={{ color:showInfo?'var(--tq)':'var(--muted)' }}>
                <Tag size={15}/>
              </button>
            </div>
          </div>

          {/* AI Panel */}
          {showAI && <AIPanel messages={msgs} contactName={sel.contactName} token={token} convId={sel.id} onUseSuggestion={t=>{ setInput(t); textRef.current?.focus(); }} onClose={()=>setShowAI(false)} />}

          <div style={{ flex:1, display:'flex', minHeight:0 }}>
            {/* Messages */}
            <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:5 }}>
              {msgs.map((m,i) => {
                const isMe=m.from==='me', isBot=m.from==='bot', isSys=m.from==='system';
                const showDate = i===0 || new Date(msgs[i-1].timestamp).toDateString()!==new Date(m.timestamp).toDateString();
                return (
                  <React.Fragment key={m.id||i}>
                    {showDate&&<div style={{ textAlign:'center', margin:'8px 0' }}><span style={{ background:'rgba(0,0,0,.06)', color:'var(--muted)', borderRadius:20, padding:'3px 14px', fontSize:11, fontWeight:500 }}>{new Date(m.timestamp).toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'short'})}</span></div>}
                    {isSys?(
                      <div style={{ textAlign:'center' }}><span style={{ background:'var(--ok2)', color:'var(--ok)', borderRadius:8, padding:'3px 14px', fontSize:11, fontWeight:600 }}>✓ {m.content}</span></div>
                    ):(
                      <div style={{ display:'flex', justifyContent:isMe||isBot?'flex-end':'flex-start' }}>
                        {!isMe&&!isBot&&<div style={{ width:24, height:24, borderRadius:'50%', background:sel.channel==='whatsapp'?'#d4f7e0':'#fce4ef', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:sel.channel==='whatsapp'?'#0a7a40':'#9a1050', marginRight:7, flexShrink:0, alignSelf:'flex-end', marginBottom:2 }}>{(sel.contactName||'?')[0].toUpperCase()}</div>}
                        <div style={{ maxWidth:'68%', background:isBot?'#e8faf4':isMe?(sel.channel==='whatsapp'?'#dcfce7':'#fde4f0'):'#fff', borderRadius:isMe||isBot?'14px 14px 3px 14px':'14px 14px 14px 3px', padding:'9px 12px', boxShadow:'0 1px 2px rgba(0,0,0,.06)' }}>
                          {isBot&&<div style={{ fontSize:10, color:'var(--ok)', fontWeight:700, marginBottom:3, display:'flex', alignItems:'center', gap:4 }}><Bot size={9}/>Bot Vittalis</div>}
                          {isMe&&m.senderNome&&i>0&&msgs[i-1].from!=='me'&&<div style={{ fontSize:10, color:'var(--muted)', marginBottom:2, fontWeight:600 }}>{m.senderNome?.split(' ')[0]}</div>}
                          {m.type==='text'&&<div style={{ fontSize:13.5, lineHeight:1.55, whiteSpace:'pre-wrap' }}>{m.content}</div>}
                          {m.type==='image'&&<img onClick={()=>setLightbox(m.content)} src={m.content} alt="img" style={{ maxWidth:240, maxHeight:240, borderRadius:8, display:'block', objectFit:'cover', cursor:'pointer' }} onError={e=>e.target.style.display='none'}/>}
                          {m.type==='audio'&&<div style={{ display:'flex', alignItems:'center', gap:8, minWidth:190 }}><Volume2 size={14} color="var(--tq)"/><audio controls src={m.content} style={{ flex:1, height:30, minWidth:150 }}/></div>}
                          {m.type==='video'&&<video controls src={m.content} style={{ maxWidth:260, borderRadius:8 }}/>}
                          {m.type==='document'&&<a href={m.content} download target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', gap:7, color:'var(--pet)', fontSize:13 }}><File size={14}/><span style={{ textDecoration:'underline' }}>{m.filename||'Arquivo'}</span></a>}
                          <div style={{ fontSize:10, color:'var(--light)', marginTop:4, textAlign:'right' }}>{fmt.msgTime(m.timestamp)}{isMe&&<span style={{ marginLeft:4 }}>{m.status==='delivered'?'✓✓':'✓'}</span>}</div>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
              <div ref={endRef}/>
            </div>

            {/* Contact info panel */}
            {showInfo && <ContactPanel conv={selFull||sel} lead={leadData} onClose={()=>setShowInfo(false)}/>}
          </div>

          {/* Quick replies */}
          {showQR&&(
            <div style={{ background:'#fff', borderTop:'1px solid var(--border)', padding:'9px 14px', display:'flex', gap:6, flexWrap:'wrap', maxHeight:100, overflowY:'auto', flexShrink:0 }}>
              {qr.map(q=><button key={q.id} onClick={()=>{ setInput(q.texto); setShowQR(false); textRef.current?.focus(); }} style={{ padding:'5px 12px', borderRadius:8, background:'var(--tq3)', color:'var(--tq2)', border:'1px solid var(--tq3)', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>{q.titulo}</button>)}
            </div>
          )}

          {/* Input bar */}
          <div style={{ background:'#fff', padding:'10px 14px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
            <div style={{ display:'flex', gap:6, alignItems:'flex-end' }}>
              <button onClick={()=>fileRef.current?.click()} className="btn btn-g btn-ico"><Paperclip size={16}/></button>
              <button onClick={()=>setShowQR(p=>!p)} className="btn btn-ico" style={{ background:showQR?'var(--tq3)':'transparent', color:showQR?'var(--tq)':'var(--muted)', borderRadius:8 }}><Hash size={16}/></button>
              <input ref={fileRef} type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" style={{ display:'none' }} onChange={handleFile}/>
              <textarea ref={textRef} value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); } }}
                placeholder="Mensagem… (Enter envia · Shift+Enter nova linha)"
                rows={1} style={{ flex:1, padding:'9px 13px', border:'1.5px solid var(--border)', borderRadius:10, fontSize:13.5, resize:'none', outline:'none', maxHeight:100, overflowY:'auto', lineHeight:1.55, transition:'border-color .15s', fontFamily:'DM Sans, sans-serif' }}
                onFocus={e=>e.target.style.borderColor='var(--tq)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
              <button onClick={recording?stopRec:startRec} className="btn btn-ico" style={{ background:recording?'var(--err2)':'var(--bg2)', color:recording?'var(--err)':'var(--muted)', borderRadius:8, animation:recording?'pulse 1.2s infinite':'none' }}>
                {recording?<MicOff size={16}/>:<Mic size={16}/>}
              </button>
              <button onClick={()=>send()} disabled={!input.trim()} className="btn btn-ico" style={{ background:input.trim()?'var(--tq)':'var(--bg2)', color:input.trim()?'#fff':'var(--light)', borderRadius:8, transition:'all .15s' }}>
                <Send size={16}/>
              </button>
            </div>
            {recording&&<div style={{ textAlign:'center', marginTop:5, fontSize:11.5, color:'var(--err)', fontWeight:600 }}>🔴 Gravando… clique novamente para parar</div>}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox&&<div onClick={()=>setLightbox(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.9)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }}><img src={lightbox} alt="" style={{ maxWidth:'92vw', maxHeight:'90vh', borderRadius:8 }}/><button onClick={()=>setLightbox(null)} style={{ position:'absolute', top:20, right:20, background:'rgba(255,255,255,.15)', color:'#fff', border:'none', borderRadius:'50%', padding:10, cursor:'pointer' }}><X size={18}/></button></div>}

      {/* Proposta modal */}
      {showProposta && sel && (
        <PropostaModal
          convId={sel.id} token={token}
          contactName={sel.contactName}
          atendente={user?.nome}
          onClose={txt=>{ setShowProposta(false); if(txt) setMsgs(p=>[...p,{id:Date.now(),from:'me',type:'text',content:txt,timestamp:new Date().toISOString(),status:'sent',senderNome:user?.nome}]); }}
        />
      )}
    </div>
  );
}
