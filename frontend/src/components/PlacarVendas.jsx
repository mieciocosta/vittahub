import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* PLACAR DE VENDAS — a faixa do topo é a primeira coisa que a equipe vê. 🔥
   Ela não está aqui pra informar: está aqui pra PROVOCAR a próxima venda.

   O que move gente a vender (e por isso está na faixa, nesta ordem):
     1. O que já fiz hoje  → orgulho / vergonha saudável do zero
     2. A tarefa de HOJE   → "1 Plano Vacinal" é fazível; "R$ 100 mil" paralisa
     3. O ritmo do mês     → barra enchendo, com o que falta por dia útil
     4. O PRÊMIO           → dinheiro no bolso dela é o gatilho mais forte
     5. Um botão pra agir  → do impulso ao registro em um clique

   Regras que valem aqui: o servidor decide se manda valores em R$ (colega não
   descobre o número da colega nem por subtração) e cada uma só vê o SETOR dela.
   Some no Login (sem user). */

// "1 Consulta" / "7 Consultas" — o rótulo vem no plural do servidor, então o
// singular é ajustado aqui na hora de escrever a frase.
const SINGULAR = { 'Consultas': 'Consulta', 'Sessões': 'Sessão', 'Planos': 'Plano' };
const qtdTexto = (f) => {
  const n = f.falta ?? 0;
  return `${n} ${n === 1 ? (SINGULAR[f.rotulo] || f.rotulo) : f.rotulo}`;
};
const EMOJI = { vacinas: '💉', consultas: '🩺', terapias: '🧩' };
const CORES = { vacinas: '#fcd34d', consultas: '#67e8f9', terapias: '#fda4af' };

/* Dias em que a clínica trabalha até o fim do mês (domingo não conta).
   Serve pra transformar "faltam R$ 83 mil" — que desanima — em "R$ 4.150 por
   dia", que é uma tarefa que cabe no dia de hoje. */
function diasUteisRestantes() {
  const agora = new Date(Date.now() - 3 * 3600 * 1000); // São Luís = UTC-3
  const ano = agora.getUTCFullYear(), mes = agora.getUTCMonth();
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  let n = 0;
  for (let d = agora.getUTCDate(); d <= ultimo; d++) {
    if (new Date(Date.UTC(ano, mes, d)).getUTCDay() !== 0) n++;
  }
  return Math.max(n, 1);
}

/* Quanto ainda dá pra fazer HOJE. Urgência honesta: só aparece dentro do
   expediente (até as 18h de São Luís), senão vira cobrança fora de hora. */
function horasDeExpediente() {
  const agora = new Date(Date.now() - 3 * 3600 * 1000);
  const h = agora.getUTCHours() + agora.getUTCMinutes() / 60;
  if (h < 7 || h >= 18) return null;
  const falta = 18 - h;
  const hh = Math.floor(falta), mm = Math.round((falta - hh) * 60);
  return hh > 0 ? `${hh}h${String(mm).padStart(2, '0')}` : `${mm}min`;
}

// Cápsula de vidro — todo bloco da faixa usa o mesmo desenho, pra ficar limpo
const Capsula = ({ children, destaque, title, onClick }) => (
  <div title={title} onClick={onClick}
    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 12px', borderRadius: 13,
      background: destaque ? 'rgba(252,211,77,.16)' : 'rgba(255,255,255,.09)',
      border: `1px solid ${destaque ? 'rgba(252,211,77,.45)' : 'rgba(255,255,255,.16)'}`,
      backdropFilter: 'blur(6px)', whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default' }}>
    {children}
  </div>
);
const Rotulo = ({ children }) => (
  <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: .7, textTransform: 'uppercase', color: 'rgba(255,255,255,.68)' }}>{children}</div>
);

// Barrinha de progresso reaproveitada nas cápsulas
const Barra = ({ pct, cor, largura = 62 }) => (
  <div style={{ width: largura, height: 5, borderRadius: 4, background: 'rgba(0,0,0,.28)', overflow: 'hidden' }}>
    <div style={{ width: `${Math.max(Math.min(pct, 100), 2)}%`, height: '100%', borderRadius: 4, background: cor, transition: 'width .8s cubic-bezier(.2,.8,.2,1)' }} />
  </div>
);

export default function PlacarVendas() {
  const api = useApi();
  const nav = useNavigate();
  const { user } = useAuth();
  const [meta, setMeta] = useState(null);
  const [hoje, setHoje] = useState(null);
  const [pulse, setPulse] = useState(false);
  const [festa, setFesta] = useState(false);   // comemoração de venda ao vivo
  const [pausa, setPausa] = useState(null);    // ⏸️ chaves do automático
  const [painel, setPainel] = useState(false); // painel de chaves (master)
  const sockRef = useRef(null);

  const carregar = () => {
    api.get('/extras/meta-setor').then(setMeta).catch(() => {});
    api.get('/extras/vendas/hoje').then(setHoje).catch(() => {});
    /* Estado do freio — TODA a equipe vê a tarja (com a Vitta calada, quem não
       responder na mão deixa o cliente no vácuo). Só o master tem o botão. */
    api.get('/inbox/automacao/pausa').then(setPausa).catch(() => {});
  };

  /* ⏸️ CHAVES DO AUTOMÁTICO — uma por área, porque desligar a Vitta não pode
     calar o follow-up e os lembretes (foi exatamente o que o master pediu).
     Fica aqui no topo de propósito: no aperto ninguém caça em Configurações. */
  const trocarArea = async (area, ligar) => {
    try {
      const d = await api.post('/inbox/automacao/pausa', { area, ligado: ligar });
      setPausa(d);
    } catch (e) { window.alert('Erro: ' + e.message); }
  };
  const pararTudo = async () => {
    if (!window.confirm('PARAR TUDO que é automático agora?\n\nVitta, follow-up, lembretes e mensagens agendadas. O Chat continua normal: a equipe escreve e envia na mão.')) return;
    try { setPausa(await api.post('/inbox/automacao/pausa', { pausada: true })); }
    catch (e) { window.alert('Erro: ' + e.message); }
  };
  const AREAS_UI = [
    ['bot', '🤖 Vitta respondendo', 'Resposta automática, menu de triagem e reabertura de 24h'],
    ['followup', '♻️ Follow-up e resgate', 'Reativa lead parado e resgata quem não fechou'],
    ['lembretes', '🔔 Lembretes', 'Consulta de amanhã, aniversário e próxima dose'],
    ['agendadas', '📤 Mensagens agendadas', 'Texto que a equipe escreveu e marcou pra depois'],
  ];
  const desligadas = AREAS_UI.filter(([k]) => pausa?.ligado && pausa.ligado[k] === false);

  useEffect(() => {
    if (!user) return;
    carregar();
    const t = setInterval(carregar, 90000);
    import('socket.io-client').then(({ io }) => {
      const BASE = import.meta.env.VITE_API_URL || '';
      const s = io(BASE, { transports: ['websocket', 'polling'], auth: { token: localStorage.getItem('vh_token') || '' } });
      s.on('venda_registrada', () => {
        carregar();
        setPulse(true); setTimeout(() => setPulse(false), 1600);
        /* Venda fechada merece festa na tela. Não é enfeite: comemorar em
           público é o que faz a próxima vir mais rápido (pedido do master). */
        setFesta(true); setTimeout(() => setFesta(false), 3200);
      });
      sockRef.current = s;
    }).catch(() => {});
    return () => { clearInterval(t); try { sockRef.current?.disconnect(); } catch {} };
  }, [user]); // eslint-disable-line

  if (!user || !meta || !meta.metaGlobal) return null;
  const gestao = ['master', 'supervisor'].includes(user.role);
  // O servidor decide se manda os valores do setor. Fora da gestão eles nem
  // chegam — assim a colega não descobre o número da outra por subtração.
  const verValores = meta.mostra_valores !== false;
  const setoresLista = (meta.porSetor && meta.porSetor.length) ? meta.porSetor : [meta];
  const nHoje = hoje?.n ?? 0;

  /* "Meta batida" precisa vir de um número que EXISTE. Quando escondi os
     valores do setor da equipe, faltaGlobal passou a chegar null — e
     (null ?? 0) <= 0 dava TRUE: o placar inteiro ficava verde comemorando sem
     ninguém ter vendido nada. Pra quem não recebe valores, o que vale é a meta
     do DIA; e o padrão de ausência agora é "não batida", nunca o contrário. */
  const focos = Object.values(meta.focoDia || {});
  const focoTudoOk = focos.length > 0 && focos.every(itens => itens.every(f => (f.falta ?? 1) === 0));

  /* UM só número em R$ na faixa. Antes apareciam dois — o do SETOR e o
     INDIVIDUAL — e como o setor soma a produção das colegas, davam valores
     diferentes lado a lado ("83 mil aqui, 80 mil ali"): parecia erro do
     sistema. Quem tem meta individual acompanha a DELA, que é a que ela
     controla; quem não tem, acompanha a do setor. */
  const ind = (meta.individual && meta.individual.meta > 0) ? meta.individual : null;
  const alvoMes = ind ? ind.meta : setoresLista.reduce((a, s) => a + (s.metaMinima || 0), 0);
  const feitoMes = ind ? (ind.confirmado || 0) : setoresLista.reduce((a, s) => a + (s.confirmado || 0), 0);
  const aReceber = ind ? (ind.aReceber || 0) : setoresLista.reduce((a, s) => a + (s.aReceber || 0), 0);
  const faltaMes = Math.max(alvoMes - feitoMes, 0);
  const pctMes = alvoMes ? Math.min((feitoMes / alvoMes) * 100, 100) : 0;
  const batida = verValores ? (alvoMes > 0 && faltaMes <= 0) : focoTudoOk;

  /* 🎁 O PRÊMIO é o argumento mais forte da faixa: não é "a meta da clínica",
     é dinheiro no bolso dela.
     Dois modelos, e a diferença importa (o master cobrou quando misturamos):
       · setor COM diária (consultas): o prêmio é ACUMULADO — R$ 100 por dia
         batido, até 26 dias = R$ 2.600 no mês. Mostra o que já juntou.
       · setor SEM diária (vacinas): prêmio de meta — bateu a mínima, ganhou. */
  const s0 = setoresLista[0] || {};
  const diarias = s0.premioDia > 0 ? s0.diarias : null;
  const premio = diarias
    ? { modelo: 'diaria', valor: diarias.teto, ganho: diarias.valor >= diarias.teto,
        acumulado: diarias.valor, dias: diarias.conquistadas, tetoDias: diarias.teto_dias, porDiaVale: s0.premioDia }
    : !verValores ? null
    : (s0.premioMinimo > 0 && !s0.premioMinimoConquistado)
      ? { valor: s0.premioMinimo, falta: Math.max(s0.faltaMinima ?? 0, 0), pct: Math.min(s0.pctMinima ?? 0, 100), alvo: s0.metaMinima }
      : (s0.premio > 0 && !s0.premioConquistado)
        ? { valor: s0.premio, falta: Math.max(s0.faltaGlobal ?? 0, 0), pct: Math.min(s0.pctGlobal ?? 0, 100), alvo: s0.metaGlobal }
        : (s0.premio > 0 ? { valor: s0.premio, falta: 0, pct: 100, alvo: s0.metaGlobal, ganho: true } : null);

  const dias = diasUteisRestantes();
  const porDia = faltaMes > 0 ? faltaMes / dias : 0;
  const restaHoje = horasDeExpediente();

  const grito = festa ? '🎉 VENDA FECHADA! Bora pra próxima!'
    : batida ? '🏆 Meta batida! Agora é lucro!'
    : focoTudoOk ? '✅ Meta do dia feita — cada venda a mais já é bônus!'
    : nHoje > 0 ? 'Bora fechar mais uma! 💪'
    : restaHoje ? 'A primeira do dia é sua — ainda dá tempo! 🚀'
    : 'A primeira venda do dia é sua! 🚀';

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 90, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap',
      padding: '9px 18px 11px', color: '#fff', overflow: 'hidden',
      background: festa ? 'linear-gradient(90deg,#78350f,#b45309,#f59e0b)'
        : batida ? 'linear-gradient(90deg,#064e3b,#047857,#10b981)'
        : 'linear-gradient(100deg,#0b1023 0%,#2e1065 45%,#6d28d9 100%)',
      transition: 'background .6s ease',
      boxShadow: '0 4px 18px rgba(0,0,0,.28)', borderBottom: '1px solid rgba(212,175,55,.4)' }}>

      {/* brilho que atravessa a faixa — o movimento é o que puxa o olho pra cá */}
      <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.13),transparent)', transform: 'translateX(-100%)', animation: 'vh-placar-shine 5s ease-in-out infinite', pointerEvents: 'none' }} />

      {/* 1️⃣ O QUE EU FIZ HOJE */}
      <div title={gestao && hoje?.casa ? `Casa inteira hoje: ${hoje.casa.n} venda(s) · ${fmt.brl(hoje.casa.total)}` : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 13px 5px 10px', borderRadius: 13,
        background: nHoje > 0 ? 'rgba(16,185,129,.2)' : 'rgba(255,255,255,.09)',
        border: `1px solid ${nHoje > 0 ? 'rgba(110,231,183,.5)' : 'rgba(255,255,255,.16)'}`,
        transition: 'transform .35s cubic-bezier(.2,.9,.3,1.4)', transform: pulse ? 'scale(1.1)' : 'scale(1)' }}>
        <span style={{ fontSize: 19, filter: nHoje > 0 ? 'none' : 'grayscale(.6) opacity(.8)' }}>🔥</span>
        <div style={{ lineHeight: 1.12 }}>
          {/* É o que EU fechei hoje. O número da casa não movia ninguém:
              a atendente via "12 fechadas" sem saber quantas eram dela. */}
          <Rotulo>Minhas vendas hoje</Rotulo>
          <div style={{ fontSize: 15.5, fontWeight: 900, letterSpacing: .2 }}>
            {nHoje} {nHoje === 1 ? 'fechada' : 'fechadas'}
            {hoje?.total ? <span style={{ color: '#6ee7b7' }}> · {fmt.brl(hoje.total)}</span> : ''}
            {/* 🧹 Auditoria: "casa:" saiu do texto e virou tooltip — a primeira
                cápsula é o número DELA; o da casa é consulta, não placar. */}
          </div>
        </div>
      </div>

      {/* 2️⃣ A TAREFA DE HOJE — por setor (o backend já filtra o setor de cada uma) */}
      {setoresLista.map((s) => {
        const nome = s.setor && s.setor !== 'geral' ? s.setor[0].toUpperCase() + s.setor.slice(1) : 'Geral';
        const foco = meta.focoDia?.[s.setor] || null;      // meta em QUANTIDADE
        const focoOk = foco ? foco.every(f => (f.falta ?? 0) === 0) : false;
        const mes = meta.focoMes?.[s.setor] || null;       // alvo do mês (ex.: 20 Planos)
        const minMeta = s.metaMinima || 100000;
        const faltaMin = Math.max(0, s.faltaMinima ?? Math.max(minMeta - (s.confirmado || 0), 0));
        const cor = CORES[s.setor] || '#fde68a';
        if (!foco && !verValores) return null;
        return (
          <Capsula key={s.setor}
            // A meta ideal saiu da faixa, mas continua no "passar o mouse".
            title={foco
              ? `${nome} hoje: ${foco.map(f => `${f.feitos} de ${f.alvo} ${f.rotulo.toLowerCase()}`).join(' ou ')}${verValores ? ` · no mês ${fmt.brl(s.confirmado || 0)} de ${fmt.brl(minMeta)}` : ''}`
              : `${nome}: ${fmt.brl(s.confirmado || 0)} de ${fmt.brl(minMeta)} · meta ideal ${fmt.brl(s.metaGlobal || 0)}`}>
            <span style={{ fontSize: 15 }}>{EMOJI[s.setor] || '🎯'}</span>
            <div style={{ lineHeight: 1.12, transition: 'transform .35s', transform: pulse ? 'scale(1.05)' : 'scale(1)' }}>
              <Rotulo>{nome} · meta de hoje</Rotulo>
              <div style={{ fontSize: 13.5, fontWeight: 900, color: focoOk ? '#6ee7b7' : cor, textShadow: '0 1px 3px rgba(0,0,0,.45)' }}>
                {/* Onde existe meta em QUANTIDADE ela substitui o R$: "falta
                    R$ 99.600" não diz o que fazer hoje; "1 Plano Vacinal" diz. */}
                {foco
                  ? (focoOk ? '✅ Feita! Bora além' : foco.map(qtdTexto).join(' ou '))
                  : (faltaMin <= 0 ? '🏆 Meta batida!' : `falta ${fmt.brl(faltaMin)}`)}
              </div>
              {/* O alvo do MÊS logo abaixo: 1 por dia é o passo, 20 é o destino */}
              {mes && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <Barra pct={mes.alvo ? (mes.feitos / mes.alvo) * 100 : 0} cor={`linear-gradient(90deg,${cor},#fff8e1)`} largura={54} />
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,.9)' }}>
                    {mes.falta > 0 ? `${mes.feitos} de ${mes.alvo} ${mes.rotulo} no mês` : `🏆 ${mes.alvo} ${mes.rotulo} — completo!`}
                  </span>
                </div>
              )}
              {/* 💵 A diária mora aqui: bater a meta de HOJE vale dinheiro HOJE */}
              {s.premioDia > 0 && (
                <div style={{ fontSize: 10, fontWeight: 900, marginTop: 3, color: focoOk ? '#6ee7b7' : '#fcd34d' }}>
                  {focoOk ? `🏅 diária de ${fmt.brl(s.premioDia)} é sua!` : `💵 diária: ${fmt.brl(s.premioDia)} batendo a meta de hoje`}
                </div>
              )}
            </div>
          </Capsula>
        );
      })}

      {/* 3️⃣ RITMO DO MÊS — a barra enchendo e quanto falta POR DIA */}
      {verValores && alvoMes > 0 && (
        <Capsula title={`${ind ? 'Sua produção' : 'Setor'} no mês: ${fmt.brl(feitoMes)} vendidos de ${fmt.brl(alvoMes)}`
          + (aReceber > 0 ? ` · ${fmt.brl(aReceber)} ainda a receber` : '')
          + ` · ${dias} dia(s) de trabalho até o fim do mês`}>
          <span style={{ fontSize: 15 }}>📈</span>
          <div style={{ lineHeight: 1.12 }}>
            <Rotulo>{ind ? 'Minha meta do mês' : 'Meta do setor'} · {fmt.brl(feitoMes)} de {fmt.brl(alvoMes)} · {pctMes.toFixed(1)}%</Rotulo>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
              <Barra pct={pctMes} cor={pctMes >= 100 ? '#6ee7b7' : 'linear-gradient(90deg,#f59e0b,#fcd34d)'} largura={76} />
              <span style={{ fontSize: 11.5, fontWeight: 900, color: faltaMes <= 0 ? '#6ee7b7' : '#fff' }}>
                {faltaMes <= 0 ? '🏆 completo!' : `${fmt.brl(porDia)}/dia · ${dias}d`}
              </span>
            </div>
          </div>
        </Capsula>
      )}

      {/* 🧹 Auditoria: a diária deixou de ser cápsula própria (o master via
          12+ elementos na faixa) — ela vira um selo DENTRO da cápsula do setor,
          logo abaixo da meta de hoje, onde o olho já está. */}

      {/* 4️⃣ O PRÊMIO — o motivo mais concreto de fechar mais uma hoje */}
      {premio && premio.modelo === 'diaria' && (
        <Capsula destaque title={`${fmt.brl(premio.porDiaVale)} por dia em que a meta do dia é batida · até ${premio.tetoDias} dias = ${fmt.brl(premio.valor)} no mês`}>
          <span style={{ fontSize: 16 }}>{premio.ganho ? '🏆' : '💰'}</span>
          <div style={{ lineHeight: 1.12 }}>
            <Rotulo>Suas diárias · {premio.dias} de {premio.tetoDias} dias</Rotulo>
            <div style={{ fontSize: 13.5, fontWeight: 900, color: premio.acumulado > 0 ? '#6ee7b7' : '#fcd34d', textShadow: '0 1px 3px rgba(0,0,0,.45)' }}>
              {fmt.brl(premio.acumulado)}
              <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.92)', marginLeft: 6 }}>
                de {fmt.brl(premio.valor)} · {fmt.brl(premio.porDiaVale)}/dia batido
              </span>
            </div>
          </div>
        </Capsula>
      )}
      {premio && premio.modelo !== 'diaria' && premio.valor > 0 && (
        <Capsula destaque title={`Prêmio de ${fmt.brl(premio.valor)} ao alcançar ${fmt.brl(premio.alvo || 0)}`}>
          <span style={{ fontSize: 16 }}>{premio.ganho ? '🏆' : '🎁'}</span>
          <div style={{ lineHeight: 1.12 }}>
            <Rotulo>{premio.ganho ? 'Prêmio conquistado' : 'Seu prêmio'}</Rotulo>
            <div style={{ fontSize: 13.5, fontWeight: 900, color: '#fcd34d', textShadow: '0 1px 3px rgba(0,0,0,.45)' }}>
              {fmt.brl(premio.valor)}
              {!premio.ganho && (
                <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,.92)', marginLeft: 6 }}>
                  · faltam {fmt.brl(premio.falta)}
                </span>
              )}
            </div>
          </div>
        </Capsula>
      )}

      {/* 5️⃣ Só faz sentido enquanto a cápsula do ritmo estiver mostrando o SETOR:
             quando ela já mostra a meta individual, esta aqui seria o mesmo
             número duas vezes — foi exatamente o que confundiu o master. */}
      {!ind && meta.individual && meta.individual.meta > 0 && (
        <Capsula title={`Sua produção: ${fmt.brl(meta.individual.confirmado)} de ${fmt.brl(meta.individual.meta)}`}>
          <span style={{ fontSize: 15 }}>🎯</span>
          <div style={{ lineHeight: 1.12 }}>
            <Rotulo>Sua meta global · {Math.min(meta.individual.pct, 100)}%</Rotulo>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
              <Barra pct={meta.individual.pct} cor={meta.individual.falta <= 0 ? '#6ee7b7' : 'linear-gradient(90deg,#ec4899,#f9a8d4)'} largura={58} />
              <span style={{ fontSize: 11.5, fontWeight: 900, color: meta.individual.falta <= 0 ? '#6ee7b7' : '#f9a8d4' }}>
                {meta.individual.falta <= 0 ? '🏆 batida!' : `falta ${fmt.brl(meta.individual.falta)}`}
              </span>
            </div>
          </div>
        </Capsula>
      )}

      <div style={{ flex: 1, minWidth: 8 }} />

      {/* ⏸️ Chaves do automático (só o master) */}
      {user?.role === 'master' && pausa?.ligado && (
        <div style={{ position: 'relative' }}>
          <button onClick={() => setPainel(v => !v)} title="Ligar/desligar cada automático"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 12, cursor: 'pointer',
              whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 900,
              border: `1px solid ${desligadas.length ? 'rgba(252,165,165,.7)' : 'rgba(255,255,255,.3)'}`,
              background: desligadas.length ? 'rgba(220,38,38,.28)' : 'rgba(255,255,255,.1)', color: '#fff' }}>
            {desligadas.length ? `⏸️ ${desligadas.length} desligado${desligadas.length > 1 ? 's' : ''}` : '⚙️ Automático'}
          </button>
          {painel && (
            <>
              <span onClick={() => setPainel(false)} style={{ position: 'fixed', inset: 0, zIndex: 300 }} />
              <div className="card" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 301, width: 320, padding: '12px 14px', color: 'var(--txt)' }}>
                <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 2 }}>O que sai sozinho</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                  Cada chave é independente — desligar a Vitta não cala os lembretes.
                </div>
                {AREAS_UI.map(([k, rot, sub]) => {
                  const on = pausa.ligado[k] !== false;
                  return (
                    <div key={k} onClick={() => trocarArea(k, !on)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 0', cursor: 'pointer',
                        borderBottom: '1px solid var(--border)' }}>
                      <span style={{ width: 34, height: 20, borderRadius: 20, flexShrink: 0, marginTop: 2, position: 'relative',
                        background: on ? 'var(--ok,#16a34a)' : 'var(--border)', transition: 'background .2s' }}>
                        <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%',
                          background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 800, fontSize: 12.5 }}>{rot}</span>
                        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.35 }}>{sub}</span>
                      </span>
                      <span style={{ fontSize: 10.5, fontWeight: 900, color: on ? 'var(--ok,#16a34a)' : 'var(--err,#dc2626)' }}>
                        {on ? 'LIGADO' : 'PARADO'}
                      </span>
                    </div>
                  );
                })}
                <button onClick={pararTudo} className="btn btn-s" style={{ width: '100%', marginTop: 10, color: 'var(--err,#dc2626)', fontWeight: 800 }}>
                  ⏸️ Parar tudo de uma vez
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 🏆 Atalho pro pódio — a disputa mora aqui em cima, não escondida no menu */}
      <button onClick={() => nav('/ranking')} title="Ver o ranking da equipe (por quantidade de vendas)"
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 12, cursor: 'pointer',
          border: '1px solid rgba(255,255,255,.28)', background: 'rgba(255,255,255,.1)', color: '#fff',
          fontSize: 11.5, fontWeight: 900, whiteSpace: 'nowrap' }}>
        🏆 Ranking
      </button>

      {/* 6️⃣ DO IMPULSO À AÇÃO — registrar a venda sem sair procurando onde */}
      <button onClick={() => nav('/caixa')}
        title="Registrar uma venda agora"
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 12, cursor: 'pointer',
          border: '1px solid rgba(255,255,255,.3)', color: '#0b1023', whiteSpace: 'nowrap',
          background: 'linear-gradient(180deg,#fde68a,#f59e0b)', fontSize: 12, fontWeight: 900,
          boxShadow: '0 3px 12px rgba(245,158,11,.45)' }}>
        💰 Registrar venda
      </button>

      {/* Grito de guerra + expediente numa linha só (auditoria: eram dois) */}
      <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {grito}{restaHoje && !batida ? ` · ⏳ ${restaHoje}` : ''}
      </div>

      {/* Pausado precisa GRITAR: esquecer o freio puxado é pior que o problema
          que ele resolve (cliente fica sem resposta e ninguém percebe). */}
      {/* O que está parado, em pastilhas — texto corrido em faixa vermelha vira
          ruído e some da vista em dois dias. Aqui cada área é um item, e a
          cobrança de responder à mão só aparece quando é o BOT que está fora. */}
      {desligadas.length > 0 && (
        <div style={{ width: '100%', marginTop: 7, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap',
          padding: '7px 12px', borderRadius: 12,
          background: 'linear-gradient(90deg, rgba(127,29,29,.92), rgba(153,27,27,.72))',
          border: '1px solid rgba(252,165,165,.4)' }}>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: .8, textTransform: 'uppercase',
            color: '#fecaca', whiteSpace: 'nowrap' }}>⏸️ Fora do ar</span>
          {desligadas.map(([k, rot]) => (
            <span key={k} style={{ fontSize: 11, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap',
              background: 'rgba(0,0,0,.28)', border: '1px solid rgba(255,255,255,.16)', borderRadius: 20, padding: '3px 10px' }}>
              {rot}
            </span>
          ))}
          {pausa?.ligado?.bot === false && (
            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#fff' }}>
              👀 Ninguém responde sozinho — <b>todo cliente é na mão</b>. Olho no Chat e em “Atenção agora”.
            </span>
          )}
          {user?.role === 'master' && (
            <button onClick={() => setPainel(true)}
              style={{ marginLeft: 'auto', padding: '4px 11px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap',
                border: '1px solid rgba(255,255,255,.35)', background: 'rgba(255,255,255,.14)', color: '#fff',
                fontSize: 11, fontWeight: 900 }}>
              Religar →
            </button>
          )}
        </div>
      )}

      {/* Barra grande do mês colada na base da faixa — o "termômetro" do time.
          Enche na frente de todo mundo a cada venda registrada. */}
      {verValores && alvoMes > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: 'rgba(0,0,0,.3)' }}>
          <div style={{ width: `${Math.max(pctMes, 1.5)}%`, height: '100%',
            background: pctMes >= 100 ? 'linear-gradient(90deg,#10b981,#6ee7b7)' : 'linear-gradient(90deg,#f59e0b,#fcd34d,#fff8e1)',
            boxShadow: '0 0 12px rgba(252,211,77,.85)', transition: 'width 1s cubic-bezier(.2,.8,.2,1)' }} />
        </div>
      )}

      {/* 🎉 Chuva de comemoração quando entra uma venda ao vivo */}
      {festa && (
        <span aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {['🎉', '💰', '✨', '🎊', '⭐', '💵', '🎉', '✨'].map((e, i) => (
            <span key={i} style={{ position: 'absolute', top: -18, left: `${8 + i * 11.5}%`, fontSize: 15,
              animation: `vh-placar-cai 3s ${i * .18}s ease-in forwards` }}>{e}</span>
          ))}
        </span>
      )}

      <style>{`
        @keyframes vh-placar-shine { 0% { transform: translateX(-100%);} 55%,100% { transform: translateX(200%);} }
        @keyframes vh-placar-cai { 0% { transform: translateY(0) rotate(0); opacity: 1; } 100% { transform: translateY(90px) rotate(220deg); opacity: 0; } }
      `}</style>
    </div>
  );
}
