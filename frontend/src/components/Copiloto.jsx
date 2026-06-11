import React, { useState, useRef, useCallback } from 'react';
import { Sparkles, X, FileText, Target, Lightbulb, PenLine, RefreshCw, ArrowUpLeft, AlertCircle, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';

/* ─── Copiloto Vittalis ───────────────────────────────────────────────────────
   Painel lateral de inteligência comercial para a equipe.
   O backend monta todo o contexto (conversa + catálogo + lead) e devolve JSON
   estruturado por modo — aqui só renderizamos bonito. Cache por conversa+modo. */

const MODES = [
  { k: 'resumo',     l: 'Resumo',     Icon: FileText },
  { k: 'score',      l: 'Score',      Icon: Target },
  { k: 'estrategia', l: 'Estratégia', Icon: Lightbulb },
  { k: 'resposta',   l: 'Resposta',   Icon: PenLine },
];

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

  const run = useCallback(async (m, fresh = false) => {
    if (!convId) return;
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
            <div style={{ fontSize: 9.5, color: P.txt3, fontWeight: 600, letterSpacing: .6 }}>VITTALIS · CLAUDE</div>
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 14px' }}>
        {renderBody()}
      </div>
    </div>
  );
}
