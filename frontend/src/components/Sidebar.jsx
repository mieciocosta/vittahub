import React, { useEffect, useState, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Users, Kanban, BarChart2,
  LogOut, Settings, Smartphone, Sun, Moon, ChevronLeft, ChevronRight, ChevronDown,
  CalendarClock, CalendarDays, Bell, CheckCheck, UserPlus, Shield,
  Gift, Bot, Image, FileText, Smile, Phone, Star, Database, Stethoscope, Target, Puzzle,
  Trophy, GraduationCap, Rocket, Wallet, Palette, Gamepad2, BookOpen, LayoutGrid, Pencil, Flame, FileSearch,
  BellRing, Syringe, ExternalLink, ClipboardList, FileSignature,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../context/AuthContext.jsx';
import { setToken } from '../hooks/api.js';
import { fmt, clarear, escurecer, tituloUsuario } from '../hooks/utils.js';
import { versiculoDoDia } from '../hooks/versiculos.js';

// 4 tons por família: p<0 clareia, p>0 escurece. Quatro é o ponto em que a
// pessoa vê diferença real entre eles sem virar um degradê indeciso.
const TONS = [
  { nome: 'Claro',  p: -0.35 },
  { nome: 'Médio',  p: 0 },
  { nome: 'Forte',  p: 0.28 },
  { nome: 'Escuro', p: 0.5 },
];
import AvatarBuilder from './AvatarBuilder.jsx';

// Atalhos coloridos por classificação → abrem o chat filtrado (?cls=).
// Fidelidade abre a PASTA (as conversas dela saem do inbox).
// `setor` diz de quem é a pasta (pedido do master): Vacinação, Planos Vacinais e
// Fidelidade são do setor de VACINAS; Consultas e Terapias, do de CONSULTAS.
// Quem não é do setor não vê a pasta — antes todas apareciam pra todo mundo.
const SETORES_MENU = [
  { cls:'vacinacao',       label:'Vacinação',       cor:'#7c5cbf', to:'/vacinacao',       setor:'vacinas' },
  { cls:'planos_vacinais', label:'Planos Vacinais', cor:'#3b82f6', to:'/planos-vacinais', setor:'vacinas' },
  { cls:'fidelidade',      label:'Fidelidade',      cor:'#eab308', to:'/fidelidade',      setor:'vacinas' },
  { cls:'consultas',       label:'Consultas',       cor:'#00B8C0', to:'/consultas',       setor:'consultas' },
  { cls:'terapias',        label:'Terapias',        cor:'#C4973B', to:'/terapias',        setor:'terapias' },
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
  // 💲 Logo abaixo do Chat e visivel PRA TODOS (pedido do master) —
  // qualquer atendente consulta valores e monta orçamento sem sair da conversa.
  { to:'/tabela-precos', icon:FileText,     label:'Tabela de Preços', cor:'#0ea5e9' },
  // 🏆 Coladinho na Tabela de Preços (pedido do master): orçou → estuda quem
  // fechou. Cada case agora vira uma aula de vendas gerada pela IA.
  { to:'/cases-sucesso', icon:Trophy,       label:'Cases de Sucesso', cor:'#eab308' },
  // Quem agenda consulta vive alternando entre a conversa e a grade dos profissionais.
  { to:'/profissionais', icon:Stethoscope,  label:'Profissionais', consultas:true, cor:'#22d3ee' },
  { to:'/agenda',     icon:CalendarDays,    label:'Agenda', cor:'#f59e0b' },

  { grupo:'Vender' },
  { to:'/plano-vacinal', icon:Syringe, label:'Plano Vacinal', vacinas:true, cor:'#22c55e', destaque:true },
  { to:'/plano-terapias', icon:Puzzle,      label:'Plano de Terapias', terapias:true, destaque:true, cor:'#a855f7' },
  { to:'/retornos',   icon:Bell,            label:'Follow-up',  retornos:true, cor:'#fb7185' },
  { to:'/recuperacao',icon:Flame,           label:'Recuperação', cor:'#f97316' },
  // Pódio por QUANTIDADE de vendas (pedido do master) — fica em "Vender"
  // de propósito: ranking é combustível de venda, não relatório de fim de dia.
  { to:'/ranking',    icon:Trophy,          label:'Ranking', cor:'#f59e0b', destaque:true },
  { to:'/minha-carteira', icon:Wallet,     label:'Minha Carteira', cor:'#2dd4bf' },
  { to:'/leads',      icon:Users,           label:'Clientes', cor:'#a78bfa' },
  { to:'/lembretes',  icon:BellRing,        label:'Lembretes', cor:'#facc15' },

  { grupo:'Fim do dia' },
  /* 🧹 Auditoria: "Meu Relatório" saiu do menu — era a MESMA página do
     Relatório do Dia com um parâmetro; dois itens pro mesmo destino só
     engordavam a lista. O individual é uma aba dentro da página. */
  { to:'/agenda?aba=relatorio', icon:ClipboardList, label:'Relatório do Dia', cor:'#0ea5e9', destaque:true },
  { to:'/caixa',      icon:Wallet,          label:'Caixa', cor:'#34d399' },
  { to:'/metas',      icon:Target,          label:'Metas', gestao:true, cor:'#e879f9' },

  { grupo:'Operação' },
  { to:'/vacinas-solicitacao', icon:Syringe, label:'Solicitar Vacinas', vacinas:true, cor:'#8b5cf6' },
  { to:'/funil',      icon:Kanban,          label:'Funil', cor:'#2dd4bf' },
  { to:'/relatorios', icon:BarChart2,       label:'Relatórios', cor:'#60a5fa' },
  { to:'/banco-dados',icon:Database,        label:'Banco de Dados', cor:'#94a3b8' },

  { grupo:'Equipe' },
  { to:'/equipe',     icon:Users,           label:'Chat da Equipe', equipe:true, cor:'#4ade80' },
  { to:'/meu-painel', icon:LayoutGrid,      label:'Meu Painel', cor:'#c084fc' },
  { to:'/amigo',      icon:BookOpen,        label:'Meu Devocional', cor:'#fbbf24' },
  { to:'/planejamento', icon:Rocket,        label:'Planejamento', lider:true, plan:true, cor:'#fb923c' },
  { to:'/quiz',       icon:Gamepad2,        label:'Quiz de Vendas', cor:'#f472b6' },
  // Estudos fica na Equipe; os Cases subiram pra perto da Tabela de Preços.
  { to:'/estudos',       icon:FileSearch,   label:'Estudos', cor:'#C4973B' },
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
  /* ─── 📂 MENU EM SANFONA (pedido do master: "menu muito grande, cria menus e
     submenus") ────────────────────────────────────────────────────────────────
     Eram ~30 itens abertos de uma vez: a pessoa não LIA o menu, varria com o
     olho e desistia. Agora cada seção abre e fecha, e só duas ficam abertas por
     padrão: "Meu dia" (o que ela usa toda hora) e a seção da tela em que ela
     está — assim o menu sempre mostra onde ela se encontra, sem esconder nada.
     A escolha fica gravada no navegador: quem gosta de tudo aberto abre uma vez
     e pronto. Menu colapsado (só ícones) ignora tudo isso. */
  const loc = useLocation();
  const grupoDoItem = React.useMemo(() => {
    const mapa = {}; let atual = null;
    for (const n of NAV) { if (n.grupo) atual = n.grupo; else if (n.to) mapa[n.to] = atual; }
    return mapa;
  }, []);
  const grupoAtivo = React.useMemo(() => {
    const rota = loc.pathname + loc.search;
    // Casa a rota mais específica primeiro (senão "/" pega tudo)
    const chave = Object.keys(grupoDoItem)
      .filter(k => k === '/' ? rota === '/' : rota.startsWith(k.split('?')[0]))
      .sort((x, y) => y.length - x.length)[0];
    return grupoDoItem[chave] || 'Meu dia';
  }, [loc.pathname, loc.search, grupoDoItem]);
  /* O master testou a sanfona e mandou ao contrário: TUDO ABERTO por padrão
     ("quero que deixe aberto todos"). O clique continua funcionando pra quem
     quiser recolher uma seção — mas agora o que fica guardado é a lista de
     FECHADAS, e ela nasce vazia. A seção da tela atual nunca fecha. */
  const [gruposFechados, setGruposFechados] = useState(() => {
    try { const g = JSON.parse(localStorage.getItem('vh_menu_fechados') || 'null'); if (Array.isArray(g)) return g; } catch {}
    return [];
  });
  useEffect(() => { try { localStorage.setItem('vh_menu_fechados', JSON.stringify(gruposFechados)); } catch {} }, [gruposFechados]);
  const grupoAberto = (g) => !gruposFechados.includes(g) || g === grupoAtivo;
  const alternarGrupo = (g) => setGruposFechados(p => p.includes(g)
    ? p.filter(x => x !== g)
    : [...p, g]);
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
  /* Quem vê aba de OUTRO setor: só o master e o marketing (ve_tudo E sem setor
     nenhum — é a combinação do José e do Carlos).
     Antes bastava "não ter setor" pra ver tudo, e isso transformava qualquer
     cadastro incompleto num vazamento silencioso: foi assim que a Danielle,
     com o setor não aplicado por um seed furado, voltou a ver Solicitar
     Vacinas. Agora falta de cadastro FECHA em vez de abrir — e o marketing
     (José e Carlos) recebe os três setores explicitamente no cadastro, em vez
     de depender de "não ter setor". */
  const podeSetor = (s) => user?.role === 'master' || meusSetores.includes(s);
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
  // Família escolhida no seletor de cor (o tom sai dela). Começa na cor atual.
  const [familia, setFamilia] = useState(() => {
    const v = localStorage.getItem('vh_cor') || '';
    return /^#[0-9a-f]{3,6}$/i.test(v) ? v : '#00B8C0';
  });
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
  /* 🎯 Mini-placar do perfil (pedido do master: "acrescenta as metas
     embaixo"). Mesmas regras do placar grande: meta individual quando existe;
     vacinas fala em VALORES, consultas em porcentagem; quem não vê valores do
     setor só vê o que é DELA. */
  const [metaMini, setMetaMini] = useState(null);
  useEffect(() => {
    api.get('/extras/meta-setor').then(setMetaMini).catch(() => {});
  }, []); // eslint-disable-line

  const VERS_DIA = versiculoDoDia();
  const saudDia = (() => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; })();
  /* 🔥 Frase de VENDAS do dia (pedido do master: em destaque, abaixo do
     versículo). Gira pelo dia do ano — nunca repete em dias seguidos. Curtas de
     propósito: frase de guerra se lê num relance, não se estuda. */
  const FRASES_VENDA = [
    'Você pode mais! E hoje é o dia de provar.',
    'Você pode ir além das metas!',
    'Vai com fé que você vai conseguir!',
    'Acredita: o seu melhor mês começa hoje!',
    'Você nasceu pra vencer — vai lá e mostra!',
    'Hoje é seu dia de brilhar!',
    'Ninguém segura você quando você decide!',
    'Sua garra vale ouro — usa ela hoje!',
    'Vai dar certo, porque você não desiste!',
    'O impossível é só questão de tentar de novo!',
    'Você é capaz de muito mais do que imagina!',
    'Levanta a cabeça e vai — o dia é seu!',
    'Deus te deu talento: usa ele sem medo!',
    'Confia no seu potencial — ele é enorme!',
    'Você já venceu dias difíceis. Hoje é moleza!',
    'Sonha grande e trabalha firme!',
    'A vitória gosta de quem insiste — insiste!',
    'Você tem tudo pra ser a campeã do mês!',
    'Bora! Seu recorde está esperando por você!',
    'Cada passo seu hoje te leva mais longe!',
    'Não pare agora — você está quase lá!',
    'Sua força é maior que qualquer meta!',
    'Vai com coragem que o resultado vem!',
    'Hoje você vai se surpreender com você mesma!',
    'Meta é só o começo — você vai além!',
    'Seu esforço nunca é em vão. Nunca!',
    'Acredite: você é a diferença desse time!',
    'Um dia de cada vez, uma vitória de cada vez!',
    'Você é mais forte que o desânimo!',
    'Faça hoje o que seu futuro vai agradecer!',
    'Com fé e trabalho, nada te para!',
    'O sucesso está te esperando — vai buscar!',
    'Você foi feita pra coisas grandes!',
    'A sua hora é agora!',
    'Persistência é o seu superpoder!',
    'Sorria: hoje tem vitória com seu nome!',
    'Não duvide de você — nós não duvidamos!',
    'Sua dedicação inspira todo mundo aqui!',
    'Vai lá e faz acontecer!',
    'Você já é vencedora — só falta o mundo ver!',
    'Grandes conquistas começam com um simples "eu consigo"!',
    'Respira fundo e vai: você dá conta!',
    'Seu potencial não tem teto!',
    'Hoje pode ser o melhor dia do seu mês!',
    'Quem acredita, conquista. E você acredita!',
    'Nada como um dia de garra pra mudar tudo!',
    'Você está mais perto do que pensa!',
    'Continue: a recompensa vem a caminho!',
    'Seja a sua melhor versão hoje!',
    'Todo esforço seu está sendo visto!',
    'A meta treme quando você chega!',
    'Seu sorriso abre portas — e fecha vendas!',
    'Coragem! O resto a fé completa!',
    'Você é imparável quando quer!',
    'Faz com amor que o resultado vem em dobro!',
    'O dia é curto, mas a sua vontade é gigante!',
    'Vitória se constrói — e você é ótima construtora!',
    'Se cansar, descansa. Mas não desiste!',
    'Você tem o dom de fazer acontecer!',
    'Confie no processo: você está crescendo!',
    'Cabeça erguida, coração confiante!',
    'O seu limite é bem mais longe do que parece!',
    'Cada "sim" de hoje é fruto da sua fé!',
    'Você merece cada conquista que vier!',
    'Não é sorte — é você sendo excelente!',
    'Vai que hoje é dia de recorde!',
    'Sua energia positiva move essa equipe!',
    'Pequenos passos, grandes vitórias!',
    'Deus abençoa quem faz a parte dele. Faça a sua!',
    'Você é prova de que esforço compensa!',
    'Levanta, sacode a poeira e brilha!',
    'Um novo dia, uma nova chance de vencer!',
    'Seu trabalho muda vidas — que orgulho!',
    'Acredite no seu taco!',
    'Hoje o seu nome vai subir no ranking!',
    'A fé remove montanhas — e bate metas!',
    'Você faz o difícil parecer fácil!',
    'Se foi difícil ontem, hoje você está mais forte!',
    'Ninguém faz o que você faz do jeito que você faz!',
    'Seu futuro está sorrindo pra você!',
    'Vai com tudo: metade da vitória é a atitude!',
    'Você inspira mais gente do que imagina!',
    'A conquista de hoje começa no primeiro bom-dia!',
    'Tem anjo torcendo por você — não decepciona!',
    'Você é a peça que faz esse time ganhar!',
    'Semeia hoje, colhe logo — é lei!',
    'Nada resiste a um dia inteiro da sua dedicação!',
    'O topo combina com você!',
    'Vibra com cada vitória, por menor que pareça!',
    'Sua história de sucesso está sendo escrita hoje!',
    'Enquanto uns esperam, você faz!',
    'Que hoje seja ainda melhor que ontem!',
    'Força, foco e fé — sua fórmula vencedora!',
    'Você chegou até aqui — imagina até onde vai!',
    'O seu empenho é a sua sorte!',
    'Vencer virou hábito seu!',
    'Toda grande vitória começou pequena — continue!',
    'Você tem fé, tem garra, tem tudo!',
    'O dia te espera de braços abertos — vai!',
    'Vai além! Sempre além! Você consegue!',
  ];
  const diaAno = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const fraseVenda = FRASES_VENDA[diaAno % FRASES_VENDA.length];

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
      {SETORES_MENU.filter(s => podeSetor(s.setor))
        .map(s => setorItem(s.to || `/inbox?cls=${s.cls}`, s.cor, s.label, setorCount[s.cls]))}
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
            {/* Foto maior (pedido do master) — é o rosto da pessoa no sistema */}
            <button onClick={()=>setShowAvatarBuilder(true)} title="Foto de perfil (foto própria ou avatar)"
              style={{ background:'none', border:'none', cursor:'pointer', padding:0, borderRadius:'50%', lineHeight:0,
                boxShadow:'0 0 0 3px rgba(255,255,255,.6), 0 4px 14px rgba(0,0,0,.25)' }}>
              <UserAvatar size={76} />
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
              <div style={{ color:'rgba(255,255,255,.85)', fontSize:10.5 }}>{user?.role === 'master' ? '◆ Master' : `${user?.role === 'supervisor' ? '◆ ' : ''}${tituloUsuario(user)}`}<span style={{ marginLeft:6 }}><span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'#3ef58f', marginRight:3, verticalAlign:'1px' }}/>Online</span></div>
            </div>
            {/* ☀️ O bloco pessoal do dia — redesenhado (pedido do master:
                "melhore a visualização"). O que mudou: caixas dentro de caixas
                viraram UM bloco com fios separadores; o versículo ficou curto e
                elegante (2 linhas no máximo, referência na mesma linha); a
                frase dourada é a única com cor própria (é o destaque); e as
                metas são duas linhas varridas num olhar, com a barra por
                último. Menos moldura, mais leitura. */}
            <div style={{ width:'100%', marginTop:4, borderRadius:11, overflow:'hidden',
              background:'rgba(0,0,0,.14)', border:'1px solid rgba(255,255,255,.16)' }}>

              {/* Saudação + versículo */}
              <div style={{ padding:'8px 11px 7px' }}>
                <div style={{ fontSize:13, fontWeight:900, color:'#fff', letterSpacing:.2 }}>
                  {(() => { const h = new Date().getHours();
                    return h < 12 ? `☀️ Bom dia, ${(user?.nome || '').split(' ')[0]}!`
                      : h < 18 ? `🌤️ Boa tarde, ${(user?.nome || '').split(' ')[0]}!`
                      : `🌙 Boa noite, ${(user?.nome || '').split(' ')[0]}!`; })()}
                </div>
                <div title={`“${VERS_DIA[0]}” — ${VERS_DIA[1]}`}
                  style={{ fontSize:10, color:'rgba(255,255,255,.85)', lineHeight:1.45, fontStyle:'italic', marginTop:3,
                    display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                  “{VERS_DIA[0]}”
                </div>
                <div style={{ fontSize:9, color:'rgba(255,255,255,.55)', fontWeight:800, marginTop:1, textAlign:'right' }}>— {VERS_DIA[1]}</div>
              </div>

              {/* 🔥 A frase do dia — o ÚNICO destaque colorido do bloco */}
              <div style={{ padding:'7px 11px', borderTop:'1px solid rgba(255,255,255,.12)',
                background:'linear-gradient(90deg, rgba(252,211,77,.30), rgba(245,158,11,.14))' }}>
                <div style={{ fontSize:10.5, fontWeight:900, color:'#fff', lineHeight:1.4 }}>🔥 {fraseVenda}</div>
              </div>

              {/* 🎯 Metas — duas linhas varridas num olhar */}
              {(() => {
                if (!metaMini?.metaGlobal) return null;
                const lista = (metaMini.porSetor && metaMini.porSetor.length) ? metaMini.porSetor : [metaMini];
                const ind = (metaMini.individual && metaMini.individual.meta > 0) ? metaMini.individual : null;
                const verVal = metaMini.mostra_valores !== false;
                const alvo = ind ? ind.meta : lista.reduce((a3, x) => a3 + (x.metaMinima || 0), 0);
                const feito = ind ? (ind.confirmado || 0) : lista.reduce((a3, x) => a3 + (x.confirmado || 0), 0);
                const falta = Math.max(alvo - feito, 0);
                const pct = alvo ? Math.min((feito / alvo) * 100, 100) : 0;
                const brl = (v) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
                const foco = metaMini.focoDia?.[lista[0]?.setor] || null;
                const focoOk = foco ? foco.every(f => (f.falta ?? 0) === 0) : false;
                const focoTxt = foco ? foco.map(f => (f.falta ?? 0) > 0 ? `falta ${f.falta} ${f.rotulo}` : f.rotulo).join(' ou ') : null;
                const ehConsultas = lista[0]?.setor === 'consultas';
                if (!ind && !verVal && !focoTxt) return null;
                const Linha = ({ icone, rotulo, valor, cor }) => (
                  <div style={{ display:'flex', alignItems:'baseline', gap:6, fontSize:10 }}>
                    <span style={{ flexShrink:0 }}>{icone}</span>
                    <span style={{ color:'rgba(255,255,255,.65)', fontWeight:800, flexShrink:0 }}>{rotulo}</span>
                    {/* Quebra em 2 linhas em vez de cortar com "…" — número
                        cortado é pior que linha dupla */}
                    <span style={{ color: cor || '#fff', fontWeight:900, minWidth:0, lineHeight:1.35 }}>{valor}</span>
                  </div>
                );
                return (
                  <div style={{ padding:'7px 11px 9px', borderTop:'1px solid rgba(255,255,255,.12)', display:'flex', flexDirection:'column', gap:4 }}>
                    {focoTxt && (
                      <Linha icone="🎯" rotulo="Hoje" cor={focoOk ? '#6ee7b7' : '#fff'}
                        valor={focoOk ? `✅ ${focoTxt}` : focoTxt} />
                    )}
                    {(ind || verVal) && alvo > 0 && (
                      <>
                        <Linha icone={ehConsultas ? '📈' : '💰'} rotulo="Mês"
                          cor={pct >= 100 ? '#6ee7b7' : '#fcd34d'}
                          valor={ehConsultas
                            ? `${pct.toFixed(1).replace('.', ',')}% de 100%`
                            : `${brl(feito)} · falta ${brl(falta)}`} />
                        <div style={{ height:5, borderRadius:4, background:'rgba(0,0,0,.3)', overflow:'hidden', marginTop:1 }}>
                          <div style={{ width:`${Math.max(pct, 2)}%`, height:'100%', borderRadius:4,
                            background: pct >= 100 ? '#6ee7b7' : 'linear-gradient(90deg,#f59e0b,#fcd34d)' }} />
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
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
                      <span style={{ display:'block', fontSize:10, color:'var(--muted, #6b7280)' }}>{tituloUsuario(u2)}</span>
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
            && (!n.consultas || podeSetor('consultas'))
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
            if (n.grupo) {
              if (collapsed) return <div key={`g-${n.grupo}`} style={{ height:1, background:'rgba(255,255,255,.18)', margin:'7px 8px' }} />;
              const on = grupoAberto(n.grupo);
              const daTela = n.grupo === grupoAtivo;
              return (
                <button key={`g-${n.grupo}`} onClick={() => alternarGrupo(n.grupo)}
                  title={on ? 'Recolher esta seção' : 'Abrir esta seção'}
                  style={{ display:'flex', alignItems:'center', gap:6, width:'100%', cursor:'pointer',
                    fontSize:9.5, fontWeight:800, letterSpacing:1.4, textTransform:'uppercase',
                    color: daTela ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.55)',
                    padding:'11px 10px 5px', background:'none', border:'none', textAlign:'left' }}>
                  {/* A setinha diz o estado sem precisar ler nada */}
                  <span style={{ display:'inline-block', transition:'transform .18s', transform: on ? 'rotate(90deg)' : 'rotate(0deg)', fontSize:8, opacity:.8 }}>▶</span>
                  <span style={{ flex:1 }}>{n.grupo}</span>
                  {/* Ponto marca a seção da tela aberta — orientação sem texto */}
                  {daTela && <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--tq,#00B8C0)' }} />}
                </button>
              );
            }
            // Item de seção fechada não desenha (menu colapsado mostra tudo)
            if (!collapsed && n.to && grupoDoItem[n.to] && !grupoAberto(grupoDoItem[n.to])) return null;
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

        {/* 🎨 Cor do CRM. O painel usa position:FIXED de propósito: a barra
            lateral inteira tem overflow:hidden, então qualquer coisa que se
            sobreponha a ela é cortada — era por isso que o clique parecia não
            fazer nada. Fixed sai da barra e nada mais o corta. */}
        {!collapsed && paletaCores.length > 0 && (() => {
          const corAtual = corDia === 'auto' || corDia === 'off' ? null : paletaCores[parseInt(corDia)];
          return (
          <>
            <button onClick={() => setPaletaAberta(a => !a)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:7, padding:'8px 10px', marginTop:8,
                borderRadius:12, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.14)',
                cursor:'pointer', color:'#fff' }}>
              <span style={{ width:16, height:16, borderRadius:'50%', flexShrink:0, background: corAtual?.tq || 'conic-gradient(#00B8C0,#7c3aed,#f59e0b,#16a34a,#00B8C0)', border:'1.5px solid rgba(255,255,255,.5)' }} />
              <span style={{ fontSize:11.5, fontWeight:800, flex:1, textAlign:'left', color:'rgba(255,255,255,.92)' }}>Cor do CRM</span>
              <span style={{ fontSize:9.5, fontWeight:700, color:'rgba(255,255,255,.62)' }}>{corDia === 'auto' ? 'do dia' : (corAtual?.nome || '')}</span>
              {paletaAberta ? <ChevronDown size={13} color="rgba(255,255,255,.7)" /> : <ChevronRight size={13} color="rgba(255,255,255,.7)" />}
            </button>

            {paletaAberta && (
              <>
                <div onClick={() => setPaletaAberta(false)} style={{ position:'fixed', inset:0, zIndex:600 }} />
                <div style={{ position:'fixed', left:12, bottom:16, zIndex:601, width:250, maxHeight:'70vh', overflowY:'auto',
                  padding:14, borderRadius:16, background:'var(--card,#fff)', border:'1px solid var(--border,#e2e8f0)',
                  boxShadow:'0 18px 44px rgba(0,0,0,.34)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:11 }}>
                    <span style={{ fontSize:13, fontWeight:800, flex:1, color:'var(--txt,#0f172a)' }}>🎨 Cor do CRM</span>
                    <button onClick={() => setPaletaAberta(false)}
                      style={{ border:'none', background:'var(--bg2,#f1f5f9)', color:'var(--muted,#64748b)', borderRadius:8, padding:'3px 8px', cursor:'pointer', fontSize:12, fontWeight:800 }}>✕</button>
                  </div>

                  <button onClick={() => { onSetCorDia && onSetCorDia('auto'); setPaletaAberta(false); }}
                    style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'9px 11px', marginBottom:10,
                      borderRadius:11, cursor:'pointer', fontSize:12.5, fontWeight:700, textAlign:'left',
                      border: corDia === 'auto' ? '1.5px solid var(--tq)' : '1.5px solid var(--border,#e2e8f0)',
                      background: corDia === 'auto' ? 'var(--tq3,#eef6f7)' : 'var(--card,#fff)',
                      color: corDia === 'auto' ? 'var(--tq2)' : 'var(--txt,#0f172a)' }}>
                    <span style={{ width:20, height:20, borderRadius:'50%', flexShrink:0,
                      background:'conic-gradient(#00B8C0,#7c3aed,#f59e0b,#16a34a,#00B8C0)' }} />
                    <span style={{ flex:1 }}>Cor do dia (automático)</span>
                    {corDia === 'auto' && <span style={{ fontSize:13 }}>✓</span>}
                  </button>

                  {/* 🎨 MONTE A SUA COR (ideia do master): escolhe a família e
                      depois o TOM dentro dela. Cada tom vira uma cor completa —
                      o sistema deriva sozinho o acento escuro, os dois fundos
                      claros e o degradê da barra a partir do tom escolhido. */}
                  <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:1.2, color:'var(--muted,#64748b)', textTransform:'uppercase', marginBottom:7 }}>
                    Escolha a família
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(28px,1fr))', gap:6, marginBottom:12 }}>
                    {paletaCores.map((c, i) => (
                      <button key={i} onClick={() => { setFamilia(c.tq); onSetCorDia && onSetCorDia(c.tq); }} title={c.nome}
                        style={{ width:28, height:28, borderRadius:'50%', cursor:'pointer', padding:0, background:c.tq,
                          border: familia === c.tq ? '3px solid var(--txt,#0f172a)' : '2px solid rgba(0,0,0,.08)',
                          boxShadow: familia === c.tq ? '0 0 0 3px var(--tq3,#eef6f7)' : '0 1px 3px rgba(0,0,0,.14)',
                          transition:'transform .12s' }}
                        onMouseEnter={e => e.currentTarget.style.transform='scale(1.18)'}
                        onMouseLeave={e => e.currentTarget.style.transform='scale(1)'} />
                    ))}
                  </div>

                  <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:1.2, color:'var(--muted,#64748b)', textTransform:'uppercase', marginBottom:7 }}>
                    Agora o tom
                  </div>
                  <div style={{ display:'flex', gap:7, marginBottom:12 }}>
                    {TONS.map(t => {
                      const cor = t.p === 0 ? familia
                        : t.p < 0 ? clarear(familia, -t.p) : escurecer(familia, t.p);
                      const ativo = String(corDia).toLowerCase() === cor.toLowerCase();
                      return (
                        <button key={t.nome} onClick={() => onSetCorDia && onSetCorDia(cor)} title={t.nome}
                          style={{ flex:1, height:44, borderRadius:11, cursor:'pointer', padding:0, background:cor,
                            border: ativo ? '3px solid var(--txt,#0f172a)' : '1.5px solid rgba(0,0,0,.1)',
                            boxShadow: ativo ? '0 0 0 3px var(--tq3,#eef6f7)' : '0 1px 4px rgba(0,0,0,.16)',
                            display:'flex', alignItems:'flex-end', justifyContent:'center', paddingBottom:3,
                            fontSize:8.5, fontWeight:800, color: t.p >= .3 ? '#fff' : 'rgba(0,0,0,.55)', transition:'transform .12s' }}
                          onMouseEnter={e => e.currentTarget.style.transform='translateY(-2px)'}
                          onMouseLeave={e => e.currentTarget.style.transform='none'}>
                          {t.nome}
                        </button>
                      );
                    })}
                  </div>

                  <label style={{ display:'flex', alignItems:'center', gap:9, padding:'9px 11px', borderRadius:11,
                    border:'1.5px dashed var(--border,#cbd5e1)', cursor:'pointer', fontSize:12.5, fontWeight:700, color:'var(--txt,#0f172a)' }}>
                    <input type="color" value={familia}
                      onChange={e => { setFamilia(e.target.value); onSetCorDia && onSetCorDia(e.target.value); }}
                      style={{ width:28, height:28, border:'none', background:'none', padding:0, cursor:'pointer' }} />
                    Escolher qualquer cor
                  </label>

                  <div style={{ display:'flex', alignItems:'center', gap:9, marginTop:12, padding:'9px 11px',
                    borderRadius:11, background:'var(--bg2,#f1f5f9)' }}>
                    <span style={{ width:22, height:22, borderRadius:'50%', flexShrink:0,
                      background: corAtual?.tq || 'conic-gradient(#00B8C0,#7c3aed,#f59e0b,#16a34a,#00B8C0)',
                      border:'2px solid #fff', boxShadow:'0 1px 4px rgba(0,0,0,.2)' }} />
                    <span style={{ flex:1, fontSize:11.5, fontWeight:700, color:'var(--txt,#0f172a)' }}>
                      {corDia === 'auto' ? 'Cor do dia' : 'Aplicada agora'}
                    </span>
                    <button onClick={() => setPaletaAberta(false)}
                      style={{ border:'none', borderRadius:9, padding:'6px 13px', cursor:'pointer',
                        background:'var(--tq)', color:'#fff', fontSize:11.5, fontWeight:800 }}>Pronto</button>
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted,#64748b)', marginTop:8, lineHeight:1.5 }}>
                    Muda na hora enquanto você escolhe. Vale só pra você, neste aparelho.
                  </div>
                </div>
              </>
            )}
          </>
          );
        })()}
      </div>
      {/* Meta agora fica só no Placar do topo (por setor). Removida daqui pra dar
         destaque ao menu e não duplicar a informação. */}
      {/* 🧹 O cartãozinho de saudação+versículo do rodapé subiu pro perfil,
          logo abaixo da foto (pedido do master) — dois bom-dias na mesma
          coluna era repetição. */}
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
