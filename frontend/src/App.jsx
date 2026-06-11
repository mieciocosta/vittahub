import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inbox from './pages/Inbox.jsx';
import Leads from './pages/Leads.jsx';
import Funil from './pages/Funil.jsx';
import Retornos from './pages/Retornos.jsx';
import Relatorios from './pages/Relatorios.jsx';
import Configuracoes from './pages/Configuracoes.jsx';
import WhatsApp from './pages/WhatsApp.jsx';

export default function App() {
  const { user, loading } = useAuth();
  const [unread, setUnread] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem('vh_theme') || 'light');
  // Sidebar navigation collapsed state (persiste entre sessões)
  const [navCollapsed, setNavCollapsed] = useState(
    () => localStorage.getItem('vh_nav') === 'collapsed'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vh_theme', theme);
  }, [theme]);

  // Atualiza a CSS variable --sw ao colapsar/expandir sidebar
  useEffect(() => {
    const sw = navCollapsed ? '56px' : '230px';
    document.documentElement.style.setProperty('--sw', sw);
    localStorage.setItem('vh_nav', navCollapsed ? 'collapsed' : 'open');
  }, [navCollapsed]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');
  const toggleNav = () => setNavCollapsed(p => !p);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'linear-gradient(160deg,#f7fbfc,#e8f4f6)' }}>
      <div style={{ textAlign:'center' }}>
        <img src="/logos/logo-v-color.png" alt="Vittalis Saúde" style={{ height:110, marginBottom:24 }} />
        <div><span className="spin" style={{ width:26, height:26, borderColor:'rgba(0,184,192,0.2)', borderTopColor:'var(--tq)' }} /></div>
      </div>
    </div>
  );

  if (!user) return <Login />;

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <Sidebar
        unread={unread}
        theme={theme}
        onToggleTheme={toggleTheme}
        collapsed={navCollapsed}
        onToggleCollapse={toggleNav}
      />
      <main style={{ marginLeft:'var(--sw)', flex:1, minHeight:'100vh', overflowX:'hidden', transition:'margin-left .2s ease' }}>
        <Routes>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/inbox"        element={<Inbox onUnreadChange={setUnread} />} />
          <Route path="/leads"        element={<Leads />} />
          <Route path="/funil"        element={<Funil />} />
          <Route path="/retornos"     element={<Retornos />} />
          <Route path="/relatorios"   element={<Relatorios />} />
          <Route path="/whatsapp"     element={user.role === 'master' ? <WhatsApp /> : <Navigate to="/" />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="*"             element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
