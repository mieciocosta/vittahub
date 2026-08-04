import React, { useEffect, useState, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Users, Kanban, BarChart2,
  LogOut, Settings, Smartphone, Sun, Moon, ChevronLeft, ChevronRight,
  CalendarClock, CalendarDays, Bell, CheckCheck, UserPlus, Shield,
  Gift, Bot, Image, FileText, Smile, Phone, Star, Database, Stethoscope, Target,
  Trophy, GraduationCap, Rocket, Wallet, Palette, Gamepad2, Heart, LayoutGrid, Pencil, Flame,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../context/AuthContext.jsx';
import { setToken } from '../hooks/api.js';
import { fmt } from '../hooks/utils.js';
import AvatarBuilder from './AvatarBuilder.jsx';

// Atalhos coloridos por classificação → abrem o chat filtrado (?cls=).
// Fidelidade abre a PASTA (as conversas dela saem do inbox).
const SETORES_MENU = [
  { cls:'vacinacao',       label:'Vacinação',       cor:'#7c5cbf', to:'/vacinacao' },
  { cls:'planos_vacinais', label:'Planos Vacinais', cor:'#3b82f6', to:'/planos-vacinais' },
  { cls:'consultas',       label:'Consultas',       cor:'#00B8C0', to:'/consultas' },
  { cls:'terapias',        label:'Terapias',        cor:'#C4973B', to:'/terapias' },
  { cls:'fidelidade',      label:'Fidelidade',      cor:'#eab308', to:'/fidelidade' },
];

const NAV = [
  { to:'/',           icon:LayoutDashboard, label:'Resumo' },
  { to:'/meu-painel', icon:LayoutGrid,      label:'Meu Painel' },
  { to:'/cases-sucesso', icon:Trophy,       label:'Cases de Sucesso' },
  { to:'/planejamento', icon:Rocket,        label:'Planejamento', lider:true, plan:true },
  { to:'/quiz',       icon:Gamepad2,        label:'Quiz de Vendas' },
  { to:'/inbox',      icon:MessageSquare,   label:'Chat',     unread:true },
  { to:'/amigo',      icon:Heart,           label:'Meu Amigo' },
  { to:'/equipe',     icon:Users,           label:'Chat da Equipe', equipe:true },
  { to:'/leads',      icon:Users,           label:'Clientes' },
  { to:'/banco-dados',icon:Database,        label:'Banco de Dados' },
  { to:'/funil',      icon:Kanban,          label:'Organização' },
  { to:'/recuperacao',icon:Flame,           label:'Recuperação' },
  { to:'/retornos',   icon:Bell,            label:'Follow-up',  retornos:true },
  { to:'/agenda',     icon:CalendarDays,    label:'Agenda' },
  { to:'/metas',      icon:Target,          label:'Metas', masterOnly:true },
  { to:'/caixa',      icon:Wallet,          label:'Caixa' },
  { to:'/profissionais', icon:Stethoscope,  label:'Profissionais', consultas:true },
  { to:'/relatorios', icon:BarChart2,       label:'Relatórios' },
  { to:'/cursos',     icon:GraduationCap,   label:'Cursos' },
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

export default function Sidebar({ unread = 0, theme = 'light', onToggleTheme, collapsed = false, onToggleCollapse, mobileOpen = false, onCloseMobile, corDia = 'auto', onSetCorDia, paletaCores = [] }) {
  const { user, setUser, logout, isMaster } = useAuth();
  // 👥 TROCA-RÁPIDA DE USUÁRIO (master): de qualquer tela, vira outro usuário.
  // Usa sempre o token do master (guardado ao impersonar) — dá pra pular direto
  // de um usuário pro outro sem "voltar" antes.
  const [trocaOpen, setTrocaOpen] = useState(false);
  const [trocaUsers, setTrocaUsers] = useState([]);
  const ehDono = /mi[eé]cio/i.test(`${user?.nome || ''} ${user?.email || ''}`);
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
  const [showAvatarBuilder, setShowAvatarBuilder] = useState(false);
  const [paletaAberta, setPaletaAberta] = useState(false);
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
  const [metaMini, setMetaMini] = useState(null);
  useEffect(() => {
    api.get('/extras/meta-setor').then(setMetaMini).catch(() => {});
  }, []); // eslint-disable-line

  // Versículo do dia — ±100 versos sobre fé, amor, perseverança, esperança,
  // coragem, paz, sabedoria e gratidão; roda pelo dia do ano, sem repetir na semana.
  const VERS_DIA = (() => {
    const V = [['Entrega o teu caminho ao Senhor; confia nele, e ele o fará.','Salmos 37:5'],['Tudo posso naquele que me fortalece.','Filipenses 4:13'],['O Senhor é o meu pastor; nada me faltará.','Salmos 23:1'],['Não temas, porque eu sou contigo.','Isaías 41:10'],['Confia no Senhor de todo o teu coração.','Provérbios 3:5'],['Porque para Deus nada é impossível.','Lucas 1:37'],['A fé é a certeza das coisas que se esperam.','Hebreus 11:1'],['Se Deus é por nós, quem será contra nós?','Romanos 8:31'],['Tudo é possível ao que crê.','Marcos 9:23'],['Buscai primeiro o Reino de Deus, e todas estas coisas vos serão acrescentadas.','Mateus 6:33'],['O justo viverá pela fé.','Romanos 1:17'],['Sem fé é impossível agradar a Deus.','Hebreus 11:6'],['Andamos por fé, e não por vista.','2 Coríntios 5:7'],['Se tiverdes fé como um grão de mostarda, nada vos será impossível.','Mateus 17:20'],['Eu sei em quem tenho crido.','2 Timóteo 1:12'],['Crê no Senhor Jesus e serás salvo, tu e a tua casa.','Atos 16:31'],['A minha alma espera somente em Deus; dele vem a minha salvação.','Salmos 62:1'],['Clama a mim, e responder-te-ei.','Jeremias 33:3'],['Pedi, e dar-se-vos-á; buscai e encontrareis.','Mateus 7:7'],['O Senhor é fiel; ele vos confirmará e guardará do maligno.','2 Tessalonicenses 3:3'],['O amor é paciente, o amor é bondoso.','1 Coríntios 13:4'],['Amarás o teu próximo como a ti mesmo.','Marcos 12:31'],['Nós amamos porque ele nos amou primeiro.','1 João 4:19'],['O amor cobre uma multidão de pecados.','1 Pedro 4:8'],['Agora permanecem a fé, a esperança e o amor; o maior destes é o amor.','1 Coríntios 13:13'],['Deus é amor.','1 João 4:8'],['Ninguém tem maior amor do que este: dar a vida pelos seus amigos.','João 15:13'],['Que tudo entre vós seja feito com amor.','1 Coríntios 16:14'],['Amai-vos uns aos outros como eu vos amei.','João 13:34'],['Deus amou o mundo de tal maneira que deu o seu Filho unigênito.','João 3:16'],['O amor jamais acaba.','1 Coríntios 13:8'],['Acima de tudo, revesti-vos do amor, que é o vínculo da perfeição.','Colossenses 3:14'],['Nada nos poderá separar do amor de Deus.','Romanos 8:39'],['Sobre tudo o que se deve guardar, guarda o teu coração.','Provérbios 4:23'],['Em toda ocasião ama o amigo; na angústia, nasce o irmão.','Provérbios 17:17'],['Não nos cansemos de fazer o bem; a seu tempo ceifaremos.','Gálatas 6:9'],['Corramos com perseverança a carreira que nos está proposta.','Hebreus 12:1'],['Combati o bom combate, acabei a carreira, guardei a fé.','2 Timóteo 4:7'],['Bem-aventurado o homem que persevera na provação.','Tiago 1:12'],['A tribulação produz perseverança; a perseverança, um caráter aprovado.','Romanos 5:3-4'],['Os que esperam no Senhor renovam as suas forças; sobem com asas como águias.','Isaías 40:31'],['Sede firmes e constantes, sempre abundantes na obra do Senhor.','1 Coríntios 15:58'],['O choro pode durar uma noite, mas a alegria vem pela manhã.','Salmos 30:5'],['O vosso trabalho no Senhor não é em vão.','1 Coríntios 15:58'],['Ainda que eu ande pelo vale da sombra da morte, não temerei mal algum.','Salmos 23:4'],['Depois de terdes sofrido um pouco, ele mesmo vos aperfeiçoará e fortalecerá.','1 Pedro 5:10'],['Esforçai-vos, e ele fortalecerá o vosso coração, vós todos que esperais no Senhor.','Salmos 31:24'],['Deus enxugará dos seus olhos toda lágrima.','Apocalipse 21:4'],['Semeiam com lágrimas os que com júbilo ceifarão.','Salmos 126:5'],['Persevera; a tua recompensa não será cortada.','Provérbios 23:18'],['Eu sei os planos que tenho para vós: planos de paz, e não de mal.','Jeremias 29:11'],['A esperança não decepciona.','Romanos 5:5'],['O Senhor é bom para os que esperam nele.','Lamentações 3:25'],['Espera no Senhor, anima-te, e ele fortalecerá o teu coração.','Salmos 27:14'],['Aquietai-vos e sabei que eu sou Deus.','Salmos 46:10'],['Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia.','Salmos 46:1'],['Lança o teu cuidado sobre o Senhor, e ele te susterá.','Salmos 55:22'],['Vinde a mim, todos os que estais cansados, e eu vos aliviarei.','Mateus 11:28'],['A minha graça te basta.','2 Coríntios 12:9'],['Todas as coisas cooperam para o bem daqueles que amam a Deus.','Romanos 8:28'],['O Senhor completará o que começou em mim.','Salmos 138:8'],['Aquele que começou boa obra em vós há de completá-la.','Filipenses 1:6'],['As misericórdias do Senhor se renovam a cada manhã.','Lamentações 3:22-23'],['Este é o dia que o Senhor fez; regozijemo-nos e alegremo-nos nele.','Salmos 118:24'],['Eis que faço uma coisa nova; agora sairá à luz.','Isaías 43:19'],['Sê forte e corajoso; não temas, porque o Senhor é contigo.','Josué 1:9'],['O Senhor é a minha luz e a minha salvação; a quem temerei?','Salmos 27:1'],['No mundo tereis aflições; mas tende bom ânimo, eu venci o mundo.','João 16:33'],['Deus não nos deu espírito de covardia, mas de poder, de amor e de moderação.','2 Timóteo 1:7'],['O Senhor pelejará por vós, e vós vos calareis.','Êxodo 14:14'],['Maior é o que está em vós do que o que está no mundo.','1 João 4:4'],['Com Deus faremos proezas.','Salmos 60:12'],['O nome do Senhor é torre forte; o justo corre para ela e está seguro.','Provérbios 18:10'],['Quando estou fraco, então é que sou forte.','2 Coríntios 12:10'],['Levanto os meus olhos para os montes; o meu socorro vem do Senhor.','Salmos 121:1-2'],['Ainda que a figueira não floresça, eu me alegrarei no Senhor.','Habacuque 3:17-18'],['Não temas; eu te ajudo, diz o Senhor.','Isaías 41:13'],['Deixo-vos a paz; a minha paz vos dou.','João 14:27'],['A paz de Deus excede todo o entendimento.','Filipenses 4:7'],['Não se turbe o vosso coração; credes em Deus, crede também em mim.','João 14:1'],['Não andeis ansiosos por coisa alguma; em tudo, orai com ações de graças.','Filipenses 4:6'],['Tu conservarás em paz aquele cuja mente está firmada em ti.','Isaías 26:3'],['Bem-aventurados os pacificadores, porque serão chamados filhos de Deus.','Mateus 5:9'],['Em paz me deito e logo pego no sono, porque só tu, Senhor, me fazes repousar seguro.','Salmos 4:8'],['Se algum de vós tem falta de sabedoria, peça-a a Deus, que a todos dá.','Tiago 1:5'],['Tudo o que fizerdes, fazei-o de todo o coração, como ao Senhor.','Colossenses 3:23'],['A resposta branda desvia o furor.','Provérbios 15:1'],['Melhor é o fim das coisas do que o seu princípio.','Eclesiastes 7:8'],['Tudo tem o seu tempo determinado debaixo do céu.','Eclesiastes 3:1'],['Lâmpada para os meus pés é a tua palavra, e luz para o meu caminho.','Salmos 119:105'],['O temor do Senhor é o princípio da sabedoria.','Provérbios 9:10'],['Confia ao Senhor as tuas obras, e os teus planos serão estabelecidos.','Provérbios 16:3'],['A mão dos diligentes enriquece.','Provérbios 10:4'],['Foste fiel no pouco; sobre o muito te colocarei.','Mateus 25:21'],['Em tudo dai graças.','1 Tessalonicenses 5:18'],['Alegrai-vos sempre no Senhor; outra vez digo: alegrai-vos.','Filipenses 4:4'],['Rendei graças ao Senhor, porque ele é bom.','Salmos 107:1'],['A alegria do Senhor é a vossa força.','Neemias 8:10'],['Bendize, ó minha alma, ao Senhor, e não te esqueças de nenhum de seus benefícios.','Salmos 103:2'],['Provai e vede que o Senhor é bom.','Salmos 34:8'],['Deleita-te no Senhor, e ele concederá os desejos do teu coração.','Salmos 37:4'],['O coração alegre é como o bom remédio.','Provérbios 17:22'],['Grandes coisas fez o Senhor por nós, por isso estamos alegres.','Salmos 126:3'],['Mais bem-aventurado é dar do que receber.','Atos 20:35'],['Deus ama a quem dá com alegria.','2 Coríntios 9:7'],['Sede uns para com os outros benignos e compassivos.','Efésios 4:32'],['Assim brilhe a vossa luz diante dos homens.','Mateus 5:16'],['Como quereis que os homens vos façam, fazei-o também a eles.','Lucas 6:31'],['Eu e a minha casa serviremos ao Senhor.','Josué 24:15'],['O Senhor te abençoe e te guarde.','Números 6:24']];
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
      {SETORES_MENU.map(s => setorItem(s.to || `/inbox?cls=${s.cls}`, s.cor, s.label, setorCount[s.cls]))}
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

      {/* Nav */}
      <nav onClick={() => onCloseMobile?.()} style={{ flex:1, padding: collapsed ? '14px 6px' : '14px 10px', display:'flex', flexDirection:'column', gap:3, overflowY:'auto', overflowX:'hidden' }}>
        {!collapsed && <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:1.6, color:'rgba(255,255,255,.62)', padding:'0 12px 6px', textTransform:'uppercase' }}>Menu</div>}
        {NAV.filter(n => (!n.masterOnly || user?.role === 'master')
            && (!n.consultas || ['master','supervisor'].includes(user?.role) || user?.setor === 'consultas')
            && (!n.lider || user?.lider || user?.role === 'master')
          ).map(({ to, icon:Icon, label, unread:showU, retornos:retBadge, equipe:eqBadge, plan:planBadge }) => (
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
            <button onClick={()=>setShowAvatarBuilder(true)} title="Foto de perfil (foto própria ou avatar)" style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
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
            <button onClick={()=>setShowAvatarBuilder(true)} title="Foto de perfil (foto própria ou avatar)" style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
              <UserAvatar size={34} />
            </button>
            <div style={{ flex:1, minWidth:0 }}>
              <button onClick={editarNome} title="Editar meu nome" style={{ background:'none', border:'none', padding:0, cursor:'pointer', display:'flex', alignItems:'center', gap:4, maxWidth:'100%' }}>
                <span style={{ color:'#fff', fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.nome?.split(' ')[0]}</span>
                <Pencil size={10} color="rgba(255,255,255,.55)" style={{ flexShrink:0 }} />
              </button>
              {nomeOpen && (
                <div style={{ position:'fixed', bottom:64, left:12, zIndex:9999, background:'var(--card, #fff)', border:'1px solid var(--border, #e5e7eb)', borderRadius:14, boxShadow:'0 12px 40px rgba(0,0,0,.35)', padding:12, width:240 }}>
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
              <div style={{ color:'rgba(255,255,255,.85)', fontSize:10.5 }}>{user?.role === 'master' ? '◆ Master' : user?.role === 'supervisor' ? '◆ Supervisora' : 'Atendente'}<span style={{ marginLeft:6 }}><span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'#3ef58f', marginRight:3, verticalAlign:'1px' }}/>Online</span></div>
            </div>
            {podeTrocar && (
              <button onClick={abrirTroca} title="Trocar de usuário (entrar como)" style={{ padding:6, background: trocaOpen ? 'rgba(255,255,255,.25)' : 'none', color:'#fff', borderRadius:6, cursor:'pointer', border:'none' }}>
                <Users size={13} />
              </button>
            )}
            {trocaOpen && (
              <div style={{ position:'fixed', bottom:64, left:12, zIndex:9999, background:'var(--card, #fff)', border:'1px solid var(--border, #e5e7eb)', borderRadius:14, boxShadow:'0 12px 40px rgba(0,0,0,.35)', padding:10, width:230, maxHeight:340, overflowY:'auto' }}>
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
                      <span style={{ display:'block', fontSize:10, color:'var(--muted, #6b7280)' }}>{u2.role==='master'?'Master':u2.role==='supervisor'?'Supervisora':'Atendente'}{u2.setor?` · ${u2.setor}`:''}</span>
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
        )}

        {/* Paleta de cores — compacta: 1 linha, abre só ao clicar (não rouba espaço do menu) */}
        {!collapsed && paletaCores.length > 0 && (() => {
          const corAtual = corDia === 'auto' || corDia === 'off' ? null : paletaCores[parseInt(corDia)];
          return (
          <div style={{ marginTop:8, borderRadius:12, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.14)', overflow:'hidden' }}>
            <button onClick={() => setPaletaAberta(a => !a)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:7, padding:'7px 10px', background:'none', border:'none', cursor:'pointer', color:'#fff' }}>
              <span style={{ width:15, height:15, borderRadius:'50%', flexShrink:0, background: corAtual?.tq || 'conic-gradient(#00B8C0,#7c3aed,#f59e0b,#16a34a,#00B8C0)', border:'1.5px solid rgba(255,255,255,.5)' }} />
              <span style={{ fontSize:11, fontWeight:800, flex:1, textAlign:'left', color:'rgba(255,255,255,.9)' }}>Cor do CRM</span>
              <span style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,.6)' }}>{corDia === 'auto' ? 'do dia' : (corAtual?.nome || '')}</span>
              {paletaAberta ? <ChevronDown size={13} color="rgba(255,255,255,.7)" /> : <ChevronRight size={13} color="rgba(255,255,255,.7)" />}
            </button>
            {paletaAberta && (
              <div style={{ padding:'0 10px 10px' }}>
                <button onClick={() => onSetCorDia && onSetCorDia('auto')} title="Trocar automaticamente a cada dia"
                  style={{ fontSize:9.5, fontWeight:800, padding:'3px 9px', borderRadius:20, cursor:'pointer', marginBottom:8,
                    border: corDia === 'auto' ? '1px solid #fff' : '1px solid rgba(255,255,255,.3)',
                    background: corDia === 'auto' ? 'rgba(255,255,255,.9)' : 'transparent',
                    color: corDia === 'auto' ? '#0a1622' : 'rgba(255,255,255,.85)' }}>
                  ✨ Cor do dia (automático)
                </button>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {paletaCores.map((c, i) => {
                    const ativo = String(corDia) === String(i);
                    return (
                      <button key={i} onClick={() => onSetCorDia && onSetCorDia(String(i))} title={c.nome}
                        style={{ width:20, height:20, borderRadius:'50%', cursor:'pointer', padding:0, background:c.tq,
                          border: ativo ? '2px solid #fff' : '2px solid rgba(255,255,255,.25)',
                          boxShadow: ativo ? '0 0 0 2px rgba(255,255,255,.35)' : 'none', transition:'transform .12s' }}
                        onMouseEnter={e => e.currentTarget.style.transform='scale(1.15)'}
                        onMouseLeave={e => e.currentTarget.style.transform='scale(1)'} />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          );
        })()}
      </div>
      {/* Meta agora fica só no Placar do topo (por setor). Removida daqui pra dar
         destaque ao menu e não duplicar a informação. */}
      {!collapsed && (
        <div style={{ margin:'0 12px 10px', padding:'10px 13px', borderRadius:13, background:'rgba(255,255,255,.14)', border:'1px solid rgba(255,255,255,.22)' }}>
          <div style={{ fontSize:11.5, fontWeight:800, color:'#fff', marginBottom:3 }}>{saudDia}, {(user?.nome||'').split(' ')[0]}! ☀️</div>
          <div style={{ fontSize:9.5, color:'rgba(255,255,255,.85)', lineHeight:1.45, fontStyle:'italic' }}>“{VERS_DIA[0]}”</div>
          <div style={{ fontSize:9, color:'rgba(255,255,255,.6)', marginTop:2, fontWeight:700 }}>{VERS_DIA[1]}</div>
        </div>
      )}
      {showAvatarBuilder && <AvatarBuilder onClose={() => setShowAvatarBuilder(false)} />}
    </aside>
  );
}
