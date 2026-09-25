import { query } from '../db/pool.js';

/* 📆 HORÁRIOS LIVRES DE VERDADE (ordem do master, 25/09: "quero que a IA seja
   inteligente para agendar consultas e terapias").

   Antes a Vitta recebia só a janela semanal de cada profissional ("seg
   08:00–12:00") e podia oferecer um horário já ocupado: o choque era
   conferido só na agenda do VittaHub e só com a hora exatamente igual; o
   VittaMed, onde mora a maior parte dos atendimentos de consultas e
   terapias, nem era olhado.

   Aqui:
   · cada janela vira horários de 1 hora (regra da casa: ~1h por consulta ou
     sessão), a partir de D+2 (antecedência mínima do master);
   · desconta o que está ocupado na agenda do VittaHub (qualquer status que
     não seja cancelado/faltou) e na agenda do VittaMed, com folga de 1 hora;
   · o nome do profissional é comparado sem acento e sem "Dr./Dra.";
   · a agenda do VittaMed fica em cache por 3 min e cada consulta a ele tem
     4 s de limite: se ele não responder, segue só com o VittaHub e avisa.
   Usado no prompt da Vitta e na trava do pre_agendar. */

const DIAS_K = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const ROT_D = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DURACAO_MIN = 60;

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(dr|dra|doutor|doutora)\b\.?/g, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
export function mesmoProfissional(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const [x1, x2 = ''] = x.split(' '), [y1, y2 = ''] = y.split(' ');
  return x1 === y1 && (x2 === y2 || !x2 || !y2);
}
const paraMin = (h) => { const [a, b] = String(h || '').split(':').map(Number); return Number.isFinite(a) ? a * 60 + (b || 0) : null; };
const paraHora = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const hojeSLZ = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const somaDias = (iso, n) => new Date(new Date(iso + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const dowDe = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
const rotuloData = (iso) => `${ROT_D[dowDe(iso)]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
// Do jeito que se fala com o cliente: "segunda 28/09 às 8h", "às 10h30"
const DIA_FALADO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const horaFalada = (h) => { const [a, b] = String(h).split(':'); return `${Number(a)}h${b && b !== '00' ? b : ''}`; };
const dataFalada = (iso, h) => `${DIA_FALADO[dowDe(iso)]} ${iso.slice(8, 10)}/${iso.slice(5, 7)} às ${horaFalada(h)}`;

// ── Agenda do VittaMed, com cache curto ──────────────────────────────────────
const cacheVm = new Map();   // data → { em, itens, ok }  (ok: true | false | null = ponte desligada)
async function configVittaMed() {
  if (process.env.VITTAMED_URL && String(process.env.INTEGRACAO_TOKEN || '').length >= 16) {
    return { url: process.env.VITTAMED_URL, token: process.env.INTEGRACAO_TOKEN };
  }
  const { rows: [c] } = await query("SELECT valor FROM configuracoes WHERE chave = 'ponte_vittamed'").catch(() => ({ rows: [] }));
  const v = c?.valor || {};
  return v.api_url && String(v.token || '').length >= 16 ? { url: v.api_url, token: v.token } : null;
}
async function agendaVittaMedDia(data, cfg) {
  const c = cacheVm.get(data);
  if (c && Date.now() - c.em < 180000) return c;
  let out;
  if (!cfg) out = { em: Date.now(), itens: [], ok: null };
  else {
    try {
      const { default: fetch } = await import('node-fetch');
      const r = await fetch(`${String(cfg.url).replace(/\/+$/, '')}/api/integracao/agenda?data=${data}`, {
        headers: { 'x-integracao-token': cfg.token }, signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      out = { em: Date.now(), ok: true,
        itens: (j.itens || []).filter(i => !['cancelado', 'faltou'].includes(String(i.status || '').toLowerCase())) };
    } catch { out = { em: Date.now() - 150000, itens: [], ok: false }; }   // falha: tenta de novo em 30 s
  }
  cacheVm.set(data, out);
  return out;
}

/* Horários livres de cada profissional ativo de consultas/terapias, de
   D+diasMin até D+diasAte. */
export async function horariosLivres({ diasMin = 2, diasAte = 12, setores = ['consultas', 'terapias'] } = {}) {
  const { rows: profs } = await query(`
    SELECT id, nome, especialidade, COALESCE(setor,'consultas') setor, disponibilidade
      FROM profissionais WHERE ativo = true AND COALESCE(setor,'consultas') = ANY($1::text[])
     ORDER BY nome`, [setores]).catch(() => ({ rows: [] }));
  if (!profs.length) return { profissionais: [], vittamed: { ligado: false, ok: true }, datas: [] };
  const hoje = hojeSLZ();
  const datas = [];
  for (let d = diasMin; d <= diasAte; d++) datas.push(somaDias(hoje, d));
  const { rows: ocupados } = await query(`
    SELECT data::text data, hora, profissional FROM agenda_eventos
     WHERE data BETWEEN $1 AND $2 AND COALESCE(profissional,'') <> ''
       AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%' AND LOWER(COALESCE(status,'')) <> 'faltou'`,
    [datas[0], datas[datas.length - 1]]).catch(() => ({ rows: [] }));
  const cfg = await configVittaMed();
  const vm = await Promise.all(datas.map(d => agendaVittaMedDia(d, cfg)));
  const profissionais = profs.map(p => {
    const dias = [];
    datas.forEach((d, i) => {
      const disp = p.disponibilidade?.[DIAS_K[dowDe(d)]];
      const ini = paraMin(disp?.inicio), fim = paraMin(disp?.fim);
      if (ini == null || fim == null || fim - ini < DURACAO_MIN) return;
      const ocup = ocupados.filter(o => o.data === d && mesmoProfissional(o.profissional, p.nome)).map(o => paraMin(o.hora))
        .concat(vm[i].itens.filter(it => mesmoProfissional(it.profissional, p.nome)).map(it => paraMin(it.hora)))
        .filter(v => v != null);
      const horas = [];
      for (let m = ini; m + DURACAO_MIN <= fim; m += DURACAO_MIN) {
        if (!ocup.some(o => Math.abs(o - m) < DURACAO_MIN)) horas.push(paraHora(m));
      }
      if (horas.length) dias.push({ data: d, rotulo: rotuloData(d), horas });
    });
    return { id: p.id, nome: p.nome, especialidade: p.especialidade || '', setor: p.setor, dias };
  });
  return {
    profissionais, datas,
    vittamed: { ligado: !!cfg, ok: vm.every(x => x.ok !== false) },
  };
}

/* Texto compacto pro prompt da Vitta, agrupado por setor e especialidade. */
export function textoHorariosParaIA(hl, { maxDias = 6, maxHorasDia = 6 } = {}) {
  const linhas = [];
  for (const setor of ['consultas', 'terapias']) {
    const ps = hl.profissionais.filter(p => p.setor === setor);
    if (!ps.length) continue;
    linhas.push(`${setor === 'consultas' ? 'CONSULTAS' : 'TERAPIAS'}:`);
    for (const p of ps) {
      const dias = p.dias.slice(0, maxDias).map(d => `${d.rotulo} (${d.data}): ${d.horas.slice(0, maxHorasDia).join(', ')}`);
      linhas.push(`• ${p.nome}${p.especialidade ? ` — ${p.especialidade}` : ''}: ${dias.length ? dias.join(' | ') : 'SEM horário livre nos próximos dias'}`);
    }
  }
  return linhas.join('\n');
}

/* Confere UM horário antes de reservar e, se não der, sugere os mais
   próximos (do mesmo profissional primeiro; depois da mesma especialidade). */
export async function conferirHorario({ profissional, especialidade, data, hora }) {
  const hl = await horariosLivres({ diasMin: 2, diasAte: 30 });
  let prof = profissional ? hl.profissionais.find(p => mesmoProfissional(p.nome, profissional)) : null;
  if (!prof && especialidade) {
    const esp = norm(especialidade);
    const daEsp = hl.profissionais.filter(p => norm(p.especialidade).includes(esp) || esp.includes(norm(p.especialidade)));
    prof = daEsp.find(p => p.dias.some(d => d.data === data && d.horas.includes(hora))) || daEsp[0] || null;
  }
  const alvoMin = new Date(`${data}T${hora}:00Z`).getTime();
  const candidatos = (lista) => lista.flatMap(p => p.dias.flatMap(d => d.horas.map(h => ({ profissional: p.nome, especialidade: p.especialidade,
    setor: p.setor, data: d.data, hora: h, rotulo: dataFalada(d.data, h), dist: Math.abs(new Date(`${d.data}T${h}:00Z`).getTime() - alvoMin) }))));
  if (!prof) return { livre: false, motivo: 'profissional', prof: null, alternativas: candidatos(hl.profissionais).sort((a, b) => a.dist - b.dist).slice(0, 2), vittamed: hl.vittamed };
  const livre = prof.dias.some(d => d.data === data && d.horas.includes(hora));
  let alternativas = [];
  if (!livre) {
    alternativas = candidatos([prof]).sort((a, b) => a.dist - b.dist).slice(0, 2);
    if (alternativas.length < 2 && prof.especialidade) {
      const outros = hl.profissionais.filter(p => p.id !== prof.id && norm(p.especialidade) === norm(prof.especialidade));
      alternativas = alternativas.concat(candidatos(outros).sort((a, b) => a.dist - b.dist)).slice(0, 2);
    }
  }
  return { livre, motivo: livre ? null : 'ocupado', prof, alternativas, vittamed: hl.vittamed };
}
