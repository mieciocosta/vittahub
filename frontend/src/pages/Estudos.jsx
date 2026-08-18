import React, { useEffect, useState } from 'react';
import { BookOpen, Sparkles, Search, X, Check, Trash2, MessageSquare, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* ESTUDOS — conversas que alguém escolheu estudar.

   Irmão dos Cases de Sucesso, e diferente dele de propósito: Cases é
   automático (toda conversa que virou venda entra sozinha); aqui é curadoria.
   Por isso cabe a venda perdida, a objeção que travou, o atendimento que a
   gente não quer repetir — o que mais ensina raramente é o que deu certo. */

const TAGS = {
  ganhou:  { rotulo: '✅ Deu certo',   cor: '#16a34a' },
  perdeu:  { rotulo: '💔 Perdemos',    cor: '#dc2626' },
  objecao: { rotulo: '🧱 Objeção',     cor: '#C4973B' },
  modelo:  { rotulo: '⭐ Modelo',      cor: '#0E8C96' },
  erro:    { rotulo: '⚠️ Erro nosso',  cor: '#ea580c' },
  duvida:  { rotulo: '❓ Dúvida',      cor: '#7c3aed' },
};
const STATUS = { aberto: 'Para estudar', estudado: 'Estudado', arquivado: 'Arquivado' };

/* Markdown leve, igual ao de Cases de Sucesso — títulos, negrito e listas. */
function Markdown({ texto }) {
  const bold = (s) => String(s).split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') && p.endsWith('**')
    ? <strong key={i}>{p.slice(2, -2)}</strong> : <React.Fragment key={i}>{p}</React.Fragment>);
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--txt2)' }}>
      {String(texto || '').split('\n').map((l, i) => {
        const t = l.trim();
        if (!t) return <div key={i} style={{ height: 6 }} />;
        if (/^#{1,6}\s/.test(t)) return <div key={i} style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--txt)', margin: '12px 0 4px' }}>{bold(t.replace(/^#+\s/, ''))}</div>;
        if (/^[-*]\s/.test(t)) return <div key={i} style={{ display: 'flex', gap: 7, paddingLeft: 4 }}><span style={{ color: 'var(--tq)' }}>•</span><span>{bold(t.replace(/^[-*]\s/, ''))}</span></div>;
        return <div key={i} style={{ marginTop: 2 }}>{bold(t)}</div>;
      })}
    </div>
  );
}

function Etiqueta({ tag }) {
  const t = TAGS[tag]; if (!t) return null;
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color: t.cor, border: `1px solid ${t.cor}55`, background: `${t.cor}14` }}>{t.rotulo}</span>;
}

export default function Estudos() {
  const api = useApi();
  const nav = useNavigate();
  const { user } = useAuth();
  const podeApagar = ['master', 'supervisor'].includes(user?.role) || user?.lider;

  const [lista, setLista] = useState([]);
  const [filtro, setFiltro] = useState({ status: '', tag: '', busca: '' });
  const [aberto, setAberto] = useState(null);   // { estudo, conversa, mensagens, aviso }
  const [carregando, setCarregando] = useState(true);
  const [analisando, setAnalisando] = useState(false);
  const [rascunho, setRascunho] = useState({ motivo: '', aprendizado: '' });
  const [erro, setErro] = useState(null);

  const carregar = () => {
    setCarregando(true);
    const qs = new URLSearchParams();
    if (filtro.status) qs.set('status', filtro.status);
    if (filtro.tag) qs.set('tag', filtro.tag);
    if (filtro.busca.trim()) qs.set('busca', filtro.busca.trim());
    api.get(`/extras/estudos${qs.toString() ? `?${qs}` : ''}`)
      .then(d => setLista(Array.isArray(d) ? d : []))
      .catch(e => setErro(e.message))
      .finally(() => setCarregando(false));
  };
  useEffect(carregar, [filtro.status, filtro.tag]);

  const abrir = async (e) => {
    setErro(null);
    try {
      const d = await api.get(`/extras/estudos/${e.id}`);
      setAberto(d);
      setRascunho({ motivo: d.estudo.motivo || '', aprendizado: d.estudo.aprendizado || '' });
    } catch (err) { setErro(err.message); }
  };

  const salvar = async (campos) => {
    if (!aberto) return;
    try {
      const e = await api.put(`/extras/estudos/${aberto.estudo.id}`, campos);
      setAberto({ ...aberto, estudo: e });
      setLista(l => l.map(x => x.id === e.id ? { ...x, ...e } : x));
    } catch (err) { setErro(err.message); }
  };

  const analisar = async () => {
    if (!aberto || analisando) return;
    setAnalisando(true); setErro(null);
    try {
      const e = await api.post(`/extras/estudos/${aberto.estudo.id}/analisar`, {});
      setAberto({ ...aberto, estudo: e });
    } catch (err) { setErro(err.message); }
    setAnalisando(false);
  };

  const apagar = async (id) => {
    try { await api.delete(`/extras/estudos/${id}`); setAberto(null); carregar(); }
    catch (err) { setErro(err.message); }
  };

  const alternarTag = (tag) => {
    const atuais = aberto?.estudo?.tags || [];
    salvar({ tags: atuais.includes(tag) ? atuais.filter(t => t !== tag) : [...atuais, tag] });
  };

  return (
    <div style={{ padding: '18px 20px 40px', maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <BookOpen size={22} color="#C4973B" />
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>Estudos</h1>
        <button onClick={() => nav('/cases-sucesso')} className="btn btn-sm"
          style={{ marginLeft: 'auto', background: '#422006', color: '#fcd34d', border: '1.5px solid #eab308', fontWeight: 700, fontSize: 11.5 }}>
          <Trophy size={12} /> Cases de Sucesso
        </button>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Conversas que a equipe trouxe para olhar com calma. No Inbox, o botão <strong>📚 Estudar</strong> manda a
        conversa para cá. Cabe o que deu certo e o que travou — o que mais ensina raramente é o que deu certo.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: 10, color: 'var(--light)' }} />
          <input value={filtro.busca} onChange={e => setFiltro({ ...filtro, busca: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && carregar()}
            placeholder="Buscar por cliente, motivo ou aprendizado…"
            style={{ width: '100%', padding: '7px 10px 7px 27px', fontSize: 13 }} />
        </div>
        <select value={filtro.status} onChange={e => setFiltro({ ...filtro, status: e.target.value })} style={{ fontSize: 12.5, padding: '7px 9px' }}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filtro.tag} onChange={e => setFiltro({ ...filtro, tag: e.target.value })} style={{ fontSize: 12.5, padding: '7px 9px' }}>
          <option value="">Todas as marcas</option>
          {Object.entries(TAGS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
        </select>
      </div>

      {erro && <div style={{ padding: 10, borderRadius: 8, background: 'var(--err2,#fdecec)', color: 'var(--err,#dc2626)', fontSize: 12.5, marginBottom: 12 }}>{erro}</div>}

      {carregando ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Carregando…</div>
        : !lista.length ? (
          <div style={{ textAlign: 'center', padding: '46px 20px', color: 'var(--muted)' }}>
            <BookOpen size={30} color="var(--light)" />
            <div style={{ fontWeight: 700, marginTop: 10, color: 'var(--txt2)' }}>Nenhuma conversa em estudo ainda</div>
            <div style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.6 }}>
              Abra uma conversa no Inbox e clique em <strong>📚 Estudar</strong>. Vale tanto a que fechou bonito
              quanto a que travou numa objeção.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))' }}>
            {lista.map(e => (
              <div key={e.id} onClick={() => abrir(e)} className="card"
                style={{ padding: 13, cursor: 'pointer', borderLeft: `3px solid ${e.status === 'estudado' ? '#16a34a' : e.status === 'arquivado' ? 'var(--light)' : '#C4973B'}`, opacity: e.status === 'arquivado' ? .65 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.titulo || e.contact_nome || 'Conversa'}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{STATUS[e.status] || e.status}</span>
                </div>
                {e.conversa_sumiu && <div style={{ fontSize: 10.5, color: 'var(--err,#dc2626)', marginTop: 3 }}>conversa excluída — o aprendizado ficou</div>}
                {e.motivo && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 5, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.motivo}</div>}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                  {(e.tags || []).map(t => <Etiqueta key={t} tag={t} />)}
                  {e.analise && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tq)' }}>✨ analisada</span>}
                </div>
              </div>
            ))}
          </div>
        )}

      {aberto && (
        <div onClick={() => setAberto(null)}
          style={{ position: 'fixed', inset: 0, background: '#0009', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3vh 12px', overflow: 'auto' }}>
          <div onClick={ev => ev.stopPropagation()} className="card"
            style={{ maxWidth: 940, width: '100%', padding: 0, overflow: 'hidden' }}>

            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{aberto.estudo.titulo || aberto.estudo.contact_nome}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                  trazido por {aberto.estudo.criado_por_nome || '—'}
                  {aberto.conversa?.phone ? ` · ${aberto.conversa.phone}` : ''}
                </div>
              </div>
              {aberto.conversa && (
                <button onClick={() => nav(`/inbox?c=${aberto.estudo.conversa_id}`)} className="btn btn-sm btn-g" style={{ fontSize: 11.5 }}>
                  <MessageSquare size={12} /> Abrir no Inbox
                </button>
              )}
              <button onClick={() => setAberto(null)} className="btn btn-sm btn-g"><X size={13} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 0 }}>
              {/* ─── esquerda: a conversa ─── */}
              <div style={{ borderRight: '1px solid var(--bd)', padding: 14, maxHeight: '68vh', overflow: 'auto' }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>A conversa</div>
                {aberto.aviso && <div style={{ fontSize: 12.5, color: 'var(--err,#dc2626)' }}>{aberto.aviso}</div>}
                {aberto.mensagens.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.from_type === 'contact' ? 'flex-start' : 'flex-end', marginBottom: 6 }}>
                    <div style={{ maxWidth: '86%', padding: '6px 9px', borderRadius: 9, fontSize: 12.5, lineHeight: 1.5,
                      background: m.from_type === 'contact' ? 'var(--bg2)' : '#0E8C9622', color: 'var(--txt2)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 2 }}>
                        {m.from_type === 'contact' ? 'Cliente' : (m.sender_nome || 'Nós')} · {String(m.created_at).slice(0, 10).split('-').reverse().join('/')}
                      </div>
                      {m.type === 'text' ? m.content : <em>[{m.type}]</em>}
                    </div>
                  </div>
                ))}
              </div>

              {/* ─── direita: o estudo ─── */}
              <div style={{ padding: 14, maxHeight: '68vh', overflow: 'auto' }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>O que olhar aqui</div>
                <textarea value={rascunho.motivo} onChange={e => setRascunho({ ...rascunho, motivo: e.target.value })}
                  onBlur={() => rascunho.motivo !== (aberto.estudo.motivo || '') && salvar({ motivo: rascunho.motivo })}
                  placeholder="Por que essa conversa vale ser estudada? Ex.: a mãe sumiu depois do preço; a Raylane contornou a objeção de convênio."
                  rows={3} style={{ width: '100%', fontSize: 12.5, lineHeight: 1.5, resize: 'vertical' }} />

                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '10px 0 4px' }}>
                  {Object.entries(TAGS).map(([k, v]) => {
                    const ativa = (aberto.estudo.tags || []).includes(k);
                    return (
                      <button key={k} onClick={() => alternarTag(k)} className="btn btn-sm"
                        style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px',
                          background: ativa ? `${v.cor}22` : 'transparent', color: ativa ? v.cor : 'var(--muted)',
                          border: `1px solid ${ativa ? v.cor : 'var(--bd)'}` }}>
                        {v.rotulo}
                      </button>
                    );
                  })}
                </div>

                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', margin: '14px 0 6px' }}>
                  O que a equipe aprendeu
                </div>
                <textarea value={rascunho.aprendizado} onChange={e => setRascunho({ ...rascunho, aprendizado: e.target.value })}
                  onBlur={() => rascunho.aprendizado !== (aberto.estudo.aprendizado || '') && salvar({ aprendizado: rascunho.aprendizado })}
                  placeholder="A conclusão fica aqui. É o que sobra quando a conversa já foi esquecida."
                  rows={4} style={{ width: '100%', fontSize: 12.5, lineHeight: 1.5, resize: 'vertical' }} />

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                  <button onClick={analisar} disabled={analisando || !aberto.estudo.conversa_id} className="btn btn-sm"
                    style={{ background: '#3b0764', color: '#e9d5ff', border: '1.5px solid #7c3aed', fontWeight: 700, fontSize: 11.5 }}>
                    {analisando ? <span className="spin" style={{ width: 10, height: 10 }} /> : <Sparkles size={12} />}
                    {aberto.estudo.analise ? ' Analisar de novo' : ' A Vitta lê e comenta'}
                  </button>
                  <button onClick={() => salvar({ status: aberto.estudo.status === 'estudado' ? 'aberto' : 'estudado' })} className="btn btn-sm btn-g" style={{ fontSize: 11.5, fontWeight: 700 }}>
                    <Check size={12} /> {aberto.estudo.status === 'estudado' ? 'Reabrir' : 'Marcar como estudado'}
                  </button>
                  <button onClick={() => salvar({ status: 'arquivado' })} className="btn btn-sm btn-g" style={{ fontSize: 11.5 }}>Arquivar</button>
                  {podeApagar && (
                    <button onClick={() => apagar(aberto.estudo.id)} className="btn btn-sm"
                      style={{ background: 'var(--err2,#fdecec)', color: 'var(--err,#dc2626)', border: '1.5px solid var(--err,#dc2626)', fontSize: 11.5 }}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                {aberto.estudo.analise && (
                  <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--bg2)' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--tq)', marginBottom: 6 }}>
                      ✨ O que a Vitta viu
                    </div>
                    <Markdown texto={aberto.estudo.analise} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
