import React, { useEffect, useState, useRef } from 'react';
import { GraduationCap, Plus, Trash2, X, Check, PlayCircle, Paperclip, FileText, Download } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

/* CURSOS — treinamento da equipe: vídeos, links e materiais. Gestão adiciona,
   todo mundo assiste. */

const CATEGORIAS = ['Geral', 'Vendas', 'Atendimento', 'Vacinas', 'Consultas', 'Terapias', 'Sistema'];
const CAT_COR = { Geral: '#0E8C96', Vendas: '#16a34a', Atendimento: '#00B8C0', Vacinas: '#7c5cbf', Consultas: '#00B8C0', Terapias: '#C4973B', Sistema: '#3b82f6' };

export default function Cursos() {
  const api = useApi();
  const { user } = useAuth();
  const gestao = user?.role === 'master' || user?.role === 'supervisor';
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const fileRef = useRef(null);

  const anexar = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const url = await fileToDataUrl(f);
    if (url.length > 15_500_000) { setErro('Arquivo muito grande (máx. ~12MB). Para vídeos grandes, use um link.'); return; }
    setErro(''); setModal(m => ({ ...m, arquivo: url, filename: f.name, mimetype: f.type }));
  };

  const load = () => api.get('/extras/cursos').then(d => setLista(Array.isArray(d) ? d : [])).catch(() => setLista([])).finally(() => setCarregando(false));
  useEffect(() => { load(); }, []); // eslint-disable-line

  const salvar = async () => {
    if (!modal.titulo?.trim()) { setErro('Informe o título.'); return; }
    setSalvando(true); setErro('');
    try { const c = await api.post('/extras/cursos', modal); setLista(p => [c, ...p]); setModal(null); }
    catch (e) { setErro(e.message); }
    setSalvando(false);
  };
  const excluir = async (c) => {
    if (!window.confirm(`Remover "${c.titulo}"?`)) return;
    setLista(p => p.filter(x => x.id !== c.id));
    try { await api.del(`/extras/cursos/${c.id}`); } catch { load(); }
  };

  return (
    <div style={{ padding: 28, maxWidth: 1040, margin: '0 auto' }}>
      <div style={{ borderRadius: 18, padding: '22px 26px', marginBottom: 20, color: '#fff', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #7c5cbf 0%, #5b21b6 60%, #3b0764 130%)', boxShadow: '0 10px 30px rgba(124,92,191,.3)' }}>
        <div style={{ position: 'absolute', right: -25, top: -25, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,.10)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 23, fontWeight: 800 }}><GraduationCap size={24} /> Cursos</div>
            <div style={{ fontSize: 13.5, opacity: .95, marginTop: 6, maxWidth: 560, lineHeight: 1.5 }}>Treinamento da equipe: vídeos, aulas e materiais pra todo mundo vender e atender melhor. 🎓</div>
          </div>
          {gestao && <button onClick={() => { setErro(''); setModal({ titulo: '', descricao: '', url: '', categoria: 'Geral' }); }} className="btn" style={{ gap: 7, background: 'rgba(255,255,255,.92)', color: '#5b21b6', border: 'none', fontWeight: 800 }}><Plus size={15} /> Novo curso</button>}
        </div>
      </div>

      {carregando ? (
        <div style={{ color: 'var(--muted)', padding: 30 }}>Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="card" style={{ padding: 44, textAlign: 'center', color: 'var(--muted)' }}>
          <GraduationCap size={34} color="var(--border)" style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Nenhum curso ainda.</div>
          {gestao && <div style={{ fontSize: 12.5 }}>Clique em “Novo curso” pra adicionar o primeiro treinamento.</div>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
          {lista.map(c => {
            const cor = CAT_COR[c.categoria] || '#0E8C96';
            return (
              <div key={c.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: 4, background: cor }} />
                <div style={{ padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: cor, background: cor + '18', borderRadius: 20, padding: '2px 9px' }}>{c.categoria || 'Geral'}</span>
                    {gestao && <button onClick={() => excluir(c)} title="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><Trash2 size={13} /></button>}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{c.titulo}</div>
                  {c.descricao && <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{c.descricao}</div>}
                  <div style={{ flex: 1 }} />
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noreferrer" className="btn btn-p" style={{ gap: 7, marginTop: 4, textDecoration: 'none', background: cor, borderColor: cor }}>
                      <PlayCircle size={15} /> Abrir curso
                    </a>
                  )}
                  {c.arquivo && (
                    <a href={c.arquivo} download={c.filename || 'material'} target="_blank" rel="noreferrer"
                      className="btn btn-s" style={{ gap: 7, marginTop: c.url ? 6 : 4, textDecoration: 'none' }}>
                      <FileText size={14} /> {c.filename ? (c.filename.length > 24 ? c.filename.slice(0, 22) + '…' : c.filename) : 'Material'} <Download size={13} style={{ opacity: .7 }} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 460, maxWidth: '100%', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>Novo curso</h3>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div className="field" style={{ margin: 0 }}><label>Título *</label><input value={modal.titulo} onChange={e => setModal({ ...modal, titulo: e.target.value })} placeholder="Ex: Como conduzir pro fechamento" /></div>
              <div className="field" style={{ margin: 0 }}><label>Categoria</label>
                <select value={modal.categoria} onChange={e => setModal({ ...modal, categoria: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)' }}>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}><label>Link (YouTube, PDF, Drive…)</label><input value={modal.url} onChange={e => setModal({ ...modal, url: e.target.value })} placeholder="https://..." /></div>
              <div className="field" style={{ margin: 0 }}>
                <label>Anexar arquivo (PDF, vídeo, imagem — até ~12MB)</label>
                <input ref={fileRef} type="file" accept="application/pdf,video/*,image/*,.doc,.docx,.ppt,.pptx" style={{ display: 'none' }} onChange={anexar} />
                {modal.arquivo ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg2)', borderRadius: 9, padding: '7px 11px' }}>
                    <FileText size={15} color="var(--tq2)" style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{modal.filename}</span>
                    <button type="button" onClick={() => setModal(m => ({ ...m, arquivo: null, filename: null, mimetype: null }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--err)' }}><X size={14} /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-s btn-sm" style={{ gap: 6 }}><Paperclip size={14} /> Escolher arquivo</button>
                )}
              </div>
              <div className="field" style={{ margin: 0 }}><label>Descrição</label><textarea value={modal.descricao} onChange={e => setModal({ ...modal, descricao: e.target.value })} rows={3} placeholder="Sobre o que é o curso…" style={{ resize: 'vertical' }} /></div>
              {erro && <div style={{ fontSize: 12, color: 'var(--err)', fontWeight: 600 }}>{erro}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={salvar} disabled={salvando} className="btn btn-p" style={{ flex: 1, gap: 6 }}><Check size={14} /> {salvando ? 'Salvando…' : 'Salvar curso'}</button>
                <button onClick={() => setModal(null)} className="btn">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
