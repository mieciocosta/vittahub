import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import CelebracaoGlobal from './components/CelebracaoGlobal.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inbox from './pages/Inbox.jsx';
import Leads from './pages/Leads.jsx';
import Funil from './pages/Funil.jsx';
import Retornos from './pages/Retornos.jsx';
import Relatorios from './pages/Relatorios.jsx';
import Configuracoes from './pages/Configuracoes.jsx';
import Agenda from './pages/Agenda.jsx';
import Indicacoes from './pages/Indicacoes.jsx';
import PastaClientes from './pages/PastaClientes.jsx';
import Classificar from './pages/Classificar.jsx';
import Profissionais from './pages/Profissionais.jsx';
import Metas from './pages/Metas.jsx';
import Equipe from './pages/Equipe.jsx';
import Biblioteca from './pages/Biblioteca.jsx';
import Figurinhas from './pages/Figurinhas.jsx';
import Modelos from './pages/Modelos.jsx';
import Ligacoes from './pages/Ligacoes.jsx';
import IAssistente from './pages/IAssistente.jsx';
import Auditoria from './pages/Auditoria.jsx';
import WhatsApp from './pages/WhatsApp.jsx';

// Heartbeat isolado — roda em background, sem afetar o render do App
function Heartbeat({ userId }) {
  const started = React.useRef(false);
  React.useEffect(() => {
    if (!userId || started.current) return;
    started.current = true;
    let lat = null, lng = null;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => { lat = p.coords.latitude; lng = p.coords.longitude; }, () => {}, { enableHighAccuracy: false, timeout: 10000 });
    }
    const tk = () => localStorage.getItem('vh_token') || '';
    const BASE = import.meta.env.VITE_API_URL || '';
    const beat = () => {
      const pagina = location.pathname.replace(/\//g, '') || 'dashboard';
      fetch(`${BASE}/api/auditoria/heartbeat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk()}` }, body: JSON.stringify({ latitude: lat, longitude: lng, pagina }) }).catch(() => {});
    };
    const logNav = () => {
      fetch(`${BASE}/api/auditoria/log`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk()}` }, body: JSON.stringify({ acao: 'navegacao', detalhes: { pagina: location.pathname }, latitude: lat, longitude: lng }) }).catch(() => {});
    };
    window.__auditLog = (acao, entidade, entidade_id, detalhes) => {
      fetch(`${BASE}/api/auditoria/log`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk()}` }, body: JSON.stringify({ acao, entidade, entidade_id, detalhes, latitude: lat, longitude: lng }) }).catch(() => {});
    };
    beat();
    const hb = setInterval(beat, 30000);
    return () => { clearInterval(hb); delete window.__auditLog; started.current = false; };
  }, [userId]); // eslint-disable-line

  // Navegação: registra CADA página que o atendente abre (passo a passo).
  const loc = useLocation();
  React.useEffect(() => {
    if (userId && window.__auditLog) window.__auditLog('navegacao', 'pagina', loc.pathname);
  }, [loc.pathname, userId]);

  // Cópia: registra quando o atendente copia texto/número (Ctrl+C).
  React.useEffect(() => {
    if (!userId) return;
    const onCopy = () => {
      try {
        const txt = String(window.getSelection?.() || '').trim().slice(0, 80);
        if (!txt || !window.__auditLog) return;
        const ehTel = txt.replace(/\D/g, '').length >= 8 && /^[\d()+\-.\s]+$/.test(txt);
        window.__auditLog('copiar', ehTel ? 'telefone' : 'texto', '', { copiado: txt });
      } catch {}
    };
    document.addEventListener('copy', onCopy);
    return () => document.removeEventListener('copy', onCopy);
  }, [userId]);

  return null; // never renders anything
}

export default function App() {
  const { user, loading } = useAuth();
  const [unread, setUnread] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem('vh_theme') || 'light');
  const [mobileMenu, setMobileMenu] = useState(false);
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
  // Hook estável: precisa ficar ANTES dos early-returns abaixo (regras de hooks),
  // senão o nº de hooks muda entre renders (loading→pronto) e estoura React #310.
  const closeMobile = React.useCallback(() => setMobileMenu(false), []);

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
      <CelebracaoGlobal />
      <button className="vh-hamburger" onClick={() => setMobileMenu(true)} aria-label="Menu">☰</button>
      <div className={`vh-overlay${mobileMenu ? ' open' : ''}`} onClick={() => setMobileMenu(false)} />
      <Sidebar
        unread={unread}
        theme={theme}
        onToggleTheme={toggleTheme}
        collapsed={navCollapsed}
        onToggleCollapse={toggleNav}
        mobileOpen={mobileMenu}
        onCloseMobile={closeMobile}
      />
      {user && <Heartbeat userId={user.id} />}
      <main className='vh-main' style={{ marginLeft:'var(--sw)', flex:1, minHeight:'100vh', overflowX:'hidden', transition:'margin-left .2s ease' }}>
        <ErrorBoundary>
        <Routes>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/inbox"        element={<Inbox onUnreadChange={setUnread} />} />
          <Route path="/leads"        element={<Leads />} />
          <Route path="/funil"        element={<Funil />} />
          <Route path="/retornos"     element={<Retornos />} />
          <Route path="/relatorios"   element={<Relatorios />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/profissionais" element={(['master','supervisor'].includes(user.role) || user.setor === 'consultas') ? <Profissionais /> : <Navigate to="/" />} />
          <Route path="/metas" element={<Metas />} />
          <Route path="/equipe" element={<Equipe />} />
          <Route path="/classificar" element={<Classificar />} />
          <Route path="/fidelidade" element={<PastaClientes categoria="fidelidade" key="fidelidade" />} />
          <Route path="/planos-vacinais" element={<PastaClientes classificacao="planos_vacinais" key="planos_vacinais" />} />
          <Route path="/vacinacao" element={<PastaClientes classificacao="vacinacao" key="vacinacao" />} />
          <Route path="/consultas" element={<PastaClientes classificacao="consultas" key="consultas" />} />
          <Route path="/terapias" element={<PastaClientes classificacao="terapias" key="terapias" />} />
          <Route path="/banco-dados" element={<PastaClientes categoria="banco_dados" key="banco_dados" />} />
          <Route path="/indicacoes" element={<Indicacoes />} />
          <Route path="/biblioteca" element={<Biblioteca />} />
          <Route path="/figurinhas" element={<Figurinhas />} />
          <Route path="/modelos" element={<Modelos />} />
          <Route path="/ligacoes" element={<Ligacoes />} />
          <Route path="/ia" element={<IAssistente />} />
          <Route path="/auditoria" element={user.role === 'master' ? <Auditoria /> : <Navigate to="/" />} />
          <Route path="/whatsapp"     element={user.role === 'master' ? <WhatsApp /> : <Navigate to="/" />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="*"             element={<Navigate to="/" />} />
        </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}
