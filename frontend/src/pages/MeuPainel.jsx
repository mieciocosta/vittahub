import React, { useEffect, useState, useRef } from 'react';
import { LayoutGrid, StickyNote, CheckSquare, Square, Paperclip, FileText, Download, Trash2, Plus, X, Check, Pencil, UserPlus, Search, MessageSquare, Flame, Send, Copy, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* MEU PAINEL — o painel de trabalho da atendente.
   Em cima, as OPORTUNIDADES do dia (pedido do master: painel que ajude a
   vender mais consultas e terapias) — quem já é cliente da casa e tem o
   próximo passo esperando. Embaixo, o mural pessoal: notas, tarefas e
   documentos. Cada um monta o seu. Privado. */

const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

// Hoje no fuso de São Luís (UTC-3) — depois das 21h o ISO puro vira amanhã.
const hojeSLZ = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '';

/* Frases prontas por tipo de oportunidade. Não são disparadas por robô: a
   mensagem chega ESCRITA na caixa da conversa e quem lê, ajusta e envia é a
   atendente. Tom da casa: calorosa, curta, sempre terminando em convite. */
const FRASES = {
  consulta: (nome, pac, eu) =>
`Oi, ${nome || 'tudo bem'}! Aqui é a ${eu} da Vittalis Saúde 💙

${pac ? `Vi que o(a) ${pac} já` : 'Vi que vocês já'} veio vacinar com a gente — obrigada pela confiança!

Vocês já fazem o acompanhamento com a nossa pediatra? Na consulta a gente olha crescimento, sono e alimentação, e ainda deixa o calendário de vacinas redondinho.

Tenho horário essa semana — quer que eu separe um pra vocês? 😊`,
  terapia: (nome, pac, eu) =>
`Oi, ${nome || 'tudo bem'}! Aqui é a ${eu} da Vittalis Saúde 💙

Depois da consulta${pac ? ` do(a) ${pac}` : ''}, muitas famílias seguem com uma avaliação nas nossas terapias — fonoaudiologia, terapia ocupacional e psicologia (ABA), entre outras.

É uma avaliação tranquila, feita brincando, e ela mostra certinho o que ajuda a criança a evoluir mais rápido.

Posso reservar um horário pra essa avaliação? 😊`,
  retomar: (nome, pac, eu) =>
`Oi, ${nome || 'tudo bem'}! Aqui é a ${eu} da Vittalis Saúde 💙

Senti falta ${pac ? `do(a) ${pac}` : 'de vocês'} por aqui! Nessa fase cada semana de terapia conta muito, e retomar agora faz diferença de verdade no resultado.

Consegui abrir horário na agenda dessa semana. Quer que eu reserve pra vocês? 😊`,
};

export default function MeuPainel() {
  const api = useApi();
  const nav = useNavigate();
  const { user } = useAuth();
  const primeiro = (user?.nome || '').split(' ')[0];
  const [itens, setItens] = useState([]);
  const [modal, setModal] = useState(null); // { id?, tipo, titulo, conteudo }
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const docRef = useRef(null);
  const [buscaCli, setBuscaCli] = useState(null); // modal de adicionar cliente

  const load = () => api.get('/extras/painel').then(d => setItens(Array.isArray(d) ? d : [])).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line

  const notas = itens.filter(i => i.tipo === 'nota');
  const tarefas = itens.filter(i => i.tipo === 'tarefa');
  const docs = itens.filter(i => i.tipo === 'documento');
  const clientes = itens.filter(i => i.tipo === 'cliente');

  const addCliente = async (c) => {
    try {
      const it = await api.post('/extras/painel', { tipo: 'cliente', titulo: c.contact_name || c.phone || 'Cliente', ref_id: c.id, telefone: c.phone || '' });
      setItens(p => [it, ...p]); setBuscaCli(null);
    } catch (e) { setErro(e.message); }
  };
  const salvarNotaCliente = async (c, texto) => {
    setItens(p => p.map(x => x.id === c.id ? { ...x, conteudo: texto } : x));
    try { await api.put(`/extras/painel/${c.id}`, { conteudo: texto }); } catch { load(); }
  };

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
    if (url.length > 52_000_000) { setErro('Documento muito grande (máx. ~40MB).'); return; }
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
          Seu painel, {primeiro}. Em cima, quem está pronto pra dar o próximo passo com a gente; embaixo, suas notas, tarefas e documentos. 🗂️
        </div>
      </div>
      {erro && <div style={{ fontSize: 13, color: 'var(--err)', fontWeight: 600, marginBottom: 12 }}>{erro}</div>}

      {/* 🔥 OPORTUNIDADES — o coração do painel: para quem falar HOJE */}
      <Oportunidades />


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

      {/* MEUS CLIENTES — atendimentos trazidos pro painel, cada um com sua nota */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}><UserPlus size={18} color="#7c3aed" /> Meus clientes {clientes.length > 0 && <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>({clientes.length})</span>}</span>
          <button onClick={() => { setErro(''); setBuscaCli({ q: '', res: [] }); }} className="btn btn-p btn-sm" style={{ gap: 6 }}><Plus size={14} /> Trazer cliente</button>
        </div>
        {clientes.length === 0 ? (
          <div className="card" style={{ padding: 34, textAlign: 'center', color: 'var(--muted)' }}>
            <UserPlus size={30} color="var(--border)" style={{ marginBottom: 8 }} />
            <div style={{ fontWeight: 700 }}>Nenhum cliente no painel ainda.</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>Traga os atendimentos que você quer acompanhar de perto — cada um com seu <b>bloco de notas próprio</b>.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14 }}>
            {clientes.map(c => (
              <div key={c.id} className="card" style={{ padding: '15px 17px', borderTop: '3px solid #7c3aed' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{(c.titulo || '?')[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.titulo}</div>
                    {c.telefone && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{c.telefone}</div>}
                  </div>
                  {c.ref_id && <button onClick={() => nav(`/inbox?conv=${c.ref_id}`)} title="Abrir conversa" className="btn btn-s btn-sm" style={{ gap: 4, padding: '5px 9px' }}><MessageSquare size={13} /></button>}
                  <button onClick={() => excluir(c)} title="Tirar do painel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={15} /></button>
                </div>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 4 }}>📝 Notas deste cliente</div>
                <textarea defaultValue={c.conteudo || ''} onBlur={e => { if (e.target.value !== (c.conteudo || '')) salvarNotaCliente(c, e.target.value); }}
                  rows={3} placeholder="Anote aqui tudo sobre este atendimento…"
                  style={{ width: '100%', padding: '9px 11px', borderRadius: 10, border: '1.5px solid var(--border)', background: '#faf5ff', color: 'var(--txt)', fontSize: 12.5, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal buscar/trazer cliente */}
      {buscaCli && (
        <div onClick={() => setBuscaCli(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '80px 16px' }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 460, maxWidth: '100%', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><UserPlus size={18} color="#7c3aed" /> Trazer cliente pro painel</h3>
              <button onClick={() => setBuscaCli(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg2)', borderRadius: 9, padding: '8px 11px', marginBottom: 10 }}>
              <Search size={15} color="var(--muted)" />
              <input autoFocus value={buscaCli.q} onChange={async e => {
                const q = e.target.value; setBuscaCli(s => ({ ...s, q }));
                if (q.trim().length >= 2) { const r = await api.get(`/inbox/conversations/buscar?q=${encodeURIComponent(q)}`).catch(() => []); setBuscaCli(s => ({ ...s, res: Array.isArray(r) ? r : [] })); }
                else setBuscaCli(s => ({ ...s, res: [] }));
              }} placeholder="Buscar por nome ou telefone…" style={{ border: 'none', background: 'none', outline: 'none', flex: 1, color: 'var(--txt)', fontSize: 13.5 }} />
            </div>
            <div style={{ maxHeight: 320, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(buscaCli.res || []).length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: 8 }}>Digite pelo menos 2 letras pra buscar.</div>}
              {(buscaCli.res || []).map(c => {
                const ja = clientes.some(x => x.ref_id === c.id);
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: 'var(--bg2)', borderRadius: 9 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{(c.contact_name || c.phone || '?')[0]?.toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.contact_name || 'Sem nome'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.phone || ''}</div>
                    </div>
                    {ja ? <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7c3aed' }}>✓ no painel</span>
                    : <button onClick={() => addCliente(c)} className="btn btn-p btn-sm" style={{ gap: 4 }}><Plus size={13} /> Trazer</button>}
                  </div>
                );
              })}
            </div>
            {erro && <div style={{ fontSize: 12, color: 'var(--err)', fontWeight: 600, marginTop: 8 }}>{erro}</div>}
          </div>
        </div>
      )}

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

/* ═══ OPORTUNIDADES DO DIA ══════════════════════════════════════════════════
   Pedido do master: painel que faça a atendente VENDER MAIS consultas e
   terapias. Ninguém vende mais olhando para um mural vazio — vende olhando
   para uma LISTA DE GENTE com o próximo passo evidente. O backend cruza as
   vendas da carteira dela com o que a família ainda não fez:
     · vacinou e nunca consultou     → consulta
     · consultou e não faz terapia   → avaliação
     · terapia parada                → retomar
   Um clique abre a conversa com a frase já escrita (ela lê, ajusta e envia). */
function Oportunidades() {
  const api = useApi();
  const nav = useNavigate();
  const { user } = useAuth();
  const eu = primeiroNome(user?.nome) || 'equipe';
  const [d, setD] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [copiado, setCopiado] = useState('');
  const CHAVE = 'vh_oport_' + hojeSLZ();
  // "Já falei com esse" vale só pelo dia — amanhã a lista nasce limpa.
  const [feitos, setFeitos] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]')); } catch { return new Set(); }
  });
  const marcar = (k) => setFeitos(p => {
    const n = new Set(p); n.add(k);
    try { localStorage.setItem(CHAVE, JSON.stringify([...n])); } catch { /* modo privado */ }
    return n;
  });

  const load = () => {
    setCarregando(true);
    api.get('/extras/oportunidades').then(setD).catch(() => setD(null)).finally(() => setCarregando(false));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const frase = (g, it) => (FRASES[g.chave] || FRASES.consulta)(primeiroNome(it.nome), primeiroNome(it.paciente), eu);

  // Abre a conversa JÁ com a mensagem escrita na caixa (mesmo caminho da
  // pasta Fidelidade: sessionStorage + ?conv=). Enviar continua sendo dela.
  const falar = (g, it) => {
    if (!it.conversa_id) { window.alert('Esse cliente ainda não tem conversa no WhatsApp por aqui.'); return; }
    try { sessionStorage.setItem('vh_rascunho_' + it.conversa_id, frase(g, it)); } catch { /* ok */ }
    marcar(g.chave + it.conversa_id);
    nav(`/inbox?conv=${it.conversa_id}`);
  };
  const copiar = async (g, it) => {
    try { await navigator.clipboard.writeText(frase(g, it)); setCopiado(g.chave + it.conversa_id); setTimeout(() => setCopiado(''), 1600); }
    catch { window.alert('Não consegui copiar aqui. Use o botão "Falar" que a frase já vai escrita.'); }
  };

  if (carregando) return <div className="card" style={{ padding: 18, marginBottom: 20, fontSize: 13, color: 'var(--muted)' }}>Procurando oportunidades…</div>;
  if (!d) return null;

  const m = d.minhas || {};
  const grupos = (d.grupos || []).map(g => ({ ...g, itens: (g.itens || []).filter(i => !feitos.has(g.chave + i.conversa_id)) }));
  const restam = grupos.reduce((a, g) => a + g.itens.length, 0);

  return (
    <div style={{ marginBottom: 22 }}>
      {/* Faixa: o que ela já vendeu + quantas pessoas esperam contato */}
      <div style={{ borderRadius: 16, padding: '16px 20px', color: '#fff', marginBottom: 14,
        background: 'linear-gradient(135deg,#b45309,#f59e0b 60%,#fbbf24)', boxShadow: '0 8px 22px rgba(245,158,11,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Flame size={19} /> {restam > 0 ? `${restam} ${restam === 1 ? 'pessoa esperando' : 'pessoas esperando'} seu contato` : 'Lista do dia zerada — que orgulho! 🏆'}
            </div>
            <div style={{ fontSize: 12.5, opacity: .95, marginTop: 3 }}>
              {restam > 0 ? 'São famílias que já confiam na clínica. Falta só o convite.' : 'Você falou com todo mundo da lista de hoje. Amanhã tem mais.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ background: 'rgba(255,255,255,.2)', borderRadius: 11, padding: '7px 13px', textAlign: 'center' }}>
              <div style={{ fontSize: 19, fontWeight: 900, lineHeight: 1 }}>{m.consultas_hoje || 0}</div>
              <div style={{ fontSize: 10, opacity: .9, marginTop: 2 }}>consultas hoje</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.2)', borderRadius: 11, padding: '7px 13px', textAlign: 'center' }}>
              <div style={{ fontSize: 19, fontWeight: 900, lineHeight: 1 }}>{m.terapias_hoje || 0}</div>
              <div style={{ fontSize: 10, opacity: .9, marginTop: 2 }}>terapias hoje</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.14)', borderRadius: 11, padding: '7px 13px', textAlign: 'center' }}>
              <div style={{ fontSize: 19, fontWeight: 900, lineHeight: 1 }}>{(m.consultas_mes || 0) + (m.terapias_mes || 0)}</div>
              <div style={{ fontSize: 10, opacity: .9, marginTop: 2 }}>no mês</div>
            </div>
            <button onClick={load} title="Atualizar a lista" style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 10, padding: 9, cursor: 'pointer', color: '#fff', display: 'flex' }}><RefreshCw size={15} /></button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14, alignItems: 'start' }}>
        {grupos.map(g => (
          <div key={g.chave} className="card" style={{ padding: '15px 17px', borderTop: `3px solid ${g.cor}` }}>
            <div style={{ fontWeight: 800, fontSize: 14.5, display: 'flex', alignItems: 'center', gap: 7 }}>
              <span>{g.emoji}</span> {g.titulo}
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: g.cor }}>{g.itens.length}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '4px 0 10px', lineHeight: 1.4 }}>{g.porque}</div>
            {g.itens.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nada pendente por aqui hoje. 👏</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {g.itens.map(it => (
                <div key={g.chave + it.conversa_id} style={{ background: 'var(--bg2)', borderRadius: 10, padding: '9px 11px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.nome || it.paciente || 'Sem nome'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }} data-nocopy>
                        {it.telefone || '—'}{it.dias != null && ` · há ${it.dias} dia${it.dias === 1 ? '' : 's'}`}
                      </div>
                    </div>
                    <button onClick={() => copiar(g, it)} title="Copiar a frase" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiado === g.chave + it.conversa_id ? 'var(--ok,#16a34a)' : 'var(--muted)', display: 'flex' }}>
                      {copiado === g.chave + it.conversa_id ? <Check size={15} /> : <Copy size={14} />}
                    </button>
                    <button onClick={() => marcar(g.chave + it.conversa_id)} title="Já falei com essa família" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}><X size={15} /></button>
                    <button onClick={() => falar(g, it)} className="btn btn-p btn-sm" style={{ gap: 5, padding: '5px 10px' }}><Send size={12} /> Falar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
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
