import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, Users, Kanban, BarChart2, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const NAV = [
  { to:'/',           icon:LayoutDashboard, label:'Dashboard' },
  { to:'/inbox',      icon:MessageSquare,   label:'Inbox',     unread:true },
  { to:'/leads',      icon:Users,           label:'Leads' },
  { to:'/funil',      icon:Kanban,          label:'Funil' },
  { to:'/relatorios', icon:BarChart2,       label:'Relatórios' },
];

const initials = n => (n||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();

export default function Sidebar({ unread = 0 }) {
  const { user, logout, isMaster } = useAuth();

  return (
    <aside style={{
      width:'var(--sw)', minHeight:'100vh', position:'fixed', left:0, top:0, bottom:0, zIndex:100,
      background:'var(--pet3)',
      display:'flex', flexDirection:'column',
      borderRight:'1px solid rgba(255,255,255,0.06)',
      boxShadow:'4px 0 24px rgba(0,0,0,.18)',
    }}>
      {/* Logo */}
      <div style={{ padding:'22px 18px 18px', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
        <img src="/logos/logo-h-white.png" alt="Vittalis" style={{ height:30, objectFit:'contain', width:'100%', maxWidth:150, display:'block' }} />
        <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:8 }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--tq)', boxShadow:'0 0 6px var(--tq)' }}/>
          <span style={{ fontFamily:'DM Sans', fontSize:10, fontWeight:700, letterSpacing:1.8, color:'rgba(255,255,255,0.28)', textTransform:'uppercase' }}>VittaHub CRM</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'14px 10px', display:'flex', flexDirection:'column', gap:2 }}>
        {NAV.map(({ to, icon:Icon, label, unread:showU }) => (
          <NavLink key={to} to={to} end={to==='/'} style={({ isActive }) => ({
            display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
            borderRadius:10, textDecoration:'none',
            color: isActive ? '#fff' : 'rgba(255,255,255,0.45)',
            background: isActive ? 'rgba(0,184,192,0.15)' : 'transparent',
            fontWeight: isActive ? 600 : 400, fontSize:13.5,
            borderLeft: `2px solid ${isActive ? 'var(--tq)' : 'transparent'}`,
            transition: 'all .13s',
          })}>
            <Icon size={16} strokeWidth={1.8} />
            <span style={{ flex:1 }}>{label}</span>
            {showU && unread > 0 && (
              <span style={{ background:'var(--tq)', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10.5, fontWeight:800, minWidth:20, textAlign:'center', boxShadow:'0 2px 6px rgba(0,184,192,.4)' }}>{unread > 99 ? '99+' : unread}</span>
            )}
          </NavLink>
        ))}

        {isMaster && (
          <NavLink to="/configuracoes" style={({ isActive }) => ({
            display:'flex', alignItems:'center', gap:10, padding:'9px 12px', marginTop:8,
            borderRadius:10, textDecoration:'none',
            color: isActive ? '#fff' : 'rgba(255,255,255,0.28)',
            background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
            fontWeight:400, fontSize:13, borderLeft:'2px solid transparent',
          })}>
            <Settings size={15} strokeWidth={1.6} />
            <span>Configurações</span>
          </NavLink>
        )}
      </nav>

      {/* User */}
      <div style={{ padding:'12px 10px 16px', borderTop:'1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 10px', borderRadius:10, background:'rgba(255,255,255,0.05)' }}>
          <div style={{ width:32, height:32, borderRadius:'50%', background:`linear-gradient(135deg, var(--tq), var(--pet))`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11.5, fontWeight:700, color:'#fff', flexShrink:0, letterSpacing:.5 }}>
            {initials(user?.nome)}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ color:'#fff', fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.nome?.split(' ')[0]}</div>
            <div style={{ color:'rgba(255,255,255,0.32)', fontSize:10.5 }}>{user?.role === 'master' ? '◆ Master' : 'Atendente'}</div>
          </div>
          <button onClick={logout} style={{ padding:6, background:'none', color:'rgba(255,255,255,0.3)', borderRadius:6, transition:'color .15s' }}
            onMouseEnter={e=>e.currentTarget.style.color='rgba(255,255,255,.7)'}
            onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.3)'}>
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
