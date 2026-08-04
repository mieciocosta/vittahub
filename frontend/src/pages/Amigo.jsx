import React, { useEffect, useState, useRef } from 'react';
import { BookOpen, Send, Trash2, Sparkles, Users, ChevronLeft, Eye } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* MEU DEVOCIONAL — uma palavra de Deus + aplicações práticas pra vida real.
   A pessoa pede um tema (ou a palavra do dia) e recebe: 📖 A Palavra,
   💡 Reflexão, ✅ Aplicações de hoje e 🙏 Oração. Master acompanha a equipe. */

export default function Amigo() {
  const api = useApi();
  const { user } = useAuth();
  const ehMaster = user?.role === 'master';
  const primeiro = (user?.nome || '').split(' ')[0];
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  // Modo master: 'chat' (própria conversa) | 'lista' | 'ver'
  const [modo, setModo] = useState('chat');
  const [equipe, setEquipe] = useState([]);
  const [vendo, setVendo] = useState(null); // { usuario, mensagens }
  const fimRef = useRef(null);
  const inputRef = useRef(null);

  // 🌅 Devocional do dia — tema curado, o MESMO pra toda a equipe
  const [devocional, setDevocional] = useState(null);
  const [devAberto, setDevAberto] = useState(false);
  useEffect(() => {
    api.get('/extras/amigo/historico').then(d => {
      const lista = Array.isArray(d) ? d : [];
      setMsgs(lista);
      setDevAberto(lista.length === 0); // sem conversa → devocional já aberto
    }).catch(() => {}).finally(() => setCarregando(false));
    api.get('/extras/amigo/devocional-hoje').then(setDevocional).catch(() => {});
  }, []); // eslint-disable-line

  // Erros aqui eram engolidos — o clique parecia "não fazer nada". Agora a lista
  // sempre abre e mostra: carregando → conteúdo OU o motivo do erro.
  const [equipeLoad, setEquipeLoad] = useState(false);
  const [equipeErro, setEquipeErro] = useState('');
  const abrirEquipe = () => {
    setModo('lista'); setEquipeErro(''); setEquipeLoad(true);
    api.get('/extras/amigo/usuarios')
      .then(d => setEquipe(Array.isArray(d) ? d : []))
      .catch(e => { setEquipe([]); setEquipeErro(e.message || 'Não consegui carregar a lista.'); })
      .finally(() => setEquipeLoad(false));
  };
  const verConversa = (u) => {
    api.get(`/extras/amigo/conversa/${u.usuario_id}`).then(d => { setVendo(d); setModo('ver'); }).catch(() => {});
  };
  const inic = (nome) => (nome || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase();
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, enviando]);

  const enviar = async (txtDireto) => {
    const t = (txtDireto ?? texto).trim();
    if (!t || enviando) return;
    setTexto('');
    setMsgs(p => [...p, { role: 'user', content: t }]);
    setEnviando(true);
    try {
      const r = await api.post('/extras/amigo/mensagem', { texto: t });
      setMsgs(p => [...p, { role: 'assistant', content: r.resposta }]);
    } catch (e) {
      setMsgs(p => [...p, { role: 'assistant', content: 'Não consegui buscar a palavra agora. Tenta de novo daqui a pouco? 🙏' }]);
    }
    setEnviando(false);
    inputRef.current?.focus();
  };

  const limpar = async () => {
    if (!window.confirm('Apagar toda a conversa? Isso não pode ser desfeito.')) return;
    setMsgs([]);
    try { await api.del('/extras/amigo/historico'); } catch {}
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 780, margin: '0 auto', padding: '18px 16px' }}>
      {/* Header */}
      <div style={{ borderRadius: 18, padding: '18px 22px', marginBottom: 14, color: '#fff', position: 'relative', overflow: 'hidden', flexShrink: 0,
        background: 'linear-gradient(135deg,#4c1d95 0%,#6d28d9 55%,#7c3aed 130%)', boxShadow: '0 10px 30px rgba(109,40,217,.3)' }}>
        <div style={{ position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,.1)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 20, fontWeight: 800 }}><BookOpen size={22} /> Meu Devocional</div>
            <div style={{ fontSize: 12.5, opacity: .95, marginTop: 4 }}>Uma palavra de Deus pra hoje — e como aplicá-la na sua vida. 📖</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {ehMaster && modo === 'chat' && (
              <button onClick={abrirEquipe} title="Ver conversas da equipe" style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 9, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
                <Users size={13} /> Equipe
              </button>
            )}
            {modo === 'chat' && msgs.length > 0 && (
              <button onClick={limpar} title="Apagar conversa" style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 9, padding: '7px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
                <Trash2 size={13} /> Limpar
              </button>
            )}
            {modo !== 'chat' && (
              <button onClick={() => { setModo('chat'); setVendo(null); }} style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 9, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
                <ChevronLeft size={13} /> Voltar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MASTER: lista da equipe */}
      {modo === 'lista' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>Acompanhe com carinho quem buscou uma palavra. As conversas são pessoais — use pra cuidar da equipe.</div>
          {equipeLoad ? (
            <div className="card" style={{ padding: 34, textAlign: 'center', color: 'var(--muted)' }}>Carregando a lista…</div>
          ) : equipeErro ? (
            <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--err,#dc2626)', fontWeight: 600 }}>
              ⚠️ {equipeErro}
              <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 500, marginTop: 8 }}>Se estiver "entrando como" outra pessoa, volte ao seu usuário master e tente de novo.</div>
            </div>
          ) : equipe.length === 0 ? (
            <div className="card" style={{ padding: 34, textAlign: 'center', color: 'var(--muted)' }}>Ninguém usou o Meu Devocional ainda.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {equipe.map(u => (
                <div key={u.usuario_id} onClick={() => verConversa(u)} className="card" style={{ padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: u.cor || 'linear-gradient(135deg,#4c1d95,#7c3aed)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, overflow: 'hidden' }}>
                    {u.avatar ? <img src={u.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : inic(u.nome)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{u.nome || 'Usuário'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{u.setor || '—'} · {u.total} mensagem(ns) · última {u.ultima ? new Date(u.ultima).toLocaleDateString('pt-BR') : '—'}</div>
                  </div>
                  <Eye size={16} color="var(--muted)" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MASTER: conversa de um liderado (só leitura) */}
      {modo === 'ver' && vendo && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 2px' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--txt)' }}>{vendo.usuario?.nome || 'Conversa'} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>({vendo.usuario?.setor || '—'})</span></div>
          {(vendo.mensagens || []).map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '78%', padding: '10px 14px', borderRadius: 16, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? 'var(--tq)' : 'var(--card)', color: m.role === 'user' ? '#fff' : 'var(--txt)', border: m.role === 'user' ? 'none' : '1px solid var(--border)' }}>
                {m.content}
              </div>
            </div>
          ))}
          {!(vendo.mensagens || []).length && <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Sem mensagens.</div>}
        </div>
      )}

      {modo === 'chat' && (<>

      {/* 🌅 Devocional do dia (tema curado — igual pra toda a equipe) */}
      {devocional && (
        <div className="card" style={{ flexShrink: 0, marginBottom: 12, padding: 0, overflow: 'hidden', border: '1.5px solid #ddd6fe' }}>
          <button onClick={() => setDevAberto(a => !a)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '11px 15px', border: 'none', cursor: 'pointer', textAlign: 'left',
              background: 'linear-gradient(90deg,#ede9fe,#f5f3ff)', color: '#4c1d95', fontWeight: 800, fontSize: 13.5 }}>
            <span>🌅</span>
            <span style={{ flex: 1 }}>Devocional de hoje: {devocional.tema}</span>
            <span style={{ fontSize: 11, fontWeight: 700, opacity: .7 }}>{devocional.ref} {devAberto ? '▲' : '▼'}</span>
          </button>
          {devAberto && (
            <div style={{ padding: '14px 17px', fontSize: 13.5, lineHeight: 1.65, whiteSpace: 'pre-wrap', color: 'var(--txt)' }}>
              {devocional.texto}
            </div>
          )}
        </div>
      )}

      {/* Conversa */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 2px' }}>
        {carregando ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Carregando…</div>
        ) : msgs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--muted)' }}>
            <div style={{ width: 66, height: 66, borderRadius: '50%', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#4c1d95,#7c3aed)', boxShadow: '0 8px 24px rgba(109,40,217,.3)' }}>
              <BookOpen size={30} color="#fff" />
            </div>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--txt)' }}>A paz, {primeiro}! 🙏</div>
            <div style={{ fontSize: 15, marginTop: 8, maxWidth: 420, marginInline: 'auto', lineHeight: 1.5, fontWeight: 700, color: 'var(--txt2)' }}>
              Que palavra você precisa hoje?
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 18, maxWidth: 480, marginInline: 'auto' }}>
              {[['🌅','Palavra do dia'],['😰','Ansiedade'],['🙏','Gratidão'],['💪','Perseverança'],['❤️','Amor'],['🧠','Sabedoria'],['😔','Desânimo'],['👨‍👩‍👧','Família']].map(([em, tema]) => (
                <button key={tema} onClick={() => enviar(tema === 'Palavra do dia' ? 'Quero a palavra do dia' : `Quero uma palavra sobre ${tema.toLowerCase()}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 20, border: '1.5px solid #ddd6fe', background: 'var(--card)', color: 'var(--txt)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  {em} {tema}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.role === 'assistant' && (
                <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#4c1d95,#7c3aed)', alignSelf: 'flex-end' }}>
                  <BookOpen size={15} color="#fff" />
                </div>
              )}
              <div style={{ maxWidth: '78%', padding: '11px 15px', borderRadius: 16, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? 'var(--tq)' : 'var(--card)', color: m.role === 'user' ? '#fff' : 'var(--txt)',
                border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                borderBottomRightRadius: m.role === 'user' ? 4 : 16, borderBottomLeftRadius: m.role === 'user' ? 16 : 4,
                boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
                {m.content}
              </div>
            </div>
          ))
        )}
        {enviando && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13, paddingLeft: 4 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#4c1d95,#7c3aed)' }}><BookOpen size={15} color="#fff" /></div>
            <span className="spin" style={{ width: 14, height: 14, borderColor: 'rgba(109,40,217,.2)', borderTopColor: '#6d28d9' }} /> pensando com carinho…
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 12, flexShrink: 0 }}>
        <textarea ref={inputRef} value={texto} onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          rows={1} placeholder="Peça uma palavra: um tema, um sentimento… ou 'palavra do dia'"
          style={{ flex: 1, resize: 'none', maxHeight: 120, padding: '12px 15px', borderRadius: 14, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--txt)', fontSize: 14, fontFamily: 'inherit' }} />
        <button onClick={() => enviar()} disabled={enviando || !texto.trim()} className="btn btn-p" style={{ borderRadius: 14, height: 46, width: 46, padding: 0, justifyContent: 'center', opacity: !texto.trim() ? .5 : 1 }}>
          <Send size={17} />
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--light)', textAlign: 'center', marginTop: 7 }}>
        <Sparkles size={10} style={{ verticalAlign: -1 }} /> Palavra e aplicações baseadas na Bíblia. Em crise, procure alguém de confiança — CVV: <b>188</b>.
      </div>
      </>)}
    </div>
  );
}
