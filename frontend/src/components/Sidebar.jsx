import React, { useEffect, useState, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Users, Kanban, BarChart2,
  LogOut, Settings, Smartphone, Sun, Moon, ChevronLeft, ChevronRight,
  CalendarClock, CalendarDays, Bell, CheckCheck, UserPlus, Shield,
  Gift, Bot, Image, FileText, Smile, Phone, Star, Database, Stethoscope,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

// Atalhos coloridos por classificação → abrem o chat filtrado (?cls=)
const SETORES_MENU = [
  { cls:'vacinacao',       label:'Vacinação',       cor:'#7c5cbf' },
  { cls:'planos_vacinais', label:'Planos Vacinais', cor:'#3b82f6' },
  { cls:'consultas',       label:'Consultas',       cor:'#00B8C0' },
  { cls:'terapias',        label:'Terapias',        cor:'#C4973B' },
];

const NAV = [
  { to:'/',           icon:LayoutDashboard, label:'Dashboard' },
  { to:'/inbox',      icon:MessageSquare,   label:'Chat',     unread:true },
  { to:'/leads',      icon:Users,           label:'Clientes' },
  { to:'/fidelidade', icon:Star,            label:'Fidelidade' },
  { to:'/banco-dados',icon:Database,        label:'Banco de Dados' },
  { to:'/funil',      icon:Kanban,          label:'Organização' },
  { to:'/retornos',   icon:Bell,            label:'Follow-up',  retornos:true },
  { to:'/agenda',     icon:CalendarDays,    label:'Agenda' },
  { to:'/profissionais', icon:Stethoscope,  label:'Profissionais' },
  { to:'/relatorios', icon:BarChart2,       label:'Relatórios' },
  { to:'/indicacoes', icon:Gift,            label:'Indicações' },
  { to:'/ia',         icon:Bot,             label:'IA Assistente' },
];

const NAV_FERRAMENTAS = [
  { to:'/biblioteca', icon:Image,           label:'Biblioteca' },
  { to:'/modelos',    icon:FileText,        label:'Modelos de Mensagens' },
  { to:'/figurinhas', icon:Smile,           label:'Figurinhas' },
  { to:'/ligacoes',   icon:Phone,           label:'Ligações' },
];

const NAV_ADMIN = [
  { to:'/auditoria', icon:Shield, label:'Auditoria', masterOnly:true },
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

export default function Sidebar({ unread = 0, theme = 'light', onToggleTheme, collapsed = false, onToggleCollapse, mobileOpen = false, onCloseMobile }) {
  const { user, setUser, logout, isMaster } = useAuth();

  const avatarFileRef = useRef(null);
  // Foto de perfil: reduz no navegador (128px jpeg) e salva no próprio usuário
  const trocarAvatar = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    const img = new window.Image();
    img.onload = async () => {
      const d = 128, m = Math.min(img.width, img.height);
      const cv = document.createElement('canvas');
      cv.width = d; cv.height = d;
      cv.getContext('2d').drawImage(img, (img.width-m)/2, (img.height-m)/2, m, m, 0, 0, d, d);
      const dataUrl = cv.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(img.src);
      try {
        const r = await api.patch('/auth/me/avatar', { avatar: dataUrl });
        setUser?.({ ...user, avatar: r.avatar });
      } catch {}
    };
    img.src = URL.createObjectURL(f);
  };
  const [metaMini, setMetaMini] = useState(null);
  useEffect(() => {
    api.get('/reports/dashboard').then(d => d?.metas && setMetaMini(d.metas.vacinas)).catch(() => {});
  }, []); // eslint-disable-line

  const VERS_DIA = (() => {
    const V = [['Entrega o teu caminho ao Senhor; confia nele, e ele o fará.','Salmos 37:5'],['Tudo posso naquele que me fortalece.','Filipenses 4:13'],['O Senhor é o meu pastor; nada me faltará.','Salmos 23:1'],['Não temas, porque eu sou contigo.','Isaías 41:10'],['O coração alegre é como o bom remédio.','Provérbios 17:22'],['Confia no Senhor de todo o teu coração.','Provérbios 3:5'],['As misericórdias do Senhor se renovam a cada manhã.','Lamentações 3:22'],['Este é o dia que o Senhor fez.','Salmos 118:24'],['Porque para Deus nada é impossível.','Lucas 1:37'],['Sê forte e corajoso.','Josué 1:9']];
    const dia = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    return V[dia % V.length];
  })();
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
      {setorItem('/inbox?cls=sem', '#94a3b8', 'Novos a classificar', setorCount.sem_classificacao)}
      {SETORES_MENU.map(s => setorItem(`/inbox?cls=${s.cls}`, s.cor, s.label, setorCount[s.cls]))}
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
        <NavLink to="/" title="Ir para o Dashboard" className="brand-link" style={{ textDecoration:'none', display:'block' }}>
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

      {/* Nav */}
      <nav onClick={() => onCloseMobile?.()} style={{ flex:1, padding: collapsed ? '14px 6px' : '14px 10px', display:'flex', flexDirection:'column', gap:3, overflowY:'auto', overflowX:'hidden' }}>
        {!collapsed && <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:1.6, color:'rgba(255,255,255,.62)', padding:'0 12px 6px', textTransform:'uppercase' }}>Menu</div>}
        {NAV.map(({ to, icon:Icon, label, unread:showU, retornos:retBadge }) => (
          <React.Fragment key={to}>
          <NavLink to={to} end={to==='/'} title={collapsed ? label : ''} style={({ isActive }) => ({
            display:'flex', alignItems:'center', gap: collapsed ? 0 : 10,
            padding: collapsed ? '10px 0' : '9px 12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius:12, textDecoration:'none',
            color: isActive ? 'var(--tq2)' : 'rgba(255,255,255,.85)',
            background: isActive ? '#ffffff' : 'transparent',
            boxShadow: isActive ? '0 4px 16px rgba(3,43,48,.22)' : 'none',
            fontWeight: isActive ? 700 : 500, fontSize:13.5,
            transition: 'all .15s',
            position:'relative',
          })}>
            <Icon size={16} strokeWidth={1.8} />
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
            {collapsed && retBadge && vencidos > 0 && (
              <span style={{ position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background:'var(--err)', border:'2px solid #fff' }} />
            )}
            {/* Badge no ícone quando colapsado */}
            {collapsed && showU && unread > 0 && (
              <span style={{ position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background:'var(--tq)', border:'2px solid #fff' }} />
            )}
          </NavLink>
          {to === '/leads' && setoresBlock}
          </React.Fragment>
        ))}

        {/* ── Administração (só master) ── */}
        {user?.role === 'master' && (
          <>
            {!collapsed && <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:1.6, color:'rgba(255,255,255,.62)', padding:'12px 12px 6px', textTransform:'uppercase', borderTop:'1px solid rgba(255,255,255,.16)', marginTop:10 }}>Administração</div>}
            {collapsed && <div style={{ borderTop:'1px solid rgba(255,255,255,.16)', margin:'10px 8px' }} />}
            {NAV_ADMIN.map(({ to, icon:Icon, label }) => (
              <NavLink key={to} to={to} title={collapsed ? label : ''} style={({ isActive }) => ({
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
                <Icon size={15} strokeWidth={1.8} />
                {!collapsed && <span style={{ flex:1 }}>{label}</span>}
              </NavLink>
            ))}
          </>
        )}

        {/* ── Ferramentas ── */}
        {!collapsed && <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:1.6, color:'rgba(255,255,255,.62)', padding:'12px 12px 6px', textTransform:'uppercase', borderTop:'1px solid rgba(255,255,255,.16)', marginTop:10 }}>Ferramentas</div>}
        {collapsed && <div style={{ borderTop:'1px solid rgba(255,255,255,.16)', margin:'10px 8px' }} />}
        {NAV_FERRAMENTAS.map(({ to, icon:Icon, label }) => (
          <NavLink key={to} to={to} title={collapsed ? label : ''} style={({ isActive }) => ({
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
            <Icon size={15} strokeWidth={1.8} />
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
          <Smartphone size={16} strokeWidth={1.8} />
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
            <Settings size={15} strokeWidth={1.6} />
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

        {/* User card */}
        {collapsed ? (
          <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'center' }}>
            <button onClick={()=>avatarFileRef.current?.click()} title="Trocar foto de perfil" style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
              <UserAvatar size={32} />
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
          <div style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 10px', borderRadius:12, background:'rgba(255,255,255,.14)', border:'1px solid rgba(255,255,255,.2)' }}>
            <button onClick={()=>avatarFileRef.current?.click()} title="Trocar foto de perfil" style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
              <UserAvatar size={34} />
            </button>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ color:'#fff', fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.nome?.split(' ')[0]}</div>
              <div style={{ color:'rgba(255,255,255,.85)', fontSize:10.5 }}>{user?.role === 'master' ? '◆ Master' : user?.role === 'supervisor' ? '◆ Supervisora' : 'Atendente'}<span style={{ marginLeft:6 }}><span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'#3ef58f', marginRight:3, verticalAlign:'1px' }}/>Online</span></div>
            </div>
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
        )}
      </div>
      {!collapsed && metaMini && (
        <div style={{ margin:'0 12px 8px', padding:'10px 13px', borderRadius:13, background:'rgba(255,255,255,.14)', border:'1px solid rgba(255,255,255,.22)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
            <span style={{ fontSize:10.5, fontWeight:800, color:'#fff' }}>Meta do mês — Vacinas</span>
            <span style={{ fontSize:13, fontWeight:800, color:'#fff' }}>{Math.round(metaMini.pct)}%</span>
          </div>
          <div style={{ height:7, borderRadius:6, background:'rgba(255,255,255,.25)', overflow:'hidden' }}>
            <div style={{ width:`${Math.min(metaMini.pct,100)}%`, height:'100%', background:'#fff', borderRadius:6 }} />
          </div>
          <div style={{ fontSize:9.5, color:'rgba(255,255,255,.75)', marginTop:4 }}>
            {Number(metaMini.vendido).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0})} / {Number(metaMini.meta).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0})}
          </div>
        </div>
      )}
      {!collapsed && (
        <div style={{ margin:'0 12px 10px', padding:'10px 13px', borderRadius:13, background:'rgba(255,255,255,.14)', border:'1px solid rgba(255,255,255,.22)' }}>
          <div style={{ fontSize:11.5, fontWeight:800, color:'#fff', marginBottom:3 }}>{saudDia}, {(user?.nome||'').split(' ')[0]}! ☀️</div>
          <div style={{ fontSize:9.5, color:'rgba(255,255,255,.85)', lineHeight:1.45, fontStyle:'italic' }}>“{VERS_DIA[0]}”</div>
          <div style={{ fontSize:9, color:'rgba(255,255,255,.6)', marginTop:2, fontWeight:700 }}>{VERS_DIA[1]}</div>
        </div>
      )}
      <input ref={avatarFileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={trocarAvatar} />
    </aside>
  );
}
