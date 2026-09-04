import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aoVivo } from '../hooks/polling.js';

/* 💬 CHAT DA EQUIPE — pedido do master ────────────────────────────────────────
   "Um botão em todo chat: Chat da equipe. Que apareça para todos. Bem legal e
   chamativo, onde elas possam conversar, e sempre que forem chamadas apareça
   verde. Pode colocar na lateral."

   Duas partes:
   · BotaoChatEquipe — mora na lateral do Inbox, à vista o dia inteiro. Fica
     turquesa normalmente, VERDE PULSANDO quando alguém escreveu @NomeDela.
   · PainelChatEquipe — a gaveta que abre por cima da lista, sem tirar a pessoa
     de onde ela está.

   Por que o verde é o do CHAMADO e não o de mensagem nova: numa equipe de sete
   pessoas o chat tem movimento o tempo todo. Se tudo acendesse igual, o aviso
   viraria paisagem em dois dias e o chamado de verdade se perderia no meio.
   Mensagem nova = bolinha com o número. Te chamaram = verde pulsando.        */

const VERDE = '#16a34a';
const TURQ = '#00B8C0';

const primeiroNome = (n) => String(n || '').trim().split(' ')[0];
const hhmm = (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/* Data em cima do grupo de mensagens: "Hoje", "Ontem" ou a data. Sem isso, uma
   conversa de três dias vira um bloco só e ninguém sabe o que é de quando.
   Dia de São Luís (UTC-3), não o do servidor de quem abriu a tela. */
const diaSLZ = (d) => new Date(new Date(d).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
function rotuloDoDia(d) {
  const hoje = diaSLZ(Date.now());
  const ontem = diaSLZ(Date.now() - 86400000);
  const dia = diaSLZ(d);
  if (dia === hoje) return 'Hoje';
  if (dia === ontem) return 'Ontem';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

/* Pinta o @nome dentro do texto. O da própria pessoa sai destacado — é o que
   faz ela achar, de relance, o pedaço da conversa que é com ela. */
function TextoComMencoes({ texto, meuPrimeiro }) {
  const partes = String(texto || '').split(/(@[\p{L}]{2,})/gu);
  return (
    <>
      {partes.map((p, i) => {
        if (!p.startsWith('@')) return <React.Fragment key={i}>{p}</React.Fragment>;
        const ehMim = p.slice(1).toLowerCase() === String(meuPrimeiro || '').toLowerCase();
        return (
          <b key={i} style={{
            color: ehMim ? '#065f46' : 'var(--tq2,#0891b2)',
            background: ehMim ? '#bbf7d0' : 'transparent',
            borderRadius: 5, padding: ehMim ? '0 4px' : 0,
          }}>{p}</b>
        );
      })}
    </>
  );
}

/* ─── O BOTÃO DA LATERAL ──────────────────────────────────────────────────── */
export function BotaoChatEquipe({ api, user, onAbrir, aberto }) {
  const [st, setSt] = useState({ naoLidas: 0, chamado: false });

  const puxar = useCallback(() => {
    if (aberto) { setSt({ naoLidas: 0, chamado: false }); return; }
    api.get('/extras/chat-equipe/status').then(setSt).catch(() => {});
  }, [api, aberto]);

  useEffect(() => { puxar(); return aoVivo(puxar, 20000); }, [puxar]);

  /* A mensagem chega pelo socket do Inbox, que a repassa como evento da janela.
     Sem isso o botão só acenderia no próximo ciclo — até 20 s de atraso para
     alguém que foi chamada agora. */
  useEffect(() => {
    const aoChegar = (e) => {
      const m = e.detail || {};
      if (m.autor_id === user?.id) return;
      setSt(p => ({
        naoLidas: (p.naoLidas || 0) + 1,
        chamado: p.chamado || (m.mencoes || []).includes(user?.id),
      }));
    };
    window.addEventListener('vh_chat_equipe', aoChegar);
    return () => window.removeEventListener('vh_chat_equipe', aoChegar);
  }, [user?.id]);

  const chamado = st.chamado && !aberto;

  return (
    <>
      <style>{`@keyframes vhChamado {
        0%,100% { box-shadow: 0 0 0 0 rgba(22,163,74,.55); }
        50%     { box-shadow: 0 0 0 7px rgba(22,163,74,0); } }`}</style>
      <button onClick={onAbrir} title={chamado ? 'Te chamaram no chat da equipe!' : 'Conversar com a equipe'}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
          padding: '10px 12px', marginBottom: 10, borderRadius: 12, border: 'none',
          color: '#fff', fontWeight: 800, fontSize: 13, textAlign: 'left',
          background: chamado
            ? `linear-gradient(135deg, ${VERDE}, #22c55e)`
            : aberto ? 'linear-gradient(135deg,#0f766e,#115e59)' : `linear-gradient(135deg, ${TURQ}, #0891b2)`,
          boxShadow: chamado ? '0 4px 14px rgba(22,163,74,.35)' : '0 3px 10px rgba(0,184,192,.28)',
          animation: chamado ? 'vhChamado 1.6s ease-out infinite' : 'none',
          transition: 'background .25s ease',
        }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>{chamado ? '🔔' : '💬'}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {chamado ? 'Te chamaram no chat!' : 'Chat da equipe'}
        </span>
        {!aberto && st.naoLidas > 0 && (
          <span style={{
            background: 'rgba(255,255,255,.95)', color: chamado ? VERDE : '#0e7490',
            borderRadius: 10, padding: '1px 7px', fontSize: 10.5, fontWeight: 900, flexShrink: 0,
          }}>{st.naoLidas > 99 ? '99+' : st.naoLidas}</span>
        )}
      </button>
    </>
  );
}

/* ─── O PAINEL ────────────────────────────────────────────────────────────── */
export function PainelChatEquipe({ api, user, onFechar }) {
  const [msgs, setMsgs] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [txt, setTxt] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregou, setCarregou] = useState(false);
  const fimRef = useRef(null);
  const inputRef = useRef(null);
  const meuPrimeiro = primeiroNome(user?.nome);

  const carregar = useCallback(() => {
    api.get('/extras/chat-equipe')
      .then(d => { setMsgs(Array.isArray(d?.data) ? d.data : []); setCarregou(true); })
      .catch(() => setCarregou(true));
  }, [api]);

  useEffect(() => {
    carregar();
    api.get('/extras/chat-equipe/equipe').then(d => setEquipe(Array.isArray(d) ? d : [])).catch(() => {});
    // Abriu = leu tudo. O botão apaga na hora.
    api.post('/extras/chat-equipe/li', {}).catch(() => {});
    return aoVivo(carregar, 6000);
  }, [carregar]);

  // Mensagem que chega pelo socket entra na hora, sem esperar o próximo ciclo
  useEffect(() => {
    const aoChegar = (e) => {
      const m = e.detail;
      if (!m?.id) return;
      setMsgs(p => (p.some(x => x.id === m.id) ? p : [...p, m]));
      api.post('/extras/chat-equipe/li', {}).catch(() => {});
    };
    const aoApagar = (e) => setMsgs(p => p.filter(x => x.id !== e.detail?.id));
    window.addEventListener('vh_chat_equipe', aoChegar);
    window.addEventListener('vh_chat_equipe_del', aoApagar);
    return () => {
      window.removeEventListener('vh_chat_equipe', aoChegar);
      window.removeEventListener('vh_chat_equipe_del', aoApagar);
    };
  }, [api]);

  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  const enviar = async () => {
    const t = txt.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      const d = await api.post('/extras/chat-equipe', { texto: t });
      if (d?.mensagem) setMsgs(p => (p.some(x => x.id === d.mensagem.id) ? p : [...p, d.mensagem]));
      setTxt('');
    } catch (e) { window.alert(e.message || 'Não consegui enviar'); }
    setEnviando(false);
    inputRef.current?.focus();
  };

  /* Sugestão de @ enquanto digita: a menção só funciona se o nome estiver
     escrito igual ao do cadastro, e ninguém decora isso. */
  const sugestoes = useMemo(() => {
    const m = txt.match(/@([\p{L}]*)$/u);
    if (!m) return [];
    const busca = m[1].toLowerCase();
    return equipe
      .filter(u => u.id !== user?.id && u.primeiro.toLowerCase().startsWith(busca))
      .slice(0, 5);
  }, [txt, equipe, user?.id]);

  const usarSugestao = (u) => {
    setTxt(t => t.replace(/@([\p{L}]*)$/u, `@${u.primeiro} `));
    inputRef.current?.focus();
  };

  let diaAnterior = null;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column',
      background: 'var(--card,#fff)',
    }}>
      {/* Cabeçalho */}
      <div style={{
        padding: '12px 14px', flexShrink: 0, color: '#fff',
        background: `linear-gradient(135deg, ${TURQ}, #0e7490)`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 20 }}>💬</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Chat da equipe</div>
          <div style={{ fontSize: 11, opacity: .85 }}>
            {equipe.length ? `${equipe.length} pessoas · use @nome para chamar alguém` : 'use @nome para chamar alguém'}
          </div>
        </div>
        <button onClick={onFechar} title="Fechar"
          style={{ border: 'none', background: 'rgba(255,255,255,.18)', color: '#fff', width: 30, height: 30,
            borderRadius: 9, cursor: 'pointer', fontSize: 15, fontWeight: 800, lineHeight: 1 }}>×</button>
      </div>

      {/* Mensagens */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', background: 'var(--bg2,#f6f9fb)' }}>
        {carregou && msgs.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, marginTop: 40, padding: '0 20px' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>👋</div>
            Ninguém escreveu ainda.<br />Manda a primeira — a equipe toda vê aqui.
          </div>
        )}
        {msgs.map(m => {
          const meu = m.autor_id === user?.id;
          const meChamou = !meu && (m.mencoes || []).includes(user?.id);
          const dia = rotuloDoDia(m.created_at);
          const mostraDia = dia !== diaAnterior;
          diaAnterior = dia;
          return (
            <React.Fragment key={m.id}>
              {mostraDia && (
                <div style={{ textAlign: 'center', margin: '10px 0 12px' }}>
                  <span style={{ background: 'var(--card,#fff)', border: '1px solid var(--border)', color: 'var(--muted)',
                    fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>{dia}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: meu ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                <div className="vh-chateq-bolha" style={{
                  maxWidth: '86%', padding: '8px 11px', borderRadius: 14,
                  borderBottomRightRadius: meu ? 4 : 14, borderBottomLeftRadius: meu ? 14 : 4,
                  background: meu ? TURQ : meChamou ? '#ecfdf5' : 'var(--card,#fff)',
                  color: meu ? '#fff' : 'var(--txt,#0f172a)',
                  border: meu ? 'none' : `1px solid ${meChamou ? '#86efac' : 'var(--border)'}`,
                  borderLeft: meChamou ? `3px solid ${VERDE}` : undefined,
                  boxShadow: '0 1px 3px rgba(15,23,42,.05)', position: 'relative',
                }}>
                  {!meu && (
                    <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 2, color: m.autor_cor || 'var(--tq2,#0891b2)' }}>
                      {primeiroNome(m.autor_nome)}
                      {meChamou && <span style={{ color: VERDE, marginLeft: 6 }}>chamou você</span>}
                    </div>
                  )}
                  <div style={{ fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    <TextoComMencoes texto={m.texto} meuPrimeiro={meuPrimeiro} />
                  </div>
                  <div style={{ fontSize: 10, opacity: .6, textAlign: 'right', marginTop: 3 }}>
                    {hhmm(m.created_at)}
                    {(meu || user?.role === 'master') && (
                      <button onClick={async () => {
                          if (!window.confirm('Apagar esta mensagem?')) return;
                          await api.del(`/extras/chat-equipe/${m.id}`).catch(() => {});
                          setMsgs(p => p.filter(x => x.id !== m.id));
                        }}
                        title="Apagar" style={{ border: 'none', background: 'transparent', cursor: 'pointer',
                          color: 'inherit', opacity: .8, marginLeft: 6, fontSize: 10, padding: 0 }}>🗑</button>
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={fimRef} />
      </div>

      {/* Escrever */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: 10, background: 'var(--card,#fff)', position: 'relative' }}>
        {sugestoes.length > 0 && (
          <div style={{ position: 'absolute', bottom: '100%', left: 10, right: 10, marginBottom: 6,
            background: 'var(--card,#fff)', border: '1px solid var(--border)', borderRadius: 12,
            boxShadow: '0 8px 24px rgba(15,23,42,.14)', overflow: 'hidden' }}>
            {sugestoes.map(u => (
              <button key={u.id} onClick={() => usarSugestao(u)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px',
                  border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: u.cor || TURQ, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900 }}>
                  {u.primeiro[0]?.toUpperCase()}
                </span>
                <b>{u.primeiro}</b>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>{u.nome}</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea ref={inputRef} value={txt} onChange={e => setTxt(e.target.value)} rows={1}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            placeholder="Escreva para a equipe…  (@nome chama alguém)"
            style={{ flex: 1, resize: 'none', maxHeight: 110, minHeight: 40, padding: '10px 12px',
              borderRadius: 12, border: '1px solid var(--border)', fontSize: 13.5, fontFamily: 'inherit',
              background: 'var(--bg2,#f8fafc)', color: 'var(--txt,#0f172a)', outline: 'none' }} />
          <button onClick={enviar} disabled={enviando || !txt.trim()}
            style={{ border: 'none', borderRadius: 12, padding: '0 16px', height: 40, cursor: 'pointer',
              background: txt.trim() ? `linear-gradient(135deg, ${TURQ}, #0891b2)` : 'var(--border)',
              color: '#fff', fontWeight: 800, fontSize: 13, opacity: enviando ? .6 : 1 }}>
            {enviando ? '…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
