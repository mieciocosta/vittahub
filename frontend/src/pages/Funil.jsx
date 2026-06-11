import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { MessageCircle, Pencil, Plus, Trash2, GripVertical, Check, X, Search, Clock, CalendarClock, Phone } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt, openWA } from '../hooks/utils.js';
import LeadModal from '../components/LeadModal.jsx';

/* ─── Funil de Vendas — Kanban ────────────────────────────────────────────────
   Colunas dinâmicas (título editável inline, cor, ordem, criar/excluir) +
   arrastar e soltar leve em HTML5 nativo, sem dependência nova.
   "Fechado" e "Perdido" são fixas (relatórios dependem do nome).             */

const COL_W = 264;
const PALETA = ['#3b82f6', '#f97316', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#00B8C0', '#207898', '#C4973B', '#ec4899'];

/* tempo na etapa: "hoje" / "3d" — acima de 7 dias sinaliza estagnação */
function tempoEtapa(iso) {
  if (!iso) return null;
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return { txt: 'hoje', stale: false };
  return { txt: `${dias}d na etapa`, stale: dias > 7 };
}

export default function Funil() {
  const api = useApi();
  const { isMaster, user } = useAuth();
  const [colunas, setColunas] = useState([]);
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);          // lead em edição | { _novo:true, status }
  const [busca, setBusca] = useState('');
  const [fResp, setFResp] = useState('');
  const [erro, setErro] = useState('');

  // drag de lead / drag de coluna
  const [dragLead, setDragLead] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [dragCol, setDragCol] = useState(null);

  // edição inline de coluna
  const [editCol, setEditCol] = useState(null);      // { id, nome }
  const [paletteFor, setPaletteFor] = useState(null);
  const [novaCol, setNovaCol] = useState(false);
  const [novaColNome, setNovaColNome] = useState('');

  const flash = (m) => { setErro(m); setTimeout(() => setErro(''), 4000); };

  const load = useCallback(async (silent = false) => {
    try {
      const [cols, ls, meta] = await Promise.all([
        api.get('/leads/colunas'),
        api.get('/leads?limit=400'),
        users.length ? Promise.resolve(null) : api.get('/leads/meta'),
      ]);
      setColunas(cols || []);
      setLeads(ls.data || []);
      if (meta) setUsers(meta.users || []);
    } catch (e) { if (!silent) flash(e.message); }
  }, [users.length]); // eslint-disable-line

  useEffect(() => { load(); }, []); // eslint-disable-line
  // Atualização leve: polling 20s + ao voltar para a aba
  useEffect(() => {
    const t = setInterval(() => load(true), 20000);
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [load]);

  /* ── filtros ── */
  const leadsFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return leads.filter(l => {
      if (fResp && l.responsavel_id !== fResp) return false;
      if (!q) return true;
      return (l.nome || '').toLowerCase().includes(q) || (l.telefone || '').includes(q) || (l.interesse || '').toLowerCase().includes(q);
    });
  }, [leads, busca, fResp]);

  /* ── mover lead ── */
  const dropLead = async (e, colNome) => {
    e.preventDefault(); setOverCol(null);
    if (dragCol) return dropColuna(colNome);
    if (!dragLead || dragLead.status === colNome) { setDragLead(null); return; }
    const id = dragLead.id;
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status: colNome, status_changed_at: new Date().toISOString() } : l));
    setDragLead(null);
    try { await api.patch(`/leads/${id}/status`, { status: colNome }); }
    catch (err) { flash(err.message); load(true); }
  };

  /* ── reordenar colunas (arrastar pelo cabeçalho) ── */
  const dropColuna = async (alvoNome) => {
    const de = colunas.findIndex(c => c.nome === dragCol);
    const para = colunas.findIndex(c => c.nome === alvoNome);
    setDragCol(null);
    if (de < 0 || para < 0 || de === para) return;
    const nova = [...colunas];
    const [mov] = nova.splice(de, 1);
    nova.splice(para, 0, mov);
    setColunas(nova);
    try { await api.patch('/leads/colunas/reorder', { ids: nova.map(c => c.id) }); }
    catch (err) { flash(err.message); load(true); }
  };

  /* ── colunas: criar / renomear / cor / excluir ── */
  const criarColuna = async () => {
    const nome = novaColNome.trim();
    if (!nome) { setNovaCol(false); return; }
    try {
      const col = await api.post('/leads/colunas', { nome, cor: PALETA[colunas.length % PALETA.length] });
      setColunas(p => [...p, col]);
      setNovaCol(false); setNovaColNome('');
    } catch (err) { flash(err.message); }
  };
  const salvarNomeColuna = async () => {
    if (!editCol) return;
    const { id, nome } = editCol;
    const atual = colunas.find(c => c.id === id);
    setEditCol(null);
    if (!nome.trim() || nome === atual?.nome) return;
    try {
      const upd = await api.put(`/leads/colunas/${id}`, { nome: nome.trim() });
      setColunas(p => p.map(c => c.id === id ? upd : c));
      setLeads(p => p.map(l => l.status === atual.nome ? { ...l, status: upd.nome } : l));
    } catch (err) { flash(err.message); }
  };
  const mudarCor = async (col, cor) => {
    setPaletteFor(null);
    try {
      const upd = await api.put(`/leads/colunas/${col.id}`, { cor });
      setColunas(p => p.map(c => c.id === col.id ? upd : c));
    } catch (err) { flash(err.message); }
  };
  const excluirColuna = async (col) => {
    if (!window.confirm(`Excluir a etapa "${col.nome}"?`)) return;
    try {
      await api.del(`/leads/colunas/${col.id}`);
      setColunas(p => p.filter(c => c.id !== col.id));
    } catch (err) { flash(err.message); }
  };

  /* ── salvar lead (modal) ── */
  const salvarLead = async (form) => {
    if (form.id) await api.put(`/leads/${form.id}`, form);
    else await api.post('/leads', form);
    load(true);
  };

  return (
    <div style={{ padding: '24px 26px 0', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .fk-card{transition:transform .12s ease, box-shadow .15s ease}
        .fk-card:hover{transform:translateY(-2px);box-shadow:var(--s3)}
        .fk-card:active{cursor:grabbing}
        .fk-col{transition:border-color .15s, background .15s}
        .fk-iconbtn{width:24px;height:24px;border-radius:7px;border:none;background:transparent;color:var(--light);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .12s,color .12s}
        .fk-iconbtn:hover{background:var(--bg2);color:var(--txt2)}
        .fk-scroll::-webkit-scrollbar{height:9px}
        .fk-scroll::-webkit-scrollbar-thumb{background:var(--bord2);border-radius:8px}
        @media (prefers-reduced-motion: reduce){.fk-card{transition:none}}
      `}</style>

      {/* cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800 }}>Funil de Vendas</h1>
          <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>
            Arraste os cards entre etapas · arraste o cabeçalho para reordenar colunas · clique no lápis para renomear
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--light)' }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, telefone ou interesse"
              style={{ padding: '8px 12px 8px 30px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--card)', fontSize: 12.5, width: 250, outline: 'none' }} />
          </div>
          <select value={fResp} onChange={e => setFResp(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--card)', fontSize: 12.5, color: 'var(--txt2)', outline: 'none' }}>
            <option value="">Todos os responsáveis</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
      </div>

      {erro && (
        <div style={{ marginBottom: 10, padding: '8px 14px', borderRadius: 10, background: 'var(--err2)', color: 'var(--err)', fontSize: 12.5, fontWeight: 600 }}>{erro}</div>
      )}

      {/* board */}
      <div className="fk-scroll" style={{ display: 'flex', gap: 12, flex: 1, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 18, alignItems: 'stretch' }}>
        {colunas.map(col => {
          const items = leadsFiltrados.filter(l => l.status === col.nome);
          const total = isMaster ? items.reduce((s, l) => s + (parseFloat(l.valor_proposta) || 0), 0) : null;
          const isOver = overCol === col.nome;
          const editing = editCol?.id === col.id;
          return (
            <div key={col.id} className="fk-col"
              onDragOver={e => { e.preventDefault(); setOverCol(col.nome); }}
              onDragLeave={() => setOverCol(o => o === col.nome ? null : o)}
              onDrop={e => dropLead(e, col.nome)}
              style={{
                minWidth: COL_W, flex: `0 0 ${COL_W}px`, display: 'flex', flexDirection: 'column', maxHeight: '100%',
                background: isOver ? 'var(--tq4)' : 'var(--card)', borderRadius: 14,
                border: `1.5px solid ${isOver ? col.cor : 'var(--border)'}`,
                boxShadow: 'var(--s1)', overflow: 'hidden',
                opacity: dragCol === col.nome ? .45 : 1,
              }}>
              {/* faixa de cor */}
              <div style={{ height: 4, background: col.cor, flexShrink: 0 }} />

              {/* cabeçalho da coluna */}
              <div draggable={!editing}
                onDragStart={e => { e.stopPropagation(); setDragCol(col.nome); }}
                onDragEnd={() => setDragCol(null)}
                style={{ padding: '10px 10px 8px', display: 'flex', alignItems: 'center', gap: 5, cursor: editing ? 'default' : 'grab', flexShrink: 0 }}>
                <GripVertical size={13} color="var(--light)" style={{ flexShrink: 0 }} />
                {editing ? (
                  <>
                    <input autoFocus value={editCol.nome}
                      onChange={e => setEditCol({ ...editCol, nome: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') salvarNomeColuna(); if (e.key === 'Escape') setEditCol(null); }}
                      onBlur={salvarNomeColuna}
                      style={{ flex: 1, minWidth: 0, padding: '4px 8px', borderRadius: 8, border: `1.5px solid ${col.cor}`, fontSize: 13, fontWeight: 700, outline: 'none' }} />
                    <button className="fk-iconbtn" onMouseDown={e => e.preventDefault()} onClick={salvarNomeColuna}><Check size={13} /></button>
                  </>
                ) : (
                  <>
                    <span title={col.fixa ? 'Etapa fixa (usada nos relatórios)' : 'Duplo clique para renomear'}
                      onDoubleClick={() => !col.fixa && setEditCol({ id: col.id, nome: col.nome })}
                      style={{ fontWeight: 800, fontSize: 13, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {col.nome}
                    </span>
                    <span style={{ background: `${col.cor}14`, borderRadius: 9, padding: '1px 8px', fontSize: 11.5, fontWeight: 800, color: col.cor, flexShrink: 0 }}>{items.length}</span>
                    {!col.fixa && (
                      <button className="fk-iconbtn" title="Renomear etapa" onClick={() => setEditCol({ id: col.id, nome: col.nome })}><Pencil size={12} /></button>
                    )}
                    <div style={{ position: 'relative' }}>
                      <button className="fk-iconbtn" title="Cor da etapa" onClick={() => setPaletteFor(paletteFor === col.id ? null : col.id)}>
                        <span style={{ width: 11, height: 11, borderRadius: '50%', background: col.cor, display: 'block', border: '2px solid var(--card)', boxShadow: '0 0 0 1.5px var(--bord2)' }} />
                      </button>
                      {paletteFor === col.id && (
                        <div style={{ position: 'absolute', top: 28, right: 0, zIndex: 50, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 11, boxShadow: 'var(--s3)', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
                          {PALETA.map(c => (
                            <button key={c} onClick={() => mudarCor(col, c)}
                              style={{ width: 19, height: 19, borderRadius: '50%', background: c, border: c === col.cor ? '2.5px solid var(--txt)' : '2.5px solid transparent', cursor: 'pointer' }} />
                          ))}
                        </div>
                      )}
                    </div>
                    {!col.fixa && items.length === 0 && (
                      <button className="fk-iconbtn" title="Excluir etapa vazia" onClick={() => excluirColuna(col)}><Trash2 size={12} /></button>
                    )}
                  </>
                )}
              </div>

              {total !== null && total > 0 && (
                <div style={{ padding: '0 12px 7px', fontSize: 12, fontWeight: 800, color: col.cor, flexShrink: 0 }}>{fmt.brl(total)}</div>
              )}

              {/* cards */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '2px 9px 9px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {items.map(l => {
                  const te = tempoEtapa(l.status_changed_at);
                  return (
                    <div key={l.id} className="fk-card" draggable
                      onDragStart={e => { e.stopPropagation(); setDragLead(l); }}
                      onDragEnd={() => setDragLead(null)}
                      onDoubleClick={() => setModal(l)}
                      style={{ background: 'var(--card)', borderRadius: 11, padding: '10px 11px', border: '1px solid var(--border)', borderLeft: `3px solid ${col.cor}`, cursor: 'grab', opacity: dragLead?.id === l.id ? .45 : 1, boxShadow: 'var(--s1)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{l.nome}</div>
                        {l.responsavel_nome && (
                          <span title={l.responsavel_nome} style={{ width: 20, height: 20, borderRadius: '50%', background: l.responsavel_cor || 'var(--tq)', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {fmt.initials(l.responsavel_nome)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{l.interesse}{l.origem ? ` · ${l.origem}` : ''}</div>
                      {l.telefone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--light)', marginTop: 4 }}>
                          <Phone size={10} />{fmt.phone(l.telefone)}
                        </div>
                      )}
                      {isMaster && parseFloat(l.valor_proposta) > 0 && (
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ok)', marginTop: 5 }}>{fmt.brl(parseFloat(l.valor_proposta))}</div>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                        {te && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: te.stale ? 'var(--err)' : 'var(--light)' }}>
                            <Clock size={10} />{te.txt}
                          </span>
                        )}
                        {l.data_retorno && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: 'var(--warn)' }}>
                            <CalendarClock size={10} />{fmt.date(l.data_retorno)}
                          </span>
                        )}
                      </div>
                      {l.tags?.length > 0 && (
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 6 }}>
                          {l.tags.slice(0, 3).map(t => <span key={t} className={`tag tag-${t}`}>#{t}</span>)}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                        {l.telefone && (
                          <button onClick={() => openWA(l.telefone, l.nome)}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '5px', borderRadius: 7, background: 'var(--wa2)', color: 'var(--wa)', fontSize: 11.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                            <MessageCircle size={11} /> WhatsApp
                          </button>
                        )}
                        <button onClick={() => setModal(l)}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '5px', borderRadius: 7, background: 'var(--tq3)', color: 'var(--tq2)', fontSize: 11.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                          <Pencil size={11} /> Editar
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* criar lead direto na etapa */}
                <button onClick={() => setModal({ _novo: true, status: col.nome })}
                  style={{ padding: '8px', borderRadius: 10, border: '1.5px dashed var(--bord2)', background: 'transparent', color: 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Plus size={13} /> Novo lead
                </button>
              </div>
            </div>
          );
        })}

        {/* nova etapa */}
        <div style={{ minWidth: 218, flex: '0 0 218px' }}>
          {novaCol ? (
            <div style={{ background: 'var(--card)', borderRadius: 14, border: '1.5px solid var(--tq)', padding: 10 }}>
              <input autoFocus value={novaColNome} onChange={e => setNovaColNome(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') criarColuna(); if (e.key === 'Escape') { setNovaCol(false); setNovaColNome(''); } }}
                placeholder="Nome da etapa"
                style={{ width: '100%', padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 13, fontWeight: 600, outline: 'none' }} />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={criarColuna} style={{ flex: 1, padding: '6px', borderRadius: 8, background: 'var(--tq)', color: '#fff', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer' }}>Criar etapa</button>
                <button onClick={() => { setNovaCol(false); setNovaColNome(''); }} className="fk-iconbtn" style={{ width: 30, height: 30 }}><X size={14} /></button>
              </div>
            </div>
          ) : (
            <button onClick={() => setNovaCol(true)}
              style={{ width: '100%', padding: '13px', borderRadius: 14, border: '1.5px dashed var(--bord2)', background: 'transparent', color: 'var(--muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Plus size={15} /> Nova etapa
            </button>
          )}
        </div>
      </div>

      {modal && (
        <LeadModal
          lead={modal._novo ? null : modal}
          prefill={modal._novo ? { status: modal.status, responsavelId: user?.id } : {}}
          onClose={() => setModal(null)}
          onSave={salvarLead}
        />
      )}
    </div>
  );
}
