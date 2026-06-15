import React, { useEffect, useState, useCallback } from 'react';
import { Shield, Search, ChevronLeft, MapPin, Clock, Wifi, WifiOff, Loader2, Monitor, Smartphone } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* ═══ AUDITORIA VITTAHUB — somente administrador ═══════════════════════════
   3 níveis: Presença (tempo real) + Usuários → Dias → Timeline.
   Localização, ociosidade, IP, dispositivo — mesmo conceito do VittaSys.   */

const ACOES = {
  login: ['🔑', '#059669'], login_falha: ['🚫', '#dc2626'], navegacao: ['📄', '#94a3b8'],
  enviar_msg: ['💬', '#0369a1'], criar_lead: ['➕', '#2563eb'], editar_lead: ['✏️', '#7c3aed'],
  agendar: ['📅', '#0E8C96'], excluir: ['🗑️', '#dc2626'], editar_mensagem: ['✏️', '#d97706'],
  apagar_mensagem: ['🗑️', '#dc2626'], indicacao: ['🎁', '#C4973B'], proposta: ['💰', '#059669'],
  heartbeat: ['💓', '#e2e8f0'],
};
const CRIT = ['excluir', 'editar_lead', 'apagar_mensagem', 'editar_mensagem', 'login_falha'];

export default function Auditoria() {
  const api = useApi();
  const { isMaster } = useAuth();
  const [nivel, setNivel] = useState('presenca'); // presenca | usuarios | dias | timeline
  const [selUser, setSelUser] = useState(null);
  const [selDia, setSelDia] = useState(null);
  const [stats, setStats] = useState(null);
  const [presenca, setPresenca] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [dias, setDias] = useState([]);
  const [timeline, setTimeline] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => { api.get('/auditoria/stats').then(setStats).catch(() => {}); }, []); // eslint-disable-line

  const loadPresenca = useCallback(() => {
    api.get('/auditoria/presenca').then(setPresenca).catch(() => {});
  }, []); // eslint-disable-line
  useEffect(() => { if (nivel === 'presenca') { loadPresenca(); const t = setInterval(loadPresenca, 15000); return () => clearInterval(t); } }, [nivel]); // eslint-disable-line

  useEffect(() => {
    if (nivel === 'usuarios') api.get(`/auditoria/usuarios${search ? `?search=${encodeURIComponent(search)}` : ''}`).then(setUsuarios).catch(() => {});
  }, [nivel, search]); // eslint-disable-line

  useEffect(() => {
    if (nivel === 'dias' && selUser) api.get(`/auditoria/usuario/${selUser.id}/dias`).then(setDias).catch(() => {});
  }, [nivel, selUser?.id]); // eslint-disable-line

  useEffect(() => {
    if (nivel === 'timeline' && selUser && selDia) api.get(`/auditoria/usuario/${selUser.id}/dia/${selDia}`).then(setTimeline).catch(() => {});
  }, [nivel, selUser?.id, selDia]); // eslint-disable-line

  if (!isMaster) return <div style={{ padding: 40, color: 'var(--muted)' }}>Acesso restrito ao administrador.</div>;

  const Breadcrumb = () => (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
      <span onClick={() => { setNivel('presenca'); setSelUser(null); setSelDia(null); }} style={{ cursor: 'pointer', color: 'var(--tq2)', fontWeight: 700 }}>Auditoria</span>
      {(nivel === 'usuarios' || nivel === 'dias' || nivel === 'timeline') && (
        <><span style={{ color: 'var(--light)' }}>›</span><span onClick={() => setNivel('usuarios')} style={{ cursor: 'pointer', color: 'var(--tq2)', fontWeight: 600 }}>Usuários</span></>
      )}
      {(nivel === 'dias' || nivel === 'timeline') && selUser && (
        <><span style={{ color: 'var(--light)' }}>›</span><span onClick={() => setNivel('dias')} style={{ cursor: 'pointer', color: 'var(--tq2)', fontWeight: 600 }}>{selUser.nome?.split(' ')[0]}</span></>
      )}
      {nivel === 'timeline' && selDia && <><span style={{ color: 'var(--light)' }}>›</span><span style={{ fontWeight: 600 }}>{selDia.split('-').reverse().join('/')}</span></>}
    </div>
  );

  const StatCard = ({ label, valor, cor }) => (
    <div style={{ flex: 1, minWidth: 100, padding: '12px 14px', background: 'var(--card)', borderRadius: 11, borderLeft: `3px solid ${cor}`, textAlign: 'center', boxShadow: '0 1px 3px #0001' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor }}>{valor}</div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: .5 }}>{label}</div>
    </div>
  );

  const Avatar = ({ u, size = 36 }) => u.avatar
    ? <img src={u.avatar} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: u.cor || 'var(--tq)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * .35, fontWeight: 800 }}>{fmt.initials(u.nome)}</div>;

  return (
    <div style={{ padding: 28 }}>
      <Breadcrumb />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><Shield size={22} color="var(--tq2)" /> Auditoria</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>Presença, localização, atividades e ociosidade da equipe</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['presenca', 'usuarios'].map(n => (
            <button key={n} onClick={() => { setNivel(n); setSelUser(null); setSelDia(null); }}
              style={{ padding: '7px 15px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${nivel === n || (n === 'usuarios' && ['dias', 'timeline'].includes(nivel)) ? 'var(--tq)' : 'var(--border)'}`,
                background: nivel === n || (n === 'usuarios' && ['dias', 'timeline'].includes(nivel)) ? 'var(--tq)' : '#fff',
                color: nivel === n || (n === 'usuarios' && ['dias', 'timeline'].includes(nivel)) ? '#fff' : 'var(--muted)' }}>
              {n === 'presenca' ? '🟢 Tempo Real' : '📊 Histórico'}
            </button>
          ))}
        </div>
      </div>

      {stats && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <StatCard label="Total" valor={stats.total || 0} cor="#1B4965" />
          <StatCard label="Hoje" valor={stats.hoje || 0} cor="#0E8C96" />
          <StatCard label="Logins" valor={stats.logins_hoje || 0} cor="#059669" />
          <StatCard label="Críticas" valor={stats.acoes_criticas || 0} cor="#dc2626" />
        </div>
      )}

      {/* ── Presença em tempo real ── */}
      {nivel === 'presenca' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'var(--card)' }}>
          <div style={{ padding: '13px 18px', background: 'linear-gradient(90deg,var(--tq),#0aa6ae)', color: '#fff', fontWeight: 800, fontSize: 14 }}>
            Equipe — Tempo Real
          </div>
          {presenca.length === 0 && <div style={{ padding: '36px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Nenhum dado de presença ainda — o heartbeat começa quando a equipe abrir o CRM.</div>}
          {presenca.map(p => {
            const st = p.status_calc;
            const cor = st === 'online' ? '#059669' : st === 'ocioso' ? '#d97706' : '#94a3b8';
            const label = st === 'online' ? 'Online' : st === 'ocioso' ? `Ocioso há ${p.tempo_ocioso} min` : `Offline há ${p.tempo_ocioso} min`;
            const ua = p.user_agent || '';
            const isMobile = ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone');
            return (
              <div key={p.usuario_id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 18px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ position: 'relative' }}>
                  <Avatar u={p} size={40} />
                  <div style={{ position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: '50%', background: cor, border: '2px solid #fff' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.nome} <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>· {p.role === 'master' ? 'Master' : p.role === 'supervisor' ? 'Supervisora' : 'Atendente'}{p.setor ? ` · ${p.setor}` : ''}</span></div>
                  <div style={{ fontSize: 11.5, color: cor, fontWeight: 700 }}>{label}{p.pagina ? ` · ${p.pagina}` : ''}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
                    {isMobile ? <Smartphone size={12} /> : <Monitor size={12} />}
                    <span>{p.ip}</span>
                  </div>
                  {p.latitude && p.longitude && (
                    <a href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`} target="_blank" rel="noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--tq2)', fontWeight: 700, textDecoration: 'none' }}>
                      <MapPin size={11} /> Ver localização
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Nível 1: Usuários ── */}
      {nivel === 'usuarios' && (
        <>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 400, padding: '8px 12px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--card)' }}>
              <Search size={14} color="var(--muted)" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar usuário…"
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13, background: 'transparent', color: 'var(--txt)' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
            {usuarios.map(u => (
              <div key={u.id} onClick={() => { setSelUser(u); setNivel('dias'); }}
                className="card" style={{ padding: '14px 16px', cursor: 'pointer', borderLeft: `4px solid ${u.role === 'master' ? '#059669' : u.role === 'supervisor' ? '#0E8C96' : '#64748b'}`, background: 'var(--card)', transition: 'box-shadow .15s' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px #0002'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>{u.nome}</div><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{u.role}{u.setor ? ` · ${u.setor}` : ''}</div></div>
                  <Avatar u={u} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 12 }}>
                  <div><span style={{ color: 'var(--muted)' }}>Eventos:</span> <b>{u.total_eventos || 0}</b></div>
                  <div><span style={{ color: 'var(--muted)' }}>Críticas:</span> <b style={{ color: '#dc2626' }}>{u.acoes_criticas || 0}</b></div>
                  {u.ultimo_acesso && <div style={{ gridColumn: '1/-1', color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>Último: {fmt.relTime(u.ultimo_acesso)}</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Nível 2: Dias ── */}
      {nivel === 'dias' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dias.length === 0 && <div className="card" style={{ padding: '36px 18px', textAlign: 'center', color: 'var(--muted)', background: 'var(--card)' }}>Sem atividade registrada.</div>}
          {dias.map(d => {
            const dt = new Date(String(d.data).slice(0, 10) + 'T12:00:00');
            const DS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            const fh = t => t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
            return (
              <div key={d.data} onClick={() => { setSelDia(String(d.data).slice(0, 10)); setNivel('timeline'); }}
                className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', cursor: 'pointer', background: 'var(--card)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--tq4)'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                <div style={{ width: 48, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tq2)' }}>{dt.getDate()}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>{DS[dt.getDay()]}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{String(d.data).slice(0, 10)}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{fh(d.primeiro)} → {fh(d.ultimo)} · {d.duracao_min} min</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ padding: '4px 10px', borderRadius: 8, background: '#e0f2fe', fontSize: 12, fontWeight: 700, color: '#0369a1' }}>{d.total}</span>
                  {d.criticos > 0 && <span style={{ padding: '4px 10px', borderRadius: 8, background: '#fef2f2', fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{d.criticos}⚠</span>}
                </div>
                <span style={{ color: 'var(--muted)' }}>→</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Nível 3: Timeline ── */}
      {nivel === 'timeline' && timeline && (
        <>
          {timeline.sessao && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              {[['1º Acesso', timeline.sessao.primeiro ? new Date(timeline.sessao.primeiro).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—', '#0369a1'],
                ['Último', timeline.sessao.ultimo ? new Date(timeline.sessao.ultimo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—', '#0369a1'],
                ['Total', `${timeline.sessao.duracao_min || 0}m`, '#1B4965'],
                ['Ativo', `${timeline.sessao.ativo_min || 0}m`, '#059669'],
                ['Ocioso', `${timeline.sessao.ocioso_min || 0}m`, '#d97706'],
                ['Eventos', String(timeline.sessao.total_eventos || 0), '#0E8C96'],
              ].map(([l, v, c]) => (
                <div key={l} style={{ flex: 1, minWidth: 80, padding: '10px 12px', background: 'var(--card)', borderRadius: 9, textAlign: 'center', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{v}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ position: 'relative', paddingLeft: 24, borderLeft: '2px solid var(--border)' }}>
            {(timeline.timeline || []).map(e => {
              const [icon, color] = ACOES[e.acao] || ['📌', '#94a3b8'];
              const isCrit = e.critico;
              const hora = e.hora ? new Date(e.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
              return (
                <div key={e.id} style={{ position: 'relative', marginBottom: 6, marginLeft: 12 }}>
                  <div style={{ position: 'absolute', left: isCrit ? -32 : -30, top: 14, width: isCrit ? 16 : 10, height: isCrit ? 16 : 10, borderRadius: '50%', background: color, border: '2px solid #fff', boxShadow: `0 0 0 2px ${color}40` }} />
                  {e.gap_seconds && e.gap_seconds > 120 && (
                    <div style={{ fontSize: 10, color: '#d97706', fontWeight: 600, marginBottom: 4, fontStyle: 'italic' }}>⏸ {Math.round(e.gap_seconds / 60)} min ocioso</div>
                  )}
                  <div style={{ padding: isCrit ? '12px 14px' : '7px 12px', background: isCrit ? 'var(--warn2)' : 'var(--card)', borderRadius: 10, border: `${isCrit ? 2 : 1}px solid ${isCrit ? '#f59e0b' : 'var(--border)'}`, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: isCrit ? 18 : 14 }}>{icon}</span>
                        <span style={{ fontWeight: 700, fontSize: isCrit ? 13 : 12, color, fontFamily: 'monospace' }}>{hora}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: isCrit ? 11 : 10, fontWeight: 700, color: '#fff', background: color }}>{e.acao.toUpperCase().replace(/_/g, ' ')}</span>
                        {e.entidade && <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, background: 'var(--bg2)', color: 'var(--muted)', fontWeight: 600 }}>{e.entidade}</span>}
                        {e.entidade_id && <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>#{String(e.entidade_id).slice(0, 12)}</span>}
                        {e.latitude && (
                          <a href={`https://www.google.com/maps?q=${e.latitude},${e.longitude}`} target="_blank" rel="noreferrer"
                            style={{ fontSize: 10, color: 'var(--tq2)', fontWeight: 700, textDecoration: 'none' }}>📍</a>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10, color: 'var(--muted)' }}>
                        <span>{e.device}</span><span>{e.browser}</span><span>{e.ip}</span>
                      </div>
                    </div>
                    {e.detalhes && typeof e.detalhes === 'object' && Object.keys(e.detalhes).length > 0 && (
                      <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--txt2)', background: 'var(--bg2)', padding: '6px 10px', borderRadius: 7, fontFamily: 'monospace', wordBreak: 'break-all', maxHeight: 100, overflow: 'auto' }}>
                        {JSON.stringify(e.detalhes, null, 1)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {(!timeline.timeline || timeline.timeline.length === 0) && <div style={{ padding: '30px 18px', color: 'var(--muted)', fontSize: 13 }}>Sem eventos neste dia.</div>}
          </div>
        </>
      )}
    </div>
  );
}
