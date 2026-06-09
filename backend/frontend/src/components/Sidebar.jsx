import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Users, Kanban, BarChart2,
  LogOut, Settings, Smartphone, Sun, Moon, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const NAV = [
  { to:'/',           icon:LayoutDashboard, label:'Dashboard' },
  { to:'/inbox',      icon:MessageSquare,   label:'Inbox',     unread:true },
  { to:'/leads',      icon:Users,           label:'Leads' },
  { to:'/funil',      icon:Kanban,          label:'Funil' },
  { to:'/relatorios', icon:BarChart2,       label:'Relatórios' },
];

const initials = n => (n||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();

export default function Sidebar({ unread = 0, theme = 'light', onToggleTheme, collapsed = false, onToggleCollapse }) {
  const { user, logout, isMaster } = useAuth();
  const w = collapsed ? '56px' : '230px';

  return (
    <aside style={{
      width: w,
      minHeight:'100vh', position:'fixed', left:0, top:0, bottom:0, zIndex:100,
      background:'var(--pet3)',
      display:'flex', flexDirection:'column',
      borderRight:'1px solid rgba(255,255,255,0.06)',
      boxShadow:'4px 0 24px rgba(0,0,0,.18)',
      transition:'width .2s ease',
      overflow:'hidden',
    }}>

      {/* Logo / Brand */}
      <div style={{ padding: collapsed ? '18px 0' : '22px 18px 18px', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent: collapsed ? 'center' : 'flex-start', flexShrink:0 }}>
        {collapsed ? (
          /* Ícone pequeno quando colapsado */
          <div style={{ width:28, height:28, borderRadius:8, background:'var(--tq)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ color:'#fff', fontSize:13, fontWeight:900, letterSpacing:-1 }}>V</span>
          </div>
        ) : (
          <div>
            <img src="/logos/logo-h-white.png" alt="Vittalis" style={{ height:30, objectFit:'contain', width:'100%', maxWidth:150, display:'block' }} />
            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:8 }}>
              <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--tq)', boxShadow:'0 0 6px var(--tq)' }}/>
              <span style={{ fontFamily:'DM Sans', fontSize:10, fontWeight:700, letterSpacing:1.8, color:'rgba(255,255,255,0.28)', textTransform:'uppercase' }}>VittaHub CRM</span>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding: collapsed ? '14px 6px' : '14px 10px', display:'flex', flexDirection:'column', gap:2, overflowY:'auto', overflowX:'hidden' }}>
        {NAV.map(({ to, icon:Icon, label, unread:showU }) => (
          <NavLink key={to} to={to} end={to==='/'} title={collapsed ? label : ''} style={({ isActive }) => ({
            display:'flex', alignItems:'center', gap: collapsed ? 0 : 10,
            padding: collapsed ? '10px 0' : '9px 12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius:10, textDecoration:'none',
            color: isActive ? '#fff' : 'rgba(255,255,255,0.45)',
            background: isActive ? 'rgba(0,184,192,0.15)' : 'transparent',
            fontWeight: isActive ? 600 : 400, fontSize:13.5,
            borderLeft: collapsed ? 'none' : `2px solid ${isActive ? 'var(--tq)' : 'transparent'}`,
            transition: 'all .13s',
            position:'relative',
          })}>
            <Icon size={16} strokeWidth={1.8} />
            {!collapsed && <span style={{ flex:1 }}>{label}</span>}
            {!collapsed && showU && unread > 0 && (
              <span style={{ background:'var(--tq)', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10.5, fontWeight:800, minWidth:20, textAlign:'center', boxShadow:'0 2px 6px rgba(0,184,192,.4)' }}>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
            {/* Badge no ícone quando colapsado */}
            {collapsed && showU && unread > 0 && (
              <span style={{ position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background:'var(--tq)', border:'2px solid var(--pet3)' }} />
            )}
          </NavLink>
        ))}

        <div style={{ height:1, background:'rgba(255,255,255,0.07)', margin:'8px 12px' }}/>

        <NavLink to="/whatsapp" title={collapsed ? 'WhatsApp' : ''} style={({ isActive }) => ({
          display:'flex', alignItems:'center', gap: collapsed ? 0 : 10,
          padding: collapsed ? '10px 0' : '9px 12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius:10, textDecoration:'none',
          color: isActive ? '#25D366' : 'rgba(255,255,255,0.45)',
          background: isActive ? 'rgba(37,211,102,0.1)' : 'transparent',
          fontWeight: isActive ? 600 : 400, fontSize:13.5,
          borderLeft: collapsed ? 'none' : `2px solid ${isActive ? '#25D366' : 'transparent'}`,
          transition: 'all .13s',
        })}>
          <Smartphone size={16} strokeWidth={1.8} />
          {!collapsed && <span>WhatsApp</span>}
        </NavLink>

        {isMaster && (
          <NavLink to="/configuracoes" title={collapsed ? 'Configurações' : ''} style={({ isActive }) => ({
            display:'flex', alignItems:'center', gap: collapsed ? 0 : 10,
            padding: collapsed ? '10px 0' : '9px 12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius:10, textDecoration:'none',
            color: isActive ? '#fff' : 'rgba(255,255,255,0.28)',
            background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
            fontWeight:400, fontSize:13,
            borderLeft: collapsed ? 'none' : '2px solid transparent',
          })}>
            <Settings size={15} strokeWidth={1.6} />
            {!collapsed && <span>Configurações</span>}
          </NavLink>
        )}
      </nav>

      {/* User + toggle */}
      <div style={{ padding: collapsed ? '10px 6px 14px' : '12px 10px 16px', borderTop:'1px solid rgba(255,255,255,0.07)', flexShrink:0 }}>
        {/* Botão colapsar/expandir */}
        <button onClick={onToggleCollapse}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          style={{
            width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6,
            padding:'8px', borderRadius:8, background:'rgba(255,255,255,0.06)',
            color:'rgba(255,255,255,0.4)', border:'none', cursor:'pointer',
            marginBottom:8, transition:'all .15s', fontSize:11.5, fontWeight:600,
          }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(0,184,192,0.15)'; e.currentTarget.style.color='var(--tq)'; }}
          onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color='rgba(255,255,255,0.4)'; }}
        >
          {collapsed ? <ChevronRight size={14}/> : <><ChevronLeft size={14}/><span>Recolher</span></>}
        </button>

        {/* User card */}
        {collapsed ? (
          <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'center' }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:`linear-gradient(135deg, var(--tq), var(--pet))`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11.5, fontWeight:700, color:'#fff', letterSpacing:.5, flexShrink:0 }}>
              {initials(user?.nome)}
            </div>
            <button onClick={onToggleTheme} title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'} style={{ padding:5, background:'none', color:'rgba(255,255,255,0.3)', borderRadius:6, cursor:'pointer', border:'none' }}
              onMouseEnter={e=>e.currentTarget.style.color='rgba(255,255,255,.7)'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.3)'}>
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <button onClick={logout} title="Sair" style={{ padding:5, background:'none', color:'rgba(255,255,255,0.3)', borderRadius:6, cursor:'pointer', border:'none' }}
              onMouseEnter={e=>e.currentTarget.style.color='rgba(255,255,255,.7)'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.3)'}>
              <LogOut size={13} />
            </button>
          </div>
        ) : (
          <div style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 10px', borderRadius:10, background:'rgba(255,255,255,0.05)' }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:`linear-gradient(135deg, var(--tq), var(--pet))`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11.5, fontWeight:700, color:'#fff', flexShrink:0, letterSpacing:.5 }}>
              {initials(user?.nome)}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ color:'#fff', fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.nome?.split(' ')[0]}</div>
              <div style={{ color:'rgba(255,255,255,0.32)', fontSize:10.5 }}>{user?.role === 'master' ? '◆ Master' : 'Atendente'}</div>
            </div>
            <button onClick={onToggleTheme} title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'} style={{ padding:6, background:'none', color:'rgba(255,255,255,0.3)', borderRadius:6, transition:'color .15s', cursor:'pointer', border:'none' }}
              onMouseEnter={e=>e.currentTarget.style.color='rgba(255,255,255,.7)'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.3)'}>
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <button onClick={logout} title="Sair" style={{ padding:6, background:'none', color:'rgba(255,255,255,0.3)', borderRadius:6, transition:'color .15s', cursor:'pointer', border:'none' }}
              onMouseEnter={e=>e.currentTarget.style.color='rgba(255,255,255,.7)'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.3)'}>
              <LogOut size={13} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
