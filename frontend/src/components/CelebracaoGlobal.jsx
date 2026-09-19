import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth, useApi } from '../context/AuthContext.jsx';
import { aoVivo } from '../hooks/polling.js';
import MascoteAplaudindo, { MascoteDancando } from './MascoteAplaudindo.jsx';

/* ─── Celebração global (gamificação) ────────────────────────────────────────
   Ouve o evento 'celebracao' do servidor e mostra confete + mensagem:
   · tipo 'setor'      → todo mundo do setor vê (ex: venda de Vacinas)
   · tipo 'individual' → só quem fez a ação vê
   · tipo 'marco'      → todos veem (25/50/75/100% da meta)
   Confete em CSS puro — sem bibliotecas, leve e rápido.                     */

const CORES = ['#00B8C0', '#0E8C96', '#C4973B', '#0fb07a', '#3b82f6', '#ec4899', '#f59e0b', '#a855f7', '#f43f5e'];

/* 🎊 NOVE CHUVAS DIFERENTES (ordem do master, 28/08: "quero tipos de confete
   diferentes, e um mais lindo que o outro"). Sorteadas a cada comemoração, sem
   repetir as três últimas. Tudo em CSS: nenhuma imagem, nenhuma biblioteca —
   a tela da equipe não fica pesada.

   fita       · o confete clássico, agora girando em três eixos
   coracoes   · chuva de corações, balançando como folha caindo
   estrelas   · estrelinhas que piscam enquanto caem
   fogos      · fogos de artifício estourando dos dois cantos de baixo
   bolhas     · bolhas de sabão subindo, com brilho
   petalas    · pétalas de flor descendo em zigue-zague
   serpentina · fitas compridas de festa junina
   moedas     · moedas douradas girando (é venda, afinal)
   baloes     · balões subindo com a cordinha                                */
const rnd = (a, b) => a + Math.random() * (b - a);

function Chuva({ tipo, grande }) {
  const n = grande ? 70 : 46;
  const base = { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 999, overflow: 'hidden' };

  if (tipo === 'fogos') {
    // Dois estouros radiais, um de cada canto de baixo
    const faisca = (cx, atraso) => Array.from({ length: 26 }).map((_, i) => {
      const ang = (i / 26) * Math.PI * 2;
      const dist = rnd(120, 260);
      return (
        <span key={`${cx}-${i}`} style={{
          position: 'absolute', left: cx, bottom: '14%', width: 7, height: 7, borderRadius: '50%',
          background: CORES[i % CORES.length], boxShadow: `0 0 10px ${CORES[i % CORES.length]}`,
          ['--dx']: `${Math.cos(ang) * dist}px`, ['--dy']: `${Math.sin(ang) * dist - 40}px`,
          animation: `vh-faisca 1.5s ${atraso}s cubic-bezier(.15,.7,.35,1) forwards`,
        }} />
      );
    });
    return (
      <div style={base}>
        {faisca('22%', 0)}{faisca('78%', .35)}{faisca('50%', .7)}
        <style>{`@keyframes vh-faisca {
          0%   { transform: translate(0,0) scale(1);   opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(.3); opacity: 0; } }`}</style>
      </div>
    );
  }

  if (tipo === 'bolhas' || tipo === 'baloes') {
    const balao = tipo === 'baloes';
    return (
      <div style={base}>
        {Array.from({ length: balao ? 22 : 34 }).map((_, i) => {
          const tam = balao ? rnd(26, 46) : rnd(14, 40);
          const cor = CORES[i % CORES.length];
          return (
            <span key={i} style={{
              position: 'absolute', bottom: -70, left: `${rnd(2, 96)}%`, width: tam, height: balao ? tam * 1.2 : tam,
              borderRadius: balao ? '50% 50% 46% 46%' : '50%',
              background: balao ? cor : `radial-gradient(circle at 32% 30%, rgba(255,255,255,.9), ${cor}55 42%, ${cor}22 70%)`,
              border: balao ? 'none' : `1.5px solid ${cor}66`,
              boxShadow: balao ? `0 6px 16px ${cor}55` : 'none',
              animation: `vh-sobe ${rnd(3, 5)}s ${rnd(0, .9)}s ease-in forwards`,
            }} />
          );
        })}
        <style>{`@keyframes vh-sobe {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          12%  { opacity: 1; }
          50%  { transform: translateY(-52vh) translateX(22px); }
          100% { transform: translateY(-108vh) translateX(-18px); opacity: .1; } }`}</style>
      </div>
    );
  }

  // As que CAEM (fita, corações, estrelas, pétalas, serpentina, moedas)
  const EMOJI = { coracoes: ['💖', '💗', '❤️', '💕', '🩵'], estrelas: ['✨', '⭐', '🌟', '💫'],
    petalas: ['🌸', '🌺', '🌼', '🍀'], moedas: ['🪙', '💰', '🏅'] };
  return (
    <div style={base}>
      {Array.from({ length: n }).map((_, i) => {
        const left = rnd(0, 100), atraso = rnd(0, .7), dur = rnd(2.2, 4);
        const cor = CORES[i % CORES.length];
        const comum = { position: 'absolute', top: -28, left: `${left}%`,
          animation: `${tipo === 'petalas' ? 'vh-folha' : 'vh-cai'} ${dur}s ${atraso}s cubic-bezier(.25,.6,.4,1) forwards` };
        if (EMOJI[tipo]) {
          const e = EMOJI[tipo][i % EMOJI[tipo].length];
          return <span key={i} style={{ ...comum, fontSize: rnd(14, 28),
            filter: tipo === 'estrelas' ? 'drop-shadow(0 0 6px rgba(255,255,255,.8))' : 'none' }}>{e}</span>;
        }
        if (tipo === 'serpentina') {
          return <span key={i} style={{ ...comum, width: rnd(4, 7), height: rnd(38, 80),
            background: `repeating-linear-gradient(45deg, ${cor}, ${cor} 7px, #fff 7px, #fff 12px)`,
            borderRadius: 4, opacity: .95 }} />;
        }
        // fita (clássico), com giro nos três eixos
        const w = rnd(7, 13);
        return <span key={i} style={{ ...comum, width: w, height: w * (Math.random() > .5 ? 1 : .45),
          background: cor, borderRadius: Math.random() > .6 ? '50%' : 2, boxShadow: `0 1px 4px ${cor}55` }} />;
      })}
      <style>{`
        @keyframes vh-cai   { 0% { transform: translateY(0) rotate(0) rotateY(0);   opacity: 1; }
                              100% { transform: translateY(106vh) rotate(680deg) rotateY(720deg); opacity: .7; } }
        @keyframes vh-folha { 0%   { transform: translateY(0) translateX(0) rotate(0); opacity: 1; }
                              33%  { transform: translateY(35vh) translateX(46px) rotate(140deg); }
                              66%  { transform: translateY(70vh) translateX(-40px) rotate(280deg); }
                              100% { transform: translateY(107vh) translateX(24px) rotate(420deg); opacity: .8; } }
      `}</style>
    </div>
  );
}

const TIPOS_CHUVA = ['fita', 'coracoes', 'estrelas', 'fogos', 'bolhas', 'petalas', 'serpentina', 'moedas', 'baloes'];
// Sorteia sem repetir as três últimas — cada venda tem a sua festa
const sortearChuva = () => {
  let recentes = [];
  try { recentes = JSON.parse(localStorage.getItem('vh_confete_recentes') || '[]'); } catch { /* ok */ }
  const livres = TIPOS_CHUVA.filter(t => !recentes.includes(t));
  const t = (livres.length ? livres : TIPOS_CHUVA)[Math.floor(Math.random() * (livres.length || TIPOS_CHUVA.length))];
  try { localStorage.setItem('vh_confete_recentes', JSON.stringify([t, ...recentes].slice(0, 3))); } catch { /* ok */ }
  return t;
};

/* ═══ 🥳 DIA DE CELEBRAÇÃO — a festa GRANDE (ordens do master, 19/09):
   · "faz o CRM de todos ficar em festa, cheio de confetes e palmas, pois foi
     ultrapassada a meta do dia do setor de vacinas; quero que apareça para
     todos; confetes, fogos e boneco dançando";
   · "a cada 30 segundos seja um efeito diferente, de forma que possa
     comemorar o dia todo, parabenizando a equipe";
   · "independente da tela que cada um esteja, que seja uma tela que force
     eles a lerem e ver o festejo";
   · "monte também um texto: A Direção da Vittalis Saúde parabeniza a equipe
     pelo alcance da meta do dia".

   Como é:
   1) ABERTURA (toma a tela inteira, em qualquer página): fundo escuro, o
      cartão com o texto da Direção, valores, duas mascotes dançando, chuva
      de confete, fogos e palmas no som. Ninguém passa sem ler: o botão
      "Li e comemorei" só libera depois de 12 segundos.
   2) O DIA TODO (até 23:59 de São Luís): uma faixa dourada fixa no topo com
      a mensagem da Direção e uma frase de parabéns que muda a cada 30 s, e
      a cada 30 s um EFEITO diferente (17 atos que se revezam: chuvas,
      fogos, balões, mascote dançando ou aplaudindo). Nada bloqueia o
      trabalho: os efeitos não capturam o clique. Um toque na faixa reabre
      a abertura; 🔊 toca as palmas de novo; 🔇 cala.
   Som só na abertura (30 s) e quando a pessoa pede, senão vira tortura na
   tela de quem está atendendo.                                             */
const ABERTURA_SOM_MS = 30000;
const LEITURA_MIN_S = 12;
const TROCA_ATO_MS = 30000;

// Texto da Direção. O começo é ditado pelo master (verbatim); o resto fala
// só da equipe, do valor dela e do quanto ele acredita em cada uma (ordem
// dele, 19/09). Sem travessão, sem aspas.
const TEXTO_DIRECAO = (setorNome) =>
  `A Direção da Vittalis Saúde parabeniza a equipe pelo alcance da meta do dia do setor de ${setorNome}. ` +
  'Mas o que eu quero dizer hoje é sobre vocês. O valor desta equipe não está no número: está no cuidado com que cada uma atende, ' +
  'na paciência com cada mãe e cada pai, e na garra de não desistir de nenhuma família. ' +
  'Eu acredito em cada uma de vocês. Acredito no talento, no coração e na capacidade que vocês têm de ir muito além. ' +
  'Vocês são o maior patrimônio da Vittalis. Obrigado por serem quem são.';

// Segunda mensagem, assinada pela Dra. Nágila (ordem do master, 19/09:
// "faz outro assinado Dra Nágila"). Sem travessão, sem aspas.
// Ditado pelo master (19/09): "a meta do dia é 19 mil e a equipe
// ultrapassou; dê os parabéns e diga eu amo vocês, Dra. Nágila"; depois:
// "retire do texto criança e coloque uma mensagem mais linda do que a de
// Miécio elogiando a equipe".
const TEXTO_NAGILA = (setorNome) =>
  `Parabéns, equipe! A meta do dia do setor de ${setorNome} era de R$ 19 mil e vocês ultrapassaram! ` +
  'Mas nenhum número é capaz de medir o que vocês são. Vocês são a alma desta casa: o sorriso que acalma, ' +
  'a palavra certa na hora certa, o cuidado que transforma um atendimento em um abraço. ' +
  'Cada uma de vocês carrega um talento que me emociona e uma força que inspira todas as outras. ' +
  'Eu me orgulho de cada conquista, de cada esforço e, principalmente, de cada uma de vocês. Eu amo vocês!';

// Frases que se revezam na faixa, uma a cada 30 s
const FRASES_PARABENS = [
  'Parabéns, equipe! Meta do dia batida 🏆',
  'Vocês são incríveis. Que orgulho desse time 🩵',
  'Cada atendimento de hoje fez a diferença 👏',
  'A meta caiu porque vocês não desistiram 💪',
  'Time unido bate qualquer meta 🤝',
  'Hoje o placar é nosso. Parabéns! 🎉',
  'Cuidado que vende: é assim que a Vittalis cresce 🌱',
  'Vocês fizeram o dia valer a pena ✨',
  'Palmas para cada uma de vocês 👏👏👏',
  'Que essa energia siga o dia inteiro 🔥',
  'Resultado de gente que ama o que faz 💙',
  'Mais famílias protegidas por causa de vocês 💉',
  'Uma equipe, uma meta, uma conquista 🏅',
  'A Direção agradece e comemora com vocês 🥳',
  'Essa vitória tem o nome de cada uma 🌟',
  'Orgulho define. Parabéns, time Vittalis! 🎊',
  'Dra. Nágila: parabéns, a meta de 19 mil caiu! Eu amo vocês 💗',
  'Dra. Nágila: vocês são a alma desta casa 🩺',
  'Dr. Miécio: obrigado pela dedicação e pela garra de cada uma 🩵',
];

/* Os 17 atos: cada um dura 30 s e traz um efeito diferente. Rodam em ordem
   e recomeçam, então em 8 minutos e meio a pessoa viu todos. */
const ATOS = [
  { chuvas: ['fita'], fogos: true,  mascote: 'danca-dir' },
  { chuvas: ['coracoes'],           mascote: 'danca-esq' },
  { chuvas: ['fogos'], fogos: true },
  { chuvas: ['baloes'],             mascote: 'palmas' },
  { chuvas: ['estrelas'], fogos: true },
  { chuvas: ['serpentina'],         mascote: 'danca-dir' },
  { chuvas: ['moedas'] },
  { chuvas: ['bolhas'],             mascote: 'danca-esq' },
  { chuvas: ['petalas'] },
  { chuvas: ['fita', 'estrelas'], fogos: true, mascote: 'palmas' },
  { chuvas: ['coracoes', 'baloes'] },
  { chuvas: ['fogos', 'moedas'], fogos: true, mascote: 'danca-dir' },
  { chuvas: ['serpentina', 'bolhas'] },
  { chuvas: ['estrelas', 'petalas'], mascote: 'danca-esq' },
  { chuvas: ['fita'], fogos: true },
  { chuvas: ['baloes', 'coracoes'], mascote: 'palmas' },
  { chuvas: ['fita', 'serpentina', 'fogos'], fogos: true, mascote: 'danca-dir' },
];

/* 🎵 MÚSICA DA FESTA (ordem do master, 19/09: "melhora o som, quero uma
   música bonita"). Não dá pra puxar música pronta: o CRM não carrega
   arquivo de fora e música de terceiros tem direitos. Então a melodia é
   NOSSA, composta aqui e tocada pelo sintetizador do navegador (Web Audio):
   fanfarra de abertura, melodia alegre em Dó maior sobre C, G, Am, F, baixo
   marcando o tempo, sininhos em arpejo e palmas leves só nos primeiros
   segundos. Sem arquivo, sem biblioteca. Devolve a função que cala tudo. */
const NOTA = (n) => 440 * Math.pow(2, (n - 69) / 12);           // MIDI → Hz
const N = { C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83, C6: 84, D6: 86, E6: 88 };
// Acordes por compasso (2 s cada, 120 bpm): raiz do baixo + notas do acorde
const ACORDES = [
  { baixo: 36, notas: [N.C4, N.E4, N.G4] },   // C
  { baixo: 43, notas: [N.G4, N.B4, N.D5] },   // G
  { baixo: 45, notas: [N.A4, N.C5, N.E5] },   // Am
  { baixo: 41, notas: [N.F4, N.A4, N.C5] },   // F
];
// Melodia: [nota, duração em tempos]; 8 compassos de 4 tempos + final
const MELODIA = [
  [N.E5, 1], [N.G5, 1], [N.C6, 2],
  [N.D6, 1], [N.B5, 1], [N.G5, 2],
  [N.A5, 1], [N.C6, 1], [N.E6, 1.5], [N.D6, .5],
  [N.C6, 2], [N.A5, 1], [N.G5, 1],
  [N.E5, .5], [N.G5, .5], [N.C6, 1], [N.E6, 2],
  [N.D6, 1], [N.B5, 1], [N.D6, 1], [N.G5, 1],
  [N.A5, 1.5], [N.G5, .5], [N.E5, 2],
  [N.F5, 1], [N.G5, 1], [N.A5, 1], [N.B5, 1],
  [N.C6, 4],
];
const TEMPO = .5;              // segundos por tempo (120 bpm)
const DURACAO_LOOP = 36 * TEMPO; // 9 compassos = 18 s

function tocarFesta(ms) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    ctx.resume?.().catch?.(() => {});
    const master = ctx.createGain(); master.gain.value = .5; master.connect(ctx.destination);
    // Um pouco de reverb barato: eco curto e baixo, pra soar "de salão"
    const eco = ctx.createDelay(1); eco.delayTime.value = .21;
    const ecoG = ctx.createGain(); ecoG.gain.value = .18;
    eco.connect(ecoG); ecoG.connect(master); ecoG.connect(eco);
    const t0 = ctx.currentTime + .05;
    const seg = ms / 1000;

    const nota = (freq, t, dur, { tipo = 'triangle', vol = .2, ataque = .02, solta = .12, eco: comEco = true, detune = 0 } = {}) => {
      if (t > t0 + seg) return;
      const o = ctx.createOscillator(); o.type = tipo; o.frequency.value = freq; o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + ataque);
      g.gain.setValueAtTime(vol, Math.max(t + ataque, t + dur - solta));
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); g.connect(master); if (comEco) g.connect(eco);
      o.start(t); o.stop(t + dur + .02);
    };
    const palma = (t, vol) => {
      if (t > t0 + seg) return;
      const dur = .06;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600 + Math.random() * 1600; f.Q.value = .9;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(master); src.start(t);
    };

    // 🎺 Fanfarra de abertura (Dó, Mi, Sol, Dó agudo), com dobra de oitava
    const FANFARRA = [[N.C5, .25], [N.E5, .25], [N.G5, .25], [N.C6, 1.1]];
    let tf = t0;
    for (const [n, d] of FANFARRA) {
      nota(NOTA(n), tf, d * TEMPO * 1.6, { tipo: 'square', vol: .09, ataque: .01 });
      nota(NOTA(n), tf, d * TEMPO * 1.6, { tipo: 'triangle', vol: .22, ataque: .01, detune: 4 });
      nota(NOTA(n - 12), tf, d * TEMPO * 1.6, { tipo: 'triangle', vol: .12, ataque: .01 });
      tf += d * TEMPO * 1.6;
    }
    // 👏 Palmas leves só nos 5 primeiros segundos, por baixo da fanfarra
    for (let t = .05; t < 5; t += .04 + Math.random() * .08) palma(t0 + t, .06 + Math.random() * .08);

    // 🎶 A música em loop, começando depois da fanfarra
    const inicio = tf + .1;
    for (let loop = 0; inicio + loop * DURACAO_LOOP < t0 + seg; loop++) {
      const base = inicio + loop * DURACAO_LOOP;
      // Acordes, baixo e sininhos: 8 compassos rodando C G Am F, e o 9º em C
      for (let c = 0; c < 9; c++) {
        const ac = ACORDES[c === 8 ? 0 : c % 4];
        const tc = base + c * 4 * TEMPO;
        // pad do acorde (suave, com eco)
        for (const n of ac.notas) nota(NOTA(n), tc, 4 * TEMPO, { tipo: 'sine', vol: .06, ataque: .25, solta: .5 });
        // baixo marcando 1 e 3
        nota(NOTA(ac.baixo), tc, .9 * TEMPO, { tipo: 'triangle', vol: .16, ataque: .01, eco: false });
        nota(NOTA(ac.baixo), tc + 2 * TEMPO, .9 * TEMPO, { tipo: 'triangle', vol: .13, ataque: .01, eco: false });
        // sininhos em arpejo (colcheias), uma oitava acima
        for (let i = 0; i < 8; i++) {
          const n = ac.notas[i % 3] + 12;
          nota(NOTA(n), tc + i * TEMPO / 2, TEMPO * .45, { tipo: 'sine', vol: .05, ataque: .005, solta: .2 });
        }
      }
      // Melodia por cima
      let tm = base;
      for (const [n, d] of MELODIA) {
        nota(NOTA(n), tm, d * TEMPO * .95, { tipo: 'triangle', vol: .2, ataque: .015 });
        nota(NOTA(n), tm, d * TEMPO * .95, { tipo: 'sine', vol: .08, ataque: .015, detune: 6 });
        tm += d * TEMPO;
      }
    }
    return () => {
      try { master.gain.setTargetAtTime(0, ctx.currentTime, .12); setTimeout(() => ctx.close().catch(() => {}), 900); } catch { /* ok */ }
    };
  } catch { return null; }
}

const brl0 = (n) => (parseFloat(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
// Frase do título (ordem do master, 19/09: "no título é que ultrapassamos a
// meta diária que é 19 mil"). A meta vem do servidor; sem ela, 19 mil.
const fraseMeta = (festa) => `Ultrapassamos a meta diária de ${brl0(festa.meta > 0 ? festa.meta : 19000)} do setor de ${festa.setorNome || 'Vacinas'}! 🏆`;

/* A ABERTURA: tela inteira, obrigatória, com o texto da Direção */
function AberturaFesta({ festa, onLiberar, mudo, onMudo }) {
  const [seg, setSeg] = useState(LEITURA_MIN_S);
  // 🎊 Confete SEM PARAR na abertura (ordem do master, 19/09: "quero com
  // confetes"): a cada 2,4 s nasce uma chuva nova, revezando os tipos, e os
  // fogos estouram junto. Antes caía uma chuva só e a tela ficava limpa
  // enquanto a pessoa lia.
  const [tick, setTick] = useState(0);
  const calarRef = useRef(null);
  useEffect(() => {
    const t = setInterval(() => setSeg(x => (x > 0 ? x - 1 : 0)), 1000);
    const c = setInterval(() => setTick(x => x + 1), 2400);
    if (!mudo) calarRef.current = tocarFesta(ABERTURA_SOM_MS);
    return () => { clearInterval(t); clearInterval(c); calarRef.current?.(); };
  }, []); // eslint-disable-line
  const TIPOS_AB = ['fita', 'serpentina', 'estrelas', 'coracoes', 'moedas', 'fita', 'petalas', 'baloes'];
  const calar = () => { calarRef.current?.(); calarRef.current = null; onMudo(); };
  const setorNome = festa.setorNome || 'Vacinas';
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(3,32,38,.82)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <Chuva key={`c${tick}`} tipo={TIPOS_AB[tick % TIPOS_AB.length]} grande />
      <Chuva key={`d${tick}`} tipo="fita" grande />
      <Chuva key={`f${tick}`} tipo="fogos" grande />
      <MascoteDancando lado="direita" fala="Bateu a meta!" sub={`Setor de ${setorNome} 🏆`} />
      <MascoteDancando lado="esquerda" fala="Dia de celebração!" sub="Parabéns, equipe! 👏" />
      <div style={{ position: 'relative', zIndex: 3001, width: 'min(94vw, 620px)', borderRadius: 28, padding: '28px 30px 24px', textAlign: 'center', color: '#fff',
        background: 'linear-gradient(135deg,#0E8C96 0%,#00B8C0 40%,#C4973B 100%)',
        boxShadow: '0 30px 90px rgba(0,0,0,.55), 0 0 0 6px rgba(255,255,255,.35)', border: '3px solid #fff',
        animation: 'vh-mega-pop .55s cubic-bezier(.3,1.6,.5,1)' }}>
        <button onClick={calar} title={mudo ? 'Som desligado' : 'Desligar o som'}
          style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(255,255,255,.22)', border: 'none', borderRadius: 9, color: '#fff', cursor: 'pointer', padding: '5px 9px', fontSize: 13, fontWeight: 900 }}>{mudo ? '🔇' : '🔊'}</button>
        <div style={{ fontSize: 62, lineHeight: 1, animation: 'vh-mega-trofeu 1s ease-in-out infinite' }}>🏆</div>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -.5, marginTop: 8, textShadow: '0 3px 12px rgba(0,0,0,.35)' }}>{festa.titulo || '🥳 Dia de celebração!'}</div>
        <div style={{ fontSize: 19, fontWeight: 900, marginTop: 8, opacity: .98, textShadow: '0 2px 8px rgba(0,0,0,.3)' }}>{fraseMeta(festa)}</div>
        {/* 📜 A mensagem da Direção, pra ler */}
        <div style={{ margin: '16px auto 0', background: 'rgba(255,255,255,.94)', color: '#06424A', borderRadius: 16, padding: '14px 18px', textAlign: 'left', fontSize: 14.5, lineHeight: 1.55, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}>
          <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: .8, color: '#92400e', marginBottom: 6 }}>📜 Mensagem da Direção</div>
          {TEXTO_DIRECAO(setorNome)}
          <div style={{ marginTop: 8, fontWeight: 900, color: '#0E8C96' }}>Dr. Miécio, Direção da Vittalis Saúde 🩵</div>
        </div>
        {/* 💌 A segunda mensagem, da Dra. Nágila */}
        <div style={{ margin: '10px auto 0', background: 'rgba(255,255,255,.94)', color: '#06424A', borderRadius: 16, padding: '14px 18px', textAlign: 'left', fontSize: 14.5, lineHeight: 1.55, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}>
          <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: .8, color: '#be185d', marginBottom: 6 }}>💌 Mensagem da Dra. Nágila</div>
          {TEXTO_NAGILA(setorNome)}
          <div style={{ marginTop: 8, fontWeight: 900, color: '#be185d' }}>Eu amo vocês! Dra. Nágila 💗</div>
        </div>
        {festa.vendido > 0 && festa.meta > 0 && festa.vendido >= festa.meta && (
          <div style={{ display: 'inline-flex', gap: 16, marginTop: 14, background: 'rgba(255,255,255,.18)', borderRadius: 14, padding: '8px 16px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 800, opacity: .9 }}>Vendido hoje <b style={{ fontSize: 17, display: 'block' }}>{brl0(festa.vendido)}</b></span>
            {festa.meta > 0 && <span style={{ fontSize: 12, fontWeight: 800, opacity: .9 }}>Meta do dia <b style={{ fontSize: 17, display: 'block' }}>{brl0(festa.meta)}</b></span>}
            {festa.meta > 0 && <span style={{ fontSize: 12, fontWeight: 800, opacity: .9 }}>Passou em <b style={{ fontSize: 17, display: 'block' }}>{Math.max(0, Math.round(((festa.vendido || 0) / festa.meta - 1) * 100))}%</b></span>}
          </div>
        )}
        <div style={{ fontSize: 24, marginTop: 12, animation: 'vh-mega-palmas .5s ease-in-out infinite', letterSpacing: 4 }}>👏👏👏</div>
        <button onClick={seg > 0 ? undefined : onLiberar} disabled={seg > 0}
          style={{ marginTop: 12, border: 'none', borderRadius: 14, padding: '12px 26px', fontSize: 15, fontWeight: 900, cursor: seg > 0 ? 'wait' : 'pointer',
            background: seg > 0 ? 'rgba(255,255,255,.35)' : '#fff', color: seg > 0 ? 'rgba(255,255,255,.9)' : '#0E8C96',
            boxShadow: seg > 0 ? 'none' : '0 10px 30px rgba(0,0,0,.3)', transition: 'all .3s' }}>
          {seg > 0 ? `Lendo a mensagem… ${seg}s` : '🎉 Li e comemorei! Voltar ao trabalho'}
        </button>
        <div style={{ fontSize: 11.5, marginTop: 8, opacity: .85 }}>A festa segue o dia inteiro na faixa do topo, com efeitos novos a cada 30 segundos.</div>
      </div>
      <style>{`
        @keyframes vh-mega-pop    { 0% { transform: scale(.4) rotate(-6deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
        @keyframes vh-mega-trofeu { 0%,100% { transform: scale(1) rotate(-8deg); } 50% { transform: scale(1.18) rotate(8deg); } }
        @keyframes vh-mega-palmas { 0%,100% { transform: scale(1); } 50% { transform: scale(1.25); } }
      `}</style>
    </div>
  );
}

/* O DIA TODO: faixa no topo + um ato diferente a cada 30 s */
function FestaDoDia({ festa, api, user, onReabrir, mudo, onMudo }) {
  const [ato, setAto] = useState(() => Math.floor(Date.now() / TROCA_ATO_MS) % ATOS.length);
  const [lidas, setLidas] = useState(null); // 📖 só gestão: quem leu / quem falta
  const calarRef = useRef(null);
  const ehGestao = user?.role === 'master' || user?.role === 'supervisor';
  useEffect(() => {
    // Todo mundo troca de ato no mesmo instante (relógio), a cada 30 s
    const t = setInterval(() => setAto(Math.floor(Date.now() / TROCA_ATO_MS) % ATOS.length), 1000);
    let parar = null;
    if (ehGestao && api) {
      const ler = () => api.get('/extras/festa-ativa/lidas').then(setLidas).catch(() => {});
      ler(); parar = aoVivo(ler, 45000);
    }
    return () => { clearInterval(t); calarRef.current?.(); parar?.(); };
  }, []); // eslint-disable-line
  const a = ATOS[ato];
  const frase = FRASES_PARABENS[ato % FRASES_PARABENS.length];
  const tocar = () => { calarRef.current?.(); calarRef.current = tocarFesta(Math.round((DURACAO_LOOP + 4) * 1000)); };
  const calar = () => { calarRef.current?.(); calarRef.current = null; onMudo(); };
  return (
    <>
      {a.chuvas.map((c, i) => <Chuva key={`${ato}-${c}-${i}`} tipo={c} grande={i === 0} />)}
      {a.mascote === 'danca-dir' && <MascoteDancando key={`m${ato}`} lado="direita" fala="Bateu a meta!" sub={`Setor de ${festa.setorNome || 'Vacinas'} 🏆`} />}
      {a.mascote === 'danca-esq' && <MascoteDancando key={`m${ato}`} lado="esquerda" fala="Dia de celebração!" sub="Parabéns, equipe! 👏" />}
      {a.mascote === 'palmas' && <MascoteAplaudindo key={`m${ato}`} nome="equipe" valor="" />}
      {/* Faixa fixa no topo */}
      <div onClick={onReabrir} title="Abrir a mensagem da Direção de novo"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1500, cursor: 'pointer',
          background: 'linear-gradient(90deg,#92400e,#C4973B 35%,#0E8C96 75%,#00B8C0)', color: '#fff',
          padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 18px rgba(0,0,0,.3)', fontSize: 13 }}>
        <span style={{ fontSize: 18, animation: 'vh-mega-trofeu 1s ease-in-out infinite', flexShrink: 0 }}>🏆</span>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
          <div style={{ fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            🥳 Dia de celebração! {fraseMeta(festa)} Toque aqui pra reler as mensagens.
          </div>
          <div key={ato} style={{ fontWeight: 800, fontSize: 12.5, opacity: .95, animation: 'vh-frase-entra .6s ease-out', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{frase}</div>
          {/* 📖 Gestão vê quem leu a mensagem e quem ainda falta */}
          {ehGestao && lidas && (
            <div style={{ fontSize: 11, fontWeight: 800, opacity: .95, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              📖 Leram {lidas.leram.length} de {lidas.total}
              {lidas.faltam.length ? ` · faltam: ${lidas.faltam.map(u => String(u.nome).split(' ')[0]).join(', ')}` : ' · todo mundo leu ✅'}
            </div>
          )}
        </div>
        <button onClick={(e) => { e.stopPropagation(); if (mudo) { onMudo(); } tocar(); }} title="Tocar a música da festa"
          style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '4px 8px', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>🎵</button>
        <button onClick={(e) => { e.stopPropagation(); calar(); }} title="Calar o som"
          style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '4px 8px', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>🔇</button>
      </div>
      <style>{`
        @keyframes vh-mega-trofeu { 0%,100% { transform: scale(1) rotate(-8deg); } 50% { transform: scale(1.18) rotate(8deg); } }
        @keyframes vh-frase-entra { 0% { transform: translateY(8px); opacity: 0; } 100% { transform: none; opacity: 1; } }
      `}</style>
    </>
  );
}

function MegaFesta({ festa, api, user }) {
  // id + versão: quando o servidor sobe a versão (texto/música novos), a
  // abertura volta pra todo mundo (ordem do master, 19/09)
  const chaveLida = `vh_festa_lida:${festa.id}:${festa.versao || 1}`;
  const [lida, setLida] = useState(() => { try { return !!localStorage.getItem(chaveLida); } catch { return false; } });
  const [mudo, setMudo] = useState(() => { try { return localStorage.getItem('vh_festa_mudo') === festa.id; } catch { return false; } });
  const marcarMudo = () => { setMudo(true); try { localStorage.setItem('vh_festa_mudo', festa.id); } catch { /* ok */ } };
  const desmutar = () => { setMudo(false); try { localStorage.removeItem('vh_festa_mudo'); } catch { /* ok */ } };
  const liberar = () => {
    setLida(true); try { localStorage.setItem(chaveLida, '1'); } catch { /* ok */ }
    // 📖 Avisa o servidor que leu: o master vê quem leu e quem falta
    api?.post('/extras/festa-ativa/lida', { id: festa.id }).catch(() => {});
  };
  if (!lida) return <AberturaFesta festa={festa} onLiberar={liberar} mudo={mudo} onMudo={marcarMudo} />;
  return <FestaDoDia festa={festa} api={api} user={user} onReabrir={() => setLida(false)} mudo={mudo} onMudo={mudo ? desmutar : marcarMudo} />;
}

const festaVigente = (f) => !!(f?.id && f.ate && new Date(f.ate).getTime() > Date.now());

export default function CelebracaoGlobal() {
  const { user } = useAuth();
  const api = useApi();
  const [festa, setFesta] = useState(null); // { titulo, texto, tipo, pct }
  const [mega, setMega] = useState(null);   // 🥳 a festa do dia (vale até o `ate`)
  const timerRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const BASE = import.meta.env.VITE_API_URL || '';
    const tk = localStorage.getItem('vh_token') || '';
    const socket = io(BASE, { transports: ['websocket', 'polling'], auth: { token: tk } });

    socket.on('celebracao', (c) => {
      if (!c) return;
      // 🥳 Meta do dia: é pra todo mundo, sem filtro de setor, e fica o dia todo
      if (c.festa === 'meta_dia') { if (festaVigente(c)) setMega(c); return; }
      // individual: só quem fez a ação comemora
      if (c.tipo === 'individual' && c.userId && c.userId !== user.id) return;
      // setor: equipe do setor + gestão
      if (c.tipo === 'setor' && user.role === 'atendente' && user.setor && user.setor !== c.setor) return;
      setFesta({ ...c, chuva: sortearChuva() });
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFesta(null), c.tipo === 'marco' ? 4200 : c.festa === 'palmas' ? 4600 : 2800);
    });
    socket.on('festa_encerrada', () => setMega(null));

    // Quem abre o CRM depois da festa começar (até o fim do dia) também
    // comemora; e a festa some sozinha quando o dia vira.
    const conferir = () => api.get('/extras/festa-ativa').then(f => setMega(festaVigente(f) ? f : null)).catch(() => {});
    conferir();
    const pararPoll = aoVivo(conferir, 30000); // 30 s: "apareça agora, independente do que estão fazendo"
    const relogio = setInterval(() => setMega(m => (m && !festaVigente(m) ? null : m)), 60000);

    return () => { socket.disconnect(); clearTimeout(timerRef.current); pararPoll(); clearInterval(relogio); };
  }, [user]); // eslint-disable-line

  // A festa do dia convive com as comemorações de venda (a venda aparece por cima)
  const megaEl = mega ? <MegaFesta key={`${mega.id}:${mega.versao || 1}`} festa={mega} api={api} user={user} /> : null;
  if (!festa) return megaEl;
  const grande = festa.tipo === 'marco';

  return (
    <>
      {megaEl}
      <Chuva tipo={festa.chuva || 'fita'} grande={grande} />
      {/* 👏 A Vitinha aparece batendo palma quando é venda (ordem do master, 28/08) */}
      {festa.festa === 'palmas' && <MascoteAplaudindo nome={festa.quem} valor={festa.valorTxt} />}
      <div style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
        animation: 'vh-pop .35s cubic-bezier(.3,1.6,.5,1)' }}>
        <div style={{ background: 'var(--card)', borderRadius: 18, padding: '16px 26px', textAlign: 'center',
          border: '2px solid var(--tq)', boxShadow: '0 12px 40px rgba(0,184,192,.35)', minWidth: 280, maxWidth: 420 }}>
          <div style={{ fontSize: 30, lineHeight: 1, marginBottom: 6 }}>🎊</div>
          <div style={{ fontWeight: 800, fontSize: grande ? 18 : 16, color: 'var(--txt)' }}>{festa.titulo}</div>
          <div style={{ fontSize: 13, color: 'var(--txt2)', marginTop: 3 }}>{festa.texto}</div>
          {festa.pct != null && (
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 8, borderRadius: 6, background: 'var(--tq4)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(festa.pct, 100)}%`, height: '100%', borderRadius: 6,
                  background: 'linear-gradient(90deg, var(--tq), var(--pet))', transition: 'width .8s' }} />
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tq2)', marginTop: 4 }}>{festa.pct}% da meta do mês</div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes vh-pop { 0% { transform: translateX(-50%) scale(.6); opacity: 0; } 100% { transform: translateX(-50%) scale(1); opacity: 1; } }`}</style>
    </>
  );
}
