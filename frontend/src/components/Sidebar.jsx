import React, { useEffect, useState, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Users, Kanban, BarChart2,
  LogOut, Settings, Smartphone, Sun, Moon, ChevronLeft, ChevronRight,
  CalendarClock, CalendarDays, Bell, CheckCheck, UserPlus, Shield,
  Gift, Bot, Image, FileText, Smile, Phone, Star, Database, Stethoscope, Target, Puzzle,
  Trophy, GraduationCap, Rocket, Wallet, Palette, Gamepad2, BookOpen, LayoutGrid, Pencil, Flame,
  BellRing, Syringe, ExternalLink, ClipboardList, FileSignature,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../context/AuthContext.jsx';
import { setToken } from '../hooks/api.js';
import { fmt } from '../hooks/utils.js';
import { versiculoDoDia } from '../hooks/versiculos.js';
import AvatarBuilder from './AvatarBuilder.jsx';

// Atalhos coloridos por classificação → abrem o chat filtrado (?cls=).
// Fidelidade abre a PASTA (as conversas dela saem do inbox).
const SETORES_MENU = [
  { cls:'vacinacao',       label:'Vacinação',       cor:'#7c5cbf', to:'/vacinacao' },
  { cls:'planos_vacinais', label:'Planos Vacinais', cor:'#3b82f6', to:'/planos-vacinais' },
  { cls:'consultas',       label:'Consultas',       cor:'#00B8C0', to:'/consultas' },
  { cls:'terapias',        label:'Terapias',        cor:'#C4973B', to:'/terapias' },
  { cls:'fidelidade',      label:'Fidelidade',      cor:'#eab308', to:'/fidelidade' },
];

// Ordem = PRIORIDADE do dia a dia (pedido do master): 1º o atendimento que gera
// venda, depois gestão/organização, por fim equipe e motivação.
/* Ordem = MOMENTO DO DIA, não importância abstrata (pedido do master).
   A rotina real é: abre o Resumo, passa o dia no Chat vendendo, registra o que
   fechou, e só no fim do expediente puxa relatório e fecha caixa. Relatório
   estava em 2º e 3º lugar — antes até do Chat — o que colocava a tarefa de fim
   de dia na frente da que gera venda.
   `grupo` desenha o título da seção; não muda permissão nem rota. */
const NAV = [
  { grupo:'Meu dia' },
  { to:'/',           icon:LayoutDashboard, label:'Resumo', cor:'#38bdf8' },
  { to:'/inbox',      icon:MessageSquare,   label:'Chat',     unread:true, cor:'#25D366' },
  { to:'/agenda',     icon:CalendarDays,    label:'Agenda', cor:'#f59e0b' },

  { grupo:'Vender' },
  { to:'/plano-vacinal', icon:Syringe, label:'Plano Vacinal', vacinas:true, cor:'#22c55e', destaque:true },
  { to:'/plano-terapias', icon:Puzzle,      label:'Plano de Terapias', terapias:true, destaque:true, cor:'#a855f7' },
  { to:'/retornos',   icon:Bell,            label:'Follow-up',  retornos:true, cor:'#fb7185' },
  { to:'/recuperacao',icon:Flame,           label:'Recuperação', cor:'#f97316' },
  { to:'/minha-carteira', icon:Wallet,     label:'Minha Carteira', cor:'#2dd4bf' },
  { to:'/leads',      icon:Users,           label:'Clientes', cor:'#a78bfa' },
  { to:'/lembretes',  icon:BellRing,        label:'Lembretes', cor:'#facc15' },

  { grupo:'Fim do dia' },
  { to:'/agenda?aba=relatorio', icon:ClipboardList, label:'Relatório do Dia', cor:'#0ea5e9', destaque:true },
  { to:'/agenda?aba=relatorio&individual=1', icon:FileSignature, label:'Meu Relatório', cor:'#f59e0b', destaque:true },
  { to:'/caixa',      icon:Wallet,          label:'Caixa', cor:'#34d399' },
  { to:'/metas',      icon:Target,          label:'Metas', gestao:true, cor:'#e879f9' },

  { grupo:'Operação' },
  { to:'/vacinas-solicitacao', icon:Syringe, label:'Solicitar Vacinas', cor:'#8b5cf6' },
  { to:'/profissionais', icon:Stethoscope,  label:'Profissionais', consultas:true, cor:'#22d3ee' },
  { to:'/funil',      icon:Kanban,          label:'Organização', cor:'#2dd4bf' },
  { to:'/relatorios', icon:BarChart2,       label:'Relatórios', cor:'#60a5fa' },
  { to:'/banco-dados',icon:Database,        label:'Banco de Dados', cor:'#94a3b8' },

  { grupo:'Equipe' },
  { to:'/equipe',     icon:Users,           label:'Chat da Equipe', equipe:true, cor:'#4ade80' },
  { to:'/meu-painel', icon:LayoutGrid,      label:'Meu Painel', cor:'#c084fc' },
  { to:'/amigo',      icon:BookOpen,        label:'Meu Devocional', cor:'#fbbf24' },
  { to:'/planejamento', icon:Rocket,        label:'Planejamento', lider:true, plan:true, cor:'#fb923c' },
  { to:'/quiz',       icon:Gamepad2,        label:'Quiz de Vendas', cor:'#f472b6' },
  { to:'/cases-sucesso', icon:Trophy,       label:'Cases de Sucesso', cor:'#eab308' },
  { to:'/cursos',     icon:GraduationCap,   label:'Cursos', cor:'#818cf8' },
  { to:'/indicacoes', icon:Gift,            label:'Indicações', cor:'#f43f5e' },
  { to:'/ia',         icon:Bot,             label:'IA Assistente', cor:'#10b981' },
];

const NAV_FERRAMENTAS = [
  { to:'/biblioteca', icon:Image,           label:'Biblioteca', cor:'#ec4899' },
  { to:'/modelos',    icon:FileText,        label:'Modelos de Mensagens', cor:'#38bdf8' },
  { to:'/figurinhas', icon:Smile,           label:'Figurinhas', cor:'#f472b6' },
  { to:'/ligacoes',   icon:Phone,           label:'Ligações', cor:'#34d399' },
];

const NAV_ADMIN = [
  { to:'/auditoria', icon:Shield, label:'Auditoria', masterOnly:true, cor:'#ef4444' },
];

/* ── Sino de notificações (novo lead, lead qualificado pela Vitta etc.) ────── */
function BellPanel({ collapsed }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const ref = useRef(null);
  const naoLidas = notifs.filter(n => !n.lida).length;

  const load = () => api.get('/inbox/notifications').then(d => setNotifs(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []); // eslint-disable-line
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const lerTodas = async () => {
    setNotifs(p => p.map(n => ({ ...n, lida: true })));
    try { await api.post('/inbox/notifications/read-all'); } catch {}
  };

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} title="Notificações"
        style={{ width:'100%', display:'flex', alignItems:'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: collapsed ? 0 : 10,
          padding: collapsed ? '10px 0' : '9px 12px', borderRadius:10, background: open ? 'rgba(255,255,255,.18)' : 'transparent',
          color: open ? '#ffffff' : 'rgba(255,255,255,.85)', border:'none', cursor:'pointer', fontSize:13.5, fontWeight:500, position:'relative' }}>
        <Bell size={16} strokeWidth={1.8} />
        {!collapsed && <span style={{ flex:1, textAlign:'left' }}>Notificações</span>}
        {naoLidas > 0 && (collapsed
          ? <span style={{ position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background:'var(--gold)', border:'2px solid #fff' }} />
          : <span style={{ background:'var(--gold)', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10.5, fontWeight:800, minWidth:20, textAlign:'center' }}>{naoLidas > 99 ? '99+' : naoLidas}</span>)}
      </button>

      {open && (
        <div style={{ position:'fixed', left:'calc(var(--sw) + 8px)', bottom:88, width:312, maxHeight:420, zIndex:400,
          background:'var(--card)', borderRadius:14, boxShadow:'var(--s4)', border:'1px solid var(--border)',
          display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.16)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontWeight:800, fontSize:13.5, color:'#ffffff' }}>Notificações</span>
            {naoLidas > 0 && (
              <button onClick={lerTodas} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 9px', borderRadius:8, background:'rgba(255,255,255,.16)', color:'var(--tq2)', fontSize:11, fontWeight:700, border:'none', cursor:'pointer' }}>
                <CheckCheck size={11} /> Ler todas
              </button>
            )}
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {notifs.length === 0 && <div style={{ padding:'26px 14px', textAlign:'center', fontSize:12.5, color:'rgba(255,255,255,.85)' }}>Nenhuma notificação ainda.</div>}
            {notifs.map(n => (
              <div key={n.id} style={{ padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,.16)', display:'flex', gap:9, background: n.lida ? 'transparent' : 'var(--tq4)' }}>
                <div style={{ width:28, height:28, borderRadius:9, background: n.lida ? 'var(--bg2)' : 'var(--tq3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                  <UserPlus size={13} color={n.lida ? 'var(--muted)' : 'var(--tq2)'} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:12.5, color:'#ffffff' }}>{n.titulo}</div>
                  <div style={{ fontSize:11.5, color:'rgba(255,255,255,.85)', lineHeight:1.45 }}>{n.texto}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,.62)', marginTop:2 }}>{fmt.relTime(n.created_at)}</div>
                </div>
                {!n.lida && <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--tq)', flexShrink:0, marginTop:5 }} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const initials = n => (n||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();

export default function Sidebar({ unread = 0, theme = 'light', onToggleTheme, collapsed = false, onToggleCollapse, mobileOpen = false, onCloseMobile, corDia = 'auto', onSetCorDia, paletaCores = [] }) {
  const { user, setUser, logout, isMaster } = useAuth();
  // 👥 TROCA-RÁPIDA DE USUÁRIO (master): de qualquer tela, vira outro usuário.
  // Usa sempre o token do master (guardado ao impersonar) — dá pra pular direto
  // de um usuário pro outro sem "voltar" antes.
  const [trocaOpen, setTrocaOpen] = useState(false);
  const [trocaUsers, setTrocaUsers] = useState([]);
  // Quem é o dono vem DO SERVIDOR (user.dono) — o regex no nome quebrava assim
  // que o master renomeava a própria conta, e o botão sumia sem explicação.
  // O regex fica só como reserva pra sessão antiga, até o próximo login.
  // Setores da pessoa (lista multi-setor ou o principal). Sem nenhum = vê tudo.
  const meusSetores = (Array.isArray(user?.setores) && user.setores.length)
    ? user.setores : [user?.setor].filter(Boolean);
  const podeSetor = (s) => user?.role === 'master' || !meusSetores.length || meusSetores.includes(s);
  const ehDono = user?.dono === true || /mi[eé]cio/i.test(`${user?.nome || ''} ${user?.email || ''}`);
  const podeTrocar = (isMaster && ehDono) || !!localStorage.getItem('vh_token_master');
  const tokenMaster = () => localStorage.getItem('vh_token_master') || localStorage.getItem('vh_token') || '';
  const abrirTroca = async () => {
    if (trocaOpen) return setTrocaOpen(false);
    setTrocaOpen(true);
    try {
      const BASE = import.meta.env.VITE_API_URL || '';
      const resp = await fetch(`${BASE}/api/auth/usuarios`, { headers: { Authorization: `Bearer ${tokenMaster()}` } });
      const d = await resp.json();
      setTrocaUsers(Array.isArray(d) ? d.filter(u2 => u2.ativo !== false) : []);
    } catch { setTrocaUsers([]); }
  };
  const trocarPara = async (u2) => {
    try {
      const BASE = import.meta.env.VITE_API_URL || '';
      const resp = await fetch(`${BASE}/api/auth/impersonar/${u2.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenMaster()}` } });
      const r = await resp.json();
      if (!resp.ok) throw new Error(r.error || 'erro');
      if (!localStorage.getItem('vh_token_master')) localStorage.setItem('vh_token_master', localStorage.getItem('vh_token') || '');
      localStorage.setItem('vh_token', r.token);
      window.location.href = '/';
    } catch (e) { window.alert('Erro ao trocar: ' + e.message); }
  };
  const voltarMaster = () => {
    const mk = localStorage.getItem('vh_token_master');
    if (mk) { localStorage.setItem('vh_token', mk); localStorage.removeItem('vh_token_master'); window.location.href = '/'; }
  };

  // Foto/avatar: o clique na foto abre o modal com as DUAS opções (foto própria
  // do aparelho ou avatar ilustrado) — antes o clique abria um seletor escondido.
  /* 🏥 Ponte pro sistema do SETOR (pedido do master). Cada equipe usa um:
     vacinas trabalha no Vittasys, consultas e terapias no VittaMed. Mostrar os
     dois pra todo mundo era mandar a Danielle abrir o sistema que não é dela.
     Quem não tem setor (master, marketing) vê os dois. */
  const [vittasysUrl, setVittasysUrl] = useState('https://vittasys.vittalissaude.com.br');
  const [vittamedUrl, setVittamedUrl] = useState('');
  const pontes = [
    { k:'vittasys', nome:'Vittasys', setores:['vacinas'], url:vittasysUrl,
      cor:'linear-gradient(135deg,#0ea5e9,#0284c7)', sombra:'rgba(14,165,233,.4)' },
    { k:'vittamed', nome:'VittaMed', setores:['consultas','terapias'], url:vittamedUrl,
      cor:'linear-gradient(135deg,#a855f7,#7c3aed)', sombra:'rgba(168,85,247,.4)' },
  ].filter(p2 => p2.url && p2.setores.some(st => podeSetor(st)));

  const vittasysLink = pontes.map(p2 => (
        <a key={p2.k} href={p2.url} target="_blank" rel="noreferrer" title={`Abrir o ${p2.nome}`}
          className="vh-nav"
          style={{ display:'flex', alignItems:'center', gap: collapsed ? 0 : 10,
            padding: collapsed ? '8px 0' : '6px 10px', justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius:12, textDecoration:'none', color:'rgba(255,255,255,.88)', fontSize:13, fontWeight:500 }}>
          <span className="vh-chip" style={{ width:25, height:25, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
            background:p2.cor, boxShadow:`0 2px 8px ${p2.sombra}` }}>
            <Stethoscope size={14} strokeWidth={2} color="#fff" />
          </span>
          {!collapsed && <><span style={{ flex:1 }}>{p2.nome}</span><ExternalLink size={11} color="rgba(255,255,255,.5)" /></>}
        </a>
  ));
  useEffect(() => {
    api.get('/extras/vittasys/config').then(d => d?.url && setVittasysUrl(d.url)).catch(() => {});
    api.get('/extras/vittamed/config').then(d => d?.url && setVittamedUrl(d.url)).catch(() => {});
  }, []); // eslint-disable-line
  const [showAvatarBuilder, setShowAvatarBuilder] = useState(false);
  const [paletaAberta, setPaletaAberta] = useState(false);
  // Editar o próprio nome — instantâneo (novo token com o nome novo).
  // Popup próprio em vez de window.prompt: no celular/webview o prompt nativo
  // muitas vezes nem abre, e aí parecia que o lápis "não fazia nada".
  const [nomeOpen, setNomeOpen] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [salvandoNome, setSalvandoNome] = useState(false);
  const editarNome = () => { setNovoNome(user?.nome || ''); setNomeOpen(true); };
  const salvarNome = async () => {
    const n = String(novoNome || '').trim();
    if (n.length < 2 || salvandoNome) return;
    setSalvandoNome(true);
    try {
      const r = await api.patch('/auth/me/nome', { nome: n });
      if (r?.token) setToken(r.token);
      if (r?.user) setUser?.(r.user);
      setNomeOpen(false);
    } catch (e) { window.alert(e.message || 'Não foi possível mudar o nome.'); }
    setSalvandoNome(false);
  };
  const [metaMini, setMetaMini] = useState(null);
  useEffect(() => {
    api.get('/extras/meta-setor').then(setMetaMini).catch(() => {});
  }, []); // eslint-disable-line

  const VERS_DIA = versiculoDoDia();
  const saudDia = (() => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; })();

  const UserAvatar = ({ size }) => user?.avatar
    ? <img src={user.avatar} alt="" style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0, display:'block' }} />
    : <div style={{ width:size, height:size, borderRadius:'50%', background:`linear-gradient(135deg, var(--tq), var(--pet))`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.36, fontWeight:700, color:'#fff', letterSpacing:.5, flexShrink:0 }}>{initials(user?.nome)}</div>;
  const api = useApi();
  const w = collapsed ? '56px' : '230px';
  // Retornos vencidos: badge vermelho no menu (atualiza a cada 60s)
  const [vencidos, setVencidos] = useState(0);
  useEffect(() => {
    const load = () => api.get('/leads/retornos').then(d => setVencidos(d.vencidos?.length || 0)).catch(() => {});
    load(); const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line

  // Planejamento: lembretes de hoje/atrasados (badge) — só líder/master
  const [lembretes, setLembretes] = useState(0);
  useEffect(() => {
    if (!(user?.lider || user?.role === 'master')) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const load = () => api.get('/extras/planejamento/notas').then(d => {
      const n = (Array.isArray(d) ? d : []).filter(x => x.tipo === 'lembrete' && !x.concluido && x.lembrete_em && String(x.lembrete_em).slice(0, 10) <= hoje).length;
      setLembretes(n);
    }).catch(() => {});
    load(); const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [user?.lider, user?.role]); // eslint-disable-line

  // Chat da equipe: não-lidas (badge)
  const [eqNaoLidas, setEqNaoLidas] = useState(0);
  useEffect(() => {
    const load = () => api.get('/inbox/chat-interno-naolidas').then(d => setEqNaoLidas(d?.n || 0)).catch(() => {});
    load(); const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line

  // Contagem de leads esperando por setor (badges dos atalhos) — atualiza a cada 15s
  const [setorCount, setSetorCount] = useState({});
  useEffect(() => {
    const load = () => api.get('/inbox/setores-contagem').then(setSetorCount).catch(() => {});
    load(); const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line

  // Bloco de Setores (logo abaixo de Clientes): atalhos coloridos com a contagem
  // de leads ESPERANDO em cada um — ajuda os atendentes a organizar o que vem junto.
  const setorBadge = (n, cor) => (!collapsed && n > 0)
    ? <span style={{ background:cor, color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10, fontWeight:800, minWidth:18, textAlign:'center' }}>{n>99?'99+':n}</span>
    : null;
  const setorItem = (to, cor, label, count) => (
    <NavLink key={to} to={to} title={collapsed ? label : ''} style={({ isActive }) => ({
      display:'flex', alignItems:'center', gap: collapsed ? 0 : 10,
      padding: collapsed ? '8px 0' : '8px 12px', justifyContent: collapsed ? 'center' : 'flex-start',
      borderRadius:12, textDecoration:'none', color: isActive ? 'var(--tq2)' : 'rgba(255,255,255,.85)',
      background: isActive ? '#ffffff' : 'transparent', fontWeight: isActive ? 700 : 500, fontSize:13, transition:'all .15s',
    })}>
      <span style={{ width:11, height:11, borderRadius:'50%', background:cor, flexShrink:0, boxShadow:`0 0 0 3px ${cor}33` }} />
      {!collapsed && <span style={{ flex:1 }}>{label}</span>}
      {setorBadge(count, cor)}
    </NavLink>
  );
  const setoresBlock = (
    <>
      {!collapsed && <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:1.6, color:'rgba(255,255,255,.62)', padding:'10px 12px 5px', textTransform:'uppercase' }}>Setores</div>}
      {setorItem('/classificar', '#94a3b8', 'Novos a classificar', setorCount.sem_classificacao)}
      {SETORES_MENU.map(s => setorItem(s.to || `/inbox?cls=${s.cls}`, s.cor, s.label, setorCount[s.cls]))}
    </>
  );

  return (
    <aside className={`vh-sidebar${mobileOpen ? ' open' : ''}`} style={{
      width: w,
      minHeight:'100vh', position:'fixed', left:0, top:0, bottom:0, zIndex:100,
      background:'var(--sidebar-bg)',
      display:'flex', flexDirection:'column',
      borderRight:'none',
      boxShadow:'4px 0 20px rgba(0,140,150,.18)',
      transition:'width .2s ease',
      overflow:'hidden',
    }}>

      {/* Logo / Brand — vertical branca oficial, clicável pro Dashboard */}
      <div style={{ padding: collapsed ? '14px 0' : '18px 14px 14px', borderBottom:'1px solid rgba(255,255,255,.16)', flexShrink:0 }}>
        <NavLink to="/" title="Ir para o Resumo" className="brand-link" style={{ textDecoration:'none', display:'block' }}>
          {collapsed ? (
            <img src="/logos/logo-icon-white.png" alt="Vittalis Saúde" style={{ height:28, objectFit:'contain', display:'block', margin:'0 auto' }} />
          ) : (
            <>
              <img src="/logos/logo-v-white.png" alt="Vittalis Saúde" style={{ width:'72%', maxWidth:152, height:'auto', objectFit:'contain', display:'block', margin:'0 auto' }} />
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, marginTop:9 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--tq)', boxShadow:'0 0 6px var(--tq)' }}/>
                <span style={{ fontSize:10, fontWeight:700, letterSpacing:1.8, color:'rgba(255,255,255,.62)', textTransform:'uppercase' }}>VittaHub CRM</span>
              </div>
            </>
          )}
        </NavLink>
      </div>

      {/* Perfil — no TOPO (pedido do master): foto, nome, papel e atalhos */}
      <div style={{ padding: collapsed ? '10px 6px 2px' : '12px 10px 4px', flexShrink:0 }}>
        {/* User card */}
        {collapsed ? (
          <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'center' }}>
            <button onClick={()=>setShowAvatarBuilder(true)} title="Foto de perfil (foto própria ou avatar)" style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
              <UserAvatar size={40} />
            </button>
            <button onClick={onToggleTheme} title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'} style={{ padding:5, background:'none', color:'rgba(255,255,255,.62)', borderRadius:6, cursor:'pointer', border:'none' }}
              onMouseEnter={e=>e.currentTarget.style.color='#ffffff'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.62)'}>
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <button onClick={logout} title="Sair" style={{ padding:5, background:'none', color:'rgba(255,255,255,.62)', borderRadius:6, cursor:'pointer', border:'none' }}
              onMouseEnter={e=>e.currentTarget.style.color='#ffffff'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.62)'}>
              <LogOut size={13} />
            </button>
          </div>
        ) : (
          <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:9, padding:'10px 10px', borderRadius:12, background:'rgba(255,255,255,.14)', border:'1px solid rgba(255,255,255,.2)' }}>
            <button onClick={()=>setShowAvatarBuilder(true)} title="Foto de perfil (foto própria ou avatar)"
              style={{ background:'none', border:'none', cursor:'pointer', padding:0, borderRadius:'50%', lineHeight:0,
                boxShadow:'0 0 0 2px rgba(255,255,255,.55)' }}>
              <UserAvatar size={56} />
            </button>
            <div style={{ flex:1, minWidth:0 }}>
              {/* Nome COMPLETO, sem corte: quebra em até 2 linhas se precisar */}
              <button onClick={editarNome} title="Editar meu nome" style={{ background:'none', border:'none', padding:0, cursor:'pointer', display:'flex', alignItems:'flex-start', gap:4, maxWidth:'100%', textAlign:'left' }}>
                <span style={{ color:'#fff', fontSize:13, fontWeight:700, lineHeight:1.3 }}>{user?.nome}</span>
                <Pencil size={10} color="rgba(255,255,255,.55)" style={{ flexShrink:0, marginTop:3 }} />
              </button>
              {nomeOpen && (
                <div style={{ position:'fixed', top:150, left:12, zIndex:9999, background:'var(--card, #fff)', border:'1px solid var(--border, #e5e7eb)', borderRadius:14, boxShadow:'0 12px 40px rgba(0,0,0,.35)', padding:12, width:240 }}>
                  <div style={{ fontSize:10.5, fontWeight:800, textTransform:'uppercase', letterSpacing:.5, color:'var(--muted, #6b7280)', marginBottom:8 }}>✏️ Meu nome de exibição</div>
                  <input autoFocus value={novoNome} onChange={e=>setNovoNome(e.target.value)}
                    onKeyDown={e=>{ if (e.key==='Enter') salvarNome(); if (e.key==='Escape') setNomeOpen(false); }}
                    placeholder="Seu nome"
                    style={{ width:'100%', padding:'9px 10px', borderRadius:9, border:'1px solid var(--border, #d1d5db)', fontSize:13.5, fontWeight:600, background:'var(--bg, #fff)', color:'var(--txt, #111827)', outline:'none', boxSizing:'border-box' }} />
                  <div style={{ display:'flex', gap:6, marginTop:8 }}>
                    <button onClick={salvarNome} disabled={salvandoNome || String(novoNome||'').trim().length < 2}
                      style={{ flex:1, padding:'8px 0', borderRadius:9, border:'none', cursor:'pointer', background:'#0E8C96', color:'#fff', fontWeight:800, fontSize:12.5, opacity: salvandoNome ? .6 : 1 }}>
                      {salvandoNome ? 'Salvando…' : 'Salvar'}
                    </button>
                    <button onClick={()=>setNomeOpen(false)} style={{ padding:'8px 12px', borderRadius:9, border:'1px solid var(--border, #d1d5db)', cursor:'pointer', background:'none', color:'var(--muted, #6b7280)', fontWeight:700, fontSize:12.5 }}>Cancelar</button>
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted, #9ca3af)', marginTop:7, lineHeight:1.4 }}>Muda na hora, em todo o sistema.</div>
                </div>
              )}
              <div style={{ color:'rgba(255,255,255,.85)', fontSize:10.5 }}>{user?.role === 'master' ? '◆ Master' : user?.role === 'supervisor' ? '◆ Supervisora' : 'Atendente'}<span style={{ marginLeft:6 }}><span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'#3ef58f', marginRight:3, verticalAlign:'1px' }}/>Online</span></div>
            </div>
            <div style={{ width:'100%', display:'flex', alignItems:'center', gap:3, justifyContent:'flex-end', marginTop:-2 }}>
            {podeTrocar && (
              <button onClick={abrirTroca} title="Trocar de usuário (entrar como)" style={{ padding:6, background: trocaOpen ? 'rgba(255,255,255,.25)' : 'none', color:'#fff', borderRadius:6, cursor:'pointer', border:'none' }}>
                <Users size={13} />
              </button>
            )}
            {trocaOpen && (
              <div style={{ position:'fixed', top:150, left:12, zIndex:9999, background:'var(--card, #fff)', border:'1px solid var(--border, #e5e7eb)', borderRadius:14, boxShadow:'0 12px 40px rgba(0,0,0,.35)', padding:10, width:230, maxHeight:340, overflowY:'auto' }}>
                <div style={{ fontSize:10.5, fontWeight:800, textTransform:'uppercase', letterSpacing:.5, color:'var(--muted, #6b7280)', padding:'2px 6px 8px' }}>👥 Entrar como…</div>
                {localStorage.getItem('vh_token_master') && (
                  <button onClick={voltarMaster} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:9, border:'none', cursor:'pointer', background:'#f5f3ff', color:'#7c3aed', fontWeight:800, fontSize:12.5, marginBottom:6 }}>
                    ↩️ Voltar ao meu usuário (master)
                  </button>
                )}
                {trocaUsers.filter(u2 => u2.id !== user?.id).map(u2 => (
                  <button key={u2.id} onClick={()=>trocarPara(u2)}
                    style={{ display:'flex', alignItems:'center', gap:8, width:'100%', textAlign:'left', padding:'7px 8px', borderRadius:9, border:'none', cursor:'pointer', background:'transparent', color:'var(--txt, #111)' }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--tq3, #eef6f7)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{ width:26, height:26, borderRadius:'50%', background:u2.cor||'var(--tq)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, flexShrink:0 }}>{(u2.nome||'?').slice(0,1)}</span>
                    <span style={{ minWidth:0 }}>
                      <span style={{ display:'block', fontSize:12.5, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u2.nome}</span>
                      <span style={{ display:'block', fontSize:10, color:'var(--muted, #6b7280)' }}>{u2.role==='master'?'Master':u2.role==='supervisor'?'Supervisora':'Atendente'}{u2.setor?` · ${u2.setor}`:''}</span>
                    </span>
                  </button>
                ))}
                {!trocaUsers.length && <div style={{ fontSize:12, color:'var(--muted, #6b7280)', padding:8 }}>Carregando…</div>}
              </div>
            )}
            <button onClick={()=>setShowAvatarBuilder(true)} title="Criar meu avatar" style={{ padding:6, background:'none', color:'rgba(255,255,255,.62)', borderRadius:6, transition:'color .15s', cursor:'pointer', border:'none' }}
              onMouseEnter={e=>e.currentTarget.style.color='#ffffff'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.62)'}>
              <Palette size={13} />
            </button>
            <button onClick={onToggleTheme} title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'} style={{ padding:6, background:'none', color:'rgba(255,255,255,.62)', borderRadius:6, transition:'color .15s', cursor:'pointer', border:'none' }}
              onMouseEnter={e=>e.currentTarget.style.color='#ffffff'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.62)'}>
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <button onClick={logout} title="Sair" style={{ padding:6, background:'none', color:'rgba(255,255,255,.62)', borderRadius:6, transition:'color .15s', cursor:'pointer', border:'none' }}
              onMouseEnter={e=>e.currentTarget.style.color='#ffffff'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.62)'}>
              <LogOut size={13} />
            </button>
            </div>
          </div>
        )}

        {/* 👥 ENTRAR COMO — antes era só um ícone de 13px perdido na fileira de
            botõezinhos, e o master não achava. Agora é uma faixa com legenda,
            logo abaixo do nome. Só o dono enxerga. */}
        {podeTrocar && !collapsed && (
          <button onClick={abrirTroca}
            style={{ width:'100%', marginTop:8, padding:'8px 10px', borderRadius:10, cursor:'pointer',
              border:'1px solid rgba(255,255,255,.28)', background:'rgba(255,255,255,.13)', color:'#fff',
              fontWeight:800, fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
            <Users size={14} /> {trocaOpen ? 'Fechar' : 'Entrar como…'}
          </button>
        )}

      </div>

      {/* 🏥 Ponte pro Vittasys — fica logo abaixo do Chat, no topo do menu */}
      {(() => null)()}
      {/* Nav */}
      <nav onClick={() => onCloseMobile?.()} style={{ flex:1, padding: collapsed ? '14px 6px' : '14px 10px', display:'flex', flexDirection:'column', gap:3, overflowY:'auto', overflowX:'hidden' }}>
        {!collapsed && <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:1.6, color:'rgba(255,255,255,.62)', padding:'0 12px 6px', textTransform:'uppercase' }}>Menu</div>}
        {NAV.filter(n => (!n.masterOnly || user?.role === 'master')
            && (!n.gestao || ['master','supervisor'].includes(user?.role))
            && (!n.consultas || ['master','supervisor'].includes(user?.role) || user?.setor === 'consultas')
            /* Cada uma vê o plano do SEU setor: Raylane e Stefany o vacinal,
               Danielle/Suellen/Mayara o de terapias. Só o MASTER vê os dois —
               'supervisor' não serve aqui, porque Raylane e Danielle são
               supervisoras e é justamente entre elas que a separação vale. */
            /* Vale o SETOR da pessoa. Nem 'supervisor' nem 've_tudo' entram na
               exceção: as duas coisas a Danielle tem, e é justamente ela que
               não pode ver o plano de vacinas. Quem vê os dois é o master e
               quem não tem setor nenhum (marketing) — aí não há o que filtrar. */
            && (!n.terapias || podeSetor('terapias'))
            && (!n.vacinas || podeSetor('vacinas'))
            && (!n.lider || user?.lider || user?.role === 'master')
          ).map((n) => {
            // Título de seção: só desenha o rótulo e segue (não é link)
            if (n.grupo) return collapsed
              ? <div key={`g-${n.grupo}`} style={{ height:1, background:'rgba(255,255,255,.18)', margin:'7px 8px' }} />
              : <div key={`g-${n.grupo}`} style={{ fontSize:9, fontWeight:800, letterSpacing:1.5,
                  color:'rgba(255,255,255,.55)', padding:'11px 12px 4px', textTransform:'uppercase' }}>{n.grupo}</div>;
            const { to, icon:Icon, label, unread:showU, retornos:retBadge, equipe:eqBadge, plan:planBadge, destaque, cor } = n;
            return (
          <React.Fragment key={to}>
          <NavLink to={to} end={to==='/'} title={collapsed ? label : ''}
            className={({ isActive }) => `vh-nav${isActive ? ' ativo' : ''}`}
            style={({ isActive }) => ({
            display:'flex', alignItems:'center', gap: collapsed ? 0 : 10,
            padding: collapsed ? '8px 0' : '6px 10px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius:12, textDecoration:'none',
            color: isActive ? 'var(--tq2)' : (destaque ? '#ffd166' : 'rgba(255,255,255,.88)'),
            background: isActive ? '#ffffff' : 'transparent',
            boxShadow: isActive ? `0 6px 18px rgba(3,43,48,.28), inset 3px 0 0 ${cor || 'var(--tq)'}` : 'none',
            fontWeight: (isActive || destaque) ? 700 : 500, fontSize:13.5,
            transition: 'all .15s',
            position:'relative',
          })}>
            {/* Chip colorido — cada botão com a sua cor (menu vivo e moderno) */}
            <span className="vh-chip" style={{ width:27, height:27, borderRadius:9, flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              background: `linear-gradient(135deg, ${cor || '#64748b'}, ${cor || '#64748b'}cc)`,
              boxShadow: `0 2px 8px ${cor || '#64748b'}55` }}>
              <Icon size={15} strokeWidth={2} color="#fff" />
            </span>
            {!collapsed && <span style={{ flex:1 }}>{label}</span>}
            {!collapsed && showU && unread > 0 && (
              <span style={{ background:'#fff', color:'var(--tq2)', borderRadius:10, padding:'1px 7px', fontSize:10.5, fontWeight:800, minWidth:20, textAlign:'center', boxShadow:'0 2px 6px rgba(3,43,48,.18)' }}>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
            {!collapsed && retBadge && vencidos > 0 && (
              <span style={{ background:'var(--err)', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10.5, fontWeight:800, minWidth:20, textAlign:'center' }}>
                {vencidos > 99 ? '99+' : vencidos}
              </span>
            )}
            {!collapsed && eqBadge && eqNaoLidas > 0 && (
              <span style={{ background:'var(--tq)', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10.5, fontWeight:800, minWidth:20, textAlign:'center' }}>
                {eqNaoLidas > 99 ? '99+' : eqNaoLidas}
              </span>
            )}
            {!collapsed && planBadge && lembretes > 0 && (
              <span style={{ background:'#7c3aed', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10.5, fontWeight:800, minWidth:20, textAlign:'center' }}>
                {lembretes > 99 ? '99+' : lembretes}
              </span>
            )}
            {collapsed && ((retBadge && vencidos > 0) || (planBadge && lembretes > 0)) && (
              <span style={{ position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background: retBadge ? 'var(--err)' : '#7c3aed', border:'2px solid #fff' }} />
            )}
            {/* Badge no ícone quando colapsado */}
            {collapsed && showU && unread > 0 && (
              <span style={{ position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background:'var(--tq)', border:'2px solid #fff' }} />
            )}
          </NavLink>
          {to === '/inbox' && vittasysLink}
          {to === '/leads' && setoresBlock}
          </React.Fragment>
            );
          })}

        {/* ── Administração (só master) ── */}
        {user?.role === 'master' && (
          <>
            {!collapsed && <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:1.6, color:'rgba(255,255,255,.62)', padding:'12px 12px 6px', textTransform:'uppercase', borderTop:'1px solid rgba(255,255,255,.16)', marginTop:10 }}>Administração</div>}
            {collapsed && <div style={{ borderTop:'1px solid rgba(255,255,255,.16)', margin:'10px 8px' }} />}
            {NAV_ADMIN.map(({ to, icon:Icon, label, cor }) => (
              <NavLink key={to} to={to} title={collapsed ? label : ''} className={({ isActive }) => `vh-nav${isActive ? ' ativo' : ''}`} style={({ isActive }) => ({
                display:'flex', alignItems:'center', gap: collapsed ? 0 : 10,
                padding: collapsed ? '10px 0' : '8px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius:12, textDecoration:'none',
                color: isActive ? 'var(--tq2)' : 'rgba(255,255,255,.85)',
                background: isActive ? '#ffffff' : 'transparent',
                boxShadow: isActive ? '0 4px 16px rgba(3,43,48,.22)' : 'none',
                fontWeight: isActive ? 700 : 500, fontSize:13,
                transition:'all .15s',
              })}>
                <span className="vh-chip" style={{ width:25, height:25, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background: `linear-gradient(135deg, ${cor || '#64748b'}, ${cor || '#64748b'}cc)`, boxShadow: `0 2px 8px ${cor || '#64748b'}55` }}><Icon size={14} strokeWidth={2} color="#fff" /></span>
                {!collapsed && <span style={{ flex:1 }}>{label}</span>}
              </NavLink>
            ))}
          </>
        )}

        {/* ── Ferramentas ── */}
        {!collapsed && <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:1.6, color:'rgba(255,255,255,.62)', padding:'12px 12px 6px', textTransform:'uppercase', borderTop:'1px solid rgba(255,255,255,.16)', marginTop:10 }}>Ferramentas</div>}
        {collapsed && <div style={{ borderTop:'1px solid rgba(255,255,255,.16)', margin:'10px 8px' }} />}
        {NAV_FERRAMENTAS.map(({ to, icon:Icon, label, cor }) => (
          <NavLink key={to} to={to} title={collapsed ? label : ''} className={({ isActive }) => `vh-nav${isActive ? ' ativo' : ''}`} style={({ isActive }) => ({
            display:'flex', alignItems:'center', gap: collapsed ? 0 : 10,
            padding: collapsed ? '10px 0' : '8px 12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius:12, textDecoration:'none',
            color: isActive ? 'var(--tq2)' : 'rgba(255,255,255,.85)',
            background: isActive ? '#ffffff' : 'transparent',
            boxShadow: isActive ? '0 4px 16px rgba(3,43,48,.22)' : 'none',
            fontWeight: isActive ? 700 : 500, fontSize:13,
            transition:'all .15s',
          })}>
            <span className="vh-chip" style={{ width:25, height:25, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background: `linear-gradient(135deg, ${cor || '#64748b'}, ${cor || '#64748b'}cc)`, boxShadow: `0 2px 8px ${cor || '#64748b'}55` }}><Icon size={14} strokeWidth={2} color="#fff" /></span>
            {!collapsed && <span style={{ flex:1 }}>{label}</span>}
          </NavLink>
        ))}

        <div style={{ height:1, background:'rgba(255,255,255,.14)', margin:'8px 12px' }}/>

        <BellPanel collapsed={collapsed} />

        {isMaster && (
        <NavLink to="/whatsapp" title={collapsed ? 'WhatsApp' : ''} style={({ isActive }) => ({
          display:'flex', alignItems:'center', gap: collapsed ? 0 : 10,
          padding: collapsed ? '10px 0' : '9px 12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius:10, textDecoration:'none',
          color: isActive ? '#aef5c8' : 'rgba(255,255,255,.85)',
          background: isActive ? 'rgba(37,211,102,0.25)' : 'transparent',
          fontWeight: isActive ? 700 : 500, fontSize:13.5,
          borderLeft: 'none',
          transition: 'all .13s',
        })}>
          <span className="vh-chip" style={{ width:27, height:27, borderRadius:9, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#25D366,#128C7E)', boxShadow:'0 2px 8px rgba(37,211,102,.4)' }}><Smartphone size={15} strokeWidth={2} color="#fff" /></span>
          {!collapsed && <span>WhatsApp</span>}
        </NavLink>
        )}

        {isMaster && (
          <NavLink to="/configuracoes" title={collapsed ? 'Configurações' : ''} style={({ isActive }) => ({
            display:'flex', alignItems:'center', gap: collapsed ? 0 : 10,
            padding: collapsed ? '10px 0' : '9px 12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius:10, textDecoration:'none',
            color: isActive ? 'var(--tq2)' : 'rgba(255,255,255,.85)',
            background: isActive ? '#ffffff' : 'transparent',
            boxShadow: isActive ? '0 4px 16px rgba(3,43,48,.22)' : 'none',
            fontWeight: isActive ? 700 : 500, fontSize:13.5,
          })}>
            <span className="vh-chip" style={{ width:27, height:27, borderRadius:9, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#64748b,#475569)', boxShadow:'0 2px 8px rgba(100,116,139,.4)' }}><Settings size={15} strokeWidth={2} color="#fff" /></span>
            {!collapsed && <span>Configurações</span>}
          </NavLink>
        )}
      </nav>

      {/* User + toggle */}
      <div style={{ padding: collapsed ? '10px 6px 14px' : '12px 10px 16px', borderTop:'1px solid rgba(255,255,255,.16)', flexShrink:0 }}>
        {/* Botão colapsar/expandir */}
        <button onClick={onToggleCollapse}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          style={{
            width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6,
            padding:'8px', borderRadius:8, background:'rgba(255,255,255,.14)',
            color:'rgba(255,255,255,.85)', border:'none', cursor:'pointer',
            marginBottom:8, transition:'all .15s', fontSize:11.5, fontWeight:600,
          }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,.26)'; e.currentTarget.style.color='#ffffff'; }}
          onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,.14)'; e.currentTarget.style.color='rgba(255,255,255,.85)'; }}
        >
          {collapsed ? <ChevronRight size={14}/> : <><ChevronLeft size={14}/><span>Recolher</span></>}
        </button>

        {/* Paleta de cores — compacta: 1 linha, abre só ao clicar (não rouba espaço do menu) */}
        {!collapsed && paletaCores.length > 0 && (() => {
          const corAtual = corDia === 'auto' || corDia === 'off' ? null : paletaCores[parseInt(corDia)];
          return (
          <div style={{ marginTop:8, borderRadius:12, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.14)', overflow:'hidden' }}>
            <button onClick={() => setPaletaAberta(a => !a)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:7, padding:'7px 10px', background:'none', border:'none', cursor:'pointer', color:'#fff' }}>
              <span style={{ width:15, height:15, borderRadius:'50%', flexShrink:0, background: corAtual?.tq || 'conic-gradient(#00B8C0,#7c3aed,#f59e0b,#16a34a,#00B8C0)', border:'1.5px solid rgba(255,255,255,.5)' }} />
              <span style={{ fontSize:11, fontWeight:800, flex:1, textAlign:'left', color:'rgba(255,255,255,.9)' }}>Cor do CRM</span>
              <span style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,.6)' }}>{corDia === 'auto' ? 'do dia' : (corAtual?.nome || '')}</span>
              {paletaAberta ? <ChevronDown size={13} color="rgba(255,255,255,.7)" /> : <ChevronRight size={13} color="rgba(255,255,255,.7)" />}
            </button>
            {paletaAberta && (
              <div style={{ padding:'0 10px 10px' }}>
                <button onClick={() => onSetCorDia && onSetCorDia('auto')} title="Trocar automaticamente a cada dia"
                  style={{ fontSize:9.5, fontWeight:800, padding:'3px 9px', borderRadius:20, cursor:'pointer', marginBottom:8,
                    border: corDia === 'auto' ? '1px solid #fff' : '1px solid rgba(255,255,255,.3)',
                    background: corDia === 'auto' ? 'rgba(255,255,255,.9)' : 'transparent',
                    color: corDia === 'auto' ? '#0a1622' : 'rgba(255,255,255,.85)' }}>
                  ✨ Cor do dia (automático)
                </button>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {paletaCores.map((c, i) => {
                    const ativo = String(corDia) === String(i);
                    return (
                      <button key={i} onClick={() => onSetCorDia && onSetCorDia(String(i))} title={c.nome}
                        style={{ width:20, height:20, borderRadius:'50%', cursor:'pointer', padding:0, background:c.tq,
                          border: ativo ? '2px solid #fff' : '2px solid rgba(255,255,255,.25)',
                          boxShadow: ativo ? '0 0 0 2px rgba(255,255,255,.35)' : 'none', transition:'transform .12s' }}
                        onMouseEnter={e => e.currentTarget.style.transform='scale(1.15)'}
                        onMouseLeave={e => e.currentTarget.style.transform='scale(1)'} />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          );
        })()}
      </div>
      {/* Meta agora fica só no Placar do topo (por setor). Removida daqui pra dar
         destaque ao menu e não duplicar a informação. */}
      {!collapsed && (
        <div style={{ margin:'0 12px 10px', padding:'10px 13px', borderRadius:13, background:'rgba(255,255,255,.14)', border:'1px solid rgba(255,255,255,.22)' }}>
          <div style={{ fontSize:11.5, fontWeight:800, color:'#fff', marginBottom:3 }}>{saudDia}, {(user?.nome||'').split(' ')[0]}! ☀️</div>
          <div style={{ fontSize:9.5, color:'rgba(255,255,255,.85)', lineHeight:1.45, fontStyle:'italic' }}>“{VERS_DIA[0]}”</div>
          <div style={{ fontSize:9, color:'rgba(255,255,255,.6)', marginTop:2, fontWeight:700 }}>{VERS_DIA[1]}</div>
        </div>
      )}
      <style>{`
        .vh-nav { will-change: transform; }
        .vh-nav:not(.ativo):hover { background: rgba(255,255,255,.13) !important; transform: translateX(4px); }
        .vh-nav:hover .vh-chip { transform: scale(1.12) rotate(-4deg); }
        .vh-chip { transition: transform .18s ease; }
        .vh-nav.ativo .vh-chip { transform: scale(1.05); }
      `}</style>
      {showAvatarBuilder && <AvatarBuilder onClose={() => setShowAvatarBuilder(false)} />}
    </aside>
  );
}
