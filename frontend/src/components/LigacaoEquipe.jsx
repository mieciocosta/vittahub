import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api as apiFixo } from '../hooks/api.js';   // objeto estável: as rotinas de escuta não se refazem a cada tela

/* 🎙️ LIGAÇÃO DE VOZ DA EQUIPE (25/09, ordem do master: "faça tudo o que
   pedi": a ligação de verdade no chat da equipe, além do "chamar").

   Como funciona: os dois navegadores falam DIRETO (WebRTC). O servidor só
   entrega o convite (oferta) e a resposta (routes/extras.js, /chat-equipe/voz).
   Sem servidor de áudio no meio: funciona muito bem dentro da clínica e na
   maioria das redes; em algumas redes de celular (4G com NAT fechado) pode não
   conectar, e a tela diz isso em vez de ficar muda.

   Este gerente fica montado UMA vez no App (qualquer página): pergunta a cada
   5 s se tem alguém ligando, ouve o evento do socket (Inbox) e o pedido de
   ligar que vem do chat da equipe (evento 'vh-ligar-voz'). */

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const esperaIce = (pc) => new Promise((ok) => {
  if (pc.iceGatheringState === 'complete') return ok();
  const t = setTimeout(ok, 3500);   // não espera pra sempre: manda o que já achou
  pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); ok(); } });
});
const primeiro = (n) => String(n || '').trim().split(/\s+/)[0] || 'Equipe';

// Toque do telefone (Web Audio, sem arquivo). Toca enquanto a tela de ligação estiver aberta.
function tocarTom(freq = 440, dur = 0.35) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur + 0.05);
    setTimeout(() => ctx.close().catch(() => {}), (dur + 0.3) * 1000);
  } catch { /* sem som, segue a tela */ }
}

export default function LigacaoEquipe({ user }) {
  const api = apiFixo;
  // estado: null | { fase: 'recebendo'|'chamando'|'conectando'|'falando'|'fim', id, nome, inicio, msg }
  const [lig, setLig] = useState(null);
  const [mudo, setMudo] = useState(false);
  const [seg, setSeg] = useState(0);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const audioRef = useRef(null);
  const pollRef = useRef(null);
  const ligRef = useRef(null);
  useEffect(() => { ligRef.current = lig; }, [lig]);

  const limpar = useCallback(() => {
    clearInterval(pollRef.current); pollRef.current = null;
    try { pcRef.current?.close(); } catch { /* já fechou */ }
    pcRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setMudo(false);
  }, []);

  const terminar = useCallback((msg, motivo = 'encerrada') => {
    const atual = ligRef.current;
    if (atual?.id && motivo) api.post(`/extras/chat-equipe/voz/${atual.id}/encerrar`, { motivo }).catch(() => {});
    limpar();
    setLig(atual ? { ...atual, fase: 'fim', msg } : null);
    setTimeout(() => setLig(l => (l?.fase === 'fim' ? null : l)), 2600);
  }, [api, limpar]);

  const montarPc = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const pc = new window.RTCPeerConnection({ iceServers: ICE });
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.ontrack = (e) => { if (audioRef.current) { audioRef.current.srcObject = e.streams[0]; audioRef.current.play?.().catch(() => {}); } };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setLig(l => (l ? { ...l, fase: 'falando', inicio: l.inicio || Date.now() } : l));
      if (pc.connectionState === 'failed') terminar('Não deu pra conectar a ligação (rede). Tente de novo ou use o chat.', 'encerrada');
    };
    pcRef.current = pc;
    return pc;
  };

  // ── LIGAR pra alguém (pedido que vem do chat da equipe)
  const ligar = useCallback(async ({ para_id, nome }) => {
    if (ligRef.current && ligRef.current.fase !== 'fim') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof window.RTCPeerConnection === 'undefined') {
      setLig({ fase: 'fim', nome, msg: 'Este navegador não faz ligação. Use o Chrome.' });
      return;
    }
    setLig({ fase: 'chamando', nome, msg: 'Preparando o microfone…' });
    try {
      const pc = await montarPc();
      const oferta = await pc.createOffer();
      await pc.setLocalDescription(oferta);
      await esperaIce(pc);
      const r = await api.post('/extras/chat-equipe/voz', { para_id, oferta: pc.localDescription });
      setLig({ fase: 'chamando', id: r.id, nome, msg: 'Chamando…' });
      const inicio = Date.now();
      pollRef.current = setInterval(async () => {
        const d = await api.get(`/extras/chat-equipe/voz/${r.id}`).catch(() => null);
        if (!d) return;
        if (d.status === 'atendida' && d.resposta && pcRef.current && !pcRef.current.remoteDescription) {
          await pcRef.current.setRemoteDescription(d.resposta).catch(() => {});
          setLig(l => (l ? { ...l, fase: 'conectando', msg: 'Conectando…' } : l));
        } else if (['recusada', 'perdida'].includes(d.status)) {
          terminar(d.status === 'recusada' ? `${primeiro(nome)} não pôde atender agora.` : 'Ninguém atendeu.', null);
        } else if (d.status === 'encerrada') {
          terminar('Ligação encerrada.', null);
        } else if (d.status === 'chamando' && Date.now() - inicio > 40000) {
          terminar('Ninguém atendeu.', 'perdida');
        }
      }, 1200);
    } catch (e) {
      terminar(e?.name === 'NotAllowedError' ? 'Microfone bloqueado: permita o microfone no cadeado ao lado do endereço.' : (e.message || 'Não consegui ligar.'), null);
    }
  }, [api, terminar]); // eslint-disable-line

  // ── ATENDER quem está ligando
  const atender = async () => {
    const atual = ligRef.current;
    if (!atual?.id) return;
    setLig({ ...atual, fase: 'conectando', msg: 'Conectando…' });
    try {
      const d = await api.get(`/extras/chat-equipe/voz/${atual.id}`);
      if (!d?.oferta || d.status !== 'chamando') { terminar('Essa ligação já terminou.', null); return; }
      const pc = await montarPc();
      await pc.setRemoteDescription(d.oferta);
      const resp = await pc.createAnswer();
      await pc.setLocalDescription(resp);
      await esperaIce(pc);
      await api.post(`/extras/chat-equipe/voz/${atual.id}/responder`, { resposta: pc.localDescription });
      // Quem atende também fica de olho se o outro lado desligou
      pollRef.current = setInterval(async () => {
        const s = await api.get(`/extras/chat-equipe/voz/${atual.id}`).catch(() => null);
        if (s && ['encerrada', 'perdida', 'recusada'].includes(s.status)) terminar('Ligação encerrada.', null);
      }, 2500);
    } catch (e) {
      terminar(e?.name === 'NotAllowedError' ? 'Microfone bloqueado: permita o microfone no cadeado ao lado do endereço.' : 'Não consegui atender.', 'encerrada');
    }
  };

  // ── Alguém me ligando? (a cada 5 s, e na hora pelo socket do Inbox)
  const verEntrando = useCallback(() => {
    if (ligRef.current && ligRef.current.fase !== 'fim') return;
    api.get('/extras/chat-equipe/voz-entrando').then(d => {
      if (d?.voz?.id && (!ligRef.current || ligRef.current.fase === 'fim')) {
        setLig({ fase: 'recebendo', id: d.voz.id, nome: d.voz.de_nome, msg: 'está te ligando' });
      }
    }).catch(() => {});
  }, [api]);
  useEffect(() => {
    if (!user?.id) return undefined;
    verEntrando();
    const t = setInterval(verEntrando, 5000);
    const aoMsg = (e) => { const m = e.detail || {}; if (m.voz_id && (m.mencoes || []).includes(user.id)) verEntrando(); };
    const aoLigar = (e) => ligar(e.detail || {});
    window.addEventListener('vh_chat_equipe', aoMsg);
    window.addEventListener('vh-ligar-voz', aoLigar);
    return () => { clearInterval(t); window.removeEventListener('vh_chat_equipe', aoMsg); window.removeEventListener('vh-ligar-voz', aoLigar); };
  }, [user?.id, verEntrando, ligar]);

  // Toque enquanto toca / chama; cronômetro enquanto fala
  useEffect(() => {
    if (!lig || !['recebendo', 'chamando'].includes(lig.fase)) return undefined;
    const tocar = () => { if (lig.fase === 'recebendo') { tocarTom(880, .25); setTimeout(() => tocarTom(880, .25), 350); } else tocarTom(440, .6); };
    tocar();
    const t = setInterval(tocar, lig.fase === 'recebendo' ? 1600 : 3000);
    // Ninguém atendeu em 40 s: some sozinha
    const fim = lig.fase === 'recebendo' ? setTimeout(() => setLig(l => (l?.fase === 'recebendo' ? null : l)), 40000) : null;
    return () => { clearInterval(t); if (fim) clearTimeout(fim); };
  }, [lig?.fase]); // eslint-disable-line
  useEffect(() => {
    if (lig?.fase !== 'falando') return undefined;
    const t = setInterval(() => setSeg(Math.floor((Date.now() - (ligRef.current?.inicio || Date.now())) / 1000)), 500);
    return () => clearInterval(t);
  }, [lig?.fase]);
  useEffect(() => () => limpar(), [limpar]);

  const alternarMudo = () => {
    const novo = !mudo; setMudo(novo);
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !novo; });
  };

  const audio = <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />;
  if (!lig) return audio;
  const recebendo = lig.fase === 'recebendo';
  const falando = lig.fase === 'falando';
  const tempo = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;

  return createPortal(
    <>
      {audio}
      <div style={{ position: 'fixed', zIndex: 10001, right: 16, bottom: 16, width: 'min(330px, calc(100vw - 32px))', borderRadius: 20,
        overflow: 'hidden', background: 'var(--card,#fff)', boxShadow: '0 18px 50px rgba(0,0,0,.35)', border: '1px solid var(--border,#e2e8f0)' }}>
        <div style={{ padding: '18px 18px 14px', color: '#fff', textAlign: 'center',
          background: lig.fase === 'fim' ? 'linear-gradient(135deg,#64748b,#334155)' : recebendo ? 'linear-gradient(135deg,#22c55e,#15803d)' : 'linear-gradient(135deg,#06b6d4,#0e7490)' }}>
          <div style={{ fontSize: 34 }}>{lig.fase === 'fim' ? '📴' : '📞'}</div>
          <div style={{ fontSize: 17, fontWeight: 900, marginTop: 4 }}>{primeiro(lig.nome)}</div>
          <div style={{ fontSize: 12.5, opacity: .92, marginTop: 2 }}>
            {falando ? `Em ligação · ${tempo}` : lig.msg}
          </div>
        </div>
        {lig.fase !== 'fim' && (
          <div style={{ display: 'flex', gap: 10, padding: 14 }}>
            {recebendo ? (
              <>
                <button onClick={() => terminar(null, 'recusada')}
                  style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Recusar</button>
                <button onClick={atender}
                  style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Atender</button>
              </>
            ) : (
              <>
                {falando && (
                  <button onClick={alternarMudo}
                    style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1px solid var(--border,#e2e8f0)', background: mudo ? '#fef3c7' : 'var(--card,#fff)',
                      color: '#0f172a', fontWeight: 900, cursor: 'pointer' }}>{mudo ? '🔇 Mudo' : '🎙️ Microfone'}</button>
                )}
                <button onClick={() => terminar('Ligação encerrada.', 'encerrada')}
                  style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Desligar</button>
              </>
            )}
          </div>
        )}
      </div>
    </>, document.body);
}
