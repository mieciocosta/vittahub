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
  abrir_conversa: ['💬', '#0E8C96'], responder: ['↩️', '#0369a1'], copiar: ['📋', '#7c3aed'],
  registrar_venda: ['💰', '#16a34a'], transferir: ['🔁', '#d97706'], classificar: ['🏷️', '#2563eb'],
  mover_pasta: ['📁', '#C4973B'], toggle_bot: ['🤖', '#0E8C96'],
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
  // 🔒 Tentativas de copiar telefone e capturas de tela (pedido do master)
  const [seg, setSeg] = useState(null);
  const [acessos, setAcessos] = useState(null);   // 🌐 logins por IP (senha compartilhada aparece)
  useEffect(() => {
    if (nivel !== 'seguranca') return;
    setSeg(null);
    api.get('/auditoria/seguranca?dias=30').then(setSeg).catch(e => setSeg({ erro: e.message }));
    api.get('/auditoria/acessos').then(setAcessos).catch(() => setAcessos(null));
  }, [nivel]); // eslint-disable-line
  // 📸 Banco de prints: a reconstituição da tela de cada captura (30 dias)
  const [prints, setPrints] = useState([]);
  const [printImg, setPrintImg] = useState(null);   // {info, imagem|null=carregando}
  useEffect(() => {
    if (nivel !== 'seguranca') return;
    api.get('/auditoria/prints').then(d => setPrints(Array.isArray(d) ? d : [])).catch(() => {});
  }, [nivel]); // eslint-disable-line
  const verPrint = async (pr) => {
    setPrintImg({ info: pr, imagem: null });
    try { const d = await api.get(`/auditoria/prints/${pr.id}/imagem`); setPrintImg({ info: pr, imagem: d.imagem }); }
    catch { setPrintImg(null); }
  };
  const [timeline, setTimeline] = useState(null);
  const [search, setSearch] = useState('');
  // 📍 Histórico de localização de acesso (pedido do master)
  const [locais, setLocais] = useState(null);
  const [locDias, setLocDias] = useState(30);
  const [locUser, setLocUser] = useState(null);
  useEffect(() => {
    if (nivel !== 'locais') return;
    setLocais(null);
    api.get(`/auditoria/localizacoes?dias=${locDias}`).then(setLocais).catch(e => setLocais({ erro: e.message }));
  }, [nivel, locDias]); // eslint-disable-line

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
          {['presenca', 'usuarios', 'locais', 'seguranca'].map(n => (
            <button key={n} onClick={() => { setNivel(n); setSelUser(null); setSelDia(null); }}
              style={{ padding: '7px 15px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${nivel === n || (n === 'usuarios' && ['dias', 'timeline'].includes(nivel)) ? 'var(--tq)' : 'var(--border)'}`,
                background: nivel === n || (n === 'usuarios' && ['dias', 'timeline'].includes(nivel)) ? 'var(--tq)' : '#fff',
                color: nivel === n || (n === 'usuarios' && ['dias', 'timeline'].includes(nivel)) ? '#fff' : 'var(--muted)' }}>
              {n === 'presenca' ? '🟢 Tempo Real' : n === 'usuarios' ? '📊 Histórico' : n === 'locais' ? '📍 Localizações' : '🔒 Segurança'}
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
      {/* 🔒 SEGURANÇA — quem tentou copiar telefone e quem capturou a tela */}
      {/* ── 📍 LOCALIZAÇÕES: de onde cada pessoa entrou no sistema ──────────
             Duas fontes com confiabilidade bem diferente: GPS do navegador
             (preciso, mas só existe com permissão) e IP (sempre existe, mas
             diz rede, não endereço). A tela mostra as duas e diz qual é qual —
             conclusão sobre gente não se tira de dado que finge precisão. */}
      {nivel === 'locais' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Período:</div>
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => { setLocDias(d); setLocUser(null); }}
                style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${locDias === d ? 'var(--tq)' : 'var(--border)'}`,
                  background: locDias === d ? 'var(--tq)' : '#fff', color: locDias === d ? '#fff' : 'var(--muted)' }}>
                {d} dias
              </button>
            ))}
            {locUser && (
              <button onClick={() => setLocUser(null)} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--border)', background: '#fff', color: 'var(--tq2)' }}>
                ← Todos
              </button>
            )}
          </div>

          {locais?.erro && <div style={{ padding: 12, borderRadius: 10, background: 'var(--err2,#fdecec)', color: 'var(--err,#dc2626)', fontSize: 13 }}>{locais.erro}</div>}
          {!locais && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Carregando…</div>}

          {locais && !locais.erro && !locUser && (
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))' }}>
              {!locais.usuarios.length && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhum acesso registrado nesse período.</div>}
              {locais.usuarios.map(u => {
                const semLoc = u.eventos ? Math.round((u.sem_localizacao / u.eventos) * 100) : 0;
                return (
                  <div key={u.usuario_id} onClick={() => setLocUser(u)} className="card"
                    style={{ padding: 14, cursor: 'pointer',
                      borderLeft: `3px solid ${u.alertas_simultaneos ? '#dc2626' : u.lugares > 3 ? '#d97706' : 'var(--tq)'}`,
                      background: u.alertas_simultaneos ? 'rgba(220,38,38,.05)' : undefined }}>
                    <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      {u.usuario_nome || '—'}
                      {u.alertas_simultaneos > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 900, background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '2px 8px' }}>
                          🚨 {u.alertas_simultaneos}x em 2 lugares ao mesmo tempo
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, lineHeight: 1.7 }}>
                      <div><b style={{ color: 'var(--txt)' }}>{u.lugares}</b> {u.lugares === 1 ? 'lugar' : 'lugares'} · <b style={{ color: 'var(--txt)' }}>{u.ips}</b> {u.ips === 1 ? 'rede' : 'redes'}</div>
                      <div>Último acesso: {new Date(u.ultimo).toLocaleString('pt-BR')}</div>
                      {semLoc > 0 && (
                        <div style={{ color: semLoc > 60 ? '#d97706' : 'var(--muted)' }}>
                          {semLoc}% dos acessos sem localização {semLoc > 60 ? '— provavelmente negou a permissão' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {locais && !locais.erro && locUser && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>{locUser.usuario_nome}</div>

              {/* 🚨 MESMO LOGIN, DOIS LUGARES, MESMA HORA (senha emprestada) */}
              {(locais.simultaneos || []).filter(e => e.usuario_id === locUser.usuario_id).length > 0 && (
                <div className="card" style={{ padding: 14, marginBottom: 12, borderLeft: '3px solid #dc2626', background: 'rgba(220,38,38,.05)' }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: '#dc2626' }}>🚨 Login usado em dois lugares ao mesmo tempo</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '4px 0 9px', lineHeight: 1.5 }}>
                    Duas redes diferentes ativas no mesmo intervalo de 10 minutos. Isso não é troca de Wi-Fi para 4G, é o mesmo acesso sendo usado por mais de uma pessoa.
                  </div>
                  {(locais.simultaneos || []).filter(e => e.usuario_id === locUser.usuario_id).map((e, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--txt2)', display: 'flex', gap: 10, flexWrap: 'wrap', padding: '4px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                      <b>{e.dia.split('-').reverse().join('/')} às {e.hora}</b>
                      <span style={{ fontFamily: 'monospace', color: '#dc2626' }}>{e.ips.join('  ×  ')}</span>
                      <span style={{ color: 'var(--muted)' }}>{e.eventos} ações</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 📅 DIA A DIA */}
              {(locais.por_dia || []).filter(d => d.usuario_id === locUser.usuario_id).length > 0 && (
                <div className="card" style={{ padding: 0, marginBottom: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 13 }}>
                    📅 Dia a dia
                  </div>
                  {(() => {
                    const dias = (locais.por_dia || []).filter(d => d.usuario_id === locUser.usuario_id);
                    const total = dias.length;
                    return dias.map((d, i) => (
                    <div key={i} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)',
                      background: d.simultaneo ? 'rgba(220,38,38,.05)' : 'transparent', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 900, color: '#fff', background: 'var(--tq)', borderRadius: 8, padding: '2px 8px', minWidth: 46, textAlign: 'center' }}>
                        Dia {total - i}
                      </span>
                      <b style={{ fontSize: 12.5, minWidth: 86 }}>{d.dia.split('-').reverse().join('/')}</b>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {new Date(new Date(d.primeiro).getTime() - 3 * 3600 * 1000).toISOString().slice(11, 16)}
                        {' às '}
                        {new Date(new Date(d.ultimo).getTime() - 3 * 3600 * 1000).toISOString().slice(11, 16)}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{d.eventos} ações</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: d.redes > 1 ? '#d97706' : 'var(--muted)' }}>
                        {d.redes} rede{d.redes > 1 ? 's' : ''}
                      </span>
                      {d.simultaneo && (
                        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 900, background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '2px 8px' }}>
                          🚨 uso simultâneo
                        </span>
                      )}
                      {/* 📍 Os LUGARES daquele dia, cada um abre no mapa */}
                      <div style={{ flexBasis: '100%', display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                        {(d.coords || []).length === 0 && (
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Sem localização neste dia (permissão não concedida)</span>
                        )}
                        {(d.coords || []).map((c, k) => (
                          <a key={k} href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer"
                            style={{ fontSize: 11, fontWeight: 700, color: 'var(--tq2)', textDecoration: 'none',
                              border: '1px solid var(--border)', borderRadius: 8, padding: '2px 9px', background: 'var(--bg2)' }}>
                            📍 {c.lat.toFixed(3)}, {c.lng.toFixed(3)}
                          </a>
                        ))}
                        {(d.ips || []).map((ip, k) => (
                          <span key={`ip${k}`} style={{ fontSize: 10.5, color: 'var(--muted)', fontFamily: 'monospace',
                            border: '1px dashed var(--border)', borderRadius: 8, padding: '2px 8px' }}>{ip}</span>
                        ))}
                      </div>
                    </div>
                  )); })()}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {locais.lugares.filter(l => l.usuario_id === locUser.usuario_id).map((l, i) => (
                  <div key={i} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    borderLeft: `3px solid ${l.sem_localizacao ? 'var(--light)' : 'var(--tq)'}` }}>
                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                      {l.sem_localizacao ? (
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--muted)' }}>Sem localização — permissão não concedida</div>
                      ) : (
                        <a href={`https://www.google.com/maps?q=${l.latitude},${l.longitude}`} target="_blank" rel="noreferrer"
                          style={{ fontWeight: 700, fontSize: 13, color: 'var(--tq2)', textDecoration: 'none' }}>
                          📍 {l.latitude.toFixed(3)}, {l.longitude.toFixed(3)} — abrir no mapa
                        </a>
                      )}
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                        {l.dispositivo === 'celular' ? '📱' : '🖥️'} {l.navegador} · rede {l.ip || '—'}
                      </div>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'right' }}>
                      <div>{new Date(l.primeiro).toLocaleDateString('pt-BR')} → {new Date(l.ultimo).toLocaleDateString('pt-BR')}</div>
                      <div><b style={{ color: 'var(--txt)' }}>{l.dias}</b> {l.dias === 1 ? 'dia' : 'dias'} · {l.eventos} registros</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--bg2,#f8fafc)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.65 }}>
                <b style={{ color: 'var(--txt2)' }}>Como ler isso:</b> os pontos são agrupados num raio de ~110 m, então casa e clínica
                aparecem separadas, mas duas salas do mesmo prédio não. A <b>rede</b> (IP) muda ao trocar de Wi-Fi para 4G sem a pessoa
                sair do lugar — mudança de rede sozinha não quer dizer mudança de lugar. E acesso sem localização quase sempre é permissão
                negada no navegador, não acesso escondido.
              </div>
            </div>
          )}
        </div>
      )}

      {nivel === 'seguranca' && (
        <div>
          {!seg && <div className="card" style={{ padding: 26, color: 'var(--muted)' }}>Carregando…</div>}
          {seg?.erro && <div className="card" style={{ padding: 20, color: 'var(--err)', fontWeight: 600 }}>⚠️ {seg.erro}</div>}
          {seg && !seg.erro && (<>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <StatCard label="Cópias bloqueadas" valor={seg.resumo.copias} cor="#ea580c" />
              <StatCard label="Capturas de tela" valor={seg.resumo.prints} cor="#dc2626" />
              <StatCard label="Pessoas envolvidas" valor={seg.resumo.pessoas} cor="var(--tq)" />
              <StatCard label="Período" valor={`${seg.dias}d`} cor="var(--muted)" />
            </div>

            {/* 🌐 ACESSOS POR LOCALIZAÇÃO (pedido do master): mesmo login em
                endereços diferentes fica exposto aqui — e gera alerta no sino. */}
            {acessos?.itens?.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>
                  🌐 Acessos por localização <span style={{ fontWeight: 600, color: 'var(--muted)', fontSize: 11.5 }}>(logins dos últimos {acessos.dias} dias, por endereço de rede)</span>
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {acessos.itens.map((u, i) => (
                    <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: u.suspeito ? 'rgba(220,38,38,.05)' : 'transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 13 }}>{u.nome}</span>
                        {u.suspeito ? (
                          <span style={{ fontSize: 10, fontWeight: 800, background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '2px 9px' }}>
                            ⚠️ {u.enderecos} endereços diferentes
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>1 endereço</span>
                        )}
                      </div>
                      <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {u.ips.map((x, j) => (
                          <div key={j} style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, color: u.suspeito ? '#dc2626' : 'var(--txt2)', fontFamily: 'monospace' }}>{x.ip}</span>
                            <span>{x.logins} login(s)</span>
                            <span>último: {new Date(x.ultimo).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            {x.aparelho && <span style={{ opacity: .8, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260, whiteSpace: 'nowrap' }}>{x.aparelho}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                  ⚠️ 2+ endereços pode ser troca de rede (Wi-Fi ↔ 4G) ou a senha usada por duas pessoas — o alerta chega no seu sino na hora do segundo login. Aparelhos diferentes no mesmo nome reforçam a suspeita.
                </div>
              </div>
            )}

            {/* 📸 O banco de prints — a tela como estava no momento da captura */}
            {prints.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>
                  📸 Prints com imagem <span style={{ fontWeight: 600, color: 'var(--muted)', fontSize: 11.5 }}>(reconstituição da tela · guardados 30 dias)</span>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {prints.map(pr => (
                    <div key={pr.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                      <span style={{ fontSize: 15 }}>🖼️</span>
                      <b style={{ minWidth: 110 }}>{String(pr.usuario_nome || '—').split(' ')[0]}</b>
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pr.tela || ''}{pr.conversa ? ` · conversa: ${pr.conversa}` : ''}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(pr.created_at).toLocaleString('pt-BR')}</span>
                      <button onClick={() => verPrint(pr)} className="btn btn-p btn-sm" style={{ fontSize: 11, fontWeight: 800 }}>Ver imagem</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {printImg && (
              <div onClick={() => setPrintImg(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 2000, display: 'flex', flexDirection: 'column', padding: 18 }}>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 13.5, marginBottom: 10 }}>
                  📸 {printImg.info.usuario_nome} · {new Date(printImg.info.created_at).toLocaleString('pt-BR')}{printImg.info.conversa ? ` · ${printImg.info.conversa}` : ''}
                  <span style={{ float: 'right', cursor: 'pointer' }}>✕ fechar</span>
                </div>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {printImg.imagem
                    ? <img src={printImg.imagem} alt="print" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, boxShadow: '0 10px 40px rgba(0,0,0,.5)' }} />
                    : <span style={{ color: '#fff', fontWeight: 700 }}>Carregando a imagem…</span>}
                </div>
              </div>
            )}

            {!seg.por_pessoa.length ? (
              <div className="card" style={{ padding: 26, textAlign: 'center', color: 'var(--muted)', fontSize: 13.5 }}>
                ✅ Nenhuma tentativa de copiar telefone ou captura de tela nos últimos {seg.dias} dias.
              </div>
            ) : (<>
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>
                  Por pessoa
                </div>
                {seg.por_pessoa.map(p => (
                  <div key={p.usuario_id || p.nome} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        última em {new Date(p.ultima).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    {p.copias > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: '#fff7ed', color: '#9a3412' }}>📋 {p.copias} cópia(s)</span>}
                    {p.prints > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: '#fee2e2', color: '#991b1b' }}>📸 {p.prints} print(s)</span>}
                  </div>
                ))}
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>
                  Últimos registros
                </div>
                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {seg.ultimos.map((u, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                      <span style={{ fontSize: 15 }}>{u.acao === 'captura_tela' ? '📸' : '📋'}</span>
                      <b style={{ minWidth: 110 }}>{String(u.usuario_nome || '—').split(' ')[0]}</b>
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--muted)' }}>
                        {u.acao === 'captura_tela' ? 'capturou a tela' : 'tentou copiar telefone'}
                        {u.detalhes?.tela ? ` em ${u.detalhes.tela}` : ''}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {new Date(u.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>)}
          </>)}
        </div>
      )}

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
