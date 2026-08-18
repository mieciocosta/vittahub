import React, { useEffect, useRef, useState } from 'react';
import { FileText, Paperclip, Download, Trash2, Plus, X, Copy, Check, Pencil, Calculator } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';
import { Toast } from '../hooks/toast.js';

/* 💲 TABELA DE PREÇOS — CONSULTAS (pedido do master).
   Duas metades que se completam:
   · em cima, as TABELAS OFICIAIS anexadas (PDF/planilha) — a fonte da verdade
     que a gestão publica;
   · embaixo, a lista de itens digitada, de onde a atendente MONTA O ORÇAMENTO
     em cliques: marca os itens, ajusta quantidade/desconto e sai com o texto
     pronto pra colar na conversa. Orçamento montado aqui nunca diverge da
     tabela — era o risco de cada uma digitar preço de cabeça. */

const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

export default function TabelaPrecos() {
  const api = useApi();
  const { user } = useAuth();
  // Visivel pra TODOS (pedido do master) — só a edição continua com a gestão.
  const ehGestao = ['master', 'supervisor'].includes(user?.role);

  // ── tabelas anexadas (mesma infra das pastas) ──────────────────────────────
  const CHAVE = 'tabela_precos_consultas';
  const fileRef = useRef(null);
  const [arqs, setArqs] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const loadArqs = () => api.get(`/extras/pasta-arquivos?chave=${CHAVE}`).then(d => setArqs(Array.isArray(d) ? d : [])).catch(() => {});
  const anexar = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    const url = await fileToDataUrl(f);
    if (url.length > 52_000_000) { Toast.show('Arquivo muito grande (máx. ~40MB).', 'error'); return; }
    setEnviando(true);
    try { const a = await api.post('/extras/pasta-arquivos', { chave: CHAVE, nome: f.name, arquivo: url, mimetype: f.type }); setArqs(p => [a, ...p]); }
    catch (err) { Toast.show(err.message, 'error'); }
    setEnviando(false);
  };
  const baixar = async (a) => {
    const d = await api.get(`/extras/pasta-arquivos/${a.id}/download`).catch(() => null);
    if (!d) return;
    const el = document.createElement('a'); el.href = d.arquivo; el.download = d.nome || 'tabela'; el.click();
  };
  const removerArq = async (a) => {
    if (!window.confirm(`Remover "${a.nome}"?`)) return;
    setArqs(p => p.filter(x => x.id !== a.id));
    try { await api.del(`/extras/pasta-arquivos/${a.id}`); } catch { loadArqs(); }
  };

  // ── itens de preço + orçamento ─────────────────────────────────────────────
  const [itens, setItens] = useState([]);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState([]);   // cópia editável (gestão)
  const [sel, setSel] = useState({});             // id → quantidade
  const [desconto, setDesconto] = useState('');
  const [copiado, setCopiado] = useState(false);
  const loadItens = () => api.get('/extras/tabela-precos').then(d => setItens(d.itens || [])).catch(() => {});
  useEffect(() => { loadArqs(); loadItens(); }, []); // eslint-disable-line

  const salvarItens = async () => {
    try {
      const d = await api.put('/extras/tabela-precos', { itens: rascunho });
      setItens(d.itens || []); setEditando(false);
      Toast.show('Tabela salva! 💙', 'success');
    } catch (e) { Toast.show(e.message, 'error'); }
  };

  const marcados = itens.filter(i => (sel[i.id] || 0) > 0);
  const subtotal = marcados.reduce((a, i) => a + i.valor * (sel[i.id] || 0), 0);
  const desc = Math.min(Math.max(parseFloat(String(desconto).replace(',', '.')) || 0, 0), subtotal);
  const total = subtotal - desc;

  const textoOrcamento = () => {
    const linhas = marcados.map(i => {
      const q = sel[i.id] || 0;
      return `• ${i.nome}${q > 1 ? ` (${q}x)` : ''} — ${fmt.brl(i.valor * q)}`;
    });
    return [
      '*Orçamento — Vittalis Saúde* 💙',
      '',
      ...linhas,
      '',
      desc > 0 ? `Subtotal: ${fmt.brl(subtotal)}\nDesconto: -${fmt.brl(desc)}\n*Total: ${fmt.brl(total)}*` : `*Total: ${fmt.brl(total)}*`,
      '',
      'Aceitamos Pix, débito e crédito. Qual horário fica melhor pra você? 😊',
    ].join('\n');
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(textoOrcamento()); }
    catch { const ta = document.createElement('textarea'); ta.value = textoOrcamento(); document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    setCopiado(true); setTimeout(() => setCopiado(false), 2000);
    Toast.show('Orçamento copiado — é só colar na conversa! 📋', 'success');
  };

  return (
    <div style={{ padding: 28, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--tq4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Calculator size={21} color="var(--tq2)" />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Tabela de Preços</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>As tabelas oficiais anexadas + o orçamento montado em cliques, sem preço de cabeça.</p>
        </div>
      </div>

      {/* 📎 Tabelas anexadas */}
      <div className="card" style={{ padding: '15px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: arqs.length ? 10 : 0 }}>
          <Paperclip size={15} color="var(--tq2)" />
          <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Tabelas anexadas {arqs.length > 0 && <span style={{ color: 'var(--muted)', fontWeight: 600 }}>({arqs.length})</span>}</span>
          <input ref={fileRef} type="file" accept="application/pdf,.doc,.docx,.xls,.xlsx,image/*" style={{ display: 'none' }} onChange={anexar} />
          <button onClick={() => fileRef.current?.click()} disabled={enviando} className="btn btn-p btn-sm" style={{ gap: 6 }}>
            <Plus size={13} /> {enviando ? 'Enviando…' : 'Anexar tabela'}
          </button>
        </div>
        {arqs.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>Anexe aqui a tabela oficial (PDF, planilha ou foto) — a equipe baixa quando precisar conferir.</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {arqs.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg2)', borderRadius: 10, padding: '7px 11px' }}>
              <FileText size={14} color="var(--tq2)" />
              <span style={{ fontSize: 12.5, fontWeight: 700, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</span>
              <button onClick={() => baixar(a)} title="Baixar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tq2)', padding: 2 }}><Download size={13} /></button>
              {ehGestao && <button onClick={() => removerArq(a)} title="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--err)', padding: 2 }}><Trash2 size={13} /></button>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
        {/* 💲 Itens da tabela */}
        <div className="card" style={{ padding: '15px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>💲 Itens e valores</span>
            {ehGestao && !editando && (
              <button onClick={() => { setRascunho(itens.map(i => ({ ...i }))); setEditando(true); }} className="btn btn-s btn-sm" style={{ gap: 5 }}>
                <Pencil size={12} /> Editar
              </button>
            )}
          </div>

          {!editando ? (
            itens.length === 0
              ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  Nenhum item ainda.{ehGestao ? ' Clique em Editar e digite os serviços com os valores — é daqui que o orçamento nasce.' : ' Peça pra gestão cadastrar os serviços.'}
                </div>
              : itens.map(i => {
                  const q = sel[i.id] || 0;
                  return (
                    <div key={i.id} onClick={() => setSel(p => ({ ...p, [i.id]: q > 0 ? 0 : 1 }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', marginBottom: 4,
                        background: q > 0 ? 'var(--tq4)' : 'transparent', border: `1.5px solid ${q > 0 ? 'var(--tq3)' : 'transparent'}` }}>
                      <span style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `2px solid ${q > 0 ? 'var(--tq)' : 'var(--border)'}`, background: q > 0 ? 'var(--tq)' : 'transparent', color: '#fff' }}>
                        {q > 0 && <Check size={12} strokeWidth={3} />}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{i.nome}</div>
                        {i.obs && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{i.obs}</div>}
                      </div>
                      <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--tq2)' }}>{fmt.brl(i.valor)}</span>
                      {q > 0 && (
                        <span onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button onClick={() => setSel(p => ({ ...p, [i.id]: Math.max(q - 1, 0) }))} className="btn btn-sm" style={{ padding: '2px 8px' }}>−</button>
                          <b style={{ minWidth: 16, textAlign: 'center', fontSize: 13 }}>{q}</b>
                          <button onClick={() => setSel(p => ({ ...p, [i.id]: q + 1 }))} className="btn btn-sm" style={{ padding: '2px 8px' }}>+</button>
                        </span>
                      )}
                    </div>
                  );
                })
          ) : (
            <>
              {rascunho.map((i, idx) => (
                <div key={i.id} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input value={i.nome} onChange={e => setRascunho(r => r.map((x, j) => j === idx ? { ...x, nome: e.target.value } : x))}
                    placeholder="Serviço (ex.: Consulta Pediátrica)"
                    style={{ flex: 2, padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)' }} />
                  <input value={i.valor} onChange={e => setRascunho(r => r.map((x, j) => j === idx ? { ...x, valor: e.target.value } : x))}
                    placeholder="R$" inputMode="decimal"
                    style={{ width: 84, padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)' }} />
                  <button onClick={() => setRascunho(r => r.filter((_, j) => j !== idx))} title="Remover"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--err)' }}><X size={14} /></button>
                </div>
              ))}
              <button onClick={() => setRascunho(r => [...r, { id: Math.random().toString(36).slice(2, 10), nome: '', valor: '' }])}
                className="btn btn-s btn-sm" style={{ gap: 5, marginTop: 4 }}><Plus size={12} /> Adicionar item</button>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={salvarItens} className="btn btn-p" style={{ flex: 1, fontWeight: 800 }}>Salvar tabela</button>
                <button onClick={() => setEditando(false)} className="btn">Cancelar</button>
              </div>
            </>
          )}
        </div>

        {/* 🧾 Orçamento montado */}
        <div className="card" style={{ padding: '15px 18px', alignSelf: 'start', position: 'sticky', top: 70 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>🧾 Orçamento</div>
          {marcados.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Marque os itens na tabela ao lado — o orçamento se monta sozinho aqui, com total e desconto.</div>
          ) : (
            <>
              {marcados.map(i => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px dashed var(--border)' }}>
                  <span>{i.nome}{(sel[i.id] || 0) > 1 ? ` (${sel[i.id]}x)` : ''}</span>
                  <b>{fmt.brl(i.valor * (sel[i.id] || 0))}</b>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Desconto R$</span>
                <input value={desconto} onChange={e => setDesconto(e.target.value)} inputMode="decimal" placeholder="0,00"
                  style={{ width: 90, padding: '6px 9px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12.5, background: 'var(--card)', color: 'var(--txt)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 900, padding: '8px 0', borderTop: '2px solid var(--border)' }}>
                <span>Total</span><span style={{ color: 'var(--ok,#16a34a)' }}>{fmt.brl(total)}</span>
              </div>
              <button onClick={copiar} className="btn btn-p" style={{ width: '100%', gap: 6, fontWeight: 800, marginTop: 6 }}>
                {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado!' : 'Copiar orçamento pra conversa'}
              </button>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 7, lineHeight: 1.5 }}>
                Sai formatado pro WhatsApp (negrito e emoji) — é só colar na conversa do cliente.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
