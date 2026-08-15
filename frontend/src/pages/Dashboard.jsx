import React, { useEffect, useState } from 'react';
import { MessageSquare, HeartPulse, CalendarCheck, CircleDollarSign, Bell, ChevronRight, Plus, Syringe, UserPlus, ClipboardList, Send, Phone } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt, tituloUsuario } from '../hooks/utils.js';
import { versiculoDoDia } from '../hooks/versiculos.js';
import MinhaEquipe from '../components/MinhaEquipe.jsx';
import { useNavigate } from 'react-router-dom';

/* ─── Dashboard Vittalis — layout aprovado pela gestão ────────────────────────
   Tudo aqui é DADO REAL do CRM. A "Agenda — Hoje" usa os retornos/follow-ups
   com data de hoje (o módulo de Agenda dedicado entra na próxima fase e este
   card já está pronto pra recebê-lo).                                        */

// "Hoje" no fuso LOCAL (São Luís): toISOString() é UTC e, depois das 21h,
// pulava pro dia seguinte — a "Agenda — Hoje" mostrava a agenda de amanhã.
const hojeLocalISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const MOTIVACIONAIS = [
  'Você está indo muito bem hoje! Cada atendimento representa uma família confiando na Vittalis. Continue assim, você faz a diferença! 💙',
  'Cada mensagem respondida com carinho hoje é uma família mais protegida amanhã. 💙',
  'Seu cuidado no atendimento é o que transforma clientes em famílias da Vittalis. ✨',
  'Por trás de cada conversa existe uma mãe ou um pai buscando o melhor pro filho — e encontrando você. 💙',
  'A diferença entre um atendimento comum e um atendimento Vittalis é o seu toque humano. ✨',
  'Cada proposta enviada hoje é uma semente. Continue plantando! 🌱',
  'Atendimento humanizado não é técnica — é o que você faz naturalmente todos os dias. 💙',
  'Cada criança vacinada começou com uma conversa como as que você está tendo agora. 💉',
  'Hoje alguém vai escolher a Vittalis por causa do SEU atendimento. 🏆',
  'Constância vence talento. E você tem os dois! ✨',
];

const ETAPAS_VACINAS = ['Novo Lead', 'Em Atendimento', 'Orçamento Enviado', 'Negociação', 'Venda Fechada', 'Agendado', 'Vacinado', 'Pós-Vacinal', 'Reagendamento Futuro'];
const CORES_FUNIL = ['#00B8C0', '#0E8C96', '#3b82f6', '#7c5cbf', '#0fb07a', '#C4973B', '#f59e0b', '#ec4899', '#e84040'];

export default function Dashboard() {
  const api = useApi();
  const { user, isMaster } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);

  const [agendaHoje, setAgendaHoje] = useState([]);
  const [agMeta, setAgMeta] = useState(null);
  const [prod, setProd] = useState(null);   // 📊 produção individual (só a própria)

  /* 👤 Troca de usuário a partir do cartão do topo. O token do MASTER é sempre
     o usado: já dentro da conta de outra pessoa, o token corrente é dela e não
     serviria nem pra listar a equipe nem pra pular pra próxima. */
  const [trocaAberta, setTrocaAberta] = useState(false);
  const [equipeTroca, setEquipeTroca] = useState([]);
  const podeTrocar = user?.dono === true || !!localStorage.getItem('vh_token_master');
  const tokenMaster = () => localStorage.getItem('vh_token_master') || localStorage.getItem('vh_token') || '';
  useEffect(() => {
    if (!podeTrocar || !trocaAberta || equipeTroca.length) return;
    const BASE = import.meta.env.VITE_API_URL || '';
    fetch(`${BASE}/api/auth/usuarios`, { headers: { Authorization: `Bearer ${tokenMaster()}` } })
      .then(r => r.json())
      .then(d => setEquipeTroca(Array.isArray(d) ? d.filter(u => u.ativo !== false) : []))
      .catch(() => setEquipeTroca([]));
  }, [trocaAberta, podeTrocar]); // eslint-disable-line
  const entrarComoUsuario = async (id) => {
    try {
      const BASE = import.meta.env.VITE_API_URL || '';
      const resp = await fetch(`${BASE}/api/auth/impersonar/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenMaster()}` },
      });
      const r = await resp.json();
      if (!resp.ok) throw new Error(r.error || 'Não foi possível trocar.');
      if (!localStorage.getItem('vh_token_master')) localStorage.setItem('vh_token_master', localStorage.getItem('vh_token') || '');
      localStorage.setItem('vh_token', r.token);
      window.location.href = '/';
    } catch (e) { window.alert('Erro: ' + e.message); }
  };
  const voltarMeuUsuario = () => {
    const mk = localStorage.getItem('vh_token_master');
    if (mk) { localStorage.setItem('vh_token', mk); localStorage.removeItem('vh_token_master'); window.location.href = '/'; }
  };
  const [vendasResumo, setVendasResumo] = useState(null);
  const [atencao, setAtencao] = useState(null);
  const [metaSetor, setMetaSetor] = useState(null);
  const [vittaHoje, setVittaHoje] = useState(null);
  const [foco, setFoco] = useState(null);   // 🎯 fila de prioridade do dia
  const [comp, setComp] = useState(null);   // 📈 este mês x mês passado
  useEffect(() => {
    api.get('/reports/dashboard').then(setData).catch(() => {});
    api.get(`/extras/agenda?data=${hojeLocalISO()}`).then(d => setAgendaHoje(Array.isArray(d) ? d : [])).catch(() => {});
    api.get('/extras/agenda/meta').then(setAgMeta).catch(() => {});
    api.get('/extras/meta-setor').then(setMetaSetor).catch(() => {});
    api.get('/extras/vitta-hoje').then(setVittaHoje).catch(() => {});
    api.get('/extras/foco-hoje').then(setFoco).catch(() => {});
    api.get('/extras/minha-producao').then(setProd).catch(() => {});
    // Comparativo soma a clínica inteira → só o dono (a supervisora vê o setor dela no placar)
    if (isMaster) api.get('/extras/comparativo-mes').then(setComp).catch(() => {});
    if (isMaster) api.get('/extras/vendas/resumo').then(setVendasResumo).catch(() => {}); // painel comercial é só do master
    const loadAt = () => api.get('/inbox/atencao-agora').then(setAtencao).catch(() => {});
    loadAt(); const t = setInterval(loadAt, 20000); return () => clearInterval(t);
  }, []); // eslint-disable-line

  const hoje = new Date();
  const hora = hoje.getHours();
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const diaAno = Math.floor((hoje - new Date(hoje.getFullYear(), 0, 0)) / 86400000);
  const [verso, ref] = versiculoDoDia();
  const motivacional = MOTIVACIONAIS[diaAno % MOTIVACIONAIS.length];
  const nome = (user?.nome || '').split(' ')[0];
  const papel = tituloUsuario(user);

  if (!data) return <div style={{ padding: 40, color: 'var(--muted)' }}>Carregando seu dia…</div>;

  const { resumo = {}, porStatus = [], followups = [], porResponsavel = [], impacto, funil = [], porSetorConv = [] } = data;
  const fupsHoje = followups.filter(f => f.data_retorno === hojeLocalISO());
  const fupsVencidos = followups.filter(f => f.data_retorno < hojeLocalISO());
  const maxFunil = Math.max(...funil.map(f => f.n), 1);
  const setorEmoji = { vacinas: '💉', consultas: '🩺', terapias: '🧩', 'sem setor': '📥' };
  // Meta GERAL do mês (todos os setores somados) + quebras por setor e atendente
  const mg = vendasResumo?.total || null;
  const setoresV = vendasResumo?.setores || null;
  const porAtend = vendasResumo?.porAtendente || [];
  const SET_INFO = [['vacinas', '💉 Vacinas', '#7c5cbf'], ['consultas', '🩺 Consultas', '#00B8C0'], ['terapias', '🧩 Terapias', '#C4973B']];
  const proxMarcoG = mg ? [25, 50, 75, 100].find(m => m > (mg.pct || 0)) : null;
  const maxAtend = Math.max(...porAtend.map(a => a.confirmado || 0), 1);

  const kpis = [
    { Icon: MessageSquare, label: 'Conversas não lidas', valor: resumo.totalUnread || 0, sub: 'Precisam de atenção', go: '/inbox' },
    { Icon: MessageSquare, label: 'Aguardando resposta', valor: data.conversas?.aguardando || 0, sub: 'Cliente falou por último', go: '/inbox' },
    { Icon: CalendarCheck, label: 'Agendamentos hoje', valor: data.agenda?.hoje ?? agendaHoje.length, sub: 'Na agenda de hoje', go: '/agenda' },
    { Icon: CalendarCheck, label: 'Próximos agendamentos', valor: data.agenda?.proximos || 0, sub: 'A confirmar / realizar', go: '/agenda' },
    { Icon: CalendarCheck, label: 'Agendados no mês 🎯', valor: agMeta ? (agMeta.alvo ? `${agMeta.feitos}/${agMeta.alvo}` : agMeta.feitos) : '—', sub: agMeta?.alvo ? `Meta: ${agMeta.pct ?? 0}% alcançada` : 'Defina o alvo nas Configurações', go: '/agenda' },
    { Icon: Bell, label: 'Follow-ups pendentes', valor: followups.length, sub: 'Retornos programados', go: '/retornos' },
  ];

  /* Atalho do sistema de origem conforme o SETOR (pedido do master): quem é de
     vacina registra no Vittasys, quem é de consulta/terapia no VittaMed. Antes
     "Registrar vacina" aparecia pra todo mundo — inclusive pra Danielle. */
  const meusSetores = (Array.isArray(user?.setores) && user.setores.length) ? user.setores : [user?.setor].filter(Boolean);
  const podeSetor = (s) => user?.role === 'master' || meusSetores.includes(s);
  const acoes = [
    { Icon: MessageSquare, label: 'Nova conversa', go: '/inbox' },
    { Icon: UserPlus, label: 'Novo cliente', go: '/leads' },
    { Icon: Send, label: 'Enviar orçamento', go: '/inbox' },
    ...(podeSetor('vacinas') ? [{ Icon: Syringe, label: 'Registrar vacina', href: 'https://vittasys.vittalissaude.com.br' }] : []),
    { Icon: ClipboardList, label: 'Nova tarefa', go: '/retornos' },
  ];

  return (
    <div style={{ padding: '0 0 28px' }}>

      {/* ── Faixa superior: saudação + versículo + meta mini + perfil ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
        padding: '16px 28px', background: 'var(--card)', borderBottom: '1px solid var(--border)', marginBottom: 22 }}>
        <div style={{ minWidth: 200 }}>
          <div style={{ fontWeight: 800, fontSize: 21 }}>{saud}, {nome}! {hora < 12 ? '☀️' : hora < 18 ? '🌤️' : '🌙'}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Que seu dia seja abençoado e produtivo!</div>
        </div>
        <div style={{ flex: 1, minWidth: 260, display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 13, background: 'var(--tq4)', border: '1px solid var(--tq3)' }}>
          <span style={{ fontSize: 17, color: 'var(--tq)', fontWeight: 900, lineHeight: 1 }}>“</span>
          <div style={{ fontSize: 12.5, color: 'var(--txt2)' }}>
            {verso} <b style={{ color: 'var(--tq2)' }}>{ref}</b>
          </div>
        </div>
        {isMaster && mg && (
          <div style={{ minWidth: 190 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>
              <span style={{ color: 'var(--muted)' }}>Meta do mês — Geral</span>
              <span style={{ color: 'var(--tq2)', fontSize: 14 }}>{Math.round(mg.pct || 0)}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 6, background: 'var(--tq4)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(mg.pct || 0, 100)}%`, height: '100%', background: 'linear-gradient(90deg,var(--tq),var(--pet))', borderRadius: 6 }} />
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 }}>{fmt.brl(mg.confirmado)} / {fmt.brl(mg.meta)}</div>
          </div>
        )}
        {/* Cartão do usuário. Pra quem pode trocar de conta, ele vira o próprio
            seletor: clica no nome e escolhe em quem entrar (pedido do master —
            ele quer isso aqui em cima, não escondido na lateral). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
          {user?.avatar
            ? <img src={user.avatar} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--tq)' }} />
            : <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,var(--tq),var(--pet))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 19 }}>{fmt.initials(user?.nome)}</div>}
          <div>
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>{nome}</div>
            {podeTrocar ? (
              <button onClick={() => setTrocaAberta(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, padding: '2px 8px', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--tq2)',
                  fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
                {papel} · trocar ▾
              </button>
            ) : <div style={{ fontSize: 11, color: 'var(--muted)' }}>{papel}</div>}
          </div>

          {trocaAberta && (
            <div style={{ position: 'absolute', top: 48, right: 0, zIndex: 300, width: 240, maxHeight: 330, overflowY: 'auto',
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 13, boxShadow: 'var(--s4,0 12px 34px rgba(0,0,0,.22))', padding: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .6, padding: '3px 7px 7px' }}>
                Entrar como…
              </div>
              {localStorage.getItem('vh_token_master') && (
                <button onClick={voltarMeuUsuario}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 9, border: 'none',
                    cursor: 'pointer', background: '#f5f3ff', color: '#7c3aed', fontWeight: 800, fontSize: 12, marginBottom: 5 }}>
                  ↩️ Voltar ao meu usuário
                </button>
              )}
              {!equipeTroca.length && <div style={{ fontSize: 12, color: 'var(--muted)', padding: 8 }}>Carregando…</div>}
              {equipeTroca.filter(u => u.id !== user?.id).map(u => (
                <button key={u.id} onClick={() => entrarComoUsuario(u.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 8px',
                    borderRadius: 9, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--txt)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--tq3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: u.cor || 'var(--tq)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                    {(u.nome || '?').slice(0, 1)}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.nome}</span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--muted)' }}>
                      {u.role === 'master' ? 'Master' : u.role === 'supervisor' ? 'Supervisora' : 'Atendente'}{u.setor ? ` · ${u.setor}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '0 28px' }}>

        {/* ── 👥 SUA EQUIPE — em destaque, no topo (pedido do master): o segundo
               papel da supervisora, que não aparecia em lugar nenhum. Vem antes
               do foco do dia de propósito: construir o time rende mais que
               qualquer tarefa avulsa. Some pra quem não tem time. ── */}
        <MinhaEquipe />

        {/* ── 🎯 MEU FOCO DE HOJE — o que fazer AGORA, em ordem de chance de vender ── */}
        {foco && foco.itens?.length > 0 && (
          <div className="card" style={{ padding: 0, marginBottom: 20, overflow: 'hidden', border: '1.5px solid var(--tq3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: 'linear-gradient(90deg,#0E8C96,#00B8C0)', color: '#fff' }}>
              <span style={{ fontSize: 17 }}>🎯</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>Meu foco de hoje</div>
                <div style={{ fontSize: 11, opacity: .9 }}>Na ordem certa: quem tem mais chance de fechar aparece primeiro</div>
              </div>
              <span style={{ background: 'rgba(255,255,255,.22)', borderRadius: 20, padding: '3px 11px', fontSize: 11.5, fontWeight: 800 }}>{foco.total} pra hoje</span>
            </div>
            <div style={{ maxHeight: 330, overflowY: 'auto' }}>
              {(foco.itens || []).map((it, i) => (
                <div key={i} onClick={() => it.conv_id ? nav(`/inbox?conv=${it.conv_id}`) : it.telefone ? nav(`/inbox?phone=${String(it.telefone).replace(/\D/g, '')}`) : nav('/agenda')}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 18px', borderBottom: i < foco.itens.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ width: 26, height: 26, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, background: `${it.cor}1f` }}>{it.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.titulo}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <b style={{ color: it.cor }}>{it.motivo}</b>{it.detalhe ? ` · "${it.detalhe}"` : ''}
                    </div>
                  </div>
                  <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: it.cor, background: `${it.cor}14`, borderRadius: 8, padding: '4px 10px' }}>{it.acao} →</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 📋 RELATÓRIO DO DIA — atalho em destaque (rotina de fim de expediente) ── */}
        <button onClick={() => nav('/agenda?aba=relatorio')}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20,
            padding: '13px 18px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
            background: 'linear-gradient(120deg,#0ea5e9,#0284c7)', color: '#fff', border: 'none',
            boxShadow: '0 6px 20px rgba(14,165,233,.28)' }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, background: 'rgba(255,255,255,.22)' }}>📋</span>
          <span style={{ flex: 1, minWidth: 180 }}>
            <span style={{ display: 'block', fontWeight: 800, fontSize: 14.5 }}>Relatório do dia</span>
            <span style={{ display: 'block', fontSize: 11.5, opacity: .92 }}>
              Produtividade da equipe, comparecimento, faturamento — e o relatório individual pra imprimir
            </span>
          </span>
          <span style={{ flexShrink: 0, background: 'rgba(255,255,255,.22)', borderRadius: 20, padding: '5px 14px', fontSize: 12, fontWeight: 800 }}>Abrir →</span>
        </button>

        {/* ── 📈 ESTE MÊS x MÊS PASSADO (gestão) — comparação até o mesmo dia ── */}
        {comp?.itens?.length > 0 && (
          <div className="card" style={{ padding: '15px 18px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>📈 Este mês x mês passado</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>comparação justa: até o dia {comp.dia} dos dois meses</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
              {(comp.itens || []).map(it => {
                const sobe = it.variacao > 0, igual = it.variacao === 0;
                const cor = igual ? 'var(--muted)' : sobe ? 'var(--ok,#16a34a)' : 'var(--err,#dc2626)';
                const val = (v) => it.formato === 'brl' ? fmt.brl(v) : it.formato === 'pct' ? `${v}%` : v;
                return (
                  <div key={it.rotulo} style={{ background: 'var(--bg2)', borderRadius: 12, padding: '11px 13px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{it.rotulo}</div>
                    <div style={{ fontSize: 19, fontWeight: 900, lineHeight: 1.2, margin: '2px 0' }}>{val(it.atual)}</div>
                    <div style={{ fontSize: 11, color: cor, fontWeight: 800 }}>
                      {igual ? '—' : `${sobe ? '▲' : '▼'} ${Math.abs(it.variacao)}%`}
                      <span style={{ color: 'var(--muted)', fontWeight: 600 }}> · antes {val(it.anterior)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── KPIs ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 13, marginBottom: 20 }}>
          {kpis.map(({ Icon, label, valor, sub, go }) => (
            <button key={label} onClick={() => nav(go)} className="card" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 17px', cursor: 'pointer', border: '1px solid var(--border)', textAlign: 'left', background: 'var(--card)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, background: 'var(--tq4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={19} color="var(--tq2)" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt2)' }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{valor}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{sub}</div>
              </div>
            </button>
          ))}
        </div>

        {/* ── Meta por SETOR (master vê todos; cada usuário vê o seu, conforme produziu) ── */}
        {metaSetor && (metaSetor.porSetor || []).length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14, marginBottom: 20 }}>
            {(metaSetor.porSetor || []).map((s) => {
              const nome = s.setor && s.setor !== 'geral' ? s.setor[0].toUpperCase() + s.setor.slice(1) : 'Geral';
              const cor = { vacinas: '#7c5cbf', consultas: '#00B8C0', terapias: '#C4973B' }[s.setor] || '#0E8C96';
              const emoji = { vacinas: '💉', consultas: '🩺', terapias: '🧩' }[s.setor] || '🎯';
              /* A meta que vale é a MÍNIMA do setor (R$ 100 mil) — o master
                 mandou tirar a "meta ideal" de R$ 500 mil da frente da equipe:
                 número grande demais desanima em vez de puxar. */
              const alvo = s.metaMinima || s.meta || 0;
              const falta = s.faltaMinima ?? Math.max(alvo - (s.confirmado || 0), 0);
              const pct = Math.min(s.pctMinima ?? 0, 100);
              const batida = alvo > 0 && falta <= 0;
              return (
                <div key={s.setor} className="card" style={{ padding: '16px 18px', borderTop: `3px solid ${cor}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    {/* "do setor" no título evita o que confundiu o master: este
                        cartão soma a equipe do setor, enquanto a faixa do topo
                        mostra a produção individual — números diferentes, e agora
                        está escrito qual é qual. */}
                    <span style={{ fontWeight: 800, fontSize: 14.5 }}>{emoji} Meta {nome} · do setor</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: cor }}>{pct}%</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{fmt.brl(s.confirmado || 0)}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                    de {fmt.brl(alvo)}{batida ? ' · 🏆 batida!' : ` · faltam ${fmt.brl(falta)}`}
                    {/* Vendido inclui o que ainda não caiu no caixa — mostrar o
                        quanto é evita a dúvida de "por que o caixa não bate?" */}
                    {s.aReceber > 0 && <span> · {fmt.brl(s.aReceber)} a receber</span>}
                  </div>
                  <div style={{ height: 9, borderRadius: 6, background: 'var(--bg2)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 6, background: batida ? 'var(--ok,#16a34a)' : cor, transition: 'width .5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── ATENÇÃO AGORA + Resumo comercial ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,1.3fr) minmax(280px,1fr)', gap: 16, marginBottom: 16 }}>
          {/* Atenção agora */}
          <div className="card" style={{ padding: '16px 18px', borderLeft: '4px solid var(--err,#dc2626)' }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>🔔 Atenção agora</div>
            {atencao ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
                {[
                  ['Sem resposta +10min', atencao.semResposta, '#dc2626', '/inbox?cls=', 'Clientes esperando'],
                  ['Leads quentes parados', atencao.quentes, '#e8671a', '/inbox', 'Querem fechar'],
                  ['Agend. sem confirmar', atencao.agendamentosSemConfirmar, '#d97706', '/agenda', 'Confirmar com o cliente'],
                  // Valor a receber é financeiro — só o master vê
                  ...(isMaster ? [['Vendas pendentes', atencao.vendasPendentes, '#2563eb', '/metas', fmt.brl(atencao.vendasPendentesValor) + ' a receber']] : []),
                ].map(([lbl, val, cor, go, sub]) => (
                  <div key={lbl} onClick={() => go && nav(go)} style={{ cursor: go ? 'pointer' : 'default', background: 'var(--bg2)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: (val > 0 ? cor : 'var(--muted)') }}>{val}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 700 }}>{lbl}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{sub}</div>
                  </div>
                ))}
              </div>
            ) : <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Carregando…</div>}
          </div>
          {/* Resumo comercial do mês — só o master */}
          {isMaster && vendasResumo && (
            <div className="card" style={{ padding: '16px 18px' }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>💰 Vendas do mês</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--ok,#16a34a)' }}>{fmt.brl(vendasResumo.total?.confirmado)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>confirmado{vendasResumo.total?.meta > 0 && ` de ${fmt.brl(vendasResumo.total.meta)} (${vendasResumo.total.pct ?? 0}%)`}</div>
              <div style={{ display: 'flex', gap: 8, fontSize: 11.5 }}>
                <div style={{ flex: 1, background: 'var(--bg2)', borderRadius: 8, padding: '7px 9px' }}><div style={{ color: 'var(--muted)' }}>Agendado</div><div style={{ fontWeight: 800, color: '#2563eb' }}>{fmt.brl(vendasResumo.total?.agendado)}</div></div>
                <div style={{ flex: 1, background: 'var(--bg2)', borderRadius: 8, padding: '7px 9px' }}><div style={{ color: 'var(--muted)' }}>Pendente</div><div style={{ fontWeight: 800, color: '#d97706' }}>{fmt.brl(vendasResumo.total?.pendente)}</div></div>
              </div>
              <button onClick={() => nav('/metas')} className="btn btn-sm" style={{ width: '100%', marginTop: 12 }}>Ver metas →</button>
            </div>
          )}
        </div>

        {/* ── 🤖 Vitta trabalhando por você — automações de hoje ── */}
        {vittaHoje && ((vittaHoje.enviadas || 0) + (vittaHoje.pendentes || 0)) > 0 && (
          <div className="card" style={{ padding: '14px 18px', marginBottom: 16, borderLeft: '4px solid var(--tq)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>🤖 Vitta trabalhando por você — hoje</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>
                {vittaHoje.enviadas} enviada{vittaHoje.enviadas === 1 ? '' : 's'} · {vittaHoje.pendentes} na fila
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(vittaHoje.lista || []).map((o) => {
                const rot = String(o.origem).replace(/^Vitta · /, '').replace(/^Campanha · /, 'Campanha ');
                const emoji = /confirma/i.test(o.origem) ? '📅' : /orçament|orcament/i.test(o.origem) ? '💰'
                  : /faltoso/i.test(o.origem) ? '🔄' : /pós-venda|pos-venda/i.test(o.origem) ? '💙'
                  : /avalia/i.test(o.origem) ? '⭐' : /campanha|reativa/i.test(o.origem) ? '📣'
                  : /dose/i.test(o.origem) ? '💉' : /follow/i.test(o.origem) ? '♻️' : '🤖';
                return (
                  <div key={o.origem} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', borderRadius: 9, padding: '6px 11px', fontSize: 12 }}>
                    <span>{emoji}</span>
                    <span style={{ fontWeight: 700 }}>{rot}</span>
                    <span style={{ fontWeight: 800, color: 'var(--tq2)' }}>
                      {o.enviadas > 0 && `${o.enviadas} ✓`}{o.enviadas > 0 && o.pendentes > 0 && ' · '}{o.pendentes > 0 && `${o.pendentes} ⏳`}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 8 }}>
              Confirmações de agenda, resgates de orçamento e faltosos, pós-venda e follow-ups — tudo automático. ✓ enviada · ⏳ programada pra hoje
            </div>
          </div>
        )}

        {/* ── Linha principal: Meta grande · Funil · Agenda-Hoje ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,1.1fr) minmax(260px,1fr) minmax(300px,1.3fr)', gap: 16, marginBottom: 16 }}>

          {/* Meta do Mês — GERAL (todos os setores somados) — card turquesa — só master */}
          {isMaster && mg && (
            <div style={{ borderRadius: 18, padding: '20px 22px', color: '#fff', position: 'relative', overflow: 'hidden',
              background: 'linear-gradient(135deg, #00B8C0 0%, #0E8C96 100%)', boxShadow: '0 8px 28px rgba(0,184,192,.3)' }}>
              <div style={{ position: 'absolute', right: -30, top: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>🏆</span> Meta do Mês — Geral
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{fmt.brl(mg.confirmado)}</div>
                  <div style={{ fontSize: 13, opacity: .85, marginTop: 3 }}>de {fmt.brl(mg.meta)}</div>
                </div>
                <div style={{ width: 74, height: 74, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `conic-gradient(#fff ${Math.min(mg.pct || 0, 100) * 3.6}deg, rgba(255,255,255,.22) 0deg)` }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(14,140,150,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>
                    {Math.round(mg.pct || 0)}%
                  </div>
                </div>
              </div>
              <div style={{ height: 9, borderRadius: 6, background: 'rgba(255,255,255,.25)', overflow: 'hidden', margin: '14px 0 10px' }}>
                <div style={{ width: `${Math.min(mg.pct || 0, 100)}%`, height: '100%', background: 'var(--card)', borderRadius: 6 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 600, opacity: .92, flexWrap: 'wrap', gap: 6 }}>
                <span>{mg.meta > 0 ? `Faltam ${fmt.brl(mg.falta)} para a meta!` : 'Defina a meta na página Metas'}</span>
                {proxMarcoG && <span>🚩 Próximo marco: {proxMarcoG}%</span>}
              </div>
              {/* Quebra por setor */}
              {setoresV && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.2)', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {SET_INFO.map(([k, rotulo]) => {
                    const s = setoresV[k] || { confirmado: 0, meta: 0, pct: null };
                    const pct = Math.min(s.pct || 0, 100);
                    return (
                      <div key={k}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>
                          <span>{rotulo}</span>
                          <span>{fmt.brl(s.confirmado)}{s.meta > 0 ? ` / ${fmt.brl(s.meta)}` : ''}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 5, background: 'rgba(255,255,255,.22)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'rgba(255,255,255,.9)', borderRadius: 5 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Funil de Atendimento — baseado nas conversas reais */}
          <div className="card" style={{ padding: '17px 19px', background: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, marginBottom: 13 }}>
              <span style={{ fontSize: 16 }}>💬</span> Funil de Atendimento
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {funil.map((f, i) => (
                <div key={f.etapa} style={{ display: 'grid', gridTemplateColumns: '128px 1fr 30px', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--txt2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.etapa}</div>
                  <div style={{ height: 9, borderRadius: 6, background: 'var(--bg2)', overflow: 'hidden' }}>
                    <div style={{ width: `${(f.n / maxFunil) * 100}%`, height: '100%', borderRadius: 6, background: CORES_FUNIL[i % CORES_FUNIL.length], transition: 'width .6s' }} />
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--txt2)', textAlign: 'right' }}>{f.n}</div>
                </div>
              ))}
            </div>
            {porSetorConv.length > 0 && (
              <div style={{ marginTop: 13, paddingTop: 11, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 7 }}>CONVERSAS POR SETOR</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {porSetorConv.map(s => (
                    <div key={s.setor} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg2)', borderRadius: 8, padding: '5px 9px', fontSize: 11.5 }}>
                      <span>{setorEmoji[s.setor] || '📥'}</span>
                      <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{s.setor}</span>
                      <span style={{ fontWeight: 800, color: 'var(--tq2)' }}>{s.n}</span>
                      {s.aguardando > 0 && <span title="aguardando resposta" style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>· {s.aguardando} ⏳</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Agenda — Hoje (retornos/follow-ups do dia) */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'var(--card)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '13px 17px', background: 'linear-gradient(90deg,var(--tq),#0aa6ae)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>📅 Agenda — Hoje</div>
              <button onClick={() => nav('/agenda')} style={{ padding: '5px 12px', borderRadius: 9, background: 'rgba(255,255,255,.92)', color: 'var(--tq2)', fontSize: 11, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
                Ver completa
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 280 }}>
              {agendaHoje.map((ev, i) => (
                <div key={`ag-${ev.id}`} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 17px', borderBottom: '1px solid var(--border)', opacity: ev.status === 'Cancelado' ? .5 : 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--tq2)', minWidth: 42 }}>{ev.hora}</div>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: ['#e0f4f5', '#ede4f7', '#fdeede', '#fde4ee'][i % 4], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                    {ev.setor === 'consultas' ? '🩺' : ev.setor === 'terapias' ? '🧩' : '💉'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.paciente}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ev.servico || ev.status}{ev.resp_nome ? ` · ${ev.resp_nome.split(' ')[0]}` : ''}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: ev.status === 'Confirmado' ? 'var(--ok)' : 'var(--muted)' }}>{ev.status}</span>
                </div>
              ))}
              {agendaHoje.length === 0 && fupsHoje.length === 0 && (
                <div style={{ padding: '30px 17px', textAlign: 'center', fontSize: 12.5, color: 'var(--muted)' }}>
                  Nenhum retorno marcado pra hoje 🎉<br />
                  <span style={{ fontSize: 11 }}>Os agendamentos do dia aparecem aqui.</span>
                </div>
              )}
              {agendaHoje.length === 0 && fupsHoje.map((f, i) => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 17px', borderBottom: i < fupsHoje.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: ['#e0f4f5', '#ede4f7', '#fdeede', '#fde4ee'][i % 4], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
                    {f.setor === 'consultas' ? '🩺' : f.setor === 'terapias' ? '🧩' : '💉'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{f.servico || f.status}{f.resp_nome ? ` · ${f.resp_nome.split(' ')[0]}` : ''}</div>
                  </div>
                  {f.conv_id && (
                    <button onClick={() => nav('/inbox')} title="Abrir conversa"
                      style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--tq3)', background: 'var(--tq4)', color: 'var(--tq2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MessageSquare size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => nav('/agenda')} style={{ margin: 13, padding: '9px 0', borderRadius: 11, border: '1.5px dashed var(--tq)', background: 'var(--tq4)', color: 'var(--tq2)', fontWeight: 800, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Plus size={13} /> Novo agendamento
            </button>
          </div>
        </div>

        {/* ── Segunda linha: Equipe hoje · Atividades · Mensagem ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,1.1fr) minmax(260px,1fr) minmax(300px,1.3fr)', gap: 16, marginBottom: 16 }}>

          {/* Desempenho da Equipe — Hoje (linha de cada colega é só do master) */}
          {isMaster && (
          <div className="card" style={{ padding: '17px 19px', background: 'var(--card)' }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 13, display: 'flex', alignItems: 'center', gap: 8 }}>👏 Desempenho da Equipe — Hoje</div>
            {(porResponsavel || []).slice(0, 5).map((u2, i) => {
              const metaDia = 10;
              const at = parseInt(u2.atend_hoje) || 0;
              const pct = Math.min((at / metaDia) * 100, 100);
              return (
                <div key={u2.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
                  {u2.avatar
                    ? <img src={u2.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                    : <div style={{ width: 32, height: 32, borderRadius: '50%', background: u2.cor || 'var(--tq)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{fmt.initials(u2.nome)}</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 12.5 }}>{(u2.nome || '').split(' ')[0]}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{at} hoje</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 5, background: 'var(--bg2)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 5, background: pct >= 100 ? 'var(--ok)' : 'var(--tq)' }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: pct >= 100 ? 'var(--ok)' : 'var(--tq2)', minWidth: 38, textAlign: 'right' }}>{Math.round(pct)}%</span>
                </div>
              );
            })}
            {(porResponsavel || []).length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sem atendimentos registrados hoje.</div>}
          </div>
          )}

          {/* Vendas por atendente — mês (confirmado) — só master */}
          {isMaster && porAtend.length > 0 && (
            <div className="card" style={{ padding: '17px 19px', background: 'var(--card)' }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>💰 Vendas por atendente</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 12 }}>Confirmado no mês · {fmt.brl(mg?.confirmado)} no total</div>
              {porAtend.slice(0, 6).map((a, i) => {
                const pct = Math.min(((a.confirmado || 0) / maxAtend) * 100, 100);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < Math.min(porAtend.length, 6) - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: i === 0 ? 'var(--gold,#C4973B)' : 'var(--muted)', minWidth: 18 }}>{i + 1}º</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(a.nome || '—').split(' ')[0]}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ok,#16a34a)' }}>{fmt.brl(a.confirmado)}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 5, background: 'var(--bg2)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 5, background: i === 0 ? 'var(--gold,#C4973B)' : 'var(--tq)' }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 10.5, color: 'var(--muted)', minWidth: 44, textAlign: 'right' }}>{a.n} venda{a.n === 1 ? '' : 's'}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Metas de agendamento por setor — feito / alvo / quanto falta */}
          {agMeta?.setores && Object.values(agMeta.setores).some(s => s.alvo > 0) && (
            <div className="card" style={{ padding: '17px 19px', background: 'var(--card)' }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>🎯 Metas de agendamento — por setor</div>
              {[['vacinas','💉 Vacinas','#7c5cbf'],['consultas','🩺 Consultas','#00B8C0'],['terapias','🧩 Terapias','#C4973B']].map(([k,rotulo,cor]) => {
                const s = agMeta.setores[k] || { feitos:0, alvo:0, falta:0, pct:null };
                if (!s.alvo) return null;
                const pct = Math.min(s.pct || 0, 100);
                return (
                  <div key={k} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12.5 }}>
                      <span style={{ fontWeight: 700 }}>{rotulo}</span>
                      <span style={{ fontWeight: 800, color: cor }}>{s.feitos}/{s.alvo}</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 5, background: 'var(--bg2)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 5, background: s.falta === 0 ? 'var(--ok)' : cor }} />
                    </div>
                    <div style={{ fontSize: 11, color: s.falta === 0 ? 'var(--ok)' : 'var(--muted)', marginTop: 3, fontWeight: 600 }}>
                      {s.falta === 0 ? '🏆 Meta batida!' : `Faltam ${s.falta} para a meta`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 📊 MINHA PRODUÇÃO — cada uma vê o SEU resultado, nunca o das colegas
              (pedido do master). A gestão continua com o placar completo abaixo. */}
          {prod && (
            <div className="card" style={{ padding: '17px 19px', background: 'var(--card)' }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                📊 Minha produção de hoje
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 12 }}>
                {prod.usuario?.nome?.split(' ')[0]} · só você vê estes números
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 13 }}>
                {[['Vendas', prod.hoje.vendas, 'var(--tq2)'],
                  ['Agendamentos', prod.hoje.agendamentos, '#8b5cf6'],
                  ['Atendimentos', prod.hoje.conversas, '#f97316']].map(([rot, val, cor]) => (
                  <div key={rot} style={{ background: 'var(--bg)', borderRadius: 10, padding: '9px 6px', textAlign: 'center' }}>
                    <div style={{ fontSize: 19, fontWeight: 800, color: cor, lineHeight: 1.1 }}>{val}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>{rot}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, paddingBottom: 9, marginBottom: 9, borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Fechado hoje</span>
                <span style={{ fontWeight: 800, color: 'var(--ok,#16a34a)' }}>{fmt.brl(prod.hoje.confirmado)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: prod.mes.meta ? 9 : 0 }}>
                <span style={{ color: 'var(--muted)', fontWeight: 600 }}>No mês</span>
                <span style={{ fontWeight: 800 }}>{fmt.brl(prod.mes.confirmado)}</span>
              </div>

              {/* 🎯 Meta individual — em R$ ou em CONSULTAS, conforme o cadastro
                  dela. Quem é cobrada por consulta vê a do DIA (que é como a
                  meta foi combinada) e o acumulado do mês logo abaixo. */}
              {prod.metaInd && (() => {
                const m = prod.metaInd;
                const porConsulta = m.tipo === 'consultas';
                const pct = porConsulta ? m.pct_dia : m.pct_mes;
                const barra = Math.min(pct || 0, 100);
                return (
                  <>
                    <div style={{ height: 8, borderRadius: 6, background: 'var(--bg2)', overflow: 'hidden', marginBottom: 5, marginTop: 4 }}>
                      <div style={{ width: `${barra}%`, height: '100%', borderRadius: 6,
                        background: (pct || 0) >= 100 ? 'var(--ok,#16a34a)' : 'var(--tq)' }} />
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, lineHeight: 1.5 }}>
                      {porConsulta ? (
                        (m.pct_dia || 0) >= 100
                          ? <>🏆 Meta do dia batida! {m.feito_dia} de {m.alvo_dia} consultas</>
                          : <>{m.feito_dia} de {m.alvo_dia} consultas hoje · faltam <b>{m.falta_dia}</b></>
                      ) : (
                        (m.pct_mes || 0) >= 100
                          ? <>🏆 Meta batida! {m.pct_mes}% de {fmt.brl(m.alvo_mes)}</>
                          : <>{m.pct_mes || 0}% da sua meta · faltam {fmt.brl(m.falta_mes)}</>
                      )}
                      {porConsulta && (
                        <div style={{ marginTop: 3 }}>
                          No mês: {m.feito_mes} de {m.alvo_mes} ({m.pct_mes || 0}%)
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Placar nominal da equipe — só a gestão enxerga o número das colegas */}
          {agMeta && (agMeta.porAtendente || []).length > 1 && (
            <div className="card" style={{ padding: '17px 19px', background: 'var(--card)' }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>🎯 Agendamentos do mês</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 12 }}>
                {agMeta.feitos} no total{agMeta.alvo ? ` · meta ${agMeta.alvo} (${agMeta.pct ?? 0}%)` : ''}
              </div>
              {(agMeta.porAtendente || []).slice(0, 6).map((u2, i) => {
                const max = Math.max(...agMeta.porAtendente.map(x => x.n), 1);
                const pct = Math.min((u2.n / max) * 100, 100);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < Math.min(agMeta.porAtendente.length, 6) - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: i === 0 ? 'var(--gold,#C4973B)' : 'var(--muted)', minWidth: 18 }}>{i + 1}º</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 12.5 }}>{(u2.nome || '—').split(' ')[0]}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--tq2)' }}>{u2.n}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 5, background: 'var(--bg2)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 5, background: i === 0 ? 'var(--gold,#C4973B)' : 'var(--tq)' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Atividades de Follow-up */}
          <div className="card" style={{ padding: '17px 19px', background: 'var(--card)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 13, display: 'flex', alignItems: 'center', gap: 8 }}>🔔 Atividades de Follow-up</div>
            <div style={{ flex: 1 }}>
              {followups.slice(0, 4).map((f, i) => {
                const vencido = f.data_retorno < hojeLocalISO();
                return (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < Math.min(followups.length, 4) - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{f.status}{vencido ? ` · desde ${fmt.date(f.data_retorno)}` : ' · para hoje'}</div>
                    </div>
                    <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 10, fontWeight: 800,
                      background: vencido ? 'var(--err2)' : '#fff7e0', color: vencido ? 'var(--err)' : '#a07514' }}>
                      {vencido ? 'Urgente' : 'Hoje'}
                    </span>
                  </div>
                );
              })}
              {followups.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '14px 0' }}>Tudo em dia por aqui! 🎉</div>}
            </div>
            <button onClick={() => nav('/retornos')} style={{ marginTop: 10, alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--tq2)', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
              Ver todos <ChevronRight size={13} />
            </button>
          </div>

          {/* Mensagem da Tarde / Ações rápidas empilhadas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: '16px 19px', background: 'var(--card)', border: '1.5px solid var(--tq3)', display: 'flex', gap: 13, alignItems: 'center' }}>
              <div style={{ fontSize: 36, flexShrink: 0 }}>{hora < 12 ? '🌅' : '💙'}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 3 }}>{hora < 12 ? 'Mensagem da Manhã' : 'Mensagem da Tarde'}</div>
                <div style={{ fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.5 }}>{motivacional}</div>
              </div>
            </div>
            <div className="card" style={{ padding: '15px 19px', background: 'var(--card)' }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 11 }}>⚡ Ações rápidas</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
                {acoes.map(({ Icon, label, go, href }) => (
                  <button key={label} onClick={() => href ? window.open(href, '_blank') : nav(go)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '11px 4px', borderRadius: 12, border: '1px solid var(--tq3)', background: 'var(--tq4)', cursor: 'pointer', transition: 'transform .12s' }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                    <Icon size={17} color="var(--tq2)" />
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--txt2)', textAlign: 'center', lineHeight: 1.25 }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Painel de Impacto ── */}
        {impacto && (
          <div className="card" style={{ padding: '17px 22px', background: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>💙 Painel de Impacto — Este Mês</div>
              {isMaster && (
                <button onClick={() => nav('/relatorios')} style={{ padding: '6px 14px', borderRadius: 9, background: 'var(--tq4)', border: '1px solid var(--tq3)', color: 'var(--tq2)', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                  Ver relatório completo
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
              {/* O servidor manda null no setor que não é da pessoa — some da lista */}
              {[['👨‍👩‍👧', impacto.familias, 'Famílias atendidas'],
                ['💉', impacto.convVacinas, 'Conversas — Vacinas'],
                ['🩺', impacto.convConsultas, 'Conversas — Consultas'],
                ['🧩', impacto.convTerapias, 'Conversas — Terapias'],
                ['💬', resumo.totalUnread || 0, 'Não lidas agora']].filter(([, v]) => v != null).map(([ic, v, l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 26 }}>{ic}</span>
                  <div>
                    <div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.1 }}>{v}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{l}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
