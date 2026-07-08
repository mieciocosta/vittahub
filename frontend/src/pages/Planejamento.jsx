import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, Users, Trophy, Coins, ClipboardCheck, GraduationCap, Target, Lightbulb, StickyNote, Bell, Plus, X, Check, Trash2, Pencil, CalendarClock, UserPlus, Activity, MessageSquare, Zap, DollarSign, Circle } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

const TIPOS = {
  estrategia: { label: 'Estratégia', Icon: Lightbulb, cor: '#C4973B' },
  nota:       { label: 'Nota',       Icon: StickyNote, cor: '#0E8C96' },
  lembrete:   { label: 'Lembrete',   Icon: Bell,       cor: '#7c3aed' },
};
function fmtDia(s) { if (!s) return ''; const d = String(s).slice(0, 10).split('-'); return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s; }

/* PLANEJAMENTO — plano de crescimento e bônus da líder. Motiva a formar equipe
   e padronizar o atendimento pra bater a meta e ganhar os bônus. */

export default function Planejamento() {
  const api = useApi();
  const nav = useNavigate();
  const { user } = useAuth();
  const nome = (user?.nome || '').split(' ')[0];
  const [plan, setPlan] = useState(null);
  const [notas, setNotas] = useState([]);
  const [modal, setModal] = useState(null); // { id?, tipo, titulo, conteudo, lembrete_em }
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const [liderados, setLiderados] = useState([]);
  const [modalAdd, setModalAdd] = useState(false);
  const [disponiveis, setDisponiveis] = useState([]);

  useEffect(() => { api.get('/extras/planejamento').then(setPlan).catch(() => {}); }, []); // eslint-disable-line
  const loadNotas = () => api.get('/extras/planejamento/notas').then(d => setNotas(Array.isArray(d) ? d : [])).catch(() => setNotas([]));
  useEffect(() => { loadNotas(); }, []); // eslint-disable-line
  const loadLiderados = () => api.get('/extras/planejamento/liderados').then(d => setLiderados(Array.isArray(d) ? d : [])).catch(() => setLiderados([]));
  useEffect(() => { loadLiderados(); const t = setInterval(loadLiderados, 45000); return () => clearInterval(t); }, []); // eslint-disable-line

  const abrirAdd = () => {
    setModalAdd(true);
    api.get('/extras/planejamento/liderados/disponiveis').then(d => setDisponiveis(Array.isArray(d) ? d : [])).catch(() => setDisponiveis([]));
  };
  const addLiderado = async (u) => {
    try { await api.post('/extras/planejamento/liderados', { usuario_id: u.id }); setModalAdd(false); loadLiderados(); }
    catch (e) { window.alert(e.message); }
  };
  const removerLiderado = async (u) => {
    if (!window.confirm(`Remover ${u.nome.split(' ')[0]} da sua equipe?`)) return;
    setLiderados(p => p.filter(x => x.id !== u.id));
    try { await api.del(`/extras/planejamento/liderados/${u.id}`); } catch { loadLiderados(); }
  };
  const [editMeta, setEditMeta] = useState(null); // { id, valor }
  const salvarMetaInd = async () => {
    if (!editMeta) return;
    const val = parseFloat(String(editMeta.valor).replace(/\./g, '').replace(',', '.')) || 0;
    const id = editMeta.id; setEditMeta(null);
    setLiderados(p => p.map(x => x.id === id ? { ...x, meta_mensal: val, meta_pct: val > 0 ? +((x.mes.vendas_valor / val) * 100).toFixed(1) : null } : x));
    try { await api.patch(`/extras/planejamento/liderados/${id}/meta`, { meta: val }); } catch { loadLiderados(); }
  };
  const inic = (nome) => (nome || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase();

  const abrirNovo = (tipo) => { setErro(''); setModal({ tipo, titulo: '', conteudo: '', lembrete_em: '' }); };
  const abrirEdit = (n) => { setErro(''); setModal({ id: n.id, tipo: n.tipo, titulo: n.titulo || '', conteudo: n.conteudo || '', lembrete_em: n.lembrete_em ? String(n.lembrete_em).slice(0, 10) : '' }); };

  const salvar = async () => {
    if (!modal.titulo.trim() && !modal.conteudo.trim()) { setErro('Escreva um título ou conteúdo.'); return; }
    setSalvando(true); setErro('');
    try {
      const payload = { tipo: modal.tipo, titulo: modal.titulo, conteudo: modal.conteudo, lembrete_em: modal.tipo === 'lembrete' ? modal.lembrete_em : null };
      if (modal.id) { const n = await api.put(`/extras/planejamento/notas/${modal.id}`, payload); setNotas(p => p.map(x => x.id === n.id ? n : x)); }
      else { const n = await api.post('/extras/planejamento/notas', payload); setNotas(p => [n, ...p]); }
      setModal(null); loadNotas();
    } catch (e) { setErro(e.message); }
    setSalvando(false);
  };
  const toggle = async (n) => {
    setNotas(p => p.map(x => x.id === n.id ? { ...x, concluido: !x.concluido } : x));
    try { await api.put(`/extras/planejamento/notas/${n.id}`, { concluido: !n.concluido }); } catch { loadNotas(); }
  };
  const excluir = async (n) => {
    if (!window.confirm('Remover este item?')) return;
    setNotas(p => p.filter(x => x.id !== n.id));
    try { await api.del(`/extras/planejamento/notas/${n.id}`); } catch { loadNotas(); }
  };

  const pct = plan ? Math.min(plan.pct || 0, 100) : 0;

  const BONUS = [
    { Icon: Users, cor: '#00B8C0', titulo: 'Forme e ganhe em cima de cada uma', txt: 'Com 2 pessoas bem treinadas na sua equipe, você passa a ganhar sobre o resultado de cada uma delas. Quanto melhor você treina, mais você fatura junto.' },
    { Icon: Trophy, cor: '#C4973B', titulo: 'Setor bateu R$ 500 mil no mês', txt: 'Quando o setor alcança R$ 500 mil no mês, você recebe um bônus de R$ 10.000 — e todo mês que bater, ganha de novo.', destaque: 'R$ 10.000 / mês' },
    { Icon: Coins, cor: '#16a34a', titulo: 'Bônus por cada pessoa liderada', txt: 'Cada pessoa que você lidera e desenvolve gera pra você um bônus de R$ 2.000. Liderar dá resultado no seu bolso.', destaque: 'R$ 2.000 por pessoa' },
  ];

  return (
    <div style={{ padding: 28, maxWidth: 940, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{ borderRadius: 20, padding: '26px 28px', marginBottom: 20, color: '#fff', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #06424A 0%, #0E8C96 55%, #00B8C0 130%)', boxShadow: '0 12px 34px rgba(6,66,74,.35)' }}>
        <div style={{ position: 'absolute', right: -30, top: -30, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,.09)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 25, fontWeight: 800 }}><Rocket size={26} /> Planejamento — {nome}</div>
        <div style={{ fontSize: 14, opacity: .96, marginTop: 8, maxWidth: 640, lineHeight: 1.55 }}>
          Você não cresce sozinha — <b>cresce formando gente</b>. Treine bem a sua equipe, padronize o atendimento e transforme resultado em bônus. Este é o seu plano. 🚀
        </div>
      </div>

      {/* Progresso rumo aos R$ 500 mil */}
      {plan && (
        <div className="card" style={{ padding: '18px 22px', marginBottom: 18, borderLeft: '4px solid #C4973B' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}><Target size={17} color="#C4973B" /> Meta do bônus — R$ 500 mil no mês</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700, textTransform: 'capitalize' }}>Setor: {plan.setor}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--ok,#16a34a)' }}>{fmt.brl(plan.confirmado)}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>de {fmt.brl(plan.meta)} · {Math.round(plan.pct || 0)}%</span>
          </div>
          <div style={{ height: 11, borderRadius: 7, background: 'var(--bg2)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 7, background: 'linear-gradient(90deg,#C4973B,#e8b04a)', transition: 'width .5s' }} />
          </div>
          <div style={{ fontSize: 12, color: pct >= 100 ? 'var(--ok)' : 'var(--muted)', fontWeight: 600, marginTop: 7 }}>
            {pct >= 100 ? '🏆 Meta batida — bônus de R$ 10 mil garantido!' : `Faltam ${fmt.brl(plan.falta)} pra destravar os R$ 10 mil deste mês.`}
          </div>
        </div>
      )}

      {/* Bônus */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, marginBottom: 20 }}>
        {BONUS.map(({ Icon, cor, titulo, txt, destaque }) => (
          <div key={titulo} className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 9, borderTop: `3px solid ${cor}` }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: cor + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={22} color={cor} /></div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{titulo}</div>
            {destaque && <div style={{ fontSize: 18, fontWeight: 800, color: cor }}>{destaque}</div>}
            <div style={{ fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.55 }}>{txt}</div>
          </div>
        ))}
      </div>

      {/* Requisito: padrão de conversas */}
      <div className="card" style={{ padding: '20px 22px', background: 'var(--tq4)', border: '1.5px solid var(--tq3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 800, fontSize: 15, marginBottom: 8 }}>
          <ClipboardCheck size={19} color="var(--tq2)" /> A chave de tudo: PADRÃO de conversas
        </div>
        <p style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.6, marginBottom: 14 }}>
          Nada disso acontece no improviso. Pra sua equipe vender de forma consistente, <b>precisa existir um padrão de atendimento</b> — do "oi" ao fechamento.
          Construa esse padrão a partir do que já deu certo e ensine cada pessoa a repetir.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => nav('/cursos')} className="btn btn-s" style={{ gap: 7 }}><GraduationCap size={15} /> Cursos de treinamento</button>
          <button onClick={() => nav('/planos-vacinais')} className="btn btn-s" style={{ gap: 7 }}><ClipboardCheck size={15} /> Passo a passo dos funis</button>
        </div>
      </div>

      {/* Minha equipe: liderados + o que cada um fez hoje */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}><Users size={18} color="var(--tq2)" /> Minha equipe {liderados.length > 0 && <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>({liderados.length})</span>}</div>
          <button onClick={abrirAdd} className="btn btn-p btn-sm" style={{ gap: 6 }}><UserPlus size={14} /> Cadastrar liderado</button>
        </div>

        {liderados.length === 0 ? (
          <div className="card" style={{ padding: 34, textAlign: 'center', color: 'var(--muted)' }}>
            <Users size={30} color="var(--border)" style={{ marginBottom: 8 }} />
            <div style={{ fontWeight: 700 }}>Você ainda não cadastrou liderados.</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>Cadastre sua equipe pra acompanhar <b>o que cada um faz no dia</b>, a proatividade e as metas.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
            {liderados.map(l => {
              const protCor = l.proatividade >= 70 ? '#16a34a' : l.proatividade >= 35 ? '#d97706' : '#dc2626';
              return (
                <div key={l.id} className="card" style={{ padding: '15px 17px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
                    <div style={{ position: 'relative' }}>
                      <div style={{ width: 42, height: 42, borderRadius: '50%', background: l.cor || 'linear-gradient(135deg,#0E8C96,#00B8C0)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{inic(l.nome)}</div>
                      <span style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%', background: l.online ? '#22c55e' : '#94a3b8', border: '2px solid var(--card)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14.5 }}>{l.nome.split(' ').slice(0, 2).join(' ')}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l.setor || '—'} · {l.online ? 'online agora' : (l.ultima_atividade ? `visto ${new Date(l.ultima_atividade).toLocaleDateString('pt-BR') === new Date().toLocaleDateString('pt-BR') ? 'hoje ' + new Date(l.ultima_atividade).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : new Date(l.ultima_atividade).toLocaleDateString('pt-BR')}` : 'sem registro')}</div>
                    </div>
                    <button onClick={() => removerLiderado(l)} title="Remover da equipe" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={15} /></button>
                  </div>

                  {/* Proatividade */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4 }}>⚡ Proatividade hoje</span>
                      <span style={{ fontWeight: 800, color: protCor }}>{l.proatividade}%</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 5, background: 'var(--bg2)', overflow: 'hidden' }}>
                      <div style={{ width: `${l.proatividade}%`, height: '100%', borderRadius: 5, background: protCor, transition: 'width .4s' }} />
                    </div>
                  </div>

                  {/* O que fez hoje */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 10 }}>
                    {[
                      { Ic: MessageSquare, v: l.hoje.mensagens, lb: 'Msgs', cor: '#2563eb' },
                      { Ic: Users, v: l.hoje.atendimentos, lb: 'Atend.', cor: '#00B8C0' },
                      { Ic: Activity, v: l.hoje.acoes, lb: 'Ações', cor: '#7c3aed' },
                      { Ic: DollarSign, v: l.hoje.vendas, lb: 'Vendas', cor: '#16a34a' },
                    ].map((s, i) => (
                      <div key={i} style={{ textAlign: 'center', background: 'var(--bg2)', borderRadius: 9, padding: '7px 4px' }}>
                        <s.Ic size={13} color={s.cor} />
                        <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.1 }}>{s.v}</div>
                        <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{s.lb}</div>
                      </div>
                    ))}
                  </div>

                  {/* Metas / resultado */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 9, borderTop: '1px solid var(--border)', fontSize: 12 }}>
                    <span style={{ color: 'var(--muted)', fontWeight: 600 }}>💰 Vendeu hoje</span>
                    <span style={{ fontWeight: 800, color: 'var(--ok,#16a34a)' }}>{fmt.brl(l.hoje.vendas_valor)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, fontSize: 12 }}>
                    <span style={{ color: 'var(--muted)', fontWeight: 600 }}>🎯 Mês ({l.mes.vendas} venda{l.mes.vendas === 1 ? '' : 's'})</span>
                    <span style={{ fontWeight: 800, color: 'var(--tq2)' }}>{fmt.brl(l.mes.vendas_valor)}</span>
                  </div>

                  {/* Meta individual do mês */}
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4 }}>🏆 Meta individual</span>
                      {editMeta?.id === l.id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input autoFocus value={editMeta.valor} onChange={e => setEditMeta({ id: l.id, valor: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') salvarMetaInd(); if (e.key === 'Escape') setEditMeta(null); }}
                            placeholder="0" style={{ width: 84, padding: '3px 6px', borderRadius: 7, border: '1.5px solid var(--tq)', fontSize: 12, textAlign: 'right' }} />
                          <button onClick={salvarMetaInd} style={{ background: 'var(--tq)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '3px 5px', display: 'flex' }}><Check size={12} /></button>
                        </div>
                      ) : (
                        <button onClick={() => setEditMeta({ id: l.id, valor: l.meta_mensal ? String(Math.round(l.meta_mensal)) : '' })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: l.meta_mensal > 0 ? 'var(--txt)' : 'var(--tq2)', fontWeight: 800, fontSize: 12.5 }}>
                          {l.meta_mensal > 0 ? fmt.brl(l.meta_mensal) : 'definir meta'} <Pencil size={11} style={{ opacity: .6 }} />
                        </button>
                      )}
                    </div>
                    {l.meta_mensal > 0 && (() => {
                      const pct = Math.min(l.meta_pct || 0, 100);
                      const cor = pct >= 100 ? '#16a34a' : pct >= 60 ? '#0891b2' : pct >= 30 ? '#d97706' : '#dc2626';
                      const falta = Math.max(l.meta_mensal - l.mes.vendas_valor, 0);
                      return (
                        <>
                          <div style={{ height: 8, borderRadius: 6, background: 'var(--bg2)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 6, background: cor, transition: 'width .4s' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginTop: 3, color: 'var(--muted)' }}>
                            <span style={{ fontWeight: 800, color: cor }}>{l.meta_pct}%</span>
                            <span>{falta > 0 ? `faltam ${fmt.brl(falta)}` : '🏆 meta batida!'}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Meu planejamento: estratégias, notas e lembretes */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}><Pencil size={18} color="var(--tq2)" /> Meu planejamento</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(TIPOS).map(([k, t]) => (
              <button key={k} onClick={() => abrirNovo(k)} className="btn btn-sm" style={{ gap: 6, background: t.cor + '18', color: t.cor, border: `1.5px solid ${t.cor}44`, fontWeight: 700 }}>
                <Plus size={13} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {notas.length === 0 ? (
          <div className="card" style={{ padding: 34, textAlign: 'center', color: 'var(--muted)' }}>
            <Lightbulb size={30} color="var(--border)" style={{ marginBottom: 8 }} />
            <div style={{ fontWeight: 700 }}>Nada por aqui ainda.</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>Crie suas <b>estratégias</b>, <b>notas</b> e <b>lembretes</b> pra organizar o crescimento da equipe.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
            {notas.map(n => {
              const t = TIPOS[n.tipo] || TIPOS.nota;
              const atrasado = n.tipo === 'lembrete' && n.lembrete_em && !n.concluido && String(n.lembrete_em).slice(0, 10) < new Date().toISOString().slice(0, 10);
              return (
                <div key={n.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', opacity: n.concluido ? .62 : 1 }}>
                  <div style={{ height: 4, background: t.cor }} />
                  <div style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, color: t.cor, background: t.cor + '18', borderRadius: 20, padding: '2px 9px' }}><t.Icon size={12} /> {t.label}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => abrirEdit(n)} title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><Pencil size={13} /></button>
                        <button onClick={() => excluir(n)} title="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                    {n.titulo && <div style={{ fontWeight: 800, fontSize: 14.5, textDecoration: n.concluido ? 'line-through' : 'none' }}>{n.titulo}</div>}
                    {n.conteudo && <div style={{ fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{n.conteudo}</div>}
                    <div style={{ flex: 1 }} />
                    {n.tipo === 'lembrete' && n.lembrete_em && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: atrasado ? 'var(--err)' : 'var(--muted)' }}>
                        <CalendarClock size={13} /> {fmtDia(n.lembrete_em)}{atrasado ? ' · atrasado' : ''}
                      </div>
                    )}
                    <button onClick={() => toggle(n)} className="btn btn-sm" style={{ gap: 6, marginTop: 4, background: n.concluido ? 'var(--bg2)' : t.cor, color: n.concluido ? 'var(--txt2)' : '#fff', border: 'none', fontWeight: 700 }}>
                      <Check size={13} /> {n.concluido ? 'Concluído' : 'Marcar como feito'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal criar/editar */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 480, maxWidth: '100%', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                {React.createElement((TIPOS[modal.tipo] || TIPOS.nota).Icon, { size: 18, color: (TIPOS[modal.tipo] || TIPOS.nota).cor })}
                {modal.id ? 'Editar' : 'Nova'} {(TIPOS[modal.tipo] || TIPOS.nota).label.toLowerCase()}
              </h3>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {Object.entries(TIPOS).map(([k, t]) => (
                  <button key={k} onClick={() => setModal(m => ({ ...m, tipo: k }))} className="btn btn-sm" style={{ flex: 1, gap: 5, fontWeight: 700,
                    background: modal.tipo === k ? t.cor : 'var(--bg2)', color: modal.tipo === k ? '#fff' : 'var(--txt2)', border: 'none' }}>
                    <t.Icon size={13} /> {t.label}
                  </button>
                ))}
              </div>
              <div className="field" style={{ margin: 0 }}><label>Título</label><input value={modal.titulo} onChange={e => setModal({ ...modal, titulo: e.target.value })} placeholder={modal.tipo === 'estrategia' ? 'Ex: Follow-up em 24h de todo orçamento' : modal.tipo === 'lembrete' ? 'Ex: Reunião de alinhamento' : 'Título'} /></div>
              <div className="field" style={{ margin: 0 }}><label>Conteúdo</label><textarea value={modal.conteudo} onChange={e => setModal({ ...modal, conteudo: e.target.value })} rows={5} placeholder="Escreva aqui…" style={{ resize: 'vertical' }} /></div>
              {modal.tipo === 'lembrete' && (
                <div className="field" style={{ margin: 0 }}><label>Data do lembrete</label><input type="date" value={modal.lembrete_em} onChange={e => setModal({ ...modal, lembrete_em: e.target.value })} /></div>
              )}
              {erro && <div style={{ fontSize: 12, color: 'var(--err)', fontWeight: 600 }}>{erro}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={salvar} disabled={salvando} className="btn btn-p" style={{ flex: 1, gap: 6 }}><Check size={14} /> {salvando ? 'Salvando…' : 'Salvar'}</button>
                <button onClick={() => setModal(null)} className="btn">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal cadastrar liderado */}
      {modalAdd && (
        <div onClick={() => setModalAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 440, maxWidth: '100%', maxHeight: '80vh', padding: 22, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><UserPlus size={18} color="var(--tq2)" /> Cadastrar liderado</h3>
              <button onClick={() => setModalAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
            </div>
            <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {disponiveis.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: 10 }}>Carregando equipe…</div>}
              {disponiveis.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, background: u.jaLiderado ? 'var(--tq4)' : 'var(--bg2)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: u.cor || 'linear-gradient(135deg,#0E8C96,#00B8C0)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{inic(u.nome)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{u.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.setor || '—'}{u.temOutroLider ? ' · já tem líder' : ''}</div>
                  </div>
                  {u.jaLiderado ? (
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tq2)' }}>✓ na equipe</span>
                  ) : (
                    <button onClick={() => addLiderado(u)} className="btn btn-p btn-sm" style={{ gap: 5 }}><Plus size={13} /> Add</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
