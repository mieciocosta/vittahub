import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, X, MessageSquareText } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* ─── Modelos de Mensagens (respostas rápidas do atalho #) ─────────────────── */
export default function Modelos() {
  const api = useApi();
  const { user, isMaster } = useAuth();
  const gestao = isMaster || user?.role === 'supervisor';
  const [lista, setLista] = useState([]);
  const [modal, setModal] = useState(null);
  const [erro, setErro] = useState('');

  const load = useCallback(() => { api.get('/inbox/quick-replies').then(d => setLista(Array.isArray(d) ? d : [])).catch(() => {}); }, []); // eslint-disable-line
  useEffect(load, [load]);

  const salvar = async () => {
    setErro('');
    if (!modal.titulo?.trim() || !modal.texto?.trim()) return setErro('Preencha título e mensagem.');
    try {
      if (modal.id) await api.put(`/inbox/quick-replies/${modal.id}`, { titulo: modal.titulo.trim(), texto: modal.texto.trim() });
      else await api.post('/inbox/quick-replies', { titulo: modal.titulo.trim(), texto: modal.texto.trim(), escopo: modal.escopo });
      setModal(null); load();
    } catch (e) { setErro(e.message); }
  };

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800 }}>💬 Modelos de Mensagens</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>Disponíveis no Chat pelo atalho <b>#</b>. Crie os <b>seus</b> modelos e personalize do seu jeito.</p>
        </div>
        <button onClick={() => setModal({ escopo: 'pessoal' })} className="btn btn-p" style={{ gap: 6 }}><Plus size={14} /> Novo modelo</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 13 }}>
        {lista.map(qr => {
          const podeMexer = qr.minha || (gestao && qr.global);
          return (
          <div key={qr.id} className="card" style={{ padding: '14px 16px', background: 'var(--card)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquareText size={14} color="var(--tq2)" />
              <span style={{ fontWeight: 800, fontSize: 13, flex: 1 }}>{qr.titulo}</span>
              <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 7px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: .3,
                background: qr.global ? 'var(--tq3)' : '#f2ecfe', color: qr.global ? 'var(--tq2)' : '#7c3aed' }}>{qr.global ? 'Equipe' : 'Meu'}</span>
              {podeMexer && (
                <>
                  <button onClick={() => setModal({ ...qr, escopo: qr.global ? 'global' : 'pessoal' })} style={miniBtn}><Pencil size={12} /></button>
                  <button onClick={async () => { if (window.confirm(`Excluir "${qr.titulo}"?`)) { await api.delete(`/inbox/quick-replies/${qr.id}`); load(); } }} style={{ ...miniBtn, color: 'var(--err)' }}><Trash2 size={12} /></button>
                </>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{qr.texto}</div>
          </div>
          );
        })}
        {lista.length === 0 && <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, gridColumn: '1 / -1', background: 'var(--card)' }}>Nenhum modelo ainda. Clique em “Novo modelo” pra criar o seu.</div>}
      </div>

      {modal && (
        <div onClick={e => e.target === e.currentTarget && setModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(3,43,48,.55)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 460, background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--s4)', padding: '18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{modal.id ? 'Editar modelo' : 'Novo modelo'}</div>
              <button onClick={() => setModal(null)} style={miniBtn}><X size={14} /></button>
            </div>
            {erro && <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 9, background: 'var(--err2)', color: 'var(--err)', fontSize: 12, fontWeight: 600 }}>{erro}</div>}
            <div className="field" style={{ marginBottom: 10 }}><label>Título *</label>
              <input value={modal.titulo || ''} maxLength={60} onChange={e => setModal({ ...modal, titulo: e.target.value })} placeholder="Ex: Confirmar pagamento" /></div>
            <div className="field"><label>Mensagem *</label>
              <textarea rows={5} value={modal.texto || ''} maxLength={1000} onChange={e => setModal({ ...modal, texto: e.target.value })}
                placeholder="Texto que será enviado…"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 12.5, resize: 'vertical', background: 'var(--bg)', color: 'var(--txt)', fontFamily: 'inherit' }} /></div>
            <div style={{ fontSize: 10.5, color: 'var(--light)', marginTop: 4 }}>{(modal.texto || '').length}/1000</div>
            {gestao && !modal.id && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => setModal({ ...modal, escopo: 'pessoal' })} className="btn btn-sm" style={{ flex: 1, fontWeight: 700, background: modal.escopo !== 'global' ? 'var(--tq)' : 'var(--bg2)', color: modal.escopo !== 'global' ? '#fff' : 'var(--txt2)', border: 'none' }}>Só pra mim</button>
                <button onClick={() => setModal({ ...modal, escopo: 'global' })} className="btn btn-sm" style={{ flex: 1, fontWeight: 700, background: modal.escopo === 'global' ? 'var(--tq)' : 'var(--bg2)', color: modal.escopo === 'global' ? '#fff' : 'var(--txt2)', border: 'none' }}>Toda a equipe</button>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setModal(null)} className="btn btn-s">Cancelar</button>
              <button onClick={salvar} className="btn btn-p">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const miniBtn = { width: 26, height: 26, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
