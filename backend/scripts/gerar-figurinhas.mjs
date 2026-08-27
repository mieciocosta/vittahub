/* 💟 FIGURINHAS DA VITTALIS — gerador oficial.
   Logomarca VERTICAL (diamante em cima, "Vittalis Saúde" embaixo), como no
   flyer da casa (ordem do master, 27/08).

   ORDEM IMPORTA (ordem do master: "as mais importantes em cima, as menos
   importantes embaixo"). O número no começo do arquivo é a posição na aba do
   chat — ele NÃO entra no título, só manda na fila. Pra promover uma
   figurinha, é só mudar o número aqui e rodar de novo:
       node scripts/gerar-figurinhas.mjs                                     */
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

const RAIZ = '/home/user/vittahub';
const SAIDA = path.join(RAIZ, 'backend/src/assets/figurinhas');
const logo = fs.readFileSync(path.join(RAIZ, 'frontend/public/logos/logo-v-white.png')).toString('base64');

// Paletas da marca (as do flyer). Dourado só no que é de comemorar.
const P = {
  tq:   ['#00B8C0', '#0E8C96'],
  pet:  ['#0E8C96', '#06424A'],
  fund: ['#0b5d68', '#032B30'],
  ceu:  ['#22d3ee', '#0e7490'],
  ouro: ['#d1a548', '#8a6420'],
  rosa: ['#ef8ab0', '#b8446f'],
  verde:['#34d399', '#0f766e'],
  noite:['#274b7a', '#0b1f36'],
};

let n = 0;
const F = (emoji, frase, nome, cor) => ({ ordem: (n += 10), emoji, frase, nome, cor });

/* ── A FILA (de cima pra baixo na aba do chat) ─────────────────────────────
   1º os cumprimentos do dia a dia, depois bênção e parabéns, depois família,
   e só então o operacional (agenda, vacina, terapia) e as de despedida. */
const FIGS = [
  F('🌅','Bom dia!','bom-dia','tq'),
  F('☀️','Boa tarde!','boa-tarde','ceu'),
  F('🌙','Boa noite!','boa-noite','noite'),
  F('😘','Beijos!','beijos','rosa'),
  F('🤗','Um abraço!','abraco','tq'),
  F('🙏','Abençoado dia','abencoado-dia','fund'),
  F('✨','Abençoada semana','abencoada-semana','fund'),
  F('💪','Excelente semana','excelente-semana','tq'),
  F('🎊','Excelente final de semana','excelente-final-semana','ceu'),
  F('🌈','Ótimo fim de semana','otimo-fim-de-semana','ceu'),
  F('😴','Bom descanso','bom-descanso','noite'),
  F('🎉','Parabéns!','parabens','ouro'),
  F('🎂','Feliz aniversário!','feliz-aniversario','ouro'),
  F('👶','Parabéns, mamãe!','parabens-mamae','rosa'),
  F('👨‍👦','Parabéns, papai!','parabens-papai','ceu'),
  F('💕','Linda família','linda-familia','rosa'),
  F('💎','Bem-vindo à família Vittalis','familia-vittalis','fund'),
  F('👑','Nossa princesa','nossa-princesa','rosa'),
  F('🤴','Nosso príncipe','nosso-principe','ceu'),
  F('💛','Gratidão!','gratidao','ouro'),
  F('🙌','Obrigada pela confiança','obrigada-confianca','rosa'),
  F('⭐','Vocês são especiais','voces-especiais','ouro'),
  F('🕊️','Deus abençoe','deus-abencoe','fund'),
  F('✝️','Mês abençoado','mes-abencoado','fund'),
  F('🕯️','Paz no seu lar','paz-no-lar','noite'),
  F('🤗','Seja muito bem-vindo!','bem-vindo','tq'),
  F('✅','Agendamento confirmado','agendamento-confirmado','verde'),
  F('🗓️','Horário reservado','horario-reservado','pet'),
  F('💙','Te esperamos!','te-esperamos','tq'),
  F('🔔','Confirmamos na véspera','confirmamos-vespera','tq'),
  F('📝','Anota na agenda','anota-na-agenda','pet'),
  F('⏰','Contagem regressiva','contagem-regressiva','ceu'),
  F('⏳','Até o grande dia','ate-o-grande-dia','ceu'),
  F('🕘','Chegue 10 min antes','chegue-antes','pet'),
  F('📘','Leve a caderneta','leve-a-caderneta','pet'),
  F('📗','Caderneta em dia','caderneta-em-dia','verde'),
  F('👌','Tá tudo certo!','ta-tudo-certo','verde'),
  F('🏠','Vamos até você','vamos-ate-voce','tq'),
  F('🔄','Imprevisto? A gente remarca','imprevisto-remarca','pet'),
  F('🩺','Consulta confirmada','consulta-confirmada','pet'),
  F('👩‍⚕️','Dia da consulta','dia-da-consulta','pet'),
  F('👶','Primeira consulta do bebê','primeira-consulta','ceu'),
  F('🧾','Leve os exames','leve-os-exames','pet'),
  F('🔁','Retorno marcado','retorno-marcado','pet'),
  F('📄','Receita enviada','receita-enviada','verde'),
  F('📏','Peso e altura em dia','peso-e-altura','verde'),
  F('💬','Dúvida? Chama a gente','duvida-chama','tq'),
  F('🧠','Cada fase tem seu cuidado','cada-fase-cuidado','pet'),
  F('💉','Dia de proteger','dia-de-proteger','tq'),
  F('🛡️','Protegidinho!','protegidinho','verde'),
  F('🦸','Dia de herói','dia-de-heroi','ceu'),
  F('🦸‍♀️','Dia de heroína','dia-de-heroina','rosa'),
  F('🏅','Certificado de coragem','certificado-coragem','ouro'),
  F('🐝','Com Buzzy dói menos','buzzy','ouro'),
  F('🌱','Crescendo forte','crescendo-forte','verde'),
  F('📈','Que evolução!','orgulho-evolucao','verde'),
  F('🧩','Cada sessão, uma evolução','cada-sessao-evolucao','pet'),
  F('🔎','Avaliar é cuidar','avaliar-e-cuidar','pet'),
  F('👨‍👩‍👧','Saúde pra família toda','saude-para-familia','tq'),
  F('👩‍⚕️','Equipe pronta','equipe-pronta','tq'),
  F('🤝','Estamos aqui','estamos-aqui','tq'),
  F('💫','Conte conosco','conte-conosco','pet'),
  F('💗','Prazer em cuidar','prazer-cuidar','rosa'),
  F('👀','De olho em vocês','de-olho-em-voces','pet'),
  F('🥰','Como ele passou?','como-passou','rosa'),
  F('💌','Indique uma amiga','indique-uma-amiga','rosa'),
  F('🎁','Tem presente pra vocês','tem-presente','ouro'),
  F('👋','Até breve!','ate-breve','tq'),
];

const pagina = (f) => {
  const [c1, c2] = P[f.cor] || P.tq;
  const tam = f.frase.length > 24 ? 35 : f.frase.length > 15 ? 41 : 49;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:512px;height:512px;background:transparent}
  .card{width:512px;height:512px;border-radius:76px;position:relative;overflow:hidden;
    background:linear-gradient(150deg,${c1} 0%, ${c2} 100%);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    font-family:'DejaVu Sans','Noto Sans',Arial,sans-serif;padding:30px 30px 130px;}
  /* luz de cima e sombra de baixo: dá volume sem sujar o fundo */
  .luz{position:absolute;top:-130px;left:-90px;width:430px;height:430px;border-radius:50%;
    background:radial-gradient(circle,rgba(255,255,255,.22),transparent 68%)}
  .sombra{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 8%,transparent 42%,rgba(0,0,0,.22) 100%)}
  /* moldura fina por dentro: o detalhe que faz parecer acabado */
  .moldura{position:absolute;inset:16px;border:1.6px solid rgba(255,255,255,.26);border-radius:62px;pointer-events:none}
  .bolha{position:relative;z-index:2;width:186px;height:186px;border-radius:50%;
    background:rgba(255,255,255,.14);border:1.6px solid rgba(255,255,255,.30);
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 10px 28px rgba(0,0,0,.18) inset, 0 6px 20px rgba(0,0,0,.14)}
  .emoji{font-size:108px;line-height:1;filter:drop-shadow(0 6px 14px rgba(0,0,0,.30))}
  .frase{position:relative;z-index:2;margin-top:22px;color:#fff;text-align:center;
    font-size:${tam}px;font-weight:800;line-height:1.15;letter-spacing:-.4px;
    text-shadow:0 3px 12px rgba(0,0,0,.30);max-width:420px}
  .rodape{position:absolute;left:0;right:0;bottom:26px;display:flex;flex-direction:column;align-items:center;z-index:2}
  .risco{width:118px;height:1.4px;background:rgba(255,255,255,.34);margin-bottom:13px}
  .rodape img{height:74px;opacity:.98;filter:drop-shadow(0 2px 6px rgba(0,0,0,.25))}
  </style></head><body><div class="card">
    <div class="luz"></div><div class="sombra"></div><div class="moldura"></div>
    <div class="bolha"><span class="emoji">${f.emoji}</span></div>
    <div class="frase">${f.frase}</div>
    <div class="rodape"><span class="risco"></span><img src="data:image/png;base64,${logo}"/></div>
  </div></body></html>`;
};

// Limpa a leva anterior (os nomes mudam de posição a cada ajuste de ordem)
for (const f of fs.readdirSync(SAIDA)) if (f.startsWith('vitta__')) fs.unlinkSync(path.join(SAIDA, f));

const b = await puppeteer.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const pg = await b.newPage();
await pg.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
for (const f of FIGS) {
  await pg.setContent(pagina(f), { waitUntil: 'load' });
  const buf = await pg.screenshot({ type: 'webp', quality: 92, omitBackground: true });
  fs.writeFileSync(path.join(SAIDA, `vitta__${String(f.ordem).padStart(3, '0')}-${f.nome}.webp`), buf);
}
await b.close();
console.log('figurinhas geradas:', FIGS.length);
