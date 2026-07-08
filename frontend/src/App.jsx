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
import CasesSucesso from './pages/CasesSucesso.jsx';
import Cursos from './pages/Cursos.jsx';
import Planejamento from './pages/Planejamento.jsx';
import Profissionais from './pages/Profissionais.jsx';
import Metas from './pages/Metas.jsx';
import Caixa from './pages/Caixa.jsx';
import Equipe from './pages/Equipe.jsx';
import Biblioteca from './pages/Biblioteca.jsx';
import Figurinhas from './pages/Figurinhas.jsx';
import Modelos from './pages/Modelos.jsx';
import Ligacoes from './pages/Ligacoes.jsx';
import IAssistente from './pages/IAssistente.jsx';
import Auditoria from './pages/Auditoria.jsx';
import WhatsApp from './pages/WhatsApp.jsx';

/* ─── Cor do dia ──────────────────────────────────────────────────────────────
   Paleta premium curada: uma cor de acento por dia da semana (0=Dom … 6=Sáb).
   Troca só o acento (--tq/--tq2/--tq3/--tq4 + gradiente da sidebar no tema claro),
   mantendo a base da marca Vittalis. Pode ser desligada com localStorage vh_cordia='off'. */
const CORES_DIA = [
  { nome: 'Turquesa Vittalis', tq: '#00B8C0', tq2: '#007d83', l3: '#e5f8f9', l4: '#f0fdfe', rgb: '0,184,192',  sidebar: 'linear-gradient(178deg,#00B8C0 0%,#0AA0AA 55%,#0E8C96 100%)' },
  { nome: 'Azul Safira',       tq: '#2563eb', tq2: '#1d4ed8', l3: '#eaf1ff', l4: '#f5f9ff', rgb: '37,99,235',  sidebar: 'linear-gradient(178deg,#2563eb 0%,#1e50c8 55%,#1741a8 100%)' },
  { nome: 'Esmeralda',         tq: '#059669', tq2: '#047857', l3: '#e6f8f1', l4: '#f2fdf9', rgb: '5,150,105',  sidebar: 'linear-gradient(178deg,#059669 0%,#048a5f 55%,#047857 100%)' },
  { nome: 'Ametista',          tq: '#7c3aed', tq2: '#6d28d9', l3: '#f2ecfe', l4: '#f9f6ff', rgb: '124,58,237', sidebar: 'linear-gradient(178deg,#7c3aed 0%,#6d28d9 55%,#5b21b6 100%)' },
  { nome: 'Índigo',            tq: '#4f46e5', tq2: '#4338ca', l3: '#ecebfe', l4: '#f6f6ff', rgb: '79,70,229',  sidebar: 'linear-gradient(178deg,#4f46e5 0%,#4338ca 55%,#3730a3 100%)' },
  { nome: 'Âmbar Dourado',     tq: '#d97706', tq2: '#b45309', l3: '#fdf3e5', l4: '#fffaf2', rgb: '217,119,6',  sidebar: 'linear-gradient(178deg,#e08610 0%,#d97706 55%,#b45309 100%)' },
  { nome: 'Ciano Petróleo',    tq: '#0891b2', tq2: '#0e7490', l3: '#e4f6fb', l4: '#f1fbfd', rgb: '8,145,178',  sidebar: 'linear-gradient(178deg,#0891b2 0%,#0a82a0 55%,#0e7490 100%)' },
];

/* vh_cor: 'off' (usa a marca padrão) | 'auto' (cor do dia) | '0'..'6' (fixa escolhida) */
function corSelecionada() {
  const v = localStorage.getItem('vh_cor') || 'auto';
  if (v === 'off') return null;
  if (v === 'auto') return CORES_DIA[new Date().getDay()] || CORES_DIA[0];
  const i = parseInt(v, 10);
  return Number.isInteger(i) && CORES_DIA[i] ? CORES_DIA[i] : (CORES_DIA[new Date().getDay()] || CORES_DIA[0]);
}

function aplicarCorDoDia(theme) {
  const root = document.documentElement;
  const props = ['--tq', '--tq2', '--tq3', '--tq4', '--sidebar-bg'];
  const c = corSelecionada();
  if (!c) {
    props.forEach(p => root.style.removeProperty(p));
    root.removeAttribute('data-cor-dia');
    return null;
  }
  root.style.setProperty('--tq', c.tq);
  root.style.setProperty('--tq2', c.tq2);
  if (theme === 'dark') {
    root.style.setProperty('--tq3', `rgba(${c.rgb},0.12)`);
    root.style.setProperty('--tq4', `rgba(${c.rgb},0.06)`);
    root.style.removeProperty('--sidebar-bg'); // no escuro a sidebar segue azul-escuro
  } else {
    root.style.setProperty('--tq3', c.l3);
    root.style.setProperty('--tq4', c.l4);
    root.style.setProperty('--sidebar-bg', c.sidebar);
  }
  root.setAttribute('data-cor-dia', c.nome);
  return c;
}

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
  const [corDia, setCorDiaState] = useState(() => localStorage.getItem('vh_cor') || 'auto');
  const [mobileMenu, setMobileMenu] = useState(false);
  // Sidebar navigation collapsed state (persiste entre sessões)
  const [navCollapsed, setNavCollapsed] = useState(
    () => localStorage.getItem('vh_nav') === 'collapsed'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vh_theme', theme);
  }, [theme]);

  // Aplica a cor do dia / cor escolhida sempre que o tema ou a escolha mudar
  useEffect(() => {
    aplicarCorDoDia(theme);
  }, [theme, corDia]);

  const setCorDia = React.useCallback((valor) => {
    localStorage.setItem('vh_cor', valor);
    setCorDiaState(valor);
  }, []);

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
        corDia={corDia}
        onSetCorDia={setCorDia}
        paletaCores={CORES_DIA}
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
          <Route path="/caixa" element={<Caixa />} />
          <Route path="/equipe" element={<Equipe />} />
          <Route path="/classificar" element={<Classificar />} />
          <Route path="/cases-sucesso" element={<CasesSucesso />} />
          <Route path="/cursos" element={<Cursos />} />
          <Route path="/planejamento" element={(user.lider || user.role === 'master') ? <Planejamento /> : <Navigate to="/" />} />
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
