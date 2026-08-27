/* 💟 Gera as 50 figurinhas da Vittalis com a LOGOMARCA OFICIAL (vertical:
   diamante em cima, "Vittalis Saúde" embaixo) — ordem do master, 27/08, depois
   do flyer. Mesmos nomes de arquivo de antes: a Biblioteca continua achando. */
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

const RAIZ = '/home/user/vittahub';
const SAIDA = path.join(RAIZ, 'backend/src/assets/figurinhas');
const logo = fs.readFileSync(path.join(RAIZ, 'frontend/public/logos/logo-v-white.png')).toString('base64');

/* Paletas da marca (as mesmas do flyer): turquesa da casa, petróleo profundo,
   e o dourado só nas datas de comemorar. */
const P = {
  tq:   ['#00B8C0', '#0E8C96'],
  pet:  ['#0E8C96', '#06424A'],
  fund: ['#06424A', '#032B30'],
  ceu:  ['#22d3ee', '#0891b2'],
  ouro: ['#C4973B', '#8a6420'],
  rosa: ['#e879a6', '#b8446f'],
  verde:['#34d399', '#0f766e'],
  noite:['#1e3a5f', '#0b1f36'],
};

const F = (nome, emoji, frase, cor) => ({ nome, emoji, frase, cor });
const FIGS = [
  F('bom-dia','🌅','Bom dia!','tq'),
  F('boa-tarde','☀️','Boa tarde!','ceu'),
  F('boa-noite','🌙','Boa noite!','noite'),
  F('bom-descanso','😴','Bom descanso','noite'),
  F('excelente-semana','✨','Excelente semana','tq'),
  F('otimo-fim-de-semana','🌈','Ótimo fim de semana','ceu'),
  F('agendamento-confirmado','✅','Agendamento confirmado','verde'),
  F('horario-reservado','🗓️','Horário reservado','pet'),
  F('anota-na-agenda','📝','Anota na agenda','pet'),
  F('confirmamos-vespera','🔔','Confirmamos na véspera','tq'),
  F('te-esperamos','💙','Te esperamos!','tq'),
  F('ate-o-grande-dia','⏳','Até o grande dia','ceu'),
  F('contagem-regressiva','⏰','Contagem regressiva','ceu'),
  F('chegue-antes','🕘','Chegue 10 min antes','pet'),
  F('leve-a-caderneta','📘','Leve a caderneta','pet'),
  F('caderneta-em-dia','📗','Caderneta em dia','verde'),
  F('ta-tudo-certo','👌','Tá tudo certo!','verde'),
  F('vamos-ate-voce','🏠','Vamos até você','tq'),
  F('equipe-pronta','👩‍⚕️','Equipe pronta','tq'),
  F('estamos-aqui','🤝','Estamos aqui','tq'),
  F('conte-conosco','💫','Conte conosco','pet'),
  F('prazer-cuidar','💗','Prazer em cuidar','rosa'),
  F('de-olho-em-voces','👀','De olho em vocês','pet'),
  F('como-passou','🤗','Como ele passou?','rosa'),
  F('protegidinho','🛡️','Protegidinho!','verde'),
  F('dia-de-proteger','💉','Dia de proteger','tq'),
  F('dia-de-heroi','🦸','Dia de herói','ceu'),
  F('dia-de-heroina','🦸‍♀️','Dia de heroína','rosa'),
  F('certificado-coragem','🏅','Certificado de coragem','ouro'),
  F('buzzy','🐝','Com Buzzy dói menos','ouro'),
  F('crescendo-forte','🌱','Crescendo forte','verde'),
  F('orgulho-evolucao','📈','Que evolução!','verde'),
  F('cada-sessao-evolucao','🧩','Cada sessão, uma evolução','pet'),
  F('avaliar-e-cuidar','🔎','Avaliar é cuidar','pet'),
  F('saude-para-familia','👨‍👩‍👧','Saúde pra família toda','tq'),
  F('familia-vittalis','💎','Bem-vindo à família Vittalis','fund'),
  F('bem-vindo','🎉','Seja muito bem-vindo!','tq'),
  F('voces-especiais','⭐','Vocês são especiais','ouro'),
  F('obrigada-confianca','🙏','Obrigada pela confiança','rosa'),
  F('gratidao','💛','Gratidão!','ouro'),
  F('indique-uma-amiga','💌','Indique uma amiga','rosa'),
  F('tem-presente','🎁','Tem presente pra vocês','ouro'),
  F('feliz-aniversario','🎂','Feliz aniversário!','ouro'),
  F('parabens-mamae','👶','Parabéns, mamãe!','rosa'),
  F('parabens-papai','👨‍👦','Parabéns, papai!','ceu'),
  F('deus-abencoe','🕊️','Deus abençoe','fund'),
  F('mes-abencoado','🙌','Mês abençoado','fund'),
  F('paz-no-lar','🕯️','Paz no seu lar','noite'),
  F('ate-breve','👋','Até breve!','tq'),
  F('imprevisto-remarca','🔄','Imprevisto? A gente remarca','pet'),
];

const pagina = (f) => {
  const [c1, c2] = P[f.cor] || P.tq;
  const tam = f.frase.length > 24 ? 36 : f.frase.length > 15 ? 42 : 50;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:512px;height:512px;background:transparent}
  .card{width:512px;height:512px;border-radius:76px;position:relative;overflow:hidden;
    background:linear-gradient(150deg,${c1} 0%, ${c2} 100%);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    font-family:'DejaVu Sans','Noto Sans',Arial,sans-serif;padding:30px 30px 132px;}
  /* brilho suave + diamante d'água: dá o ar "premium" sem poluir */
  .card::before{content:'';position:absolute;top:-120px;left:-90px;width:420px;height:420px;border-radius:50%;
    background:radial-gradient(circle,rgba(255,255,255,.20),transparent 68%)}
  .card::after{content:'';position:absolute;right:-70px;bottom:-70px;width:300px;height:300px;border-radius:50%;
    background:radial-gradient(circle,rgba(255,255,255,.10),transparent 70%)}
  .emoji{font-size:118px;line-height:1;position:relative;z-index:2;
    filter:drop-shadow(0 8px 18px rgba(0,0,0,.28))}
  .frase{position:relative;z-index:2;margin-top:18px;color:#fff;text-align:center;
    font-size:${tam}px;font-weight:800;line-height:1.16;letter-spacing:-.5px;
    text-shadow:0 3px 12px rgba(0,0,0,.30)}
  .rodape{position:absolute;left:0;right:0;bottom:28px;display:flex;justify-content:center;z-index:2}
  .rodape img{height:78px;opacity:.97;filter:drop-shadow(0 2px 6px rgba(0,0,0,.25))}
  </style></head><body><div class="card">
    <div class="emoji">${f.emoji}</div>
    <div class="frase">${f.frase}</div>
    <div class="rodape"><img src="data:image/png;base64,${logo}"/></div>
  </div></body></html>`;
};

const b = await puppeteer.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const pg = await b.newPage();
await pg.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
let n = 0;
for (const f of FIGS) {
  await pg.setContent(pagina(f), { waitUntil: 'load' });
  const buf = await pg.screenshot({ type: 'webp', quality: 92, omitBackground: true });
  fs.writeFileSync(path.join(SAIDA, `vitta__${f.nome}.webp`), buf);
  n++;
}
await b.close();
console.log('figurinhas geradas:', n);
