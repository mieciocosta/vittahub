import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import PlacarVendas from './components/PlacarVendas.jsx';
import CelebracaoGlobal from './components/CelebracaoGlobal.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Login from './pages/Login.jsx';

// Páginas carregadas sob demanda (code-splitting) — cada tela vira um pedaço
// separado, baixado só quando abre. Deixa o carregamento inicial bem mais leve.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Inbox = lazy(() => import('./pages/Inbox.jsx'));
const Leads = lazy(() => import('./pages/Leads.jsx'));
const Funil = lazy(() => import('./pages/Funil.jsx'));
const Retornos = lazy(() => import('./pages/Retornos.jsx'));
const Relatorios = lazy(() => import('./pages/Relatorios.jsx'));
const Configuracoes = lazy(() => import('./pages/Configuracoes.jsx'));
const Agenda = lazy(() => import('./pages/Agenda.jsx'));
const Indicacoes = lazy(() => import('./pages/Indicacoes.jsx'));
const PastaClientes = lazy(() => import('./pages/PastaClientes.jsx'));
const Classificar = lazy(() => import('./pages/Classificar.jsx'));
const CasesSucesso = lazy(() => import('./pages/CasesSucesso.jsx'));
const Cursos = lazy(() => import('./pages/Cursos.jsx'));
const Planejamento = lazy(() => import('./pages/Planejamento.jsx'));
const Profissionais = lazy(() => import('./pages/Profissionais.jsx'));
const Metas = lazy(() => import('./pages/Metas.jsx'));
const Caixa = lazy(() => import('./pages/Caixa.jsx'));
const Quiz = lazy(() => import('./pages/Quiz.jsx'));
const Amigo = lazy(() => import('./pages/Amigo.jsx'));
const MeuPainel = lazy(() => import('./pages/MeuPainel.jsx'));
const Equipe = lazy(() => import('./pages/Equipe.jsx'));
const Biblioteca = lazy(() => import('./pages/Biblioteca.jsx'));
const Figurinhas = lazy(() => import('./pages/Figurinhas.jsx'));
const Modelos = lazy(() => import('./pages/Modelos.jsx'));
const Ligacoes = lazy(() => import('./pages/Ligacoes.jsx'));
const IAssistente = lazy(() => import('./pages/IAssistente.jsx'));
const Auditoria = lazy(() => import('./pages/Auditoria.jsx'));
const WhatsApp = lazy(() => import('./pages/WhatsApp.jsx'));

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
  // Extras — só para escolha manual (a rotação automática usa os 7 primeiros)
  { nome: 'Menta',             tq: '#14b8a6', tq2: '#0f766e', l3: '#e3f8f5', l4: '#f1fdfb', rgb: '20,184,166', sidebar: 'linear-gradient(178deg,#14b8a6 0%,#119488 55%,#0f766e 100%)' },
  { nome: 'Azul Céu',          tq: '#0ea5e9', tq2: '#0369a1', l3: '#e4f4fd', l4: '#f1fafe', rgb: '14,165,233', sidebar: 'linear-gradient(178deg,#0ea5e9 0%,#0284c7 55%,#0369a1 100%)' },
  { nome: 'Violeta',           tq: '#9333ea', tq2: '#6b21a8', l3: '#f4e9fd', l4: '#faf5ff', rgb: '147,51,234', sidebar: 'linear-gradient(178deg,#9333ea 0%,#7e22ce 55%,#6b21a8 100%)' },
  { nome: 'Rosé',              tq: '#db2777', tq2: '#9d174d', l3: '#fdeaf3', l4: '#fef5f9', rgb: '219,39,119', sidebar: 'linear-gradient(178deg,#db2777 0%,#be185d 55%,#9d174d 100%)' },
  { nome: 'Coral',             tq: '#f43f5e', tq2: '#be123c', l3: '#ffe9ed', l4: '#fff5f7', rgb: '244,63,94',  sidebar: 'linear-gradient(178deg,#f43f5e 0%,#e11d48 55%,#be123c 100%)' },
  { nome: 'Tangerina',         tq: '#ea580c', tq2: '#c2410c', l3: '#fdeee2', l4: '#fff7f1', rgb: '234,88,12',  sidebar: 'linear-gradient(178deg,#ea580c 0%,#d24a0a 55%,#c2410c 100%)' },
  { nome: 'Verde Floresta',    tq: '#16a34a', tq2: '#15803d', l3: '#e6f8ec', l4: '#f2fdf5', rgb: '22,163,74',  sidebar: 'linear-gradient(178deg,#16a34a 0%,#159443 55%,#15803d 100%)' },
  { nome: 'Bordô',             tq: '#be123c', tq2: '#881337', l3: '#fdeaee', l4: '#fef5f7', rgb: '190,18,60',  sidebar: 'linear-gradient(178deg,#be123c 0%,#a01235 55%,#881337 100%)' },
  { nome: 'Grafite',           tq: '#475569', tq2: '#334155', l3: '#eef1f6', l4: '#f8fafc', rgb: '71,85,105',  sidebar: 'linear-gradient(178deg,#475569 0%,#3d4a5c 55%,#334155 100%)' },
  { nome: 'Ouro Velho',        tq: '#b08428', tq2: '#8a6417', l3: '#faf1dc', l4: '#fdf9ef', rgb: '176,132,40',  sidebar: 'linear-gradient(178deg,#b08428 0%,#9c7420 55%,#8a6417 100%)' },
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
        <PlacarVendas />
        <ErrorBoundary>
        <Suspense fallback={<div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'70vh' }}><span className="spin" style={{ width:26, height:26, borderColor:'rgba(0,184,192,0.2)', borderTopColor:'var(--tq)' }} /></div>}>
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
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/amigo" element={<Amigo />} />
          <Route path="/meu-painel" element={<MeuPainel />} />
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
        </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
