import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Plus, X, Check, GripVertical } from 'lucide-react';
import { fmt } from '../hooks/utils.js';

/* Funil DENTRO da pasta: Kanban de etapas (que o master cria/renomeia) pra
   empurrar cada lead até fechar a venda. Arraste o card entre as colunas. */
const PALETA = ['#3b82f6', '#8b5cf6', '#f59e0b', '#0ea5e9', '#10b981', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];

export default function PastaFunil({ api, contexto, cor, lista, setLista, nav, isMaster }) {
  const [etapas, setEtapas] = useState([]);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState('');

  const loadEtapas = useCallback(() => {
    api.get(`/inbox/pasta-funil/etapas?contexto=${contexto}`).then(d => setEtapas(Array.isArray(d) ? d : [])).catch(() => setEtapas([]));
  }, [contexto]); // eslint-disable-line
  useEffect(loadEtapas, [loadEtapas]);

  const primeira = etapas[0]?.nome;
  const colDoCard = (c) => (etapas.some(e => e.nome === c.funil_etapa) ? c.funil_etapa : primeira);

  const mover = async (c, etapaNome) => {
    if (c.funil_etapa === etapaNome) return;
    setLista(prev => prev.map(x => x.id === c.id ? { ...x, funil_etapa: etapaNome } : x));
    try { await api.patch(`/inbox/conversations/${c.id}/funil-etapa`, { etapa: etapaNome }); } catch {}
  };

  const addEtapa = async () => {
    const nome = window.prompt('Nome da nova etapa do funil:');
    if (!nome || !nome.trim()) return;
    try {
      await api.post('/inbox/pasta-funil/etapas', { contexto, nome: nome.trim(), cor: PALETA[etapas.length % PALETA.length] });
      loadEtapas();
    } catch (e) { window.alert('Erro: ' + (e.message || e)); }
  };
  const salvarNome = async () => {
    const e = etapas.find(x => x.id === editId);
    setEditId(null);
    if (!e || !editNome.trim() || editNome.trim() === e.nome) return;
    try { await api.put(`/inbox/pasta-funil/etapas/${e.id}`, { nome: editNome.trim() }); loadEtapas(); } catch {}
  };
  const excluirEtapa = async (e) => {
    if (!window.confirm(`Excluir a etapa "${e.nome}"? Os leads dela voltam para a primeira coluna.`)) return;
    try { await api.del(`/inbox/pasta-funil/etapas/${e.id}`); loadEtapas(); } catch {}
  };

  if (!etapas.length) return <div style={{ color: 'var(--muted)', padding: 20 }}>Montando o funil…</div>;

  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 14, alignItems: 'flex-start' }}>
      {etapas.map(et => {
        const cards = lista.filter(c => colDoCard(c) === et.nome);
        const isOver = overCol === et.nome;
        return (
          <div key={et.id}
            onDragOver={e => { e.preventDefault(); setOverCol(et.nome); }}
            onDragLeave={() => setOverCol(o => o === et.nome ? null : o)}
            onDrop={() => { setOverCol(null); const c = lista.find(x => x.id === dragId); if (c) mover(c, et.nome); setDragId(null); }}
            style={{ minWidth: 250, maxWidth: 250, flexShrink: 0, background: 'var(--card)', borderRadius: 14,
              border: `1.5px solid ${isOver ? et.cor : 'var(--border)'}`, boxShadow: 'var(--s1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 4, background: et.cor }} />
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--border)' }}>
              {editId === et.id ? (
                <>
                  <input autoFocus value={editNome} onChange={e => setEditNome(e.target.value)} maxLength={32}
                    onKeyDown={e => { if (e.key === 'Enter') salvarNome(); if (e.key === 'Escape') setEditId(null); }} onBlur={salvarNome}
                    style={{ flex: 1, minWidth: 0, padding: '3px 7px', borderRadius: 7, border: `1.5px solid ${et.cor}`, fontSize: 13, fontWeight: 700 }} />
                  <button onMouseDown={e => e.preventDefault()} onClick={salvarNome} style={{ border: 'none', background: 'none', cursor: 'pointer', color: et.cor }}><Check size={14} /></button>
                </>
              ) : (
                <>
                  <span onDoubleClick={() => isMaster && (setEditId(et.id), setEditNome(et.nome))}
                    style={{ flex: 1, fontWeight: 800, fontSize: 13, color: et.cor, cursor: isMaster ? 'text' : 'default' }}
                    title={isMaster ? 'Duplo clique para renomear' : ''}>{et.nome}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', background: 'var(--bg2)', borderRadius: 10, padding: '1px 7px' }}>{cards.length}</span>
                  {isMaster && !et.fixa && <button onClick={() => excluirEtapa(et)} title="Excluir etapa" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={13} /></button>}
                </>
              )}
            </div>
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 7, minHeight: 60, maxHeight: 520, overflowY: 'auto' }}>
              {cards.map(c => (
                <div key={c.id} draggable onDragStart={() => setDragId(c.id)} onDragEnd={() => setDragId(null)}
                  style={{ background: 'var(--bg2)', borderRadius: 10, padding: '9px 10px', cursor: 'grab', border: '1px solid var(--border)', opacity: dragId === c.id ? .45 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <GripVertical size={12} color="var(--light,#cbd5e1)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.contact_name || fmt.phone(c.phone)}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{fmt.phone(c.phone)}</div>
                    </div>
                    <button onClick={() => nav(`/inbox?conv=${c.id}`)} title="Abrir conversa" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--tq2)', flexShrink: 0 }}><MessageSquare size={13} /></button>
                  </div>
                </div>
              ))}
              {cards.length === 0 && <div style={{ fontSize: 11, color: 'var(--light,#9aa)', textAlign: 'center', padding: '12px 0' }}>arraste leads pra cá</div>}
            </div>
          </div>
        );
      })}
      {isMaster && (
        <button onClick={addEtapa} title="Nova etapa"
          style={{ minWidth: 150, flexShrink: 0, alignSelf: 'flex-start', padding: '12px', borderRadius: 12, border: '1.5px dashed var(--tq3)', background: 'var(--tq4)', color: 'var(--tq2)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Plus size={14} /> Nova etapa
        </button>
      )}
    </div>
  );
}
