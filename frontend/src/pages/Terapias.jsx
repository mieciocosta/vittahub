import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Search, MessageCircle, Trash2, X, ClipboardList, Target } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* ─── 🧩 ÁREA DE TERAPIAS ──────────────────────────────────────────────────────
   Pedido do master: uma aba só de terapias, onde a equipe PUXA o paciente pra
   essa área e REGISTRA o plano terapêutico. A meta do setor é 100 planos. */

const STATUS_PAC = [
  ['avaliacao', '🔎 Em avaliação', '#C4973B'],
  ['em_terapia', '🧩 Em terapia', '#7c5cbf'],
  ['pausado', '⏸️ Pausado', '#a07514'],
  ['alta', '🎓 Alta', '#0a8f5b'],
];
const ESPECIALIDADES = ['Terapia ABA', 'Fonoaudiologia', 'Terapia Ocupacional', 'Psicologia', 'Psicopedagogia', 'Fisioterapia', 'Musicoterapia', 'Nutrição'];
const stInfo = (k) => STATUS_PAC.find(s => s[0] === k) || STATUS_PAC[0];
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const wa = (t, m) => `https://wa.me/55${String(t || '').replace(/\D/g, '').slice(-11)}?text=${encodeURIComponent(m)}`;

export default function Terapias() {
  const api = useApi();
  const { user } = useAuth();
  const [dados, setDados] = useState({ pacientes: [], planos: [] });
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [puxar, setPuxar] = useState(null);     // popup de puxar paciente
  const [achados, setAchados] = useState([]);
  const [plano, setPlano] = useState(null);     // popup de registrar plano
  const [aberto, setAberto] = useState(null);   // paciente expandido
  const [toast, setToast] = useState(null);
  const [metaEdit, setMetaEdit] = useState('');
  const mostra = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  const ehGestao = ['master', 'supervisor'].includes(user?.role);

  // ⚠️ `api` fora das dependências de propósito: useApi() devolve um objeto novo
  // a cada render — deixar ele aqui faria a tela buscar dados sem parar.
  const load = useCallback(() => {
    setCarregando(true);
    Promise.all([api.get('/terapias'), api.get('/terapias/resumo').catch(() => null)])
      .then(([d, r]) => { setDados(d || { pacientes: [], planos: [] }); setResumo(r); setCarregando(false); })
      .catch(() => setCarregando(false));
  }, []); // eslint-disable-line
  useEffect(() => { load(); }, [load]);

  // Buscar quem trazer pra área (conversas, clientes e agenda)
  useEffect(() => {
    if (!puxar || (puxar.q || '').trim().length < 2) { setAchados([]); return; }
    const t = setTimeout(() => {
      api.get(`/terapias/buscar?q=${encodeURIComponent(puxar.q)}`).then(setAchados).catch(() => setAchados([]));
    }, 350);
    return () => clearTimeout(t);
  }, [puxar]); // eslint-disable-line

  async function trazer(p) {
    try {
      await api.post('/terapias/pacientes', p);
      setPuxar(null); setAchados([]); load(); mostra(`✓ ${p.nome} entrou na área de terapias`);
    } catch (e) { mostra('⚠️ ' + (e.message || 'Erro')); }
  }

  async function salvarPlano() {
    if (!plano?.especialidade) return mostra('⚠️ Escolha a especialidade');
    try {
      await api.post('/terapias/planos', { ...plano, paciente_id: plano.paciente_id });
      setPlano(null); load(); mostra('✓ Plano terapêutico registrado');
    } catch (e) { mostra('⚠️ ' + (e.message || 'Erro')); }
  }

  async function mudarStatus(p, status) {
    try { await api.put(`/terapias/pacientes/${p.id}`, { status }); load(); } catch (e) { mostra('⚠️ ' + e.message); }
  }
  async function tirarDaArea(p) {
    if (!window.confirm(`Tirar ${p.nome} da área de terapias? Os planos registrados saem junto.`)) return;
    try { await api.delete(`/terapias/pacientes/${p.id}`); load(); mostra('Paciente removido da área'); } catch (e) { mostra('⚠️ ' + e.message); }
  }
  async function salvarMeta() {
    try { await api.put('/terapias/meta', { meta: +metaEdit || 0 }); setMetaEdit(''); load(); mostra('✓ Meta atualizada'); }
    catch (e) { mostra('⚠️ ' + e.message); }
  }

  const visiveis = (dados.pacientes || []).filter(p =>
    (!filtro || p.status === filtro) &&
    (!busca.trim() || String(p.nome).toLowerCase().includes(busca.toLowerCase())));
  const planosDe = (id) => (dados.planos || []).filter(pl => pl.paciente_id === id);

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800 }}>🧩 Terapias</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>Traga o paciente para a área e registre o plano terapêutico.</p>
        </div>
        <button onClick={() => setPuxar({ q: '' })} className="btn btn-p" style={{ gap: 6 }}>
          <Plus size={14} /> Puxar paciente
        </button>
      </div>

      {/* Meta de planos do mês */}
      {resumo && (
        <div className="card" style={{ padding: '18px 20px', marginBottom: 18, background: 'linear-gradient(135deg,#5b21b6,#a855f7)', color: '#fff', border: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', opacity: .85 }}>
                <Target size={12} style={{ verticalAlign: -2 }} /> Meta do mês · planos terapêuticos
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, marginTop: 3 }}>
                {resumo.falta === 0 ? '🏆 Meta batida! Que time.' : `Faltam ${resumo.falta} plano${resumo.falta > 1 ? 's' : ''} para os ${resumo.meta}`}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 34, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>{resumo.feitos}<span style={{ fontSize: 18, opacity: .7 }}>/{resumo.meta}</span></div>
              <div style={{ fontSize: 11, opacity: .85, marginTop: 2 }}>{resumo.pct}% · {resumo.ativos} em andamento</div>
            </div>
          </div>
          <div style={{ height: 9, borderRadius: 6, background: 'rgba(255,255,255,.25)', overflow: 'hidden', marginTop: 12 }}>
            <div style={{ width: `${Math.min(100, resumo.pct)}%`, height: '100%', borderRadius: 6, background: '#fff', transition: 'width .7s' }} />
          </div>
          {resumo.valor_ativo > 0 && <div style={{ fontSize: 11.5, opacity: .9, marginTop: 8 }}>💰 {fmt.brl(resumo.valor_ativo)} por mês nos planos ativos</div>}
          {ehGestao && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="number" min={0} value={metaEdit} onChange={e => setMetaEdit(e.target.value)} placeholder={String(resumo.meta)}
                style={{ width: 110, padding: '7px 10px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700 }} />
              <button onClick={salvarMeta} className="btn btn-s" style={{ fontSize: 12 }}>Salvar meta</button>
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar paciente…"
            style={{ padding: '8px 12px 8px 30px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)' }} />
        </div>
        {[['', `Todos (${(dados.pacientes || []).length})`, 'var(--tq)'], ...STATUS_PAC.map(([k, l, c]) => [k, `${l} (${(dados.pacientes || []).filter(p => p.status === k).length})`, c])].map(([k, l, c]) => (
          <button key={k || 'todos'} onClick={() => setFiltro(k)}
            style={{ padding: '6px 13px', borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: 'pointer',
              border: `1.5px solid ${filtro === k ? c : 'var(--border)'}`,
              background: filtro === k ? c : 'var(--card)', color: filtro === k ? '#fff' : 'var(--muted)' }}>{l}</button>
        ))}
      </div>

      {/* Lista */}
      {carregando ? <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Carregando…</div>
        : visiveis.length === 0 ? (
          <div className="card" style={{ padding: 44, textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 38, opacity: .5, marginBottom: 8 }}>🧩</div>
            <div style={{ fontWeight: 700 }}>{(dados.pacientes || []).length === 0 ? 'Nenhum paciente na área de terapias ainda.' : 'Nada neste filtro.'}</div>
            {(dados.pacientes || []).length === 0 && <button onClick={() => setPuxar({ q: '' })} className="btn btn-p" style={{ marginTop: 14 }}>Puxar o primeiro paciente</button>}
          </div>
        ) : visiveis.map(p => {
          const [, rot, cor] = stInfo(p.status);
          const meus = planosDe(p.id);
          const expandido = aberto === p.id;
          return (
            <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 10, display: 'flex' }}>
              <div style={{ width: 5, background: cor, flexShrink: 0 }} />
              <div style={{ flex: 1, padding: '13px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5 }}>{p.nome}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>
                      {[p.responsavel && `resp.: ${p.responsavel}`, `${meus.length} plano${meus.length === 1 ? '' : 's'}`,
                        p.valor_ativo > 0 && `${fmt.brl(p.valor_ativo)}/mês`, p.origem !== 'manual' && `veio de ${p.origem}`]
                        .filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <select value={p.status} onChange={e => mudarStatus(p, e.target.value)}
                    style={{ padding: '5px 9px', borderRadius: 9, border: `1.5px solid ${cor}`, background: 'var(--card)', color: cor, fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                    {STATUS_PAC.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <button onClick={() => setPlano({ paciente_id: p.id, paciente: p.nome, especialidade: '', sessoes_semana: 2, valor_mensal: '', data_inicio: hojeISO(), observacoes: '' })}
                    className="btn btn-p btn-sm" style={{ gap: 5 }}><ClipboardList size={13} /> Registrar plano</button>
                  {p.telefone
                    ? <a href={wa(p.telefone, `Olá! 💙 Aqui é da Vittalis Saúde, da equipe de terapias.`)} target="_blank" rel="noreferrer"
                        className="btn btn-sm" style={{ gap: 5, background: '#25D366', color: '#fff', border: 'none', fontWeight: 800 }}><MessageCircle size={13} /> WhatsApp</a>
                    : <span style={{ fontSize: 11, color: 'var(--light)' }}>sem telefone</span>}
                  {meus.length > 0 && <button onClick={() => setAberto(expandido ? null : p.id)} className="btn btn-s btn-sm" style={{ fontSize: 12 }}>{expandido ? 'Ocultar' : 'Ver planos'}</button>}
                  <button onClick={() => tirarDaArea(p)} className="btn btn-s btn-sm" style={{ color: '#c0392b' }} title="Tirar da área"><Trash2 size={13} /></button>
                </div>

                {expandido && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    {meus.map(pl => (
                      <div key={pl.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', flexWrap: 'wrap', fontSize: 12.5 }}>
                        <span style={{ fontWeight: 800, minWidth: 150 }}>{pl.especialidade}</span>
                        <span style={{ color: 'var(--muted)' }}>{pl.sessoes_semana}x/semana{pl.valor_mensal ? ` · ${fmt.brl(pl.valor_mensal)}/mês` : ''}{pl.data_inicio ? ` · desde ${pl.data_inicio.split('-').reverse().join('/')}` : ''}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999,
                          background: pl.status === 'ativo' ? '#e2f8ef' : '#eef2f6', color: pl.status === 'ativo' ? '#0a8f5b' : '#5a6b7b' }}>{pl.status}</span>
                        {pl.criado_por_nome && <span style={{ fontSize: 10.5, color: 'var(--light)' }}>por {pl.criado_por_nome.split(' ')[0]}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

      {/* ── Popup: puxar paciente ── */}
      {puxar && (
        <div onClick={() => setPuxar(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 90, padding: 20, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 560, marginTop: 40, padding: 0 }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: 15 }}>Puxar paciente para terapias</b>
              <button onClick={() => setPuxar(null)} className="btn btn-s btn-sm"><X size={14} /></button>
            </div>
            <div style={{ padding: 18 }}>
              <div className="field"><label>Procurar no chat, nos clientes e na agenda</label>
                <input autoFocus value={puxar.q} onChange={e => setPuxar({ ...puxar, q: e.target.value })} placeholder="Nome ou telefone…" />
              </div>
              {achados.length > 0 && (
                <div style={{ marginTop: 4, maxHeight: 240, overflowY: 'auto' }}>
                  {achados.map((a, i) => (
                    <button key={i} onClick={() => trazer({ nome: a.nome, telefone: a.telefone, origem: a.origem, conversa_id: a.origem === 'conversa' ? a.ref : null, lead_id: a.origem === 'lead' ? a.ref : null })}
                      style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', marginBottom: 6, cursor: 'pointer', color: 'var(--txt)' }}>
                      <b style={{ fontSize: 13.5 }}>{a.nome}</b>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 8 }}>{a.telefone || 'sem telefone'} · {a.origem}</span>
                    </button>
                  ))}
                </div>
              )}
              {(puxar.q || '').trim().length >= 2 && achados.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 2px' }}>Ninguém encontrado (ou já está na área). Dá pra cadastrar na mão abaixo.</p>
              )}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
                <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 8, color: 'var(--muted)' }}>Ou cadastre direto</div>
                <div className="field"><label>Nome do paciente</label><input value={puxar.nome || ''} onChange={e => setPuxar({ ...puxar, nome: e.target.value })} /></div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div className="field" style={{ flex: 1 }}><label>Telefone</label><input value={puxar.telefone || ''} onChange={e => setPuxar({ ...puxar, telefone: e.target.value })} placeholder="98 9 9999-9999" /></div>
                  <div className="field" style={{ flex: 1 }}><label>Responsável</label><input value={puxar.responsavel || ''} onChange={e => setPuxar({ ...puxar, responsavel: e.target.value })} /></div>
                </div>
                <button onClick={() => trazer({ nome: puxar.nome, telefone: puxar.telefone, responsavel: puxar.responsavel, origem: 'manual' })}
                  disabled={!(puxar.nome || '').trim()} className="btn btn-p" style={{ width: '100%' }}>Trazer para terapias</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Popup: registrar plano ── */}
      {plano && (
        <div onClick={() => setPlano(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.42)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 90, padding: 20, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 520, marginTop: 40, padding: 0 }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: 15 }}>Plano terapêutico · {plano.paciente}</b>
              <button onClick={() => setPlano(null)} className="btn btn-s btn-sm"><X size={14} /></button>
            </div>
            <div style={{ padding: 18 }}>
              <div className="field"><label>Especialidade *</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {ESPECIALIDADES.map(e => (
                    <button key={e} type="button" onClick={() => setPlano({ ...plano, especialidade: e })}
                      style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                        border: `1.5px solid ${plano.especialidade === e ? '#7c5cbf' : 'var(--border)'}`,
                        background: plano.especialidade === e ? '#7c5cbf' : 'var(--card)', color: plano.especialidade === e ? '#fff' : 'var(--muted)' }}>{e}</button>
                  ))}
                </div>
                <input value={plano.especialidade} onChange={e => setPlano({ ...plano, especialidade: e.target.value })} placeholder="Ou digite outra" />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="field" style={{ flex: 1 }}><label>Sessões/semana</label><input type="number" min={0} max={14} value={plano.sessoes_semana} onChange={e => setPlano({ ...plano, sessoes_semana: e.target.value })} /></div>
                <div className="field" style={{ flex: 1 }}><label>Valor mensal (R$)</label><input type="number" min={0} value={plano.valor_mensal} onChange={e => setPlano({ ...plano, valor_mensal: e.target.value })} placeholder="0,00" /></div>
                <div className="field" style={{ flex: 1 }}><label>Início</label><input type="date" value={plano.data_inicio} onChange={e => setPlano({ ...plano, data_inicio: e.target.value })} /></div>
              </div>
              <div className="field"><label>Observações</label><textarea rows={2} value={plano.observacoes} onChange={e => setPlano({ ...plano, observacoes: e.target.value })} placeholder="O que foi combinado com a família…" /></div>
              <button onClick={salvarPlano} className="btn btn-p" style={{ width: '100%' }}>Registrar plano</button>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>Cada plano registrado conta na meta do mês.</p>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#111827', color: '#fff', padding: '12px 20px', borderRadius: 14, fontSize: 13, fontWeight: 600, zIndex: 99 }}>{toast}</div>}
    </div>
  );
}
