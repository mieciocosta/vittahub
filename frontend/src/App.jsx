import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inbox from './pages/Inbox.jsx';
import Leads from './pages/Leads.jsx';
import Funil from './pages/Funil.jsx';
import Relatorios from './pages/Relatorios.jsx';
import Configuracoes from './pages/Configuracoes.jsx';
import WhatsApp from './pages/WhatsApp.jsx';

export default function App() {
  const { user, loading } = useAuth();
  const [unread, setUnread] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem('vh_theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vh_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'linear-gradient(135deg,#0d3d52,#207898)' }}>
      <div style={{ textAlign:'center' }}>
        <img src="/logos/logo-v-white.png" alt="VittaHub" style={{ height:80, marginBottom:20, opacity:.8 }} />
        <div><span className="spin" style={{ width:28, height:28, borderColor:'rgba(255,255,255,0.3)', borderTopColor:'#fff' }} /></div>
      </div>
    </div>
  );

  if (!user) return <Login />;

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <Sidebar unread={unread} theme={theme} onToggleTheme={toggleTheme} />
      <main style={{ marginLeft:'var(--sw)', flex:1, minHeight:'100vh', overflowX:'hidden' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inbox" element={<Inbox onUnreadChange={setUnread} />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/funil" element={<Funil />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/whatsapp" element={<WhatsApp />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
