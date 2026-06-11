import React, { useEffect, useState, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Users, Kanban, BarChart2,
  LogOut, Settings, Smartphone, Sun, Moon, ChevronLeft, ChevronRight,
  CalendarClock, Bell, CheckCheck, UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

const NAV = [
  { to:'/',           icon:LayoutDashboard, label:'Dashboard' },
  { to:'/inbox',      icon:MessageSquare,   label:'Inbox',     unread:true },
  { to:'/leads',      icon:Users,           label:'Leads' },
  { to:'/funil',      icon:Kanban,          label:'Funil' },
  { to:'/retornos',   icon:CalendarClock,   label:'Retornos',  retornos:true },
  { to:'/relatorios', icon:BarChart2,       label:'Relatórios' },
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
          padding: collapsed ? '10px 0' : '9px 12px', borderRadius:10, background: open ? 'rgba(0,184,192,0.15)' : 'transparent',
          color: open ? 'var(--tq)' : 'rgba(255,255,255,0.45)', border:'none', cursor:'pointer', fontSize:13.5, position:'relative' }}>
        <Bell size={16} strokeWidth={1.8} />
        {!collapsed && <span style={{ flex:1, textAlign:'left' }}>Notificações</span>}
        {naoLidas > 0 && (collapsed
          ? <span style={{ position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background:'var(--gold)', border:'2px solid var(--pet3)' }} />
          : <span style={{ background:'var(--gold)', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10.5, fontWeight:800, minWidth:20, textAlign:'center' }}>{naoLidas > 99 ? '99+' : naoLidas}</span>)}
      </button>

      {open && (
        <div style={{ position:'fixed', left:'calc(var(--sw) + 8px)', bottom:88, width:312, maxHeight:420, zIndex:400,
          background:'var(--card)', borderRadius:14, boxShadow:'var(--s4)', border:'1px solid var(--border)',
          display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontWeight:800, fontSize:13.5, color:'var(--txt)' }}>Notificações</span>
            {naoLidas > 0 && (
              <button onClick={lerTodas} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 9px', borderRadius:8, background:'var(--tq3)', color:'var(--tq2)', fontSize:11, fontWeight:700, border:'none', cursor:'pointer' }}>
                <CheckCheck size={11} /> Ler todas
              </button>
            )}
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {notifs.length === 0 && <div style={{ padding:'26px 14px', textAlign:'center', fontSize:12.5, color:'var(--muted)' }}>Nenhuma notificação ainda.</div>}
            {notifs.map(n => (
              <div key={n.id} style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:9, background: n.lida ? 'transparent' : 'var(--tq4)' }}>
                <div style={{ width:28, height:28, borderRadius:9, background: n.lida ? 'var(--bg2)' : 'var(--tq3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                  <UserPlus size={13} color={n.lida ? 'var(--muted)' : 'var(--tq2)'} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:12.5, color:'var(--txt)' }}>{n.titulo}</div>
                  <div style={{ fontSize:11.5, color:'var(--muted)', lineHeight:1.45 }}>{n.texto}</div>
                  <div style={{ fontSize:10, color:'var(--light)', marginTop:2 }}>{fmt.relTime(n.created_at)}</div>
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

export default function Sidebar({ unread = 0, theme = 'light', onToggleTheme, collapsed = false, onToggleCollapse }) {
  const { user, logout, isMaster } = useAuth();
  const api = useApi();
  const w = collapsed ? '56px' : '230px';
  // Retornos vencidos: badge vermelho no menu (atualiza a cada 60s)
  const [vencidos, setVencidos] = useState(0);
  useEffect(() => {
    const load = () => api.get('/leads/retornos').then(d => setVencidos(d.vencidos?.length || 0)).catch(() => {});
    load(); const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line

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

      {/* Logo / Brand — vertical branca oficial, clicável pro Dashboard */}
      <div style={{ padding: collapsed ? '14px 0' : '18px 14px 14px', borderBottom:'1px solid rgba(255,255,255,0.07)', flexShrink:0 }}>
        <NavLink to="/" title="Ir para o Dashboard" className="brand-link" style={{ textDecoration:'none', display:'block' }}>
          {collapsed ? (
            <img src="/logos/logo-icon-white.png" alt="Vittalis Saúde" style={{ height:28, objectFit:'contain', display:'block', margin:'0 auto' }} />
          ) : (
            <>
              <img src="/logos/logo-v-white.png" alt="Vittalis Saúde" style={{ height:74, objectFit:'contain', display:'block', margin:'0 auto' }} />
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, marginTop:9 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--tq)', boxShadow:'0 0 6px var(--tq)' }}/>
                <span style={{ fontSize:10, fontWeight:700, letterSpacing:1.8, color:'rgba(255,255,255,0.3)', textTransform:'uppercase' }}>VittaHub CRM</span>
              </div>
            </>
          )}
        </NavLink>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding: collapsed ? '14px 6px' : '14px 10px', display:'flex', flexDirection:'column', gap:3, overflowY:'auto', overflowX:'hidden' }}>
        {!collapsed && <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:1.6, color:'rgba(255,255,255,0.22)', padding:'0 12px 6px', textTransform:'uppercase' }}>Menu</div>}
        {NAV.map(({ to, icon:Icon, label, unread:showU, retornos:retBadge }) => (
          <NavLink key={to} to={to} end={to==='/'} title={collapsed ? label : ''} style={({ isActive }) => ({
            display:'flex', alignItems:'center', gap: collapsed ? 0 : 10,
            padding: collapsed ? '10px 0' : '9px 12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius:12, textDecoration:'none',
            color: isActive ? '#fff' : 'rgba(255,255,255,0.48)',
            background: isActive ? 'linear-gradient(135deg, rgba(0,184,192,0.22), rgba(0,184,192,0.08))' : 'transparent',
            boxShadow: isActive ? 'inset 0 0 0 1px rgba(0,184,192,0.35), 0 4px 12px rgba(0,184,192,0.12)' : 'none',
            fontWeight: isActive ? 700 : 500, fontSize:13.5,
            transition: 'all .15s',
            position:'relative',
          })}>
            <Icon size={16} strokeWidth={1.8} />
            {!collapsed && <span style={{ flex:1 }}>{label}</span>}
            {!collapsed && showU && unread > 0 && (
              <span style={{ background:'var(--tq)', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10.5, fontWeight:800, minWidth:20, textAlign:'center', boxShadow:'0 2px 6px rgba(0,184,192,.4)' }}>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
            {!collapsed && retBadge && vencidos > 0 && (
              <span style={{ background:'var(--err)', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10.5, fontWeight:800, minWidth:20, textAlign:'center' }}>
                {vencidos > 99 ? '99+' : vencidos}
              </span>
            )}
            {collapsed && retBadge && vencidos > 0 && (
              <span style={{ position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background:'var(--err)', border:'2px solid var(--pet3)' }} />
            )}
            {/* Badge no ícone quando colapsado */}
            {collapsed && showU && unread > 0 && (
              <span style={{ position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background:'var(--tq)', border:'2px solid var(--pet3)' }} />
            )}
          </NavLink>
        ))}

        <div style={{ height:1, background:'rgba(255,255,255,0.07)', margin:'8px 12px' }}/>

        <BellPanel collapsed={collapsed} />

        {isMaster && (
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
        )}

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
