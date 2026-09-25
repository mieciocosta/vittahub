import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aoVivo } from '../hooks/polling.js';
import { createPortal } from 'react-dom';

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
            color: ehMim ? '#fff' : 'var(--tq2,#0891b2)',
            background: ehMim ? '#16a34a' : 'transparent',
            borderRadius: 5, padding: ehMim ? '0 4px' : 0,
          }}>{p}</b>
        );
      })}
    </>
  );
}

/* Dois bipes curtos quando chamam pelo nome. Só no chamado: som em toda
   mensagem viraria barulho numa equipe de sete. O navegador só deixa tocar
   depois que a pessoa já clicou na página; se não deixar, fica só o visual. */
function tocarChamado() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.22].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch { /* sem som, segue o visual */ }
}

/* 🟦 CARTÃO DO MENU — o MESMO molde pros três atalhos do topo do menu
   (Pesquisa Geral, Pesquisa Conversas e Chat da equipe). Ordem do master,
   25/09: "que entendam a diferença de cada um e que possam ser iguais no
   sentido de layout, menos a cor e o título". Mesmo tamanho, ícone à
   esquerda, título e uma linha dizendo pra que serve; muda só cor e texto. */
export function CartaoMenu({ icone, titulo, sub, c1, c2, direita = null, onClick, pulso = false, title, children }) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} title={title}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onClick?.(); } }}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', minHeight: 60, borderRadius: 13,
        cursor: 'pointer', color: '#fff', textAlign: 'left', boxSizing: 'border-box',
        border: '1.5px solid rgba(255,255,255,.5)', background: `linear-gradient(135deg, ${c1}, ${c2})`,
        boxShadow: `0 4px 14px ${c2}66`, animation: pulso ? 'vhChamado 1.6s ease-out infinite' : 'none' }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,.22)', fontSize: 18 }}>{icone}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 900, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titulo}</span>
        {children || (
          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            fontSize: 11, fontWeight: 600, opacity: .95, marginTop: 2, lineHeight: 1.3 }}>{sub}</span>
        )}
      </span>
      {direita}
    </div>
  );
}

/* ─── O BOTÃO DA LATERAL ──────────────────────────────────────────────────── */
export function BotaoChatEquipe({ api, user, onAbrir, aberto, compacto = false, naBarra = false, comAviso: comAvisoProp, cartao = false }) {
  // Quem avisa (prévia e toque de chamada): a faixa do topo; o cartão do menu só mostra quem espera
  const comAviso = comAvisoProp ?? naBarra;
  const [st, setSt] = useState({ naoLidas: 0, chamado: false });
  /* 🔔 AVISO NA TELA (25/09, "deixa o chat da equipe em maior evidência"):
     quem está no Inbox, na Agenda ou em qualquer página vê a prévia de quem
     escreveu. Só o botão da FAIXA mostra o aviso (ela está em toda tela), pra
     não aparecer 3 avisos iguais quando o Inbox também tem botão. */
  const [aviso, setAviso] = useState(null);   // { autor, texto, chamado }
  const [tocando, setTocando] = useState(null); // 📞 { id, de } chamada na tela
  const ultimaChamadaRef = useRef(null);
  const ultimoIdRef = useRef(undefined);      // undefined = ainda não carregou (não avisa o que já estava lá)
  const avisar = useCallback((m) => {
    if (!comAviso || aberto || !m) return;
    setAviso({ autor: primeiroNome(m.autor_nome) || 'Equipe', texto: String(m.texto || ''), chamado: !!m.chamado });
    if (m.chamado) tocarChamado();
  }, [comAviso, aberto]);

  const puxar = useCallback(() => {
    if (aberto) { setSt({ naoLidas: 0, chamado: false }); return; }
    api.get('/extras/chat-equipe/status').then(r => {
      setSt(r);
      // 📞 Chamada nova pra mim: toca (só o botão que avisa, pra não tocar 3x)
      if (comAviso && r?.chamada?.id && r.chamada.id !== ultimaChamadaRef.current) {
        ultimaChamadaRef.current = r.chamada.id;
        setTocando({ id: r.chamada.id, de: primeiroNome(r.chamada.autor_nome) });
        tocarChamado(); setTimeout(tocarChamado, 900); setTimeout(tocarChamado, 1800);
      }
      const id = r?.ultima?.id || null;
      if (ultimoIdRef.current !== undefined && id && id !== ultimoIdRef.current) avisar(r.ultima);
      ultimoIdRef.current = id;
    }).catch(() => {});
  }, [api, aberto, avisar]);

  // O aviso some sozinho (chamado fica mais tempo) e some na hora se o chat abrir
  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), aviso.chamado ? 15000 : 8000);
    return () => clearTimeout(t);
  }, [aviso]);
  useEffect(() => { if (aberto) setAviso(null); }, [aberto]);

  useEffect(() => { puxar(); return aoVivo(puxar, 10000); }, [puxar]);

  /* A mensagem chega pelo socket do Inbox, que a repassa como evento da janela.
     Sem isso o botão só acenderia no próximo ciclo — até 20 s de atraso para
     alguém que foi chamada agora. */
  useEffect(() => {
    const aoChegar = (e) => {
      const m = e.detail || {};
      if (m.autor_id === user?.id) return;
      if (m.id) ultimoIdRef.current = m.id;   // o próximo ciclo não repete o mesmo aviso
      if (m.tipo === 'chamada' && comAviso && (m.mencoes || []).includes(user?.id) && m.id !== ultimaChamadaRef.current) {
        ultimaChamadaRef.current = m.id;
        setTocando({ id: m.id, de: primeiroNome(m.autor_nome) });
        tocarChamado(); setTimeout(tocarChamado, 900); setTimeout(tocarChamado, 1800);
      }
      avisar({ ...m, chamado: (m.mencoes || []).includes(user?.id) });
      setSt(p => ({
        naoLidas: (p.naoLidas || 0) + 1,
        chamado: p.chamado || (m.mencoes || []).includes(user?.id),
      }));
    };
    window.addEventListener('vh_chat_equipe', aoChegar);
    return () => window.removeEventListener('vh_chat_equipe', aoChegar);
  }, [user?.id, avisar, comAviso]);

  const chamado = st.chamado && !aberto;

  const pulso = (
    <style>{`@keyframes vhChamado {
      0%,100% { box-shadow: 0 0 0 0 rgba(22,163,74,.55); }
      50%     { box-shadow: 0 0 0 7px rgba(22,163,74,0); } }
    @keyframes vhAvisoEntra { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>
  );

  /* ── DENTRO DA CONVERSA (pedido do master: "que fique do lado de cada chat") ──
     Quem já entrou num atendimento não volta pra lista só pra ver o chat da
     equipe — ou o botão está aqui, ou ela não vê o chamado. Mesmo comportamento
     do botão da lateral (verde quando chamam), no tamanho da barra de ações
     para não roubar a cena do "Registrar venda". */
  /* ── NA FAIXA DO TOPO (ordem do master: "deixe o chat nessa barra de cima
     chamativo") ─────────────────────────────────────────────────────────────
     A faixa é roxa e disputada: metas, prêmio, ranking, registrar venda. Um
     botão discreto ali dentro simplesmente não é visto. Então ele ganha anel
     branco e brilho próprio — e continua ficando VERDE quando chamam, que é o
     único momento em que ele precisa gritar mais alto que o resto da faixa. */
  const telaChamada = tocando && comAviso ? createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 'min(360px, 100%)', borderRadius: 20, overflow: 'hidden', background: 'var(--card,#fff)', boxShadow: '0 20px 60px rgba(0,0,0,.35)', textAlign: 'center' }}>
        <div style={{ padding: '26px 20px 18px', color: '#fff', background: `linear-gradient(135deg, #22c55e, ${VERDE})` }}>
          <div style={{ fontSize: 44, animation: 'vhChamado 1.2s ease-out infinite', display: 'inline-block', borderRadius: '50%' }}>📞</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 8 }}>{tocando.de} está te chamando</div>
          <div style={{ fontSize: 12.5, opacity: .92, marginTop: 3 }}>no chat da equipe</div>
        </div>
        <div style={{ display: 'flex', gap: 10, padding: 16 }}>
          <button onClick={() => setTocando(null)}
            style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--txt,#0f172a)', fontWeight: 800, cursor: 'pointer' }}>Agora não</button>
          <button onClick={() => { setTocando(null); onAbrir?.(); }}
            style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: VERDE, color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Atender</button>
        </div>
      </div>
    </div>, document.body) : null;

  const avisoFlutuante = (
      <>
        {telaChamada}
        {/* Portal no body: a faixa tem overflow escondido e cortava o aviso */}
        {aviso && createPortal(
          <div role="status" onClick={() => { setAviso(null); onAbrir(); }}
            style={{
              position: 'fixed', right: 16, bottom: 16, zIndex: 9999, width: 'min(340px, calc(100vw - 32px))',
              cursor: 'pointer', borderRadius: 16, overflow: 'hidden', background: 'var(--card,#fff)', color: 'var(--txt,#0f172a)',
              border: `2px solid ${aviso.chamado ? VERDE : '#f97316'}`, boxShadow: '0 12px 34px rgba(15,23,42,.28)',
              animation: 'vhAvisoEntra .25s ease-out', whiteSpace: 'normal', textAlign: 'left',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', color: '#fff', fontSize: 11.5, fontWeight: 900,
              background: aviso.chamado ? `linear-gradient(90deg, ${VERDE}, #22c55e)` : 'linear-gradient(90deg,#ea580c,#fb923c)' }}>
              <span>{aviso.chamado ? '🔔 Te chamaram no chat da equipe' : '💬 Nova mensagem no chat da equipe'}</span>
              <button onClick={(e) => { e.stopPropagation(); setAviso(null); }} aria-label="Fechar aviso"
                style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#fff', fontSize: 15, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '10px 12px 12px' }}>
              <div style={{ fontWeight: 900, fontSize: 13.5, marginBottom: 3 }}>{aviso.autor}</div>
              <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--txt2,#334155)', display: '-webkit-box', WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>
                <TextoComMencoes texto={aviso.texto} meuPrimeiro={primeiroNome(user?.nome)} />
              </div>
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, color: aviso.chamado ? VERDE : '#c2410c' }}>Toque para responder →</div>
            </div>
          </div>, document.body
        )}
      </>
  );

  if (naBarra) {
    /* Três estados, do mais calmo ao mais alto (25/09, maior evidência):
       turquesa = nada novo · LARANJA com brilho = mensagem nova no chat ·
       VERDE pulsando = te chamaram (@nome). O botão também cresceu. */
    const novas = !aberto && st.naoLidas > 0;
    return (
      <>
        {pulso}
        <style>{`@keyframes vhNovaMsg {
          0%,100% { box-shadow: 0 0 0 0 rgba(249,115,22,.55); }
          50%     { box-shadow: 0 0 0 6px rgba(249,115,22,0); } }`}</style>
        <button onClick={onAbrir} title={chamado ? 'Te chamaram no chat da equipe!' : 'Chat da equipe: conversar com as meninas'}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 14,
            cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13.5, fontWeight: 900, color: '#fff',
            border: '2px solid rgba(255,255,255,.75)',
            background: chamado
              ? `linear-gradient(180deg, #22c55e, ${VERDE})`
              : aberto ? 'linear-gradient(180deg,#0f766e,#115e59)'
              : novas ? 'linear-gradient(180deg,#fb923c,#ea580c)' : `linear-gradient(180deg, #22d3ee, ${TURQ})`,
            boxShadow: chamado ? '0 3px 16px rgba(34,197,94,.65)' : novas ? '0 3px 16px rgba(249,115,22,.6)' : '0 3px 14px rgba(0,184,192,.55)',
            animation: chamado ? 'vhChamado 1.6s ease-out infinite' : novas ? 'vhNovaMsg 2.2s ease-out infinite' : 'none',
          }}>
          <span style={{ fontSize: 17, lineHeight: 1 }}>{chamado ? '🔔' : '💬'}</span>
          {chamado ? 'Te chamaram!' : novas ? 'Mensagem da equipe' : 'Chat da equipe'}
          {novas && (
            <span style={{ background: '#fff', color: chamado ? VERDE : '#c2410c', borderRadius: 10,
              padding: '1px 7px', fontSize: 11.5, fontWeight: 900 }}>
              {st.naoLidas > 99 ? '99+' : st.naoLidas}
            </span>
          )}
        </button>
        {avisoFlutuante}
      </>
    );
  }

  // 🟦 No topo do menu: o mesmo molde das duas pesquisas (25/09)
  if (cartao) {
    return (
      <>
        {pulso}
        <CartaoMenu onClick={onAbrir} pulso={chamado}
          icone={chamado ? '🔔' : '👥'}
          titulo={chamado ? 'Te chamaram no chat!' : 'Chat da equipe'}
          sub="Fala com a equipe; @nome chama alguém"
          c1={chamado ? '#22c55e' : '#06b6d4'} c2={chamado ? VERDE : '#0e7490'}
          title="Chat da equipe: conversa interna, a equipe toda vê"
          direita={!aberto && st.naoLidas > 0 ? (
            <span style={{ background: '#fff', color: chamado ? VERDE : '#0e7490', borderRadius: 10, padding: '1px 8px', fontSize: 11.5, fontWeight: 900, flexShrink: 0 }}>
              {st.naoLidas > 99 ? '99+' : st.naoLidas}
            </span>
          ) : null} />
        {/* 👀 QUEM ESTÁ ESPERANDO VOCÊ (ordem do master, 25/09: "sinalize as
            conversas em aberto, as pessoas que me chamaram em verde, pra lembrar
            de abrir e ter o hábito de usar"). Verde = te chamou pelo @nome. */}
        {!aberto && (st.quem || []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            {st.quem.map(q => (
              <button key={q.autor_id} onClick={onAbrir}
                title={q.chamou ? `${primeiroNome(q.autor_nome)} te chamou no chat da equipe` : `${primeiroNome(q.autor_nome)} escreveu no chat da equipe`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 9px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: q.chamou ? '1.5px solid #86efac' : '1px solid rgba(255,255,255,.25)',
                  background: q.chamou ? 'linear-gradient(135deg, #22c55e, #15803d)' : 'rgba(255,255,255,.12)', color: '#fff',
                  animation: q.chamou ? 'vhChamado 1.8s ease-out infinite' : 'none' }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: q.autor_cor || TURQ, border: '2px solid rgba(255,255,255,.8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900 }}>
                  {String(q.autor_nome || '?').trim()[0]?.toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {q.chamou ? `🔔 ${primeiroNome(q.autor_nome)} te chamou` : `💬 ${primeiroNome(q.autor_nome)} escreveu`}
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 900, background: 'rgba(255,255,255,.9)', color: q.chamou ? '#15803d' : '#0e7490', borderRadius: 8, padding: '0 6px' }}>{q.n}</span>
              </button>
            ))}
          </div>
        )}
        {telaChamada}
      </>
    );
  }

  if (compacto) {
    return (
      <>
        {pulso}
        {avisoFlutuante}
        <button onClick={onAbrir} title={chamado ? 'Te chamaram no chat da equipe!' : 'Chat da equipe'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
            padding: '6px 11px', borderRadius: 9, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap',
            color: '#fff', border: 'none',
            background: chamado ? `linear-gradient(135deg, ${VERDE}, #22c55e)`
              : aberto ? 'linear-gradient(135deg,#0f766e,#115e59)' : `linear-gradient(135deg, ${TURQ}, #0891b2)`,
            boxShadow: chamado ? '0 2px 10px rgba(22,163,74,.4)' : '0 2px 8px rgba(0,184,192,.3)',
            animation: chamado ? 'vhChamado 1.6s ease-out infinite' : 'none',
          }}>
          <span style={{ fontSize: 13, lineHeight: 1 }}>{chamado ? '🔔' : '💬'}</span>
          {chamado ? 'Te chamaram!' : 'Equipe'}
          {!aberto && st.naoLidas > 0 && (
            <span style={{ background: 'rgba(255,255,255,.95)', color: chamado ? VERDE : '#0e7490',
              borderRadius: 9, padding: '0 6px', fontSize: 10, fontWeight: 900 }}>
              {st.naoLidas > 99 ? '99+' : st.naoLidas}
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      {pulso}
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
/* 👥 PAINEL DO CHAT DA EQUIPE — versão 2 (25/09, ordem do master: "quero
   melhorar esse chat com a equipe, quero que apareça a lista e melhore tudo").
   · LISTA DA EQUIPE à esquerda: cor, setor e bolinha verde de quem está
     online agora (sinal de presença dos últimos 2 min). Um toque na pessoa
     já escreve o @nome dela, o jeito de chamar alguém.
   · Mensagens com a bolinha de quem escreveu; seguidas da mesma pessoa em
     poucos minutos ficam agrupadas (menos repetição de nome).
   · Busca dentro do chat da equipe.
   · Apagar e erro de envio sem window.confirm/alert: no celular (webview)
     essas janelas simplesmente não abrem.
   Em tela estreita (e dentro da coluna da lista) a equipe vira uma fileira
   de bolinhas embaixo do cabeçalho. */
const BASE_API = import.meta.env.VITE_API_URL || '';
const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
function Bolinha({ nome, cor, tam = 30, online = null }) {
  return (
    <span style={{ position: 'relative', flexShrink: 0, width: tam, height: tam }}>
      <span style={{ width: tam, height: tam, borderRadius: '50%', background: cor || TURQ, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(tam * .36), fontWeight: 900 }}>
        {iniciais(nome)}
      </span>
      {online !== null && (
        <span style={{ position: 'absolute', right: -1, bottom: -1, width: Math.max(9, tam * .3), height: Math.max(9, tam * .3), borderRadius: '50%',
          background: online ? '#22c55e' : '#94a3b8', border: '2px solid var(--card,#fff)' }} />
      )}
    </span>
  );
}
/* 🏷️ SELO DO SETOR (ordem do master, 25/09: "quero que diga qual é o setor de
   cada também"). Cor fixa por setor, a mesma em todo lugar do chat. */
const COR_SETOR = { Vacinas: '#3b82f6', Consultas: '#0d9488', Terapias: '#f59e0b', 'Direção': '#7c3aed' };
function SeloSetor({ nome }) {
  const cor = COR_SETOR[nome] || '#64748b';
  return (
    <span style={{ display: 'inline-block', fontSize: 9.5, fontWeight: 900, color: '#fff', background: cor,
      borderRadius: 6, padding: '1px 6px', letterSpacing: .2, whiteSpace: 'nowrap' }}>{nome}</span>
  );
}

/* 🎤📎 Mídia de uma mensagem, buscada só quando aparece (a lista não traz o
   arquivo; guarda na memória da tela pra não baixar de novo). */
const cacheMidia = new Map();
function MidiaEquipe({ api, m, meu }) {
  const [d, setD] = useState(cacheMidia.get(m.id) || null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    if (d || !m.tem_midia) return;
    api.get(`/extras/chat-equipe/${m.id}/midia`)
      .then(r => { cacheMidia.set(m.id, r); setD(r); })
      .catch(() => setErro(true));
  }, [m.id]); // eslint-disable-line
  if (erro) return <div style={{ fontSize: 12, opacity: .8 }}>⚠️ Arquivo indisponível</div>;
  if (!d) return <div style={{ fontSize: 12, opacity: .75 }}>{m.tipo === 'audio' ? '🎤 carregando áudio…' : '📎 carregando…'}</div>;
  if (m.tipo === 'audio') return <audio controls src={d.midia} style={{ width: 240, maxWidth: '100%', height: 38 }} />;
  if (m.tipo === 'imagem') return (
    <a href={d.midia} target="_blank" rel="noreferrer" title="Abrir a foto">
      <img src={d.midia} alt={m.nome_arquivo || 'foto'} style={{ display: 'block', maxWidth: 260, maxHeight: 260, borderRadius: 10 }} />
    </a>
  );
  return (
    <a href={d.midia} download={m.nome_arquivo || 'arquivo'} title="Baixar o arquivo"
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, textDecoration: 'none',
        background: meu ? 'rgba(255,255,255,.18)' : 'var(--bg2,#f1f5f9)', color: 'inherit' }}>
      <span style={{ fontSize: 22 }}>📄</span>
      <span style={{ fontSize: 12.5, fontWeight: 800, wordBreak: 'break-all' }}>{m.nome_arquivo || 'arquivo'}</span>
      <span style={{ fontSize: 11, opacity: .8, marginLeft: 'auto', whiteSpace: 'nowrap' }}>⬇ baixar</span>
    </a>
  );
}

const EMOJIS = ['😀','😂','😊','😍','🥰','😘','😉','😎','🤩','🥳','😅','🙏','👏','🙌','👍','👌','💪','🤝','❤️','💙','💚','💛','💜','🔥','✨','⭐','🎉','🎂','🎁','🌷','☕','🍰','✅','❌','⚠️','📌','📞','💉','🩺','🧸','👶','💬','⏰','📅','🚗','🏥','😢','😮','🤔','🙄'];

const vistoHa = (d) => {
  if (!d) return 'sem acesso recente';
  const min = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 60) return `visto há ${Math.max(1, min)} min`;
  if (min < 1440) return `visto há ${Math.floor(min / 60)}h`;
  return `visto há ${Math.floor(min / 1440)} dia(s)`;
};

export function PainelChatEquipe({ api, user, onFechar, modo = 'lateral' }) {
  const [msgs, setMsgs] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [txt, setTxt] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');
  const [carregou, setCarregou] = useState(false);
  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [apagarId, setApagarId] = useState(null);
  const [largura, setLargura] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [ferramenta, setFerramenta] = useState(null);   // null | 'emoji' | 'figurinha' | 'chamar'
  const [figs, setFigs] = useState(null);
  const [gravando, setGravando] = useState(null);       // { mr, inicio } enquanto grava
  const [segundos, setSegundos] = useState(0);
  const arquivoRef = useRef(null);
  const fimRef = useRef(null);
  const inputRef = useRef(null);
  const meuPrimeiro = primeiroNome(user?.nome);

  const carregar = useCallback(() => {
    api.get('/extras/chat-equipe')
      .then(d => { setMsgs(Array.isArray(d?.data) ? d.data : []); setCarregou(true); })
      .catch(() => setCarregou(true));
  }, [api]);
  const carregarEquipe = useCallback(() => {
    api.get('/extras/chat-equipe/equipe').then(d => setEquipe(Array.isArray(d) ? d : [])).catch(() => {});
  }, [api]);

  useEffect(() => {
    carregar(); carregarEquipe();
    // Abriu = leu tudo. O botão apaga na hora.
    api.post('/extras/chat-equipe/li', {}).catch(() => {});
    const paraMsgs = aoVivo(carregar, 6000);
    const paraEquipe = aoVivo(carregarEquipe, 30000);   // quem está online muda devagar
    return () => { paraMsgs?.(); paraEquipe?.(); };
  }, [carregar, carregarEquipe]); // eslint-disable-line

  useEffect(() => {
    const medir = () => setLargura(window.innerWidth);
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

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

  useEffect(() => { if (!busca) fimRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, busca]);

  const enviar = async () => {
    const t = txt.trim();
    if (!t || enviando) return;
    setEnviando(true); setErroEnvio('');
    try {
      const d = await api.post('/extras/chat-equipe', { texto: t });
      if (d?.mensagem) setMsgs(p => (p.some(x => x.id === d.mensagem.id) ? p : [...p, d.mensagem]));
      setTxt('');
    } catch (e) { setErroEnvio(e.message || 'Não consegui enviar. Tente de novo.'); }
    setEnviando(false);
    inputRef.current?.focus();
  };

  const enviarEspecial = async (corpo) => {
    setEnviando(true); setErroEnvio('');
    try {
      const d = await api.post('/extras/chat-equipe', corpo);
      if (d?.mensagem) setMsgs(p => (p.some(x => x.id === d.mensagem.id) ? p : [...p, d.mensagem]));
      setFerramenta(null);
    } catch (e) { setErroEnvio(e.message || 'Não consegui enviar. Tente de novo.'); }
    setEnviando(false);
  };
  // 📎 Anexo: foto vira foto na conversa; o resto vira arquivo pra baixar
  const escolherArquivo = (ev) => {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) { setErroEnvio('Arquivo grande demais (até 12 MB).'); return; }
    const rd = new FileReader();
    rd.onload = () => enviarEspecial({ tipo: /^image\//.test(f.type) ? 'imagem' : 'arquivo', midia: rd.result, nome_arquivo: f.name, texto: txt.trim() || undefined });
    rd.onerror = () => setErroEnvio('Não consegui ler o arquivo.');
    rd.readAsDataURL(f);
  };
  // 🎤 Áudio: toca pra gravar, toca de novo pra enviar (ou ✕ pra descartar)
  const gravar = async () => {
    if (gravando) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setErroEnvio('Este navegador não grava áudio. Use o Chrome.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const cand = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      const mime = cand.find(t => MediaRecorder.isTypeSupported?.(t)) || '';
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const pedacos = [];
      mr.ondataavailable = e => { if (e.data?.size) pedacos.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (mr.__descartar) return;
        const blob = new Blob(pedacos, { type: (mr.mimeType || 'audio/webm').split(';')[0] });
        if (blob.size < 1500) { setErroEnvio('Áudio curto demais.'); return; }
        const rd = new FileReader();
        rd.onload = () => enviarEspecial({ tipo: 'audio', midia: rd.result, nome_arquivo: 'audio' });
        rd.readAsDataURL(blob);
      };
      mr.start(250);
      setGravando({ mr, inicio: Date.now() }); setSegundos(0); setErroEnvio('');
    } catch (e) {
      setErroEnvio(e?.name === 'NotAllowedError' ? 'Microfone bloqueado: permita o microfone no cadeado ao lado do endereço.' : 'Não consegui usar o microfone.');
    }
  };
  const pararGravacao = (descartar = false) => {
    if (!gravando) return;
    gravando.mr.__descartar = descartar;
    try { gravando.mr.stop(); } catch { /* já parou */ }
    setGravando(null);
  };
  useEffect(() => {
    if (!gravando) return undefined;
    const t = setInterval(() => setSegundos(Math.floor((Date.now() - gravando.inicio) / 1000)), 500);
    return () => clearInterval(t);
  }, [gravando]);
  // 💟 Figurinhas: as mesmas da Vittalis que vão pros clientes
  useEffect(() => {
    if (ferramenta !== 'figurinha' || figs) return;
    api.get('/extras/biblioteca?tipo=figurinha&limite=200')
      .then(d => setFigs(Array.isArray(d) ? d : (d?.itens || [])))
      .catch(() => setFigs([]));
  }, [ferramenta]); // eslint-disable-line
  // 🔔 Chamar: toca na tela da pessoa pra ela abrir o chat
  const ligarPara = (u) => { if (u?.id && u.id !== user?.id) enviarEspecial({ tipo: 'chamada', para_id: u.id }); };
  // 📞 Ligação de voz: quem cuida é o LigacaoEquipe (App), em qualquer página
  const ligarVoz = (u) => {
    if (!u?.id || u.id === user?.id) return;
    setFerramenta(null);
    window.dispatchEvent(new CustomEvent('vh-ligar-voz', { detail: { para_id: u.id, nome: u.nome } }));
  };

  const apagar = async (id) => {
    await api.delete(`/extras/chat-equipe/${id}`).catch(() => {});
    setMsgs(p => p.filter(x => x.id !== id));
    setApagarId(null);
  };

  /* Sugestão de @ enquanto digita: a menção só funciona se o nome estiver
     escrito igual ao do cadastro, e ninguém decora isso. */
  const sugestoes = useMemo(() => {
    const m = txt.match(/@([\p{L}]*)$/u);
    if (!m) return [];
    const b = m[1].toLowerCase();
    return equipe.filter(u => u.id !== user?.id && u.primeiro.toLowerCase().startsWith(b)).slice(0, 5);
  }, [txt, equipe, user?.id]);
  const usarSugestao = (u) => {
    setTxt(t => t.replace(/@([\p{L}]*)$/u, `@${u.primeiro} `));
    inputRef.current?.focus();
  };
  // Tocar numa pessoa da lista = chamar ela pelo @nome
  const chamar = (u) => {
    if (u.id === user?.id) return;
    setTxt(t => `${t && !/\s$/.test(t) ? `${t} ` : t}@${u.primeiro} `);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const equipeOrdenada = useMemo(() => [...equipe].sort((a, b) =>
    (b.online === true) - (a.online === true) || String(a.nome).localeCompare(String(b.nome))), [equipe]);
  const nOnline = equipe.filter(u => u.online).length;
  const corDe = useMemo(() => Object.fromEntries(equipe.map(u => [u.id, u.cor])), [equipe]);
  const setoresDe = useMemo(() => Object.fromEntries(equipe.map(u => [u.id, u.setores || []])), [equipe]);

  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? msgs.filter(m => `${m.texto || ''} ${m.autor_nome || ''}`.toLowerCase().includes(termo))
    : msgs;

  /* Aberto pela LISTA, ocupa a coluna da lista (a pessoa ainda não escolheu
     conversa). Aberto DE DENTRO de um atendimento ou da faixa, vira gaveta à
     direita, agora larga o bastante pra lista da equipe caber ao lado. */
  const gaveta = modo === 'gaveta';
  const comLista = gaveta && largura >= 760;
  const caixa = gaveta
    ? { position: 'fixed', top: 0, right: 0, bottom: 0, width: comLista ? 'min(780px, 100vw)' : 'min(440px, 100vw)', zIndex: 1200,
        boxShadow: '-14px 0 40px rgba(15,23,42,.22)', borderLeft: '1px solid var(--border)' }
    : { position: 'absolute', inset: 0, zIndex: 40 };

  let diaAnterior = null;
  let anterior = null;

  /* A gaveta vai por PORTAL no body (25/09, print do master: "não mostra o
     início, a barra de cima está cortada"). Ela nascia dentro da faixa do
     topo, que é sticky com z-index 90: o z 1200 dela só valia lá dentro, e a
     barra do "Ver como" (fora da faixa) cobria o cabeçalho do chat. */
  const conteudo = (
    <>
      {gaveta && <div onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 1199, background: 'rgba(15,23,42,.35)' }} />}
    <div style={{ ...caixa, display: 'flex', flexDirection: 'column', background: 'var(--card,#fff)' }}>
      {/* Cabeçalho */}
      <div style={{ padding: '12px 14px', flexShrink: 0, color: '#fff', background: `linear-gradient(135deg, ${TURQ}, #0e7490)`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>💬</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Chat da equipe</div>
          <div style={{ fontSize: 11.5, opacity: .9 }}>
            {equipe.length ? `${equipe.length} pessoas · ` : ''}
            <span style={{ fontWeight: 800 }}>🟢 {nOnline} online agora</span>
            {' · toque no nome pra chamar'}
          </div>
        </div>
        <button onClick={() => { setBuscando(v => !v); if (buscando) setBusca(''); }} title="Procurar no chat da equipe"
          style={{ border: 'none', background: buscando ? '#fff' : 'rgba(255,255,255,.18)', color: buscando ? '#0e7490' : '#fff',
            width: 32, height: 32, borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>🔍</button>
        <button onClick={onFechar} title="Fechar"
          style={{ border: 'none', background: 'rgba(255,255,255,.18)', color: '#fff', width: 32, height: 32,
            borderRadius: 9, cursor: 'pointer', fontSize: 16, fontWeight: 800, lineHeight: 1 }}>×</button>
      </div>
      {buscando && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--card,#fff)', flexShrink: 0 }}>
          <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Procurar mensagem ou pessoa…"
            style={{ width: '100%', padding: '8px 11px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13,
              background: 'var(--bg2,#f8fafc)', color: 'var(--txt,#0f172a)', outline: 'none' }} />
          {termo && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>{visiveis.length} mensagem(ns) encontrada(s)</div>}
        </div>
      )}
      {/* Equipe em fileira (tela estreita ou dentro da coluna da lista) */}
      {!comLista && equipe.length > 0 && (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '10px 12px', borderBottom: '1px solid var(--border)',
          background: 'var(--card,#fff)', flexShrink: 0 }}>
          {equipeOrdenada.filter(u => u.id !== user?.id).map(u => (
            <button key={u.id} onClick={() => chamar(u)} title={`${u.nome}${u.papel ? ` · ${u.papel}` : ''} · ${u.online ? 'online' : vistoHa(u.visto_em)}. Toque pra chamar`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, border: 'none', background: 'transparent',
                cursor: 'pointer', padding: 0, minWidth: 46 }}>
              <Bolinha nome={u.nome} cor={u.cor} tam={34} online={!!u.online} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--txt2)', maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.primeiro}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* 👥 A LISTA DA EQUIPE (coluna da esquerda) */}
        {comLista && (
          <div style={{ width: 230, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--card,#fff)' }}>
            <div style={{ padding: '12px 14px 6px', fontSize: 10.5, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)' }}>
              Equipe · {nOnline} online
            </div>
            {equipeOrdenada.map(u => {
              const eu = u.id === user?.id;
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center' }}>
                <button onClick={() => chamar(u)} disabled={eu}
                  title={eu ? 'Você' : `Chamar ${u.primeiro} (escreve @${u.primeiro})`}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', border: 'none',
                    background: 'transparent', cursor: eu ? 'default' : 'pointer', textAlign: 'left', opacity: u.online || eu ? 1 : .72 }}
                  onMouseEnter={e => { if (!eu) e.currentTarget.style.background = 'var(--bg2,#f1f5f9)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  <Bolinha nome={u.nome} cor={u.cor} tam={34} online={!!u.online} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--txt,#0f172a)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.primeiro}{eu ? ' (você)' : ''}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: u.online ? '#16a34a' : 'var(--muted)', fontWeight: u.online ? 800 : 500,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.online ? 'online agora' : vistoHa(u.visto_em)}
                    </span>
                    {(u.setores || []).length > 0 && (
                      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                        {u.setores.map(st => <SeloSetor key={st} nome={st} />)}
                      </span>
                    )}
                  </span>
                </button>
                {!eu && (
                  <span style={{ display: 'flex', gap: 4, marginRight: 8, flexShrink: 0 }}>
                    <button onClick={() => ligarPara(u)} title={`🔔 Chamar ${u.primeiro}: toca na tela dela pra abrir o chat`}
                      style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card,#fff)', cursor: 'pointer', fontSize: 13 }}>🔔</button>
                    <button onClick={() => ligarVoz(u)} title={`📞 Ligar pra ${u.primeiro} (ligação de voz)`}
                      style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #86efac', background: 'rgba(34,197,94,.12)', cursor: 'pointer', fontSize: 13 }}>📞</button>
                  </span>
                )}
                </div>
              );
            })}
          </div>
        )}

        {/* Mensagens */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', background: 'var(--bg2,#f6f9fb)' }}>
            {carregou && msgs.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, marginTop: 40, padding: '0 20px' }}>
                <div style={{ fontSize: 34, marginBottom: 8 }}>👋</div>
                Ninguém escreveu ainda.<br />Manda a primeira, a equipe toda vê aqui.
              </div>
            )}
            {termo && visiveis.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, marginTop: 30 }}>Nada encontrado com “{busca.trim()}”.</div>
            )}
            {visiveis.map(m => {
              const meu = m.autor_id === user?.id;
              const meChamou = !meu && (m.mencoes || []).includes(user?.id);
              const dia = rotuloDoDia(m.created_at);
              const mostraDia = dia !== diaAnterior;
              diaAnterior = dia;
              // Seguida da mesma pessoa em até 5 min: sem repetir nome e bolinha
              const agrupada = !mostraDia && anterior && anterior.autor_id === m.autor_id
                && new Date(m.created_at) - new Date(anterior.created_at) < 5 * 60 * 1000;
              anterior = m;
              const cor = m.autor_cor || corDe[m.autor_id] || TURQ;
              return (
                <React.Fragment key={m.id}>
                  {mostraDia && (
                    <div style={{ textAlign: 'center', margin: '10px 0 12px' }}>
                      <span style={{ background: 'var(--card,#fff)', border: '1px solid var(--border)', color: 'var(--muted)',
                        fontSize: 10.5, fontWeight: 800, padding: '3px 12px', borderRadius: 20 }}>{dia}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: meu ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8,
                    marginTop: agrupada ? 2 : 10 }}>
                    {!meu && (agrupada ? <span style={{ width: 30, flexShrink: 0 }} /> : <Bolinha nome={m.autor_nome} cor={cor} tam={30} />)}
                    <div className="vh-chateq-bolha" style={{
                      maxWidth: '78%', padding: '8px 12px', borderRadius: 16,
                      borderBottomRightRadius: meu ? 5 : 16, borderBottomLeftRadius: meu ? 16 : 5,
                      /* Verde TRANSLÚCIDO no "chamou você" (25/09, print do master no
                         modo escuro): o verde-claro fixo com a letra clara do tema
                         escuro deixava a mensagem ilegível. Translúcido serve pros dois. */
                      background: meu ? `linear-gradient(135deg, ${TURQ}, #0891b2)` : meChamou ? 'rgba(34,197,94,.14)' : 'var(--card,#fff)',
                      color: meu ? '#fff' : 'var(--txt,#0f172a)',
                      border: meu ? 'none' : `1px solid ${meChamou ? 'rgba(34,197,94,.55)' : 'var(--border)'}`,
                      borderLeft: meChamou ? `4px solid ${VERDE}` : undefined,
                      boxShadow: '0 1px 4px rgba(15,23,42,.07)',
                    }}>
                      {!meu && (!agrupada || meChamou) && (
                        <div style={{ fontSize: 11.5, fontWeight: 900, marginBottom: 2, color: cor }}>
                          {agrupada ? '' : primeiroNome(m.autor_nome)}
                          {!agrupada && (setoresDe[m.autor_id] || []).map(st => <span key={st} style={{ marginLeft: 5 }}><SeloSetor nome={st} /></span>)}
                          {meChamou && <span style={{ color: '#fff', background: VERDE, borderRadius: 8, padding: '0 6px', marginLeft: 6, fontSize: 10 }}>chamou você</span>}
                        </div>
                      )}
                      {m.tipo === 'figurinha' && m.figurinha_id && (
                        <img src={`${BASE_API}/api/publico/figurinha/${m.figurinha_id}`} alt="figurinha" style={{ display: 'block', width: 120, height: 120, objectFit: 'contain' }} />
                      )}
                      {['audio', 'imagem', 'arquivo'].includes(m.tipo) && <MidiaEquipe api={api} m={m} meu={meu} />}
                      {m.texto && (
                        <div style={{ fontSize: m.tipo === 'chamada' ? 13 : 13.5, fontWeight: m.tipo === 'chamada' ? 800 : 400, lineHeight: 1.5,
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: ['audio', 'imagem', 'arquivo'].includes(m.tipo) ? 5 : 0 }}>
                          <TextoComMencoes texto={m.texto} meuPrimeiro={meuPrimeiro} />
                        </div>
                      )}
                      <div style={{ fontSize: 10, opacity: .65, textAlign: 'right', marginTop: 3, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                        {hhmm(m.created_at)}
                        {(meu || user?.role === 'master') && (apagarId === m.id ? (
                          <>
                            <button onClick={() => apagar(m.id)} style={{ border: 'none', borderRadius: 6, background: '#dc2626', color: '#fff',
                              cursor: 'pointer', fontSize: 10, fontWeight: 800, padding: '1px 7px' }}>Apagar</button>
                            <button onClick={() => setApagarId(null)} style={{ border: 'none', background: 'transparent', color: 'inherit',
                              cursor: 'pointer', fontSize: 10, fontWeight: 700, padding: 0 }}>não</button>
                          </>
                        ) : (
                          <button onClick={() => setApagarId(m.id)} title="Apagar" style={{ border: 'none', background: 'transparent',
                            cursor: 'pointer', color: 'inherit', opacity: .8, fontSize: 10, padding: 0 }}>🗑</button>
                        ))}
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
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px',
                      border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--txt,#0f172a)' }}>
                    <Bolinha nome={u.nome} cor={u.cor} tam={24} online={!!u.online} />
                    <b>{u.primeiro}</b>
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>{u.online ? 'online' : u.nome}</span>
                  </button>
                ))}
              </div>
            )}
            {erroEnvio && <div style={{ fontSize: 11.5, color: '#dc2626', fontWeight: 700, marginBottom: 6 }}>⚠️ {erroEnvio}</div>}
            {/* 😊 Emojis */}
            {ferramenta === 'emoji' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2, marginBottom: 8, padding: 6,
                border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg2,#f8fafc)' }}>
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => { setTxt(t => t + e); inputRef.current?.focus(); }}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, padding: 3, borderRadius: 8 }}>{e}</button>
                ))}
              </div>
            )}
            {/* 💟 Figurinhas */}
            {ferramenta === 'figurinha' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6, marginBottom: 8, padding: 6,
                maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg2,#f8fafc)' }}>
                {figs === null && <div style={{ gridColumn: '1/-1', fontSize: 12, color: 'var(--muted)', padding: 8 }}>Carregando figurinhas…</div>}
                {figs && figs.length === 0 && <div style={{ gridColumn: '1/-1', fontSize: 12, color: 'var(--muted)', padding: 8 }}>Nenhuma figurinha cadastrada.</div>}
                {(figs || []).map(f => (
                  <button key={f.id} onClick={() => enviarEspecial({ tipo: 'figurinha', figurinha_id: f.id })} title={f.titulo}
                    style={{ height: 72, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card,#fff)', cursor: 'pointer', padding: 3 }}>
                    <img src={`${BASE_API}/api/publico/figurinha/${f.id}`} alt={f.titulo} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </button>
                ))}
              </div>
            )}
            {/* 📞 Chamar alguém */}
            {(ferramenta === 'chamar' || ferramenta === 'ligar') && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, padding: 8, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg2,#f8fafc)' }}>
                <div style={{ width: '100%', fontSize: 11.5, fontWeight: 800, color: 'var(--muted)' }}>
                  {ferramenta === 'ligar' ? '📞 Pra quem você quer ligar? (ligação de voz, precisa do microfone)' : '🔔 Quem você quer chamar? Toca na tela da pessoa.'}
                </div>
                {equipeOrdenada.filter(u => u.id !== user?.id).map(u => (
                  <button key={u.id} onClick={() => (ferramenta === 'ligar' ? ligarVoz(u) : ligarPara(u))}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 20, padding: '4px 10px 4px 4px',
                      background: 'var(--card,#fff)', cursor: 'pointer', fontSize: 12, fontWeight: 800, color: 'var(--txt,#0f172a)' }}>
                    <Bolinha nome={u.nome} cor={u.cor} tam={22} online={!!u.online} /> {u.primeiro}
                  </button>
                ))}
              </div>
            )}
            {/* Barra de ferramentas */}
            <input ref={arquivoRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={escolherArquivo} style={{ display: 'none' }} />
            {gravando ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '8px 12px', borderRadius: 12,
                background: 'rgba(220,38,38,.1)', border: '1px solid rgba(220,38,38,.4)' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc2626', animation: 'vhChamado 1.2s ease-out infinite' }} />
                <b style={{ fontSize: 13, color: '#dc2626' }}>Gravando {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}</b>
                <span style={{ flex: 1 }} />
                <button onClick={() => pararGravacao(true)} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '5px 10px', background: 'var(--card,#fff)', cursor: 'pointer', fontSize: 12, fontWeight: 800, color: 'var(--txt,#0f172a)' }}>✕ Descartar</button>
                <button onClick={() => pararGravacao(false)} style={{ border: 'none', borderRadius: 9, padding: '6px 12px', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 900 }}>➤ Enviar áudio</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {[['emoji', '😊', 'Emojis'], ['figurinha', '💟', 'Figurinhas'], ['anexo', '📎', 'Anexar foto ou arquivo'], ['audio', '🎤', 'Gravar áudio'], ['chamar', '🔔', 'Chamar alguém (toca na tela da pessoa)'], ['ligar', '📞', 'Ligar (ligação de voz)']].map(([k, ic, t]) => (
                  <button key={k} title={t}
                    onClick={() => {
                      if (k === 'anexo') { arquivoRef.current?.click(); return; }
                      if (k === 'audio') { setFerramenta(null); gravar(); return; }
                      setFerramenta(f => (f === k ? null : k));
                    }}
                    style={{ width: 38, height: 34, borderRadius: 10, cursor: 'pointer', fontSize: 17,
                      border: `1.5px solid ${ferramenta === k ? TURQ : 'var(--border)'}`,
                      background: ferramenta === k ? 'rgba(0,184,192,.14)' : 'var(--card,#fff)' }}>{ic}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea ref={inputRef} value={txt} onChange={e => setTxt(e.target.value)} rows={1}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                placeholder="Escreva para a equipe…  (@nome chama alguém)"
                style={{ flex: 1, resize: 'none', maxHeight: 120, minHeight: 42, padding: '11px 12px',
                  borderRadius: 12, border: '1.5px solid var(--border)', fontSize: 13.5, fontFamily: 'inherit',
                  background: 'var(--bg2,#f8fafc)', color: 'var(--txt,#0f172a)', outline: 'none' }} />
              <button onClick={enviar} disabled={enviando || !txt.trim()}
                style={{ border: 'none', borderRadius: 12, padding: '0 18px', height: 42, cursor: 'pointer',
                  background: txt.trim() ? `linear-gradient(135deg, ${TURQ}, #0891b2)` : 'var(--border)',
                  color: '#fff', fontWeight: 900, fontSize: 13.5, opacity: enviando ? .6 : 1 }}>
                {enviando ? '…' : 'Enviar ➤'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
  return gaveta ? createPortal(conteudo, document.body) : conteudo;
}
