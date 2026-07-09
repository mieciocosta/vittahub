import React, { useEffect, useState, useRef } from 'react';
import { LayoutGrid, StickyNote, CheckSquare, Square, Paperclip, FileText, Download, Trash2, Plus, X, Check, Pencil } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* MEU PAINEL — mural pessoal: notas, tarefas (o que eu fiz) e documentos.
   Cada um monta o seu, do jeito que quiser. Privado. */

const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

export default function MeuPainel() {
  const api = useApi();
  const { user } = useAuth();
  const primeiro = (user?.nome || '').split(' ')[0];
  const [itens, setItens] = useState([]);
  const [modal, setModal] = useState(null); // { id?, tipo, titulo, conteudo }
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const docRef = useRef(null);

  const load = () => api.get('/extras/painel').then(d => setItens(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line

  const notas = itens.filter(i => i.tipo === 'nota');
  const tarefas = itens.filter(i => i.tipo === 'tarefa');
  const docs = itens.filter(i => i.tipo === 'documento');

  const salvar = async () => {
    if (!modal.titulo?.trim() && !modal.conteudo?.trim()) { setErro('Escreva algo.'); return; }
    setSalvando(true); setErro('');
    try {
      if (modal.id) { const it = await api.put(`/extras/painel/${modal.id}`, { titulo: modal.titulo, conteudo: modal.conteudo }); setItens(p => p.map(x => x.id === it.id ? it : x)); }
      else { const it = await api.post('/extras/painel', { tipo: modal.tipo, titulo: modal.titulo, conteudo: modal.conteudo }); setItens(p => [it, ...p]); }
      setModal(null);
    } catch (e) { setErro(e.message); }
    setSalvando(false);
  };
  const addTarefa = async (titulo) => {
    if (!titulo.trim()) return;
    try { const it = await api.post('/extras/painel', { tipo: 'tarefa', titulo }); setItens(p => [it, ...p]); } catch (e) { setErro(e.message); }
  };
  const toggleTarefa = async (t) => {
    setItens(p => p.map(x => x.id === t.id ? { ...x, concluido: !x.concluido } : x));
    try { await api.put(`/extras/painel/${t.id}`, { concluido: !t.concluido }); } catch { load(); }
  };
  const excluir = async (it) => {
    if (!window.confirm('Remover este item?')) return;
    setItens(p => p.filter(x => x.id !== it.id));
    try { await api.del(`/extras/painel/${it.id}`); } catch { load(); }
  };
  const anexarDoc = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    const url = await fileToDataUrl(f);
    if (url.length > 15_500_000) { setErro('Documento muito grande (máx. ~12MB).'); return; }
    setErro('');
    try { const it = await api.post('/extras/painel', { tipo: 'documento', titulo: f.name, arquivo: url, filename: f.name, mimetype: f.type }); setItens(p => [it, ...p]); }
    catch (e) { setErro(e.message); }
  };
  const baixarDoc = async (it) => {
    const d = await api.get(`/extras/painel/${it.id}/download`).catch(() => null);
    if (!d) return;
    const a = document.createElement('a'); a.href = d.arquivo; a.download = d.filename || 'arquivo'; a.click();
  };

  const NOTA_CORES = ['#fef9c3', '#dbeafe', '#dcfce7', '#fae8ff', '#ffe4e6', '#e0f2fe'];

  return (
    <div style={{ padding: 28, maxWidth: 1100, margin: '0 auto' }}>
      <input ref={docRef} type="file" accept="application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" style={{ display: 'none' }} onChange={anexarDoc} />

      {/* Header */}
      <div style={{ borderRadius: 18, padding: '22px 26px', marginBottom: 20, color: '#fff', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg,#0b1023 0%,#1e3a8a 55%,#0e7490 130%)', boxShadow: '0 10px 30px rgba(14,116,144,.28)' }}>
        <div style={{ position: 'absolute', right: -25, top: -25, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 23, fontWeight: 800 }}><LayoutGrid size={24} /> Meu Painel</div>
        <div style={{ fontSize: 13.5, opacity: .95, marginTop: 6, maxWidth: 620, lineHeight: 1.5 }}>
          Seu mural, {primeiro}. Organize suas anotações, o que você fez e seus documentos — tudo num lugar só, do seu jeito. 🗂️
        </div>
      </div>
      {erro && <div style={{ fontSize: 13, color: 'var(--err)', fontWeight: 600, marginBottom: 12 }}>{erro}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, alignItems: 'start' }}>

        {/* NOTAS */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><StickyNote size={17} color="#ca8a04" /> Bloco de notas</span>
            <button onClick={() => { setErro(''); setModal({ tipo: 'nota', titulo: '', conteudo: '' }); }} className="btn btn-sm" style={{ gap: 5, background: '#fef9c3', color: '#a16207', border: 'none', fontWeight: 700 }}><Plus size={13} /> Nota</button>
          </div>
          {notas.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nenhuma nota ainda. Anote lembretes, ideias, tudo que quiser.</div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10 }}>
              {notas.map((n, i) => (
                <div key={n.id} style={{ background: NOTA_CORES[i % NOTA_CORES.length], borderRadius: 10, padding: '10px 12px', color: '#1f2937', position: 'relative', minHeight: 70, boxShadow: '0 2px 6px rgba(0,0,0,.06)' }}>
                  <div style={{ display: 'flex', gap: 4, position: 'absolute', top: 5, right: 5 }}>
                    <button onClick={() => { setErro(''); setModal({ id: n.id, tipo: 'nota', titulo: n.titulo || '', conteudo: n.conteudo || '' }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#57534e', opacity: .6 }}><Pencil size={12} /></button>
                    <button onClick={() => excluir(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#57534e', opacity: .6 }}><X size={13} /></button>
                  </div>
                  {n.titulo && <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 3, paddingRight: 30 }}>{n.titulo}</div>}
                  {n.conteudo && <div style={{ fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{n.conteudo}</div>}
                </div>
              ))}
            </div>}
        </div>

        {/* TAREFAS / O QUE EU FIZ */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}><CheckSquare size={17} color="#16a34a" /> Minhas tarefas</div>
          <TarefaInput onAdd={addTarefa} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
            {tarefas.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Adicione o que precisa fazer ou o que já fez.</div>}
            {tarefas.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderRadius: 8 }}>
                <button onClick={() => toggleTarefa(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.concluido ? '#16a34a' : 'var(--muted)', display: 'flex' }}>
                  {t.concluido ? <CheckSquare size={17} /> : <Square size={17} />}
                </button>
                <span style={{ flex: 1, fontSize: 13, textDecoration: t.concluido ? 'line-through' : 'none', color: t.concluido ? 'var(--muted)' : 'var(--txt)' }}>{t.titulo}</span>
                <button onClick={() => excluir(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', opacity: .5 }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* DOCUMENTOS */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><Paperclip size={17} color="#0891b2" /> Documentos</span>
            <button onClick={() => docRef.current?.click()} className="btn btn-sm" style={{ gap: 5, background: '#e4f6fb', color: '#0e7490', border: 'none', fontWeight: 700 }}><Plus size={13} /> Anexar</button>
          </div>
          {docs.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Anexe seus documentos importantes (PDF, Word, planilha, imagem).</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {docs.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: 'var(--bg2)', borderRadius: 9 }}>
                  <FileText size={15} color="#0891b2" style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename || d.titulo}</span>
                  <button onClick={() => baixarDoc(d)} title="Baixar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tq2)' }}><Download size={15} /></button>
                  <button onClick={() => excluir(d)} title="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>}
        </div>
      </div>

      {/* Modal nota */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 440, maxWidth: '100%', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><StickyNote size={18} color="#ca8a04" /> {modal.id ? 'Editar nota' : 'Nova nota'}</h3>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div className="field" style={{ margin: 0 }}><label>Título</label><input value={modal.titulo} onChange={e => setModal({ ...modal, titulo: e.target.value })} placeholder="Título (opcional)" /></div>
              <div className="field" style={{ margin: 0 }}><label>Conteúdo</label><textarea value={modal.conteudo} onChange={e => setModal({ ...modal, conteudo: e.target.value })} rows={5} placeholder="Escreva aqui…" style={{ resize: 'vertical' }} /></div>
              {erro && <div style={{ fontSize: 12, color: 'var(--err)', fontWeight: 600 }}>{erro}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={salvar} disabled={salvando} className="btn btn-p" style={{ flex: 1, gap: 6 }}><Check size={14} /> {salvando ? 'Salvando…' : 'Salvar'}</button>
                <button onClick={() => setModal(null)} className="btn">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TarefaInput({ onAdd }) {
  const [t, setT] = useState('');
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input value={t} onChange={e => setT(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onAdd(t); setT(''); } }}
        placeholder="Adicionar tarefa e Enter…" style={{ flex: 1, padding: '8px 11px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)', fontSize: 13 }} />
      <button onClick={() => { onAdd(t); setT(''); }} disabled={!t.trim()} className="btn btn-p btn-sm" style={{ opacity: t.trim() ? 1 : .5 }}><Plus size={14} /></button>
    </div>
  );
}
