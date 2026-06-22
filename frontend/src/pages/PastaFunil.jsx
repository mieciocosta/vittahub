import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Plus, X, Check, GripVertical } from 'lucide-react';
import { fmt } from '../hooks/utils.js';

/* Funil DENTRO da pasta: Kanban de etapas (que o master cria/renomeia) pra
   empurrar cada lead até fechar a venda. Arraste o card entre as colunas.
   Soltar em "Ganho" abre Registrar Venda; em "Perdido" pede o motivo. */
const PALETA = ['#3b82f6', '#8b5cf6', '#f59e0b', '#0ea5e9', '#10b981', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];
const CATEGORIAS = ['Vacinação Geral', 'Plano Vacinal', 'Fidelidade Mensal', 'Consulta', 'Terapia'];
const CAT_POR_CONTEXTO = { planos_vacinais: 'Plano Vacinal', vacinacao: 'Vacinação Geral', fidelidade: 'Fidelidade Mensal', consultas: 'Consulta', terapias: 'Terapia', banco_dados: 'Vacinação Geral' };
const FORMAS = ['Pix', 'Cartão', 'Dinheiro', 'Link de pagamento', 'Parcelado', 'Cortesia'];
const STATUS = [['pago', 'Pago'], ['sinal', 'Sinal'], ['aguardando', 'Aguardando'], ['parcelado', 'Parcelado'], ['pendente', 'Pendente'], ['cortesia', 'Cortesia']];
const MOTIVOS = ['Preço', 'Vai pensar', 'Fez em outra clínica', 'Sem interesse', 'Convênio', 'Sem retorno', 'Outro'];
// Converte "1.500,00" / "150,50" / "150" em número
const parseValor = (s) => { const t = String(s || '').trim(); if (!t) return 0; const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t; return Math.max(0, parseFloat(n) || 0); };

export default function PastaFunil({ api, contexto, cor, lista, setLista, nav, isMaster }) {
  const [etapas, setEtapas] = useState([]);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [vendaAlvo, setVendaAlvo] = useState(null);   // { card, etapa }
  const [perdaAlvo, setPerdaAlvo] = useState(null);    // { card, etapa }

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

  // Soltar um card numa coluna: Ganho → venda, Perdido → motivo, resto → move
  const soltar = (et) => {
    setOverCol(null);
    const c = lista.find(x => x.id === dragId);
    setDragId(null);
    if (!c || c.funil_etapa === et.nome) return;
    if (et.tipo === 'ganho') { setVendaAlvo({ card: c, etapa: et }); return; }
    if (et.tipo === 'perdido') { setPerdaAlvo({ card: c, etapa: et }); return; }
    mover(c, et.nome);
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
            onDrop={() => soltar(et)}
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

      {vendaAlvo && (
        <VendaModal api={api} contexto={contexto} card={vendaAlvo.card}
          onClose={() => setVendaAlvo(null)}
          onSaved={() => { mover(vendaAlvo.card, vendaAlvo.etapa.nome); setVendaAlvo(null); }} />
      )}
      {perdaAlvo && (
        <PerdaModal api={api} card={perdaAlvo.card}
          onClose={() => setPerdaAlvo(null)}
          onSaved={() => { mover(perdaAlvo.card, perdaAlvo.etapa.nome); setPerdaAlvo(null); }} />
      )}
    </div>
  );
}

function ModalShell({ titulo, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: 420, maxWidth: '100%', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{titulo}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

const inputCss = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', marginBottom: 12 };
const lblCss = { display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 5 };

/* Registrar Venda compacto — disparado ao mover o lead para "Ganho". */
function VendaModal({ api, contexto, card, onClose, onSaved }) {
  const [categoria, setCategoria] = useState(CAT_POR_CONTEXTO[contexto] || 'Vacinação Geral');
  const [valor, setValor] = useState('');
  const [forma, setForma] = useState('Pix');
  const [status, setStatus] = useState('pago');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const salvar = async () => {
    const v = parseValor(valor);
    if (v <= 0 && status !== 'cortesia') { setErro('Informe o valor da venda.'); return; }
    setSalvando(true); setErro('');
    try {
      await api.post('/extras/vendas', {
        conversa_id: card.id, categoria, valor: v, forma_pagamento: forma,
        status_pagamento: status, cliente_nome: card.contact_name || null,
      });
      onSaved();
    } catch (e) { setErro(e.message || 'Erro ao registrar'); setSalvando(false); }
  };
  return (
    <ModalShell titulo={`🏆 Registrar venda — ${card.contact_name || fmt.phone(card.phone)}`} onClose={onClose}>
      {erro && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 9, background: '#fdecec', color: '#c0392b', fontSize: 12.5, fontWeight: 600 }}>{erro}</div>}
      <label style={lblCss}>CATEGORIA</label>
      <select value={categoria} onChange={e => setCategoria(e.target.value)} style={inputCss}>
        {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <label style={lblCss}>VALOR (R$)</label>
      <input autoFocus value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" inputMode="decimal" style={inputCss} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={lblCss}>FORMA</label>
          <select value={forma} onChange={e => setForma(e.target.value)} style={inputCss}>{FORMAS.map(f => <option key={f}>{f}</option>)}</select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={lblCss}>STATUS</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={inputCss}>{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
      </div>
      <button onClick={salvar} disabled={salvando} className="btn btn-p" style={{ width: '100%', gap: 7, background: '#10b981', borderColor: '#10b981' }}>
        {salvando ? <span className="spin" style={{ width: 15, height: 15 }} /> : <Check size={15} />} Registrar e mover para Ganho
      </button>
    </ModalShell>
  );
}

/* Motivo da perda — disparado ao mover o lead para "Perdido". */
function PerdaModal({ api, card, onClose, onSaved }) {
  const [motivo, setMotivo] = useState('');
  const [outro, setOutro] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const salvar = async () => {
    const m = motivo === 'Outro' ? (outro.trim() || 'Outro') : motivo;
    if (!m) { setErro('Escolha o motivo da perda.'); return; }
    setSalvando(true); setErro('');
    try {
      await api.patch(`/inbox/conversations/${card.id}/perder`, { motivo: m, observacao: obs });
      onSaved();
    } catch (e) { setErro(e.message || 'Erro ao registrar'); setSalvando(false); }
  };
  return (
    <ModalShell titulo={`Motivo da perda — ${card.contact_name || fmt.phone(card.phone)}`} onClose={onClose}>
      {erro && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 9, background: '#fdecec', color: '#c0392b', fontSize: 12.5, fontWeight: 600 }}>{erro}</div>}
      <label style={lblCss}>MOTIVO</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
        {MOTIVOS.map(m => (
          <button key={m} onClick={() => setMotivo(m)}
            style={{ padding: '7px 11px', borderRadius: 9, border: `1.5px solid ${motivo === m ? '#ef4444' : 'var(--border)'}`, background: motivo === m ? '#fdecec' : 'var(--card)', color: motivo === m ? '#c0392b' : 'var(--txt2)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{m}</button>
        ))}
      </div>
      {motivo === 'Outro' && <input autoFocus value={outro} onChange={e => setOutro(e.target.value)} placeholder="Qual motivo?" style={inputCss} />}
      <label style={lblCss}>OBSERVAÇÃO (opcional)</label>
      <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Detalhe se quiser…" style={{ ...inputCss, resize: 'vertical' }} />
      <button onClick={salvar} disabled={salvando} className="btn btn-p" style={{ width: '100%', gap: 7, background: '#ef4444', borderColor: '#ef4444' }}>
        {salvando ? <span className="spin" style={{ width: 15, height: 15 }} /> : <Check size={15} />} Marcar como perdido
      </button>
    </ModalShell>
  );
}
