import React from 'react';

/* 🎉 VITINHA, A MASCOTE DA CASA (ordem do master, 28/08: "quando a equipe
   registrar uma venda, um personagem legal aparece na tela e dá palmas, de
   forma divertida, com movimento").

   É um personagem NOSSO, desenhado aqui em SVG nas cores da marca — nada de
   personagem de terceiros, que é registrado e não pode ser usado sem licença.
   Tudo é CSS: pula, bate palminha de verdade (as mãos se encontram), pisca os
   olhos, solta estrelinhas e some sozinha. Sem imagem, sem biblioteca, sem
   peso nenhum na tela. */

/* 🎭 A TURMA DA VITTALIS — seis personagens nossos, sorteados a cada venda
   (ordem do master, 28/08: "quero vários tipos diferentes pra não enjoar").
   Todos usam o mesmo corpinho; o que muda é a cor, o enfeite da cabeça e a
   fala. Nunca sai o mesmo duas vezes seguidas. */
const PERSONAGENS = [
  { id: 'vitinha', cores: ['#22d3ee', '#0E8C96'], borda: '#0E8C96',
    falas: ['Isso é venda!', 'Mandou bem demais!', 'Assim que se faz!'],
    enfeite: (
      <>
        <path d="M65 34c0-9-3-14-3-14s7 2 9 8" stroke="#0E8C96" strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="74" cy="24" r="6" fill="#C4973B" />
      </>
    ) },
  { id: 'estrelinha', cores: ['#fbbf24', '#d97706'], borda: '#b45309',
    falas: ['Você brilhou!', 'Estrela do dia!', 'Que fechamento!'],
    enfeite: <path d="M65 12l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#fde68a" stroke="#b45309" strokeWidth="2" /> },
  { id: 'abelhinha', cores: ['#facc15', '#ca8a04'], borda: '#a16207',
    falas: ['Trabalhou e mereceu!', 'Colmeia em festa!', 'Doce igual mel!'],
    enfeite: (
      <>
        <path d="M56 30c-4-8-10-10-10-10s2 8 8 12M74 30c4-8 10-10 10-10s-2 8-8 12" stroke="#a16207" strokeWidth="3" fill="none" strokeLinecap="round" />
        <ellipse cx="46" cy="18" rx="7" ry="5" fill="#fff" opacity=".85" />
        <ellipse cx="84" cy="18" rx="7" ry="5" fill="#fff" opacity=".85" />
      </>
    ) },
  { id: 'coelhinho', cores: ['#f9a8d4', '#db2777'], borda: '#be185d',
    falas: ['Pulei de alegria!', 'Que orgulho!', 'Você é demais!'],
    enfeite: (
      <>
        <ellipse cx="55" cy="20" rx="6" ry="16" fill="#f9a8d4" stroke="#be185d" strokeWidth="2.5" />
        <ellipse cx="75" cy="20" rx="6" ry="16" fill="#f9a8d4" stroke="#be185d" strokeWidth="2.5" />
      </>
    ) },
  { id: 'ursinho', cores: ['#a78bfa', '#6d28d9'], borda: '#5b21b6',
    falas: ['Abraço apertado!', 'Fechou bonito!', 'Time feliz!'],
    enfeite: (
      <>
        <circle cx="48" cy="30" r="11" fill="#a78bfa" stroke="#5b21b6" strokeWidth="2.5" />
        <circle cx="82" cy="30" r="11" fill="#a78bfa" stroke="#5b21b6" strokeWidth="2.5" />
      </>
    ) },
  { id: 'foguetinho', cores: ['#34d399', '#0f766e'], borda: '#115e59',
    falas: ['Decolou!', 'Rumo à meta!', 'Foi longe demais!'],
    enfeite: (
      <>
        <path d="M65 12l9 18H56l9-18z" fill="#fca5a5" stroke="#115e59" strokeWidth="2.5" />
        <circle cx="65" cy="26" r="3.5" fill="#fff" />
      </>
    ) },
];

// Sorteia sem repetir o da vez anterior — é isso que evita o enjoo
const escolherPersonagem = () => {
  let ultimo = null;
  try { ultimo = localStorage.getItem('vh_mascote_ultimo'); } catch { /* ok */ }
  const opcoes = PERSONAGENS.filter(x => x.id !== ultimo);
  const p = opcoes[Math.floor(Math.random() * opcoes.length)] || PERSONAGENS[0];
  try { localStorage.setItem('vh_mascote_ultimo', p.id); } catch { /* ok */ }
  return p;
};

export default function MascoteAplaudindo({ nome, valor }) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || '';
  const [p] = React.useState(escolherPersonagem);
  const fala = React.useMemo(() => p.falas[Math.floor(Math.random() * p.falas.length)], [p]);
  return (
    <div style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 1001, pointerEvents: 'none',
      display: 'flex', alignItems: 'flex-end', gap: 10, animation: 'vh-mascote-entra .45s cubic-bezier(.2,1.5,.4,1)' }}>

      {/* Balãozinho de fala */}
      <div style={{ background: 'var(--card,#fff)', border: '2px solid var(--tq,#00B8C0)', borderRadius: 16,
        padding: '10px 15px', boxShadow: '0 10px 30px rgba(0,184,192,.32)', marginBottom: 26, textAlign: 'right',
        animation: 'vh-balao-pula 1.1s ease-in-out infinite' }}>
        <div style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--tq2,#007d83)', whiteSpace: 'nowrap' }}>
          👏 {fala}{primeiro ? ` ${primeiro}!` : ''}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted,#5a7285)', fontWeight: 700, whiteSpace: 'nowrap' }}>
          {valor ? `Venda de ${valor} registrada` : 'Mais uma venda registrada'}
        </div>
      </div>

      <div style={{ position: 'relative', width: 130, height: 150, animation: 'vh-mascote-pula .5s ease-in-out infinite' }}>
        {/* Estrelinhas que saltam a cada palma */}
        {[['12%', '18%', '0s'], ['80%', '10%', '.18s'], ['46%', '2%', '.34s'], ['92%', '46%', '.12s']].map(([l, t, d], i) => (
          <span key={i} style={{ position: 'absolute', left: l, top: t, fontSize: 15,
            animation: `vh-estrela .5s ${d} ease-out infinite` }}>✨</span>
        ))}

        <svg viewBox="0 0 130 150" width="130" height="150" aria-label="Mascote comemorando">
          <defs>
            <linearGradient id={`vh-corpo-${p.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.cores[0]} /><stop offset="100%" stopColor={p.cores[1]} />
            </linearGradient>
          </defs>

          {/* Sombrinha no chão */}
          <ellipse cx="65" cy="143" rx="30" ry="6" fill="rgba(6,66,74,.18)" />

          {/* Corpo */}
          <path d="M65 34c22 0 36 16 36 40 0 26-16 44-36 44S29 100 29 74c0-24 14-40 36-40z" fill={`url(#vh-corpo-${p.id})`} />

          {/* Diamante da casa no peito */}
          <path d="M65 84l-9-10h18l-9 10zm-9-13l4-6h10l4 6H56z" fill="#fff" opacity=".95" />

          {/* O enfeite da cabeça é o que dá a cara de cada personagem */}
          {p.enfeite}

          {/* Olhos que piscam */}
          <g style={{ transformOrigin: '52px 62px', animation: 'vh-piscar 3.4s infinite' }}>
            <ellipse cx="52" cy="62" rx="6.5" ry="8" fill="#06424A" />
            <circle cx="54" cy="59" r="2.4" fill="#fff" />
          </g>
          <g style={{ transformOrigin: '80px 62px', animation: 'vh-piscar 3.4s infinite' }}>
            <ellipse cx="80" cy="62" rx="6.5" ry="8" fill="#06424A" />
            <circle cx="82" cy="59" r="2.4" fill="#fff" />
          </g>

          {/* Bochechas e sorrisão */}
          <ellipse cx="40" cy="74" rx="7" ry="5" fill="#f9a8d4" opacity=".75" />
          <ellipse cx="92" cy="74" rx="7" ry="5" fill="#f9a8d4" opacity=".75" />
          <path d="M54 76q11 12 22 0" stroke="#06424A" strokeWidth="3.4" fill="none" strokeLinecap="round" />

          {/* AS MÃOS: é aqui que a palma acontece — elas se encontram no meio */}
          <g style={{ transformOrigin: '65px 104px', animation: 'vh-palma-esq .42s ease-in-out infinite' }}>
            <circle cx="40" cy="104" r="11" fill={p.cores[0]} stroke={p.borda} strokeWidth="2.5" />
          </g>
          <g style={{ transformOrigin: '65px 104px', animation: 'vh-palma-dir .42s ease-in-out infinite' }}>
            <circle cx="90" cy="104" r="11" fill={p.cores[0]} stroke={p.borda} strokeWidth="2.5" />
          </g>

          {/* Pézinhos */}
          <ellipse cx="53" cy="130" rx="11" ry="7" fill={p.cores[1]} />
          <ellipse cx="77" cy="130" rx="11" ry="7" fill={p.cores[1]} />
        </svg>
      </div>

      <style>{`
        @keyframes vh-mascote-entra { 0% { transform: translateY(60px) scale(.7); opacity: 0; } 100% { transform: none; opacity: 1; } }
        @keyframes vh-mascote-pula  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
        @keyframes vh-balao-pula    { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes vh-palma-esq     { 0%,100% { transform: translateX(0) rotate(-8deg); } 50% { transform: translateX(17px) rotate(10deg); } }
        @keyframes vh-palma-dir     { 0%,100% { transform: translateX(0) rotate(8deg); }  50% { transform: translateX(-17px) rotate(-10deg); } }
        @keyframes vh-piscar        { 0%,92%,100% { transform: scaleY(1); } 96% { transform: scaleY(.12); } }
        @keyframes vh-estrela       { 0% { transform: scale(.4); opacity: 0; } 40% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(.5); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          /* Quem prefere menos movimento vê a Vitinha paradinha, sem pular */
          [aria-label="Mascote comemorando"] *, [aria-label="Mascote comemorando"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
