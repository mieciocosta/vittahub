import React from 'react';

/* 🎉 VITINHA, A MASCOTE DA CASA (ordem do master, 28/08: "quando a equipe
   registrar uma venda, um personagem legal aparece na tela e dá palmas, de
   forma divertida, com movimento").

   É um personagem NOSSO, desenhado aqui em SVG nas cores da marca — nada de
   personagem de terceiros, que é registrado e não pode ser usado sem licença.
   Tudo é CSS: pula, bate palminha de verdade (as mãos se encontram), pisca os
   olhos, solta estrelinhas e some sozinha. Sem imagem, sem biblioteca, sem
   peso nenhum na tela. */

/* 🎭 A TURMA DA VITTALIS — TRINTA personagens nossos, cada um com a sua frase
   (ordem do master, 28/08: "quero que venha junto com uma frase e tenha 30
   tipos diferentes pra não enjoar"). Mesmo corpinho, o que muda é a cor, o
   enfeite da cabeça e a fala. O sorteio guarda os últimos e não repete: dá pra
   vender o dia inteiro sem ver o mesmo bichinho duas vezes.

   Todos desenhados aqui, em SVG. Nada de personagem de terceiros: Magali,
   Mônica e companhia são registrados e exigiriam licença. */
const PERSONAGENS = [
  { id:'vitinha', cores:['#22d3ee','#0E8C96'], borda:'#0E8C96', fala:'Isso é venda!',
    enfeite:<><path d="M65 34c0-9-3-14-3-14s7 2 9 8" stroke="#0E8C96" strokeWidth="4" fill="none" strokeLinecap="round"/><circle cx="74" cy="24" r="6" fill="#C4973B"/></> },
  { id:'estrelinha', cores:['#fbbf24','#d97706'], borda:'#b45309', fala:'Você brilhou hoje!',
    enfeite:<path d="M65 12l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#fde68a" stroke="#b45309" strokeWidth="2"/> },
  { id:'abelhinha', cores:['#facc15','#ca8a04'], borda:'#a16207', fala:'Colmeia em festa!',
    enfeite:<><path d="M56 30c-4-8-10-10-10-10s2 8 8 12M74 30c4-8 10-10 10-10s-2 8-8 12" stroke="#a16207" strokeWidth="3" fill="none" strokeLinecap="round"/><ellipse cx="46" cy="18" rx="7" ry="5" fill="#fff" opacity=".85"/><ellipse cx="84" cy="18" rx="7" ry="5" fill="#fff" opacity=".85"/></> },
  { id:'coelhinho', cores:['#f9a8d4','#db2777'], borda:'#be185d', fala:'Pulei de alegria!',
    enfeite:<><ellipse cx="55" cy="20" rx="6" ry="16" fill="#f9a8d4" stroke="#be185d" strokeWidth="2.5"/><ellipse cx="75" cy="20" rx="6" ry="16" fill="#f9a8d4" stroke="#be185d" strokeWidth="2.5"/></> },
  { id:'ursinho', cores:['#a78bfa','#6d28d9'], borda:'#5b21b6', fala:'Abraço apertado!',
    enfeite:<><circle cx="48" cy="30" r="11" fill="#a78bfa" stroke="#5b21b6" strokeWidth="2.5"/><circle cx="82" cy="30" r="11" fill="#a78bfa" stroke="#5b21b6" strokeWidth="2.5"/></> },
  { id:'foguetinho', cores:['#34d399','#0f766e'], borda:'#115e59', fala:'Decolou!',
    enfeite:<><path d="M65 12l9 18H56l9-18z" fill="#fca5a5" stroke="#115e59" strokeWidth="2.5"/><circle cx="65" cy="26" r="3.5" fill="#fff"/></> },
  { id:'rainha', cores:['#f472b6','#9d174d'], borda:'#831843', fala:'Rainha da venda!',
    enfeite:<path d="M46 30l4-16 9 9 6-13 6 13 9-9 4 16z" fill="#fbbf24" stroke="#92400e" strokeWidth="2"/> },
  { id:'rei', cores:['#60a5fa','#1d4ed8'], borda:'#1e3a8a', fala:'Rei do fechamento!',
    enfeite:<path d="M46 30l4-16 9 9 6-13 6 13 9-9 4 16z" fill="#fcd34d" stroke="#92400e" strokeWidth="2"/> },
  { id:'lacinho', cores:['#fda4af','#e11d48'], borda:'#9f1239', fala:'Que capricho!',
    enfeite:<><path d="M65 26l-14-8v16zM65 26l14-8v16z" fill="#fb7185" stroke="#9f1239" strokeWidth="2"/><circle cx="65" cy="26" r="4.5" fill="#fecdd3" stroke="#9f1239" strokeWidth="2"/></> },
  { id:'festeiro', cores:['#38bdf8','#0369a1'], borda:'#075985', fala:'Isso é festa!',
    enfeite:<><path d="M65 8l12 22H53z" fill="#f472b6" stroke="#075985" strokeWidth="2"/><circle cx="65" cy="7" r="4" fill="#fbbf24"/></> },
  { id:'gatinho', cores:['#fdba74','#c2410c'], borda:'#9a3412', fala:'Miau de orgulho!',
    enfeite:<><path d="M46 32l2-18 14 10zM84 32l-2-18-14 10z" fill="#fdba74" stroke="#9a3412" strokeWidth="2.5"/></> },
  { id:'dino', cores:['#4ade80','#15803d'], borda:'#14532d', fala:'Venda gigante!',
    enfeite:<path d="M48 32l6-12 5 8 6-12 5 12 5-8 6 12z" fill="#86efac" stroke="#14532d" strokeWidth="2"/> },
  { id:'florzinha', cores:['#c084fc','#7e22ce'], borda:'#6b21a8', fala:'Floresceu!',
    enfeite:<><circle cx="65" cy="14" r="6" fill="#f9a8d4"/><circle cx="53" cy="22" r="6" fill="#f9a8d4"/><circle cx="77" cy="22" r="6" fill="#f9a8d4"/><circle cx="65" cy="26" r="5" fill="#fde68a"/></> },
  { id:'baloeiro', cores:['#f87171','#b91c1c'], borda:'#991b1b', fala:'Voando alto!',
    enfeite:<><path d="M65 34V18" stroke="#991b1b" strokeWidth="2"/><ellipse cx="65" cy="12" rx="9" ry="11" fill="#fca5a5" stroke="#991b1b" strokeWidth="2"/></> },
  { id:'enfermeirinha', cores:['#5eead4','#0d9488'], borda:'#0f766e', fala:'Cuidado que vende!',
    enfeite:<><rect x="50" y="16" width="30" height="14" rx="4" fill="#fff" stroke="#0f766e" strokeWidth="2"/><path d="M65 19v8M61 23h8" stroke="#e11d48" strokeWidth="3" strokeLinecap="round"/></> },
  { id:'arcoiris', cores:['#a5b4fc','#4338ca'], borda:'#3730a3', fala:'Dia colorido!',
    enfeite:<><path d="M45 32a20 20 0 0140 0" stroke="#f87171" strokeWidth="4" fill="none"/><path d="M51 32a14 14 0 0128 0" stroke="#fbbf24" strokeWidth="4" fill="none"/><path d="M57 32a8 8 0 0116 0" stroke="#4ade80" strokeWidth="4" fill="none"/></> },
  { id:'solzinho', cores:['#fcd34d','#d97706'], borda:'#b45309', fala:'Iluminou o dia!',
    enfeite:<><circle cx="65" cy="20" r="9" fill="#fde68a" stroke="#b45309" strokeWidth="2"/><path d="M65 6v5M52 12l3 4M78 12l-3 4M48 24h5M77 24h5" stroke="#b45309" strokeWidth="2.5" strokeLinecap="round"/></> },
  { id:'nuvenzinha', cores:['#93c5fd','#2563eb'], borda:'#1d4ed8', fala:'Chuva de vendas!',
    enfeite:<><ellipse cx="58" cy="24" rx="11" ry="8" fill="#dbeafe" stroke="#1d4ed8" strokeWidth="2"/><ellipse cx="74" cy="24" rx="9" ry="7" fill="#dbeafe" stroke="#1d4ed8" strokeWidth="2"/></> },
  { id:'coracao', cores:['#fb7185','#be123c'], borda:'#9f1239', fala:'Feito com amor!',
    enfeite:<path d="M65 32s-13-8-13-16a7 7 0 0113-4 7 7 0 0113 4c0 8-13 16-13 16z" fill="#fecdd3" stroke="#9f1239" strokeWidth="2"/> },
  { id:'pandinha', cores:['#e5e7eb','#4b5563'], borda:'#374151', fala:'Fofura e resultado!',
    enfeite:<><circle cx="48" cy="30" r="11" fill="#374151"/><circle cx="82" cy="30" r="11" fill="#374151"/></> },
  { id:'leaozinho', cores:['#fbbf24','#b45309'], borda:'#92400e', fala:'Rugido de campeã!',
    enfeite:<><circle cx="65" cy="30" r="26" fill="#f59e0b" opacity=".55"/><circle cx="65" cy="30" r="19" fill="#fbbf24"/></> },
  { id:'sapinho', cores:['#86efac','#16a34a'], borda:'#15803d', fala:'Pulo do gato!',
    enfeite:<><circle cx="53" cy="26" r="9" fill="#86efac" stroke="#15803d" strokeWidth="2"/><circle cx="77" cy="26" r="9" fill="#86efac" stroke="#15803d" strokeWidth="2"/><circle cx="53" cy="26" r="3.5" fill="#14532d"/><circle cx="77" cy="26" r="3.5" fill="#14532d"/></> },
  { id:'pipa', cores:['#67e8f9','#0891b2'], borda:'#0e7490', fala:'Foi longe demais!',
    enfeite:<><path d="M65 8l14 14-14 14-14-14z" fill="#a5f3fc" stroke="#0e7490" strokeWidth="2"/><path d="M65 8v28M51 22h28" stroke="#0e7490" strokeWidth="1.6"/></> },
  { id:'trevo', cores:['#4ade80','#166534'], borda:'#14532d', fala:'Sorte é treino!',
    enfeite:<><circle cx="57" cy="20" r="7" fill="#86efac" stroke="#14532d" strokeWidth="2"/><circle cx="73" cy="20" r="7" fill="#86efac" stroke="#14532d" strokeWidth="2"/><circle cx="65" cy="30" r="7" fill="#86efac" stroke="#14532d" strokeWidth="2"/></> },
  { id:'cupcake', cores:['#f0abfc','#a21caf'], borda:'#86198f', fala:'Doce vitória!',
    enfeite:<><path d="M52 32l4-10h18l4 10z" fill="#fbcfe8" stroke="#86198f" strokeWidth="2"/><circle cx="65" cy="16" r="6" fill="#fda4af" stroke="#86198f" strokeWidth="2"/></> },
  { id:'presente', cores:['#f87171','#7f1d1d'], borda:'#7f1d1d', fala:'Presente pra casa!',
    enfeite:<><rect x="50" y="18" width="30" height="14" rx="3" fill="#fecaca" stroke="#7f1d1d" strokeWidth="2"/><path d="M65 18v14M50 25h30" stroke="#7f1d1d" strokeWidth="2.5"/></> },
  { id:'trofeuzinho', cores:['#fde047','#a16207'], borda:'#854d0e', fala:'Troféu do dia!',
    enfeite:<><path d="M55 12h20v10a10 10 0 01-20 0z" fill="#fde68a" stroke="#854d0e" strokeWidth="2"/><path d="M65 32v-2M58 34h14" stroke="#854d0e" strokeWidth="2.5" strokeLinecap="round"/></> },
  { id:'astronauta', cores:['#cbd5e1','#475569'], borda:'#334155', fala:'Fora de série!',
    enfeite:<><circle cx="65" cy="24" r="17" fill="rgba(191,219,254,.55)" stroke="#334155" strokeWidth="2"/><path d="M55 20a10 10 0 018-6" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round"/></> },
  { id:'mago', cores:['#818cf8','#3730a3'], borda:'#312e81', fala:'Fez mágica!',
    enfeite:<><path d="M65 4l14 28H51z" fill="#a5b4fc" stroke="#312e81" strokeWidth="2"/><circle cx="65" cy="20" r="3" fill="#fde047"/><circle cx="60" cy="27" r="2.2" fill="#fde047"/></> },
  { id:'pinguim', cores:['#38bdf8','#0c4a6e'], borda:'#082f49', fala:'Time unido!',
    enfeite:<><ellipse cx="65" cy="24" rx="15" ry="12" fill="#0c4a6e"/><ellipse cx="65" cy="27" rx="9" ry="8" fill="#e0f2fe"/><path d="M65 26l5 4h-10z" fill="#f59e0b"/></> },
];

// Sorteia sem repetir o da vez anterior — é isso que evita o enjoo
const escolherPersonagem = () => {
  let recentes = [];
  try { recentes = JSON.parse(localStorage.getItem('vh_mascote_recentes') || '[]'); } catch { /* ok */ }
  const opcoes = PERSONAGENS.filter(x => !recentes.includes(x.id));
  const p = (opcoes.length ? opcoes : PERSONAGENS)[Math.floor(Math.random() * (opcoes.length || PERSONAGENS.length))];
  try { localStorage.setItem('vh_mascote_recentes', JSON.stringify([p.id, ...recentes].slice(0, 8))); } catch { /* ok */ }
  return p;
};

export default function MascoteAplaudindo({ nome, valor }) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || '';
  const [p] = React.useState(escolherPersonagem);
  const fala = p.fala;
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
