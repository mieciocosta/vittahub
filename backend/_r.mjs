/* Renderiza o VittaHub como a RAYLANE (supervisora de VACINAS) enxerga.
   As respostas abaixo imitam exatamente o que o backend devolve pra ela
   depois do recorte por setor — serve pra conferir a tela e pra caçar erro
   de render (foi assim que achamos o ChevronDown faltando). */
const puppeteer = (await import('puppeteer-core')).default;
const B = 'http://localhost:4180';

const USER = { id:'r1', nome:'Raylane Moraes', email:'raylane@vittalis', role:'supervisor',
  setor:'vacinas', setores:null, cor:'#7c5cbf', avatar:null, lider:true, ve_tudo:false, pode_impersonar:false };

const MOCK = {
  '/api/auth/me': { ...USER, dono:false },
  '/api/reports/dashboard': {
    resumo:{ totalLeads:412, leadsHoje:9, totalUnread:3, aguardando:2 },
    porStatus:[], followups:[], porResponsavel:[],   // placar nominal é só do master
    metas:{ vacinas:{ meta:200000, vendido:84500, pendente:0, pct:42.3, falta:115500, projecao:0 }, consultas:{ metaDia:10, confirmadasHoje:0 } },
    impacto:{ familias:212, convVacinas:212, convConsultas:null, convTerapias:null },
    funil:[{etapa:'Recebidas',n:212},{etapa:'Classificadas',n:190},{etapa:'Em atendimento',n:96},{etapa:'Aguardando',n:12},{etapa:'Quentes',n:21},{etapa:'Perdidas',n:8}],
    porSetorConv:[{setor:'vacinas',n:212,aguardando:12}],   // só o setor dela
  },
  '/api/extras/agenda': [
    { id:1, hora:'08:30', paciente:'Maria Luiza (bebê)', servico:'Pentavalente · 4 meses', status:'Confirmado', setor:'vacinas', resp_nome:'Raylane Moraes' },
    { id:2, hora:'10:00', paciente:'Arthur Menezes', servico:'Plano Vacinal · 1ª dose', status:'Agendado', setor:'vacinas', resp_nome:'Raylane Moraes' },
    { id:3, hora:'15:20', paciente:'Helena Castro', servico:'Meningo B', status:'Confirmado', setor:'vacinas', resp_nome:'Stefany' },
  ],
  '/api/extras/agenda/meta': {
    setores:{ vacinas:{ feitos:74, alvo:120, falta:46, pct:61.7 } },     // SÓ vacinas
    total:{ feitos:74, alvo:120, falta:46, pct:61.7 }, feitos:74, alvo:120, pct:61.7,
    porAtendente:[{ nome:'Raylane Moraes', n:74 }],                      // só a linha dela
  },
  '/api/extras/meta-setor': {
    setor:'vacinas', confirmado:16948, meta:100000, pct:16.9, falta:83052,
    metaGlobal:500000, pctGlobal:3.4, faltaGlobal:483052,
    metaMinima:100000, pctMinima:16.9, faltaMinima:83052,
    premio:10000, premioConquistado:false, premioMinimo:1500, premioMinimoConquistado:false,
    multi:true, mostra_valores:true,
    porSetor:[{ setor:'vacinas', confirmado:16948, meta:100000, pct:16.9, falta:83052,
      metaGlobal:500000, pctGlobal:3.4, faltaGlobal:483052,
      metaMinima:100000, pctMinima:16.9, faltaMinima:83052,
      premio:10000, premioConquistado:false, premioMinimo:1500, premioMinimoConquistado:false }],
    focoDia:{ vacinas:[{ rotulo:'Plano Vacinal', alvo:1, feitos:0, falta:1 }] },
    focoMes:{ vacinas:{ rotulo:'Planos', alvo:20, feitos:1, falta:19 } },
    individual:{ meta:100000, confirmado:16948, falta:83052, pct:16.9 },
  },
  '/api/extras/vitta-hoje': { enviadas:18, pendentes:5, lista:[
    { origem:'Vitta · Confirmação de agenda', enviadas:11, pendentes:2 },
    { origem:'Vitta · Próxima dose', enviadas:5, pendentes:3 },
    { origem:'Vitta · Follow-up', enviadas:2, pendentes:0 } ] },
  '/api/extras/foco-hoje': { total:3, itens:[
    { conv_id:'c1', titulo:'Ana Paula (mãe do Théo)', motivo:'Esperando resposta há 22 min', detalhe:'Quanto fica a Meningo B?', acao:'Responder', emoji:'⏳', cor:'#dc2626' },
    { conv_id:'c2', titulo:'Família Ribeiro', motivo:'Orçamento sem resposta há 3 dias', detalhe:'Plano Vacinal 1º ano', acao:'Resgatar', emoji:'💰', cor:'#C4973B' },
    { conv_id:'c3', titulo:'Bebê Lorenzo', motivo:'Dose atrasada há 9 dias', detalhe:'Pentavalente 3ª', acao:'Chamar', emoji:'💉', cor:'#7c5cbf' } ] },
  '/api/extras/minha-producao': { hoje:{ agendamentos:6, vendas:2, valor:3400, conversas:23 },
    mes:{ agendamentos:74, vendas:31, valor:84500 }, meta:{ tipo:'valor', valor:100000, falta:15500, pct:84.5 } },
  '/api/extras/vendas/hoje': { n:0, total:0 },
  '/api/inbox/atencao-agora': { esperando:2, semResposta:1, vendasPendentes:0, vendasPendentesValor:0, quentesParados:1 },
  '/api/extras/comparativo-mes': { error:'Acesso restrito ao master.' },   // 403 pra ela
  '/api/extras/vendas/resumo':   { error:'Acesso restrito ao master.' },
};

const b = await puppeteer.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process'], headless:true });
const p = await b.newPage();
await p.setViewport({ width:1440, height:1500, deviceScaleFactor:2 });
const erros = [];
p.on('console', m => { if (m.type()==='error') erros.push('CONSOLE: '+m.text().slice(0,200)); });
p.on('pageerror', e => erros.push('PAGEERROR: '+String(e.message).slice(0,200)));
p.on('requestfailed', rq => erros.push('FALHOU: '+rq.url().slice(0,120)));

await p.setRequestInterception(true);
p.on('request', req => {
  const u = new URL(req.url());
  const rota = u.pathname;
  if (!rota.startsWith('/api')) return u.origin === B ? req.continue() : req.respond({ status:200, contentType:'text/plain', body:'' });
  const achou = Object.keys(MOCK).find(k => rota === k || rota.startsWith(k + '?'));
  const corpo = achou ? MOCK[achou] : (rota.includes('/agenda') ? [] : {});
  const negado = corpo && corpo.error;
  const CORS = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*', 'Access-Control-Allow-Methods':'*' };
  if (req.method() === 'OPTIONS') return req.respond({ status:204, headers:CORS, body:'' });
  req.respond({ status: negado ? 403 : 200, contentType:'application/json', headers:CORS, body: JSON.stringify(corpo) });
});

await p.evaluateOnNewDocument(() => { localStorage.setItem('vh_token','fake.token'); });
await p.goto(B + '/', { waitUntil:'load', timeout:25000 });
await new Promise(r => setTimeout(r, 6000));

console.log('--- erros ---'); console.log(erros.length ? erros.join('\n') : '(nenhum)');
const t = await p.evaluate(() => document.body.innerText);
console.log('--- quebrou? ---', /Algo deu errado/.test(t) ? 'SIM ❌' : 'não ✅');
console.log('--- vazou setor? ---', /Consultas|Terapias|consultas|terapias/.test(t) ? 'CITA OUTRO SETOR ⚠️' : 'só vacinas ✅');
console.log('--- corpo ---'); console.log(t.slice(0, 6000));
await p.screenshot({ path:'/tmp/claude-0/-home-user-vittahub/4d60f985-9238-5ca9-9d2e-da1e765a9326/scratchpad/placar-novo.png', clip:{ x:230, y:0, width:1210, height:120 } });
await b.close();
