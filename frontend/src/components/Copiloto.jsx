import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles, X, FileText, Target, Lightbulb, PenLine, RefreshCw, ArrowUpLeft, AlertCircle, TrendingUp, TrendingDown, ChevronRight, MessageCircle, Paperclip, Send, ImageIcon, Mic, Square } from 'lucide-react';

/* ─── Copiloto Vittalis ───────────────────────────────────────────────────────
   Painel lateral de inteligência comercial para a equipe.
   O backend monta todo o contexto (conversa + catálogo + lead) e devolve JSON
   estruturado por modo — aqui só renderizamos bonito. Cache por conversa+modo. */

const MODES = [
  { k: 'resumo',     l: 'Resumo',     Icon: FileText },
  { k: 'score',      l: 'Score',      Icon: Target },
  { k: 'estrategia', l: 'Estratégia', Icon: Lightbulb },
  { k: 'resposta',   l: 'Resposta',   Icon: PenLine },
  { k: 'chat',       l: 'Chat',       Icon: MessageCircle },
];

/* Reduz a imagem no navegador antes de enviar (carteiras fotografadas têm 3-5MB;
   a IA aceita até ~5MB e não precisa de mais que 1600px pra ler) */
function comprimirImagem(file, maxDim = 1600) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = cv.toDataURL('image/jpeg', 0.85);
      resolve({ media_type: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}



async function arquivoParaBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function pedidoPareceImagem(texto, temImagem) {
  const t = String(texto || '').toLowerCase();
  const termosGerar = /(ger(a|e|ar)|cri(a|e|ar)|faz(er)?|mont(a|e|ar)|desenh(a|e|ar)|render|imagem|arte|folder|flyer|post|story|banner|layout|card)/i;
  const termosEditar = /(deixa|troca|muda|alter(a|e|ar)|edita|ajusta|melhora|refina|remove|retira|coloca|azul|cor|fundo|texto|logo)/i;
  return termosGerar.test(t) || (temImagem && termosEditar.test(t));
}

const INTENCAO_CFG = {
  alta:  { label: 'Intenção alta',  c: '#2dd4a8' },
  media: { label: 'Intenção média', c: '#f0b429' },
  baixa: { label: 'Intenção baixa', c: '#f87171' },
};
const ESTAGIO_LABEL = {
  descoberta: 'Descoberta', consideracao: 'Consideração',
  negociacao: 'Negociação', fechamento: 'Fechamento', pos_venda: 'Pós-venda',
};

/* paleta do painel (petróleo profundo da marca) */
const P = {
  bg: '#071e2c', card: 'rgba(255,255,255,.045)', cardBorder: 'rgba(255,255,255,.07)',
  txt: 'rgba(255,255,255,.88)', txt2: 'rgba(255,255,255,.6)', txt3: 'rgba(255,255,255,.38)',
  tq: '#00B8C0', tqDim: 'rgba(0,184,192,.16)',
};

function scoreColor(v) { return v >= 7 ? '#2dd4a8' : v >= 4 ? '#f0b429' : '#f87171'; }

/* Medidor semicircular do score (SVG) */
function ScoreGauge({ value }) {
  const v = Math.max(0, Math.min(10, Number(value) || 0));
  const pct = v / 10;
  const r = 54, cx = 70, cy = 66;
  const arc = (p) => {
    const a = Math.PI * (1 - p);
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
  };
  const end = arc(pct);
  const large = pct > 0.5 ? 1 : 0;
  const color = scoreColor(v);
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <svg width="140" height="84" viewBox="0 0 140 84">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9" strokeLinecap="round" />
        {pct > 0 && (
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color}55)` }} />
        )}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#fff" fontSize="26" fontWeight="800" fontFamily="DM Sans, sans-serif">{v}</text>
        <text x={cx} y={cy + 11} textAnchor="middle" fill="rgba(255,255,255,.4)" fontSize="9.5" fontWeight="600" letterSpacing="1">DE 10</text>
      </svg>
    </div>
  );
}

/* blocos reutilizáveis */
const Label = ({ children }) => (
  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: P.txt3, marginBottom: 6 }}>{children}</div>
);
const Card = ({ children, style }) => (
  <div style={{ background: P.card, border: `1px solid ${P.cardBorder}`, borderRadius: 12, padding: '12px 13px', ...style }}>{children}</div>
);
const Chip = ({ children, color = P.tq, dim }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: dim || `${color}1f`, color, border: `1px solid ${color}40` }}>{children}</span>
);
const UseBtn = ({ onClick, children }) => (
  <button onClick={onClick} className="cop-use" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, background: P.tq, color: '#04252b', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer', transition: 'transform .1s, box-shadow .15s' }}>
    <ArrowUpLeft size={13} /> {children}
  </button>
);

/* skeleton de carregamento */
function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[64, 92, 48, 110].map((h, i) => (
        <div key={i} className="cop-pulse" style={{ height: h, borderRadius: 12, background: 'rgba(255,255,255,.05)', animationDelay: `${i * .12}s` }} />
      ))}
    </div>
  );
}

export default function Copiloto({ conv, onUse, onClose }) {
  const [mode, setMode] = useState('resumo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [, force] = useState(0);
  // cache: convId -> { mode -> data }
  const cache = useRef({});
  const reqSeq = useRef(0);

  const convId = conv?.id;
  const data = cache.current[convId]?.[mode] || null;

  // ── Chat livre com a IA (com anexo de imagem) ──
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatImg, setChatImg] = useState(null); // { media_type, data, preview }
  const [chatPdf, setChatPdf] = useState(null); // { name, data }
  const [chatLoading, setChatLoading] = useState(false);
  const [gravando, setGravando] = useState(false);
  const recRef = useRef(null);
  const chatFileRef = useRef(null);
  const chatEndRef = useRef(null);

  const anexarArquivoDireto = async (f) => {
    if (!f) return;
    if (f.type === 'application/pdf') {
      if (f.size > 8 * 1024 * 1024) return; // PDF até 8MB
      const data = await arquivoParaBase64(f);
      setChatPdf({ name: f.name.slice(0, 80), data });
      setChatImg(null);
      return;
    }
    if (!f.type.startsWith('image/')) return;
    try { setChatImg(await comprimirImagem(f)); setChatPdf(null); } catch {}
  };

  const anexarArquivo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    await anexarArquivoDireto(f);
  };

  const colarArquivoNoChat = async (e) => {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.kind === 'file');
    const f = item?.getAsFile?.();
    if (!f) return;
    e.preventDefault();
    await anexarArquivoDireto(f);
  };

  // Gravação de áudio: a atendente fala, o Whisper transcreve e a IA responde
  const toggleGravacao = async () => {
    if (gravando) { recRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
      const chunks = [];
      rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setGravando(false);
        const blob = new Blob(chunks, { type: 'audio/webm' });
        if (blob.size < 800) return; // gravação vazia
        const data = await new Promise((res) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(',')[1]);
          r.readAsDataURL(blob);
        });
        enviarChat({ audio: { media_type: 'audio/webm', data } });
      };
      recRef.current = rec;
      rec.start();
      setGravando(true);
    } catch { setGravando(false); }
  };

  const enviarChat = async (extra = {}) => {
    const texto = chatInput.trim();
    if ((!texto && !chatImg && !chatPdf && !extra.audio) || chatLoading) return;
    const idTmp = Date.now();
    const rotulo = extra.audio ? '🎤 Áudio enviado' : texto || (chatPdf ? `📄 ${chatPdf.name}` : '(imagem anexada)');
    const minha = { id: idTmp, role: 'user', content: rotulo, preview: chatImg?.preview, pdfName: chatPdf?.name };
    const historico = chatMsgs.map(m => ({ role: m.role, content: m.content }));
    setChatMsgs(p => [...p, minha]);
    setChatInput('');
    const img = chatImg; setChatImg(null);
    const pdf = chatPdf; setChatPdf(null);
    setChatLoading(true);
    try {
      const BASE = import.meta.env.VITE_API_URL || '';
      const tk = localStorage.getItem('vh_token') || '';
      const gerarImagem = !extra.audio && !pdf && pedidoPareceImagem(texto, !!img);
      const resp = await fetch(`${BASE}/api/inbox/${gerarImagem ? 'ai-image' : 'ai-chat'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify({
          convId, history: historico, message: texto,
          image: img ? { media_type: img.media_type, data: img.data } : undefined,
          pdf: pdf ? { name: pdf.name, data: pdf.data } : undefined,
          audio: extra.audio,
        }),
      });
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error || `HTTP ${resp.status}`);
      // Áudio: troca o rótulo pela transcrição real (a equipe vê o que a IA entendeu)
      if (d.transcricao) setChatMsgs(p => p.map(m => m.id === idTmp ? { ...m, content: `🎤 ${d.transcricao}` } : m));
      setChatMsgs(p => [...p, { role: 'assistant', content: d.texto || 'Pronto.', image: d.image }]);
    } catch (e2) {
      setChatMsgs(p => [...p, { role: 'assistant', content: `Não consegui responder: ${e2.message}` }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    }
  };

  const run = useCallback(async (m, fresh = false) => {
    if (!convId) return;
    if (m === 'chat') { setMode('chat'); setError(''); return; }
    if (!fresh && cache.current[convId]?.[m]) { setMode(m); setError(''); return; }
    setMode(m); setError(''); setLoading(true);
    const seq = ++reqSeq.current;
    try {
      const BASE = import.meta.env.VITE_API_URL || '';
      const tk = localStorage.getItem('vh_token') || '';
      const resp = await fetch(`${BASE}/api/inbox/ai-assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ convId, mode: m }),
      });
      const d = await resp.json();
      if (seq !== reqSeq.current) return; // resposta antiga, ignora
      if (!resp.ok) throw new Error(d.error || `HTTP ${resp.status}`);
      cache.current[convId] = { ...(cache.current[convId] || {}), [m]: d.data };
      force(x => x + 1);
    } catch (e) {
      if (seq === reqSeq.current) setError(e.message);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [convId]);

  // primeira abertura: roda o resumo automaticamente
  const booted = useRef(null);
  if (convId && booted.current !== convId) { booted.current = convId; setTimeout(() => run('resumo'), 0); }

  const renderBody = () => {
    /* ── CHAT LIVRE ── */
    if (mode === 'chat') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 4 }}>
            {chatMsgs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '28px 10px', color: P.txt3, fontSize: 12, lineHeight: 1.65 }}>
                Converse com o Copiloto sobre esta conversa.<br />
                Anexe foto ou PDF (carteira de vacinação, exame, proposta)<br />ou aperte o microfone e fale — a IA transcreve e responde.
              </div>
            )}
            {chatMsgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
                {m.preview && <img src={m.preview} alt="anexo" style={{ maxWidth: 160, borderRadius: 10, display: 'block', marginBottom: 4, border: `1px solid ${P.cardBorder}` }} />}
                {m.pdfName && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', marginBottom: 4, borderRadius: 8, background: P.card, border: `1px solid ${P.cardBorder}`, fontSize: 10.5, color: P.txt2 }}><FileText size={11} color={P.tq} />{m.pdfName}</div>}
                {m.image && <img src={m.image} alt="imagem gerada pela IA" style={{ maxWidth: '100%', borderRadius: 12, display: 'block', marginBottom: 6, border: `1px solid ${P.cardBorder}` }} />}
                <div style={{ background: m.role === 'user' ? P.tqDim : P.card, border: `1px solid ${m.role === 'user' ? 'rgba(0,184,192,.35)' : P.cardBorder}`, borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px', padding: '8px 11px', fontSize: 12.5, color: P.txt, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {m.content}
                </div>
                {m.image && <a href={m.image} download={`imagem-vittalis-${Date.now()}.png`} style={{ marginTop: 5, display: 'inline-block', fontSize: 10.5, color: P.tq, fontWeight: 700, textDecoration: 'none' }}>Baixar imagem</a>}
                {m.role === 'assistant' && !m.content.startsWith('Não consegui') && (
                  <button onClick={() => onUse?.(m.content)} style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 7, background: 'transparent', border: `1px solid ${P.cardBorder}`, color: P.txt3, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                    <ArrowUpLeft size={9} /> Usar no chat
                  </button>
                )}
              </div>
            ))}
            {chatLoading && (
              <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 4, padding: '10px 12px' }}>
                {[0, 1, 2].map(i => <span key={i} className="cop-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: P.tq, animationDelay: `${i * .15}s`, display: 'block' }} />)}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {chatImg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: P.card, borderRadius: 10, border: `1px solid ${P.cardBorder}` }}>
              <ImageIcon size={13} color={P.tq} />
              <span style={{ flex: 1, fontSize: 11, color: P.txt2 }}>Imagem anexada</span>
              <button onClick={() => setChatImg(null)} style={{ background: 'none', border: 'none', color: P.txt3, cursor: 'pointer', padding: 2 }}><X size={12} /></button>
            </div>
          )}
          {chatPdf && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: P.card, borderRadius: 10, border: `1px solid ${P.cardBorder}` }}>
              <FileText size={13} color={P.tq} />
              <span style={{ flex: 1, fontSize: 11, color: P.txt2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chatPdf.name}</span>
              <button onClick={() => setChatPdf(null)} style={{ background: 'none', border: 'none', color: P.txt3, cursor: 'pointer', padding: 2 }}><X size={12} /></button>
            </div>
          )}
          {gravando && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(232,64,64,.12)', borderRadius: 10, border: '1px solid rgba(232,64,64,.4)' }}>
              <span className="cop-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: '#e84040', display: 'block' }} />
              <span style={{ flex: 1, fontSize: 11, color: P.txt2 }}>Gravando… clique no quadrado para enviar</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
            <input ref={chatFileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={anexarArquivo} />
            <button onClick={() => chatFileRef.current?.click()} title="Anexar imagem ou PDF (carteira de vacinação, exame, proposta...)"
              style={{ width: 32, height: 32, borderRadius: 9, background: P.card, border: `1px solid ${P.cardBorder}`, color: P.txt2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Paperclip size={13} />
            </button>
            <button onClick={toggleGravacao} title={gravando ? 'Parar e enviar' : 'Falar com a IA (transcrição automática)'}
              style={{ width: 32, height: 32, borderRadius: 9, background: gravando ? '#e84040' : P.card, border: `1px solid ${gravando ? '#e84040' : P.cardBorder}`, color: gravando ? '#fff' : P.txt2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {gravando ? <Square size={12} /> : <Mic size={13} />}
            </button>
            <textarea value={chatInput} onPaste={colarArquivoNoChat} onChange={e => setChatInput(e.target.value)} rows={1} placeholder="Pergunte, cole uma imagem, anexe ou fale com a IA…"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarChat(); } }}
              style={{ flex: 1, resize: 'none', padding: '8px 11px', borderRadius: 10, background: 'rgba(255,255,255,.07)', border: `1px solid ${P.cardBorder}`, color: P.txt, fontSize: 12.5, outline: 'none', lineHeight: 1.5, maxHeight: 90, fontFamily: 'inherit' }} />
            <button onClick={() => enviarChat()} disabled={chatLoading || (!chatInput.trim() && !chatImg && !chatPdf)}
              style={{ width: 32, height: 32, borderRadius: 9, background: P.tq, border: 'none', color: '#04252b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: chatLoading || (!chatInput.trim() && !chatImg && !chatPdf) ? .45 : 1 }}>
              <Send size={13} />
            </button>
          </div>
        </div>
      );
    }

    if (loading) return <Skeleton />;
    if (error) return (
      <Card style={{ borderColor: 'rgba(248,113,113,.35)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#fca5a5', fontSize: 12.5, lineHeight: 1.5 }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>{error}<br />
            <button onClick={() => run(mode, true)} style={{ marginTop: 8, padding: '5px 12px', borderRadius: 8, background: 'rgba(255,255,255,.08)', color: P.txt, fontSize: 11.5, fontWeight: 700, border: `1px solid ${P.cardBorder}`, cursor: 'pointer' }}>Tentar novamente</button>
          </div>
        </div>
      </Card>
    );
    if (!data) return (
      <div style={{ textAlign: 'center', padding: '36px 12px', color: P.txt3, fontSize: 12.5, lineHeight: 1.6 }}>
        Selecione uma análise acima.<br />O Copiloto lê a conversa inteira e o catálogo da clínica.
      </div>
    );

    /* ── RESUMO ── */
    if (mode === 'resumo') {
      const it = INTENCAO_CFG[data.intencao] || INTENCAO_CFG.media;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip color={it.c}>{it.label}</Chip>
            {data.estagio && <Chip color="#9bb8c9">{ESTAGIO_LABEL[data.estagio] || data.estagio}</Chip>}
          </div>
          <Card>
            <Label>Leitura da conversa</Label>
            <div style={{ fontSize: 13, color: P.txt, lineHeight: 1.6 }}>{data.resumo}</div>
          </Card>
          <Card>
            {data.paciente && <div style={{ marginBottom: 9 }}><Label>Paciente</Label><div style={{ fontSize: 13, color: P.txt, fontWeight: 600 }}>{data.paciente}</div></div>}
            <Label>Interesse</Label>
            <div style={{ fontSize: 13, color: P.txt, fontWeight: 600 }}>{data.interesse || '—'}</div>
          </Card>
          {data.objecoes?.length > 0 && (
            <Card>
              <Label>Objeções detectadas</Label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {data.objecoes.map((o, i) => <Chip key={i} color="#f0b429">{o}</Chip>)}
              </div>
            </Card>
          )}
          {data.sinais?.length > 0 && (
            <Card>
              <Label>Sinais</Label>
              {data.sinais.map((sg, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12.5, color: P.txt2, lineHeight: 1.55, marginBottom: i < data.sinais.length - 1 ? 6 : 0 }}>
                  <ChevronRight size={13} style={{ flexShrink: 0, marginTop: 3, color: P.tq }} />{sg}
                </div>
              ))}
            </Card>
          )}
          {data.proximo_passo && (
            <Card style={{ background: P.tqDim, borderColor: 'rgba(0,184,192,.3)' }}>
              <Label>Próximo passo</Label>
              <div style={{ fontSize: 13, color: '#bdf3f5', fontWeight: 600, lineHeight: 1.55 }}>{data.proximo_passo}</div>
            </Card>
          )}
        </div>
      );
    }

    /* ── SCORE ── */
    if (mode === 'score') {
      const cls = String(data.classificacao || '').toLowerCase();
      const clsColor = cls === 'quente' ? '#2dd4a8' : cls === 'morno' ? '#f0b429' : '#94a3b8';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Card style={{ paddingTop: 16 }}>
            <ScoreGauge value={data.score} />
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 4 }}>
              <Chip color={clsColor}>{(data.classificacao || '').toUpperCase()}</Chip>
              {data.urgencia && <Chip color="#9bb8c9">Urgência {data.urgencia}</Chip>}
            </div>
          </Card>
          <Card>
            <Label>Por quê</Label>
            <div style={{ fontSize: 12.5, color: P.txt, lineHeight: 1.6 }}>{data.justificativa}</div>
          </Card>
          {data.fatores?.length > 0 && (
            <Card>
              <Label>Fatores</Label>
              {data.fatores.map((f, i) => {
                const pos = f.impacto === 'positivo';
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: P.txt2, lineHeight: 1.5, marginBottom: i < data.fatores.length - 1 ? 7 : 0 }}>
                    {pos ? <TrendingUp size={13} color="#2dd4a8" style={{ flexShrink: 0, marginTop: 2 }} /> : <TrendingDown size={13} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />}
                    {f.fator}
                  </div>
                );
              })}
            </Card>
          )}
          {data.recomendacao && (
            <Card style={{ background: P.tqDim, borderColor: 'rgba(0,184,192,.3)' }}>
              <Label>Recomendação</Label>
              <div style={{ fontSize: 13, color: '#bdf3f5', fontWeight: 600, lineHeight: 1.55 }}>{data.recomendacao}</div>
            </Card>
          )}
        </div>
      );
    }

    /* ── ESTRATÉGIA ── */
    if (mode === 'estrategia') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Card>
            <Label>Momento</Label>
            <div style={{ fontSize: 13, color: P.txt, lineHeight: 1.6 }}>{data.leitura}</div>
          </Card>
          {data.produto_alvo && (
            <Card>
              <Label>Oferecer agora</Label>
              <div style={{ fontSize: 13, color: P.txt, fontWeight: 700 }}>{data.produto_alvo}</div>
              {data.objecao_principal && (
                <div style={{ marginTop: 9 }}>
                  <Label>Barreira a vencer</Label>
                  <Chip color="#f0b429">{data.objecao_principal}</Chip>
                </div>
              )}
            </Card>
          )}
          {data.passos?.length > 0 && (
            <Card>
              <Label>Sequência</Label>
              {data.passos.map((pso, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i < data.passos.length - 1 ? 9 : 0 }}>
                  <div style={{ width: 19, height: 19, borderRadius: 6, background: P.tqDim, color: P.tq, fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                  <div style={{ fontSize: 12.5, color: P.txt2, lineHeight: 1.55 }}>{pso}</div>
                </div>
              ))}
            </Card>
          )}
          {data.frase_pronta && (
            <Card style={{ borderLeft: `3px solid ${P.tq}` }}>
              <Label>Mensagem sugerida</Label>
              <div style={{ fontSize: 13, color: P.txt, lineHeight: 1.6, fontStyle: 'italic', marginBottom: 11 }}>“{data.frase_pronta}”</div>
              <UseBtn onClick={() => onUse?.(data.frase_pronta)}>Usar no chat</UseBtn>
            </Card>
          )}
        </div>
      );
    }

    /* ── RESPOSTA ── */
    if (mode === 'resposta') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Card style={{ borderLeft: `3px solid ${P.tq}` }}>
            <Label>Próxima mensagem</Label>
            <div style={{ fontSize: 13.5, color: P.txt, lineHeight: 1.65, marginBottom: 12, whiteSpace: 'pre-wrap' }}>{data.texto}</div>
            <UseBtn onClick={() => onUse?.(data.texto)}>Usar esta resposta</UseBtn>
          </Card>
          {data.racional && (
            <div style={{ fontSize: 11.5, color: P.txt3, lineHeight: 1.55, padding: '0 4px' }}>{data.racional}</div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="cop-slide" style={{ width: 332, flexShrink: 0, display: 'flex', flexDirection: 'column', background: `linear-gradient(168deg, ${P.bg} 0%, #0a2a3d 100%)`, borderLeft: '1px solid rgba(0,184,192,.18)', overflow: 'hidden' }}>
      <style>{`
        .cop-slide{animation:copIn .22s cubic-bezier(.2,.8,.3,1)}
        @keyframes copIn{from{transform:translateX(24px);opacity:0}to{transform:translateX(0);opacity:1}}
        .cop-pulse{animation:copPulse 1.3s ease-in-out infinite}
        @keyframes copPulse{0%,100%{opacity:.45}50%{opacity:1}}
        .cop-use:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,184,192,.4)}
        .cop-tab{transition:background .12s,color .12s}
        @media (prefers-reduced-motion: reduce){.cop-slide,.cop-pulse{animation:none}}
      `}</style>

      {/* header */}
      <div style={{ padding: '13px 14px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: P.tqDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={13} color={P.tq} />
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', letterSpacing: .2 }}>Copiloto</div>
            <div style={{ fontSize: 9.5, color: P.txt3, fontWeight: 600, letterSpacing: .6 }}>VITTALIS · GPT</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => run(mode, true)} disabled={loading} title="Atualizar análise"
            style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,.06)', border: 'none', cursor: 'pointer', color: P.txt2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw size={12} className={loading ? 'spin' : ''} />
          </button>
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,.06)', border: 'none', cursor: 'pointer', color: P.txt2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={13} />
          </button>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, padding: '10px 12px' }}>
        {MODES.map(({ k, l, Icon }) => {
          const active = mode === k;
          return (
            <button key={k} onClick={() => run(k)} disabled={loading && active} className="cop-tab"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 2px', borderRadius: 9, border: `1px solid ${active ? 'rgba(0,184,192,.45)' : 'transparent'}`, background: active ? P.tqDim : 'rgba(255,255,255,.035)', color: active ? P.tq : P.txt3, cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>
              <Icon size={14} />{l}
            </button>
          );
        })}
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: mode === 'chat' ? 'hidden' : 'auto', padding: '4px 12px 14px', display: mode === 'chat' ? 'flex' : 'block', flexDirection: 'column' }}>
        {renderBody()}
      </div>
    </div>
  );
}
