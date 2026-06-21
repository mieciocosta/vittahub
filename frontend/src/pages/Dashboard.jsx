import React, { useEffect, useState } from 'react';
import { MessageSquare, HeartPulse, CalendarCheck, CircleDollarSign, Bell, ChevronRight, Plus, Syringe, UserPlus, ClipboardList, Send, Phone } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';
import { useNavigate } from 'react-router-dom';

/* ─── Dashboard Vittalis — layout aprovado pela gestão ────────────────────────
   Tudo aqui é DADO REAL do CRM. A "Agenda — Hoje" usa os retornos/follow-ups
   com data de hoje (o módulo de Agenda dedicado entra na próxima fase e este
   card já está pronto pra recebê-lo).                                        */

const VERSICULOS = [
  ['Entrega o teu caminho ao Senhor; confia nele, e ele o fará.', 'Salmos 37:5'],
  ['Tudo posso naquele que me fortalece.', 'Filipenses 4:13'],
  ['O Senhor é o meu pastor; nada me faltará.', 'Salmos 23:1'],
  ['Não temas, porque eu sou contigo.', 'Isaías 41:10'],
  ['Em tudo dai graças, porque esta é a vontade de Deus.', '1 Tessalonicenses 5:18'],
  ['O coração alegre é como o bom remédio.', 'Provérbios 17:22'],
  ['Confia no Senhor de todo o teu coração.', 'Provérbios 3:5'],
  ['O choro pode durar uma noite, mas a alegria vem pela manhã.', 'Salmos 30:5'],
  ['Sede fortes e corajosos; não temais.', 'Deuteronômio 31:6'],
  ['As misericórdias do Senhor se renovam a cada manhã.', 'Lamentações 3:22-23'],
  ['Buscai primeiro o Reino de Deus.', 'Mateus 6:33'],
  ['Aquietai-vos e sabei que eu sou Deus.', 'Salmos 46:10'],
  ['Tudo o que fizerem, façam de todo o coração, como para o Senhor.', 'Colossenses 3:23'],
  ['A tua palavra é lâmpada para os meus pés.', 'Salmos 119:105'],
  ['Porque para Deus nada é impossível.', 'Lucas 1:37'],
  ['Este é o dia que o Senhor fez; regozijemo-nos nele.', 'Salmos 118:24'],
  ['Deleita-te também no Senhor.', 'Salmos 37:4'],
  ['Sê forte e corajoso; o Senhor teu Deus é contigo.', 'Josué 1:9'],
  ['Grandes coisas fez o Senhor por nós.', 'Salmos 126:3'],
  ['O amor é paciente, o amor é bondoso.', '1 Coríntios 13:4'],
];
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
  const [vendasResumo, setVendasResumo] = useState(null);
  const [atencao, setAtencao] = useState(null);
  useEffect(() => {
    api.get('/reports/dashboard').then(setData).catch(() => {});
    api.get(`/extras/agenda?data=${new Date().toISOString().slice(0, 10)}`).then(d => setAgendaHoje(Array.isArray(d) ? d : [])).catch(() => {});
    api.get('/extras/agenda/meta').then(setAgMeta).catch(() => {});
    api.get('/extras/vendas/resumo').then(setVendasResumo).catch(() => {});
    const loadAt = () => api.get('/inbox/atencao-agora').then(setAtencao).catch(() => {});
    loadAt(); const t = setInterval(loadAt, 20000); return () => clearInterval(t);
  }, []); // eslint-disable-line

  const hoje = new Date();
  const hora = hoje.getHours();
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const diaAno = Math.floor((hoje - new Date(hoje.getFullYear(), 0, 0)) / 86400000);
  const [verso, ref] = VERSICULOS[diaAno % VERSICULOS.length];
  const motivacional = MOTIVACIONAIS[diaAno % MOTIVACIONAIS.length];
  const nome = (user?.nome || '').split(' ')[0];
  const papel = user?.role === 'master' ? 'Master' : user?.role === 'supervisor' ? 'Supervisora' : 'Atendente';

  if (!data) return <div style={{ padding: 40, color: 'var(--muted)' }}>Carregando seu dia…</div>;

  const { resumo = {}, porStatus = [], followups = [], porResponsavel = [], metas, impacto, funil = [], porSetorConv = [] } = data;
  const fupsHoje = followups.filter(f => f.data_retorno === hoje.toISOString().slice(0, 10));
  const fupsVencidos = followups.filter(f => f.data_retorno < hoje.toISOString().slice(0, 10));
  const proxMarco = metas ? [25, 50, 75, 100].find(m => m > metas.vacinas.pct) : null;
  const maxFunil = Math.max(...funil.map(f => f.n), 1);
  const setorEmoji = { vacinas: '💉', consultas: '🩺', terapias: '🧩', 'sem setor': '📥' };

  const kpis = [
    { Icon: MessageSquare, label: 'Conversas não lidas', valor: resumo.totalUnread || 0, sub: 'Precisam de atenção', go: '/inbox' },
    { Icon: MessageSquare, label: 'Aguardando resposta', valor: data.conversas?.aguardando || 0, sub: 'Cliente falou por último', go: '/inbox' },
    { Icon: CalendarCheck, label: 'Agendamentos hoje', valor: data.agenda?.hoje ?? agendaHoje.length, sub: 'Na agenda de hoje', go: '/agenda' },
    { Icon: CalendarCheck, label: 'Próximos agendamentos', valor: data.agenda?.proximos || 0, sub: 'A confirmar / realizar', go: '/agenda' },
    { Icon: CalendarCheck, label: 'Agendados no mês 🎯', valor: agMeta ? (agMeta.alvo ? `${agMeta.feitos}/${agMeta.alvo}` : agMeta.feitos) : '—', sub: agMeta?.alvo ? `Meta: ${agMeta.pct ?? 0}% alcançada` : 'Defina o alvo nas Configurações', go: '/agenda' },
    { Icon: Bell, label: 'Follow-ups pendentes', valor: followups.length, sub: 'Retornos programados', go: '/retornos' },
  ];

  const acoes = [
    { Icon: MessageSquare, label: 'Nova conversa', go: '/inbox' },
    { Icon: UserPlus, label: 'Novo cliente', go: '/leads' },
    { Icon: Send, label: 'Enviar orçamento', go: '/inbox' },
    { Icon: Syringe, label: 'Registrar vacina', href: 'https://vittasys.vittalissaude.com.br' },
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
        {metas && (
          <div style={{ minWidth: 190 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>
              <span style={{ color: 'var(--muted)' }}>Meta do mês — Vacinas</span>
              <span style={{ color: 'var(--tq2)', fontSize: 14 }}>{Math.round(metas.vacinas.pct)}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 6, background: 'var(--tq4)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(metas.vacinas.pct, 100)}%`, height: '100%', background: 'linear-gradient(90deg,var(--tq),var(--pet))', borderRadius: 6 }} />
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 }}>{fmt.brl(metas.vacinas.vendido)} / {fmt.brl(metas.vacinas.meta)}</div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {user?.avatar
            ? <img src={user.avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--tq)' }} />
            : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,var(--tq),var(--pet))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14 }}>{fmt.initials(user?.nome)}</div>}
          <div>
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>{nome}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{papel}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 28px' }}>

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
                  ['Vendas pendentes', atencao.vendasPendentes, '#2563eb', '/metas', fmt.brl(atencao.vendasPendentesValor) + ' a receber'],
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
          {/* Resumo comercial do mês */}
          {vendasResumo && (
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

        {/* ── Linha principal: Meta grande · Funil · Agenda-Hoje ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,1.1fr) minmax(260px,1fr) minmax(300px,1.3fr)', gap: 16, marginBottom: 16 }}>

          {/* Meta de Vacinas — card turquesa */}
          {metas && (
            <div style={{ borderRadius: 18, padding: '20px 22px', color: '#fff', position: 'relative', overflow: 'hidden',
              background: 'linear-gradient(135deg, #00B8C0 0%, #0E8C96 100%)', boxShadow: '0 8px 28px rgba(0,184,192,.3)' }}>
              <div style={{ position: 'absolute', right: -30, top: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>🏆</span> Meta de Vacinas — Mês
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{fmt.brl(metas.vacinas.vendido)}</div>
                  <div style={{ fontSize: 13, opacity: .85, marginTop: 3 }}>de {fmt.brl(metas.vacinas.meta)}</div>
                </div>
                <div style={{ width: 74, height: 74, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `conic-gradient(#fff ${Math.min(metas.vacinas.pct, 100) * 3.6}deg, rgba(255,255,255,.22) 0deg)` }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(14,140,150,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>
                    {Math.round(metas.vacinas.pct)}%
                  </div>
                </div>
              </div>
              <div style={{ height: 9, borderRadius: 6, background: 'rgba(255,255,255,.25)', overflow: 'hidden', margin: '14px 0 10px' }}>
                <div style={{ width: `${Math.min(metas.vacinas.pct, 100)}%`, height: '100%', background: 'var(--card)', borderRadius: 6 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 600, opacity: .92, flexWrap: 'wrap', gap: 6 }}>
                <span>Faltam {fmt.brl(metas.vacinas.falta)} para a meta!</span>
                {proxMarco && <span>🚩 Próximo marco: {proxMarco}%</span>}
              </div>
              <div style={{ fontSize: 11, marginTop: 6, opacity: .8 }}>Projeção do mês: <b>{fmt.brl(metas.vacinas.projecao)}</b></div>
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

          {/* Desempenho da Equipe — Hoje */}
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
            {(porResponsavel || []).length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Visível para a gestão.</div>}
          </div>

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

          {/* Ranking de agendamentos do mês — por atendente */}
          {agMeta && (agMeta.porAtendente || []).length > 0 && (
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
                const vencido = f.data_retorno < hoje.toISOString().slice(0, 10);
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
              {[['👨‍👩‍👧', impacto.familias, 'Famílias atendidas'],
                ['💉', impacto.convVacinas, 'Conversas — Vacinas'],
                ['🩺', impacto.convConsultas, 'Conversas — Consultas'],
                ['🧩', impacto.convTerapias, 'Conversas — Terapias'],
                ['💬', resumo.totalUnread || 0, 'Não lidas agora']].map(([ic, v, l]) => (
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
