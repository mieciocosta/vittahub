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
  roxo: ['#a855f7', '#6d28d9'],
};

let n = 0;
/* O grupo vira o PREFIXO do arquivo e, no painel, a aba de cima (ordem do
   master, 27/08: "deixa um botão lá em cima só pra figuras de consultas e
   terapias"). vitta = Vittalis Premium (as do dia a dia). */
const F = (emoji, frase, nome, cor, grupo = 'vitta') => ({ ordem: (n += 10), emoji, frase, nome, cor, grupo });

/* ── A FILA (de cima pra baixo na aba do chat) ─────────────────────────────
   1º os cumprimentos do dia a dia, depois bênção e parabéns, depois família,
   e só então o operacional (agenda, vacina, terapia) e as de despedida. */
/* ── AS CATEGORIAS (ordem do master, 27/08: "classifica essas figurinhas —
   Bom dia 10 modelos, Boa tarde 10, Carinhosos 10, Agendamento de vacinação 10,
   Agendamento de consultas 10, Confirmação de agendamento…"). Dez de cada, pra
   atendente nunca repetir a mesma figurinha no mesmo dia. A ordem das
   categorias aqui é a ordem das abas no chat. ────────────────────────────── */
const CATEGORIAS = [
  { prefixo: 'bomdia', cor: 'tq', itens: [
    ['🌅', 'Bom dia!', 'bom-dia'],
    ['☕', 'Bom dia, família!', 'bom-dia-familia'],
    ['🌞', 'Que seu dia seja lindo', 'dia-lindo'],
    ['💙', 'Bom dia com carinho', 'bom-dia-carinho'],
    ['🐣', 'Bom dia, pequeno!', 'bom-dia-pequeno'],
    ['✨', 'Comece o dia sorrindo', 'comece-sorrindo'],
    ['🌻', 'Dia de coisa boa', 'dia-de-coisa-boa'],
    ['🍼', 'Bom dia, mamãe!', 'bom-dia-mamae'],
    ['💪', 'Dia de cuidar da saúde', 'dia-de-cuidar'],
    ['🌈', 'Bom dia, tudo bem por aí?', 'bom-dia-tudo-bem'],
  ] },
  { prefixo: 'boatarde', cor: 'ceu', itens: [
    ['☀️', 'Boa tarde!', 'boa-tarde'],
    ['🌤️', 'Boa tarde, família!', 'boa-tarde-familia'],
    ['💛', 'Boa tarde com carinho', 'boa-tarde-carinho'],
    ['🧸', 'Boa tarde, pequeno!', 'boa-tarde-pequeno'],
    ['🌼', 'Tarde abençoada', 'tarde-abencoada'],
    ['🍃', 'Tarde tranquila pra vocês', 'tarde-tranquila'],
    ['😊', 'Passando pra dar um oi', 'passando-oi'],
    ['📞', 'Boa tarde, posso ajudar?', 'boa-tarde-ajudar'],
    ['🩵', 'Boa tarde, mamãe!', 'boa-tarde-mamae'],
    ['⏰', 'Boa tarde, já pensou no horário?', 'boa-tarde-horario'],
  ] },
  { prefixo: 'boanoite', cor: 'noite', itens: [
    ['🌙', 'Boa noite!', 'boa-noite'],
    ['⭐', 'Boa noite e bons sonhos', 'boa-noite-bons-sonhos'],
    ['😴', 'Bom descanso', 'bom-descanso'],
    ['🌛', 'Boa noite, pequeno!', 'boa-noite-pequeno'],
    ['🕯️', 'Paz no seu lar', 'paz-no-lar'],
    ['💤', 'Descanse bem', 'descanse-bem'],
    ['🤍', 'Boa noite com carinho', 'boa-noite-carinho'],
    ['🛏️', 'Boa noite, mamãe!', 'boa-noite-mamae'],
    ['🌜', 'Até amanhã!', 'ate-amanha'],
    ['🙏', 'Noite abençoada', 'noite-abencoada'],
  ] },
  { prefixo: 'carinhosos', cor: 'rosa', itens: [
    ['😘', 'Beijos!', 'beijos'],
    ['🤗', 'Um abraço!', 'abraco'],
    ['💗', 'Prazer em cuidar de vocês', 'prazer-cuidar'],
    ['👑', 'Nossa princesa', 'nossa-princesa'],
    ['🤴', 'Nosso príncipe', 'nosso-principe'],
    ['💕', 'Linda família', 'linda-familia'],
    ['🙏', 'Obrigada pela confiança', 'obrigada-confianca'],
    ['⭐', 'Vocês são especiais', 'voces-especiais'],
    ['🥰', 'Como ele passou?', 'como-passou'],
    ['💫', 'Conte conosco', 'conte-conosco'],
  ] },
  { prefixo: 'abencoados', cor: 'fund', itens: [
    ['🙏', 'Abençoado dia', 'abencoado-dia'],
    ['✨', 'Abençoada semana', 'abencoada-semana'],
    ['🕊️', 'Deus abençoe', 'deus-abencoe'],
    ['✝️', 'Mês abençoado', 'mes-abencoado'],
    ['💪', 'Excelente semana', 'excelente-semana'],
    ['🎊', 'Excelente final de semana', 'excelente-final-semana'],
    ['🌈', 'Ótimo fim de semana', 'otimo-fim-de-semana'],
    ['🤲', 'Saúde e paz pra vocês', 'saude-e-paz'],
    ['💎', 'Bem-vindo à família Vittalis', 'familia-vittalis'],
    ['🍀', 'Que venha coisa boa', 'venha-coisa-boa'],
  ] },
  { prefixo: 'agvacinas', cor: 'tq', itens: [
    ['💉', 'Vamos agendar a vacina?', 'vamos-agendar-vacina'],
    ['🗓️', 'Tenho horário essa semana', 'horario-essa-semana'],
    ['🏠', 'Vamos até você', 'vamos-ate-voce'],
    ['📋', 'Monto o plano vacinal pra você', 'monto-plano-vacinal'],
    ['🛡️', 'Proteção na hora certa', 'protecao-hora-certa'],
    ['📘', 'Me manda a caderneta?', 'manda-caderneta'],
    ['🍼', 'Chegou a idade da próxima dose', 'idade-proxima-dose'],
    ['⏳', 'Não deixe a dose atrasar', 'nao-deixe-atrasar'],
    ['👶', 'Qual a idade do bebê?', 'qual-idade-bebe'],
    ['🌟', 'Manhã ou tarde fica melhor?', 'manha-ou-tarde-vacina'],
  ] },
  { prefixo: 'agconsultas', cor: 'pet', itens: [
    ['🩺', 'Vamos marcar a consulta?', 'vamos-marcar-consulta'],
    ['👩‍⚕️', 'Nossa pediatra tem horário', 'pediatra-tem-horario'],
    ['👶', 'Primeira consulta do bebê', 'primeira-consulta'],
    ['📅', 'Prefere manhã ou tarde?', 'manha-ou-tarde-consulta'],
    ['🔁', 'Hora do retorno', 'hora-do-retorno'],
    ['📏', 'Vamos pesar e medir', 'pesar-e-medir'],
    ['🧾', 'Leve os exames', 'leve-os-exames'],
    ['💬', 'Dúvida? Chama a gente', 'duvida-chama'],
    ['🧠', 'Cada fase tem seu cuidado', 'cada-fase-cuidado'],
    ['🏠', 'Consulta no conforto de casa', 'consulta-em-casa'],
  ] },
  { prefixo: 'confirmacao', cor: 'verde', itens: [
    ['✅', 'Agendamento confirmado', 'agendamento-confirmado'],
    ['🗓️', 'Horário reservado', 'horario-reservado'],
    ['👌', 'Tá tudo certo!', 'ta-tudo-certo'],
    ['🔔', 'Confirmamos na véspera', 'confirmamos-vespera'],
    ['💙', 'Te esperamos!', 'te-esperamos'],
    ['⏰', 'É amanhã, viu?', 'e-amanha'],
    ['🕘', 'Chegue 10 min antes', 'chegue-antes'],
    ['📝', 'Anota na agenda', 'anota-na-agenda'],
    ['🔄', 'Imprevisto? A gente remarca', 'imprevisto-remarca'],
    ['⏳', 'Contagem regressiva', 'contagem-regressiva'],
  ] },
  { prefixo: 'posvacinal', cor: 'verde', itens: [
    ['🛡️', 'Protegidinho!', 'protegidinho'],
    ['🦸', 'Dia de herói', 'dia-de-heroi'],
    ['🦸‍♀️', 'Dia de heroína', 'dia-de-heroina'],
    ['🏅', 'Certificado de coragem', 'certificado-coragem'],
    ['🐝', 'Com Buzzy dói menos', 'buzzy'],
    ['📗', 'Caderneta em dia', 'caderneta-em-dia'],
    ['🌱', 'Crescendo forte', 'crescendo-forte'],
    ['💉', 'Dia de proteger', 'dia-de-proteger'],
    ['👨‍👩‍👧', 'Saúde pra família toda', 'saude-para-familia'],
    ['👀', 'De olho em vocês', 'de-olho-em-voces'],
  ] },
  { prefixo: 'terapias', cor: 'roxo', itens: [
    ['🧩', 'Cada sessão, uma evolução', 'cada-sessao-evolucao'],
    ['📈', 'Que evolução!', 'orgulho-evolucao'],
    ['🔎', 'Avaliar é cuidar', 'avaliar-e-cuidar'],
    ['🗣️', 'Fono faz diferença', 'fono-faz-diferenca'],
    ['🧠', 'Estímulo na hora certa', 'estimulo-hora-certa'],
    ['🤸', 'Brincar também é terapia', 'brincar-e-terapia'],
    ['🎯', 'Um passo de cada vez', 'passo-de-cada-vez'],
    ['👏', 'Orgulho do seu progresso', 'orgulho-progresso'],
    ['🫶', 'Estamos juntos nessa', 'juntos-nessa'],
    ['📆', 'Vamos marcar a próxima sessão?', 'proxima-sessao'],
  ] },
  { prefixo: 'datas', cor: 'ouro', itens: [
    ['🎉', 'Parabéns!', 'parabens'],
    ['🎂', 'Feliz aniversário!', 'feliz-aniversario'],
    ['👶', 'Parabéns, mamãe!', 'parabens-mamae'],
    ['👨‍👦', 'Parabéns, papai!', 'parabens-papai'],
    ['🎁', 'Tem presente pra vocês', 'tem-presente'],
    ['💛', 'Gratidão!', 'gratidao'],
    ['💌', 'Indique uma amiga', 'indique-uma-amiga'],
    ['🤗', 'Seja muito bem-vindo!', 'bem-vindo'],
    ['👋', 'Até breve!', 'ate-breve'],
    ['🤝', 'Estamos aqui', 'estamos-aqui'],
  ] },
];

const FIGS = CATEGORIAS.flatMap(c => c.itens.map(([emoji, frase, nome]) =>
  ({ ordem: (n += 10), emoji, frase, nome, cor: c.cor, grupo: c.prefixo })));

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
const GRUPOS = ['vitta', 'consultas', 'terapias', 'vacinas', 'posagendamento', ...CATEGORIAS.map(c => c.prefixo)];
for (const f of fs.readdirSync(SAIDA)) {
  if (GRUPOS.some(g => f.startsWith(`${g}__`))) fs.unlinkSync(path.join(SAIDA, f));
}

const b = await puppeteer.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const pg = await b.newPage();
await pg.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
for (const f of FIGS) {
  await pg.setContent(pagina(f), { waitUntil: 'load' });
  const buf = await pg.screenshot({ type: 'webp', quality: 92, omitBackground: true });
  fs.writeFileSync(path.join(SAIDA, `${f.grupo}__${String(f.ordem).padStart(3, '0')}-${f.nome}.webp`), buf);
}
await b.close();
console.log('figurinhas geradas:', FIGS.length);
