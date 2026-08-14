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
// Lista de terapias para ASSINALAR — pedido do master. Cada uma marcada vira
// um plano, com os dias/horários dela e quanto a família paga.
const TERAPIAS = [
  ['Terapia ABA', '🧩'], ['Fonoaudiologia', '🗣️'], ['Terapia Ocupacional', '🖐️'],
  ['Psicologia', '💙'], ['Psicopedagogia', '📚'], ['Fisioterapia', '🦵'],
  ['Musicoterapia', '🎵'], ['Nutrição', '🥗'],
];
const DIAS = [['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'], ['0', 'Dom']];
const nomeDia = (d) => (DIAS.find(x => +x[0] === +d) || ['', '?'])[1];
const resumoHorarios = (hs) => (Array.isArray(hs) && hs.length
  ? hs.map(h => `${nomeDia(h.dia)} ${h.hora}`).join(' · ') : 'sem horário definido');
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
  const [aba, setAba] = useState('pacientes');   // pacientes | grade
  const [grade, setGrade] = useState(null);
  const [autoriz, setAutoriz] = useState(null);
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

  // Grade da semana e autorizações vencendo (mesma trava de `api` nas deps)
  const loadGrade = useCallback(() => {
    api.get('/terapias/grade').then(setGrade).catch(() => setGrade({ slots: [], conflitos: [] }));
    api.get('/terapias/autorizacoes').then(setAutoriz).catch(() => {});
  }, []); // eslint-disable-line
  useEffect(() => { loadGrade(); }, [loadGrade]);

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

  // Marcar/desmarcar uma terapia no popup
  function alternarTerapia(nome) {
    setPlano(pl => {
      const atuais = pl.terapias || {};
      if (atuais[nome]) { const c = { ...atuais }; delete c[nome]; return { ...pl, terapias: c }; }
      return { ...pl, terapias: { ...atuais, [nome]: { horarios: [{ dia: '1', hora: '14:00' }], valor_sessao: '', valor_mensal: '', profissional: '', convenio: '', autorizacao: '', sessoes_autorizadas: '', autorizacao_validade: '' } } };
    });
  }
  const editaTerapia = (nome, campo, valor) =>
    setPlano(pl => ({ ...pl, terapias: { ...pl.terapias, [nome]: { ...pl.terapias[nome], [campo]: valor } } }));
  const editaHorario = (nome, idx, campo, valor) =>
    setPlano(pl => ({ ...pl, terapias: { ...pl.terapias, [nome]: { ...pl.terapias[nome],
      horarios: pl.terapias[nome].horarios.map((h, k) => k === idx ? { ...h, [campo]: valor } : h) } } }));
  const addHorario = (nome) =>
    setPlano(pl => ({ ...pl, terapias: { ...pl.terapias, [nome]: { ...pl.terapias[nome],
      horarios: [...pl.terapias[nome].horarios, { dia: '1', hora: '14:00' }] } } }));
  const tiraHorario = (nome, idx) =>
    setPlano(pl => ({ ...pl, terapias: { ...pl.terapias, [nome]: { ...pl.terapias[nome],
      horarios: pl.terapias[nome].horarios.filter((_, k) => k !== idx) } } }));

  // Mensal sugerido = valor da sessão × sessões por semana × 4 semanas
  const mensalSugerido = (t) => {
    const v = parseFloat(t?.valor_sessao);
    if (!v || !t?.horarios?.length) return null;
    return Math.round(v * t.horarios.length * 4 * 100) / 100;
  };

  async function salvarPlano() {
    const marcadas = Object.entries(plano?.terapias || {});
    if (!marcadas.length) return mostra('⚠️ Marque ao menos uma terapia');
    try {
      const terapias = marcadas.map(([especialidade, t]) => ({
        especialidade,
        horarios: (t.horarios || []).filter(h => h.dia !== '' && h.hora),
        valor_sessao: t.valor_sessao,
        valor_mensal: t.valor_mensal !== '' ? t.valor_mensal : (mensalSugerido(t) ?? ''),
        profissional: t.profissional, convenio: t.convenio, autorizacao: t.autorizacao,
        sessoes_autorizadas: t.sessoes_autorizadas, autorizacao_validade: t.autorizacao_validade,
      }));
      const r = await api.post('/terapias/planos', {
        paciente_id: plano.paciente_id, terapias,
        data_inicio: plano.data_inicio, observacoes: plano.observacoes,
      });
      setPlano(null); load(); loadGrade();
      mostra(`✓ ${r?.criados || terapias.length} plano(s) registrado(s)`);
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

      {/* ⚠️ Guias de convênio vencendo — autorização vencida é atendimento feito
          e não pago. Os sistemas da área avisam antes; aqui também. */}
      {autoriz && autoriz.itens?.length > 0 && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 16, borderLeft: '5px solid #e8671a' }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8, color: '#b45309' }}>
            ⚠️ {autoriz.vencidas > 0 && `${autoriz.vencidas} guia(s) VENCIDA(S)`}
            {autoriz.vencidas > 0 && autoriz.vencendo > 0 && ' · '}
            {autoriz.vencendo > 0 && `${autoriz.vencendo} vencendo em até 15 dias`}
          </div>
          {autoriz.itens.map(a => (
            <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0', fontSize: 12.5, flexWrap: 'wrap' }}>
              <b style={{ minWidth: 150 }}>{a.paciente}</b>
              <span style={{ color: 'var(--muted)' }}>{a.especialidade}{a.convenio ? ` · ${a.convenio}` : ''}{a.autorizacao ? ` · guia ${a.autorizacao}` : ''}{a.sessoes_autorizadas ? ` · ${a.sessoes_autorizadas} sessões` : ''}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 800, color: a.dias < 0 ? '#c0392b' : '#b45309' }}>
                {a.dias < 0 ? `venceu há ${Math.abs(a.dias)} dia(s)` : a.dias === 0 ? 'vence hoje' : `vence em ${a.dias} dia(s)`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Abas */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['pacientes', '👥 Pacientes'], ['grade', '🗓️ Grade da semana']].map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)}
            style={{ padding: '7px 15px', borderRadius: 10, fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
              border: `1.5px solid ${aba === k ? 'var(--tq)' : 'var(--border)'}`,
              background: aba === k ? 'var(--tq)' : 'var(--card)', color: aba === k ? '#fff' : 'var(--muted)' }}>
            {l}{k === 'grade' && grade?.conflitos?.length > 0 && <span style={{ marginLeft: 6, background: '#c0392b', color: '#fff', borderRadius: 999, padding: '1px 7px', fontSize: 10.5 }}>{grade.conflitos.length}</span>}
          </button>
        ))}
      </div>

      {aba === 'grade' ? <GradeSemana grade={grade} /> : (<>

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
                  <button onClick={() => setPlano({ paciente_id: p.id, paciente: p.nome, terapias: {}, data_inicio: hojeISO(), observacoes: '' })}
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
                        <span style={{ color: 'var(--muted)' }}>
                          🗓️ {resumoHorarios(pl.horarios)}
                          {pl.valor_sessao ? ` · ${fmt.brl(pl.valor_sessao)}/sessão` : ''}
                          {pl.valor_mensal ? ` · ${fmt.brl(pl.valor_mensal)}/mês` : ''}
                          {pl.profissional ? ` · 👩‍⚕️ ${pl.profissional}` : ''}
                          {pl.convenio ? ` · ${pl.convenio}` : ''}
                          {pl.autorizacao_validade ? ` · guia até ${pl.autorizacao_validade.split('-').reverse().join('/')}` : ''}
                        </span>
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

      </>)}

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
              <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)', marginBottom: 8 }}>
                Marque as terapias que a criança faz e diga o dia, a hora e quanto a família paga
              </div>

              {TERAPIAS.map(([nome, ico]) => {
                const t = plano.terapias?.[nome];
                const marcada = !!t;
                const sugerido = mensalSugerido(t);
                return (
                  <div key={nome} style={{ border: `1.5px solid ${marcada ? '#7c5cbf' : 'var(--border)'}`, borderRadius: 12, marginBottom: 8, overflow: 'hidden', background: marcada ? 'rgba(124,92,191,.06)' : 'transparent' }}>
                    <button type="button" onClick={() => alternarTerapia(nome)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt)', textAlign: 'left' }}>
                      <span style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${marcada ? '#7c5cbf' : 'var(--border)'}`, background: marcada ? '#7c5cbf' : 'transparent', color: '#fff', fontSize: 13, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{marcada ? '✓' : ''}</span>
                      <span style={{ fontSize: 14 }}>{ico}</span>
                      <b style={{ fontSize: 13.5, flex: 1 }}>{nome}</b>
                      {marcada && <span style={{ fontSize: 11, color: '#7c5cbf', fontWeight: 800 }}>{t.horarios.length}x/semana</span>}
                    </button>

                    {marcada && (
                      <div style={{ padding: '0 13px 13px 13px' }}>
                        {t.horarios.map((h, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                            <select value={h.dia} onChange={e => editaHorario(nome, idx, 'dia', e.target.value)}
                              style={{ padding: '6px 9px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 12.5, fontWeight: 700, background: 'var(--card)', color: 'var(--txt)' }}>
                              {DIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                            <input type="time" value={h.hora} onChange={e => editaHorario(nome, idx, 'hora', e.target.value)}
                              style={{ padding: '6px 9px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 12.5, fontWeight: 700, background: 'var(--card)', color: 'var(--txt)' }} />
                            {t.horarios.length > 1 && (
                              <button type="button" onClick={() => tiraHorario(nome, idx)} title="Tirar este horário"
                                style={{ padding: '5px 9px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: '#c0392b', cursor: 'pointer', fontSize: 12 }}>✕</button>
                            )}
                            {idx === t.horarios.length - 1 && (
                              <button type="button" onClick={() => addHorario(nome)}
                                style={{ padding: '5px 11px', borderRadius: 9, border: '1.5px dashed #7c5cbf', background: 'transparent', color: '#7c5cbf', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>+ horário</button>
                            )}
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 130px' }}>
                            <label style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Paga por sessão (R$)</label>
                            <input type="number" min={0} value={t.valor_sessao} onChange={e => editaTerapia(nome, 'valor_sessao', e.target.value)} placeholder="0,00"
                              style={{ width: '100%', padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)' }} />
                          </div>
                          <div style={{ flex: '1 1 130px' }}>
                            <label style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Paga por mês (R$)</label>
                            <input type="number" min={0} value={t.valor_mensal} onChange={e => editaTerapia(nome, 'valor_mensal', e.target.value)}
                              placeholder={sugerido != null ? String(sugerido) : '0,00'}
                              style={{ width: '100%', padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)' }} />
                          </div>
                        </div>
                        {sugerido != null && !t.valor_mensal && (
                          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
                            💡 {t.horarios.length} sessão(ões) por semana × 4 semanas = <b>{fmt.brl(sugerido)}/mês</b>. Deixe em branco para usar essa conta.
                          </p>
                        )}
                        {/* Quem atende: é o que permite a grade apontar terapeuta
                            marcado em dois lugares no mesmo horário. */}
                        <div style={{ marginTop: 8 }}>
                          <label style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Terapeuta que atende</label>
                          <input value={t.profissional} onChange={e => editaTerapia(nome, 'profissional', e.target.value)} placeholder="Nome do terapeuta"
                            style={{ width: '100%', padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)' }} />
                        </div>
                        {/* Convênio e autorização — em TEA boa parte vem por plano
                            de saúde, e autorização vencida é atendimento não pago. */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 120px' }}>
                            <label style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Convênio</label>
                            <input value={t.convenio} onChange={e => editaTerapia(nome, 'convenio', e.target.value)} placeholder="Particular"
                              style={{ width: '100%', padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)' }} />
                          </div>
                          <div style={{ flex: '1 1 110px' }}>
                            <label style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Nº autorização</label>
                            <input value={t.autorizacao} onChange={e => editaTerapia(nome, 'autorizacao', e.target.value)} placeholder="guia"
                              style={{ width: '100%', padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)' }} />
                          </div>
                          <div style={{ flex: '0 1 100px' }}>
                            <label style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Sessões aut.</label>
                            <input type="number" min={0} value={t.sessoes_autorizadas} onChange={e => editaTerapia(nome, 'sessoes_autorizadas', e.target.value)} placeholder="0"
                              style={{ width: '100%', padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)' }} />
                          </div>
                          <div style={{ flex: '1 1 130px' }}>
                            <label style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Validade da guia</label>
                            <input type="date" value={t.autorizacao_validade} onChange={e => editaTerapia(nome, 'autorizacao_validade', e.target.value)}
                              style={{ width: '100%', padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, background: 'var(--card)', color: 'var(--txt)' }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <div className="field" style={{ flex: 1 }}><label>Início do tratamento</label><input type="date" value={plano.data_inicio} onChange={e => setPlano({ ...plano, data_inicio: e.target.value })} /></div>
              </div>
              <div className="field"><label>Observações</label><textarea rows={2} value={plano.observacoes} onChange={e => setPlano({ ...plano, observacoes: e.target.value })} placeholder="O que foi combinado com a família…" /></div>
              <button onClick={salvarPlano} className="btn btn-p" style={{ width: '100%' }}>
                Registrar {Object.keys(plano.terapias || {}).length || ''} plano{Object.keys(plano.terapias || {}).length === 1 ? '' : 's'}
              </button>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>Cada terapia marcada vira um plano e conta na meta do mês.</p>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#111827', color: '#fff', padding: '12px 20px', borderRadius: 14, fontSize: 13, fontWeight: 600, zIndex: 99 }}>{toast}</div>}
    </div>
  );
}

/* ─── 🗓️ GRADE DA SEMANA ───────────────────────────────────────────────────────
   Os sistemas da área tratam a agenda como MULTIRRECURSO: o terapeuta não pode
   estar em dois lugares no mesmo horário. A grade sai dos horários fixos dos
   planos ativos e destaca em vermelho quem está marcado duas vezes. */
function GradeSemana({ grade }) {
  if (!grade) return <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Montando a grade…</div>;
  const slots = grade.slots || [];
  if (!slots.length) return (
    <div className="card" style={{ padding: 44, textAlign: 'center', color: 'var(--muted)' }}>
      <div style={{ fontSize: 38, opacity: .5, marginBottom: 8 }}>🗓️</div>
      <div style={{ fontWeight: 700 }}>Nenhum horário marcado ainda.</div>
      <div style={{ fontSize: 12.5, marginTop: 6 }}>Registre um plano com dia e hora e a grade se monta sozinha.</div>
    </div>
  );

  const horas = [...new Set(slots.map(s => s.hora))].sort();
  const COR = { 'Terapia ABA': '#7c5cbf', 'Fonoaudiologia': '#00B8C0', 'Terapia Ocupacional': '#C4973B',
    'Psicologia': '#0e7490', 'Psicopedagogia': '#a855f7', 'Fisioterapia': '#16a34a',
    'Musicoterapia': '#ec4899', 'Nutrição': '#84cc16' };

  return (
    <div>
      {grade.conflitos?.length > 0 && (
        <div className="card" style={{ padding: '13px 18px', marginBottom: 12, borderLeft: '5px solid #c0392b' }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: '#c0392b', marginBottom: 6 }}>
            ⚠️ {grade.conflitos.length} choque(s) de horário — o mesmo terapeuta está marcado com dois pacientes
          </div>
          {grade.conflitos.map((c, i) => (
            <div key={i} style={{ fontSize: 12.5, color: 'var(--muted)', padding: '3px 0' }}>
              <b style={{ color: 'var(--txt)' }}>{c.profissional}</b> · {nomeDia(c.dia)} {c.hora} — {c.itens.map(x => x.paciente).join(' e ')}
            </div>
          ))}
        </div>
      )}
      {grade.sem_horario > 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
          ℹ️ {grade.sem_horario} plano(s) ativo(s) ainda sem dia/horário definido — eles não aparecem na grade.
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--muted)', borderBottom: '1px solid var(--border)', width: 62 }}>Hora</th>
              {DIAS.map(([v, l]) => (
                <th key={v} style={{ padding: '10px 8px', fontSize: 11.5, fontWeight: 800, color: 'var(--txt)', borderBottom: '1px solid var(--border)' }}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {horas.map(h => (
              <tr key={h}>
                <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 800, fontSize: 12.5, color: 'var(--tq2)', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>{h}</td>
                {DIAS.map(([v]) => {
                  const doSlot = slots.filter(s => s.hora === h && s.dia === +v);
                  return (
                    <td key={v} style={{ padding: 5, borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', verticalAlign: 'top' }}>
                      {doSlot.map((s, i) => (
                        <div key={i} title={`${s.paciente} · ${s.especialidade}${s.profissional ? ` · ${s.profissional}` : ''}`}
                          style={{ background: s.conflito ? '#fdecec' : `${COR[s.especialidade] || '#64748b'}18`,
                            border: `1.5px solid ${s.conflito ? '#c0392b' : (COR[s.especialidade] || '#64748b')}`,
                            borderRadius: 9, padding: '5px 7px', marginBottom: 4 }}>
                          <div style={{ fontWeight: 800, fontSize: 11.5, lineHeight: 1.25 }}>{s.conflito && '⚠️ '}{s.paciente.split(' ').slice(0, 2).join(' ')}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{s.especialidade}</div>
                          {s.profissional && <div style={{ fontSize: 10, color: COR[s.especialidade] || '#64748b', fontWeight: 700 }}>{s.profissional.split(' ')[0]}</div>}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
