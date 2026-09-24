import express from 'express';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { auth, masterOnly } from '../middleware/auth.js';

/* ═══ 🛰 ROTA DA LOGÍSTICA COM GPS (ordem do master, 24/09/2026) ═════════════
   "Bota um botão Iniciar a rota, que é pra pegar justamente os dados da rota
    que está sendo usada: horários, trajeto por GPS, quilometragem e hora de
    volta. Iniciar cada rota é OBRIGATÓRIO — o motorista ou a equipe. O intuito
    é perceber se a equipe está desenhando a rota e indo pra outro lugar fora
    do que está na agenda. E o único que vai ter visão disso é o Master."

   Como funciona:
   · A equipe (Logística) gera a rota do dia — nasce um LINK com token, que
     serve pra quem estiver no volante abrir no celular SEM login (o motorista
     não tem conta no CRM). A própria atendente logada usa o mesmo link.
   · "Iniciar rota" grava a hora e o ponto de saída, congela as visitas do dia
     (a agenda pode mudar depois; a rota registra o que estava marcado) e só
     ENTÃO libera o Google Maps. Sem iniciar, não há link do Maps: é assim que
     a obrigação vira regra e não pedido.
   · Enquanto a página fica aberta, o celular manda a posição a cada ~20 s.
     Em cada casa a pessoa toca "Cheguei" e "Saí"; no fim, "Finalizar" grava a
     hora de volta.
   · Ao finalizar, o servidor ANALISA: quilometragem pelo trajeto, paradas
     (parou 5+ min no mesmo lugar) e, pra cada parada, se bate com uma casa da
     agenda (teve "Cheguei" a menos de 250 m) ou com a clínica; o que sobra é
     "parada fora da agenda". Visita da agenda sem "Cheguei" também é apontada.
   · Só o MASTER lista e abre as rotas (trajeto no mapa, paradas, análise). A
     equipe vê apenas a rota em andamento dela (km e tempo), nunca o histórico.

   Limites honestos: GPS de celular tem erro de 5-50 m; só grava com a página
   aberta (o navegador não rastreia em segundo plano); tudo isso está escrito
   na tela do master pra ninguém tirar conclusão de mais de um ponto.        */

const r = express.Router();
const hojeSLZ = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const cut = (v, n) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };

// ── Geometria ───────────────────────────────────────────────────────────────
const R_TERRA = 6371000;
export function distanciaM(a, b) {
  const toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_TERRA * Math.asin(Math.min(1, Math.sqrt(s)));
}

/* Análise do trajeto: km, paradas e o que cada parada é.
   pontos: [{em, lat, lng, precisao, tipo, evento_id}] em ordem de tempo. */
export function analisarTrajeto(pontos, visitas, opts = {}) {
  const RAIO_PARADA = opts.raioParada || 80;      // m — mesmo lugar
  const MIN_PARADA = opts.minParada || 5;         // minutos parado pra contar
  const RAIO_CASA = opts.raioCasa || 250;         // m — "Cheguei" perto da parada
  const RAIO_CLINICA = opts.raioClinica || 200;   // m — perto do ponto de saída
  const bons = pontos.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.precisao == null || p.precisao <= 150))
    .sort((a, b) => new Date(a.em) - new Date(b.em));
  const gps = bons.filter(p => ['gps', 'inicio', 'fim'].includes(p.tipo || 'gps'));
  // Quilometragem: soma dos trechos plausíveis (ignora pulo de GPS > 150 km/h e tremida < 15 m)
  let km = 0, descartados = 0;
  for (let i = 1; i < gps.length; i++) {
    const d = distanciaM(gps[i - 1], gps[i]);
    const dt = (new Date(gps[i].em) - new Date(gps[i - 1].em)) / 1000;
    if (d < 15) continue;
    if (dt > 0 && (d / dt) * 3.6 > 150) { descartados++; continue; }
    km += d;
  }
  // Paradas: sequência de pontos dentro de RAIO_PARADA do centro, por MIN_PARADA+
  const paradas = [];
  let i = 0;
  while (i < gps.length) {
    let j = i; const centro = { lat: gps[i].lat, lng: gps[i].lng }; let n = 1;
    while (j + 1 < gps.length && distanciaM(centro, gps[j + 1]) <= RAIO_PARADA) {
      j++; n++;
      centro.lat += (gps[j].lat - centro.lat) / n; centro.lng += (gps[j].lng - centro.lng) / n;
    }
    const minutos = (new Date(gps[j].em) - new Date(gps[i].em)) / 60000;
    if (j > i && minutos >= MIN_PARADA) paradas.push({ inicio: gps[i].em, fim: gps[j].em, minutos: Math.round(minutos), lat: +centro.lat.toFixed(6), lng: +centro.lng.toFixed(6), pontos: n });
    i = j + 1;
  }
  const chegadas = bons.filter(p => p.tipo === 'chegada');
  const origem = gps[0] || null;
  const visitasPorId = new Map((visitas || []).map(v => [String(v.evento_id), v]));
  paradas.forEach(p => {
    const ch = chegadas.find(c => distanciaM(c, p) <= RAIO_CASA);
    if (ch) { p.tipo = 'visita'; p.evento_id = ch.evento_id || null; p.paciente = visitasPorId.get(String(ch.evento_id))?.paciente || null; }
    else if (origem && distanciaM(origem, p) <= RAIO_CLINICA) p.tipo = 'clinica';
    else p.tipo = 'fora_agenda';
  });
  const comChegada = new Set(chegadas.map(c => String(c.evento_id)).filter(Boolean));
  const visitasSemChegada = (visitas || []).filter(v => !comChegada.has(String(v.evento_id))).map(v => ({ evento_id: v.evento_id, hora: v.hora, paciente: v.paciente }));
  return {
    km_total: +(km / 1000).toFixed(2), pontos: gps.length, pontos_descartados: descartados,
    paradas, fora_agenda: paradas.filter(p => p.tipo === 'fora_agenda').length,
    visitas_previstas: (visitas || []).length, chegadas: chegadas.length, visitas_sem_chegada: visitasSemChegada,
    gps_fraco: pontos.length - bons.length,
  };
}

// ── Visitas do dia (a mesma régua da aba Logística) ─────────────────────────
async function visitasDoDia(data, setor) {
  const { rows } = await query(`SELECT id, hora, paciente, servico, endereco, local_link, telefone, status, setor FROM agenda_eventos WHERE data = $1 ORDER BY hora, created_at`, [data]);
  const semRua = (e) => /^[.\s]*(em\s+sua\s+)?resid[êe]ncia[.\s]*$/i.test(String(e.endereco || '').trim());
  return rows.filter(e => (e.setor || 'vacinas') === (setor || 'vacinas') && e.status !== 'Cancelado' && e.servico !== 'Pós Vacinal'
      && (String(e.endereco || '').trim() || /domic|em casa|resid/i.test(String(e.servico || ''))))
    .map(e => ({ evento_id: e.id, hora: e.hora, paciente: e.paciente, servico: e.servico, endereco: semRua(e) ? null : (String(e.endereco || '').trim() || null),
      telefone: e.telefone || null, maps: e.local_link && /^https?:\/\//i.test(e.local_link) ? e.local_link
        : (String(e.endereco || '').trim() && !semRua(e) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${String(e.endereco).trim()}, São Luís, MA`)}` : null) }));
}
const CLINICA = 'Av. Cel. Colares Moreira, 3A, Renascença, São Luís, MA';
const linkMapsRota = (visitas) => {
  const comRua = visitas.filter(v => v.endereco);
  return comRua.length ? `https://www.google.com/maps/dir/${encodeURIComponent(CLINICA)}/${comRua.map(v => encodeURIComponent(`${v.endereco}, São Luís, MA`)).join('/')}` : null;
};

// Rotas abertas há mais de 14 h viram "abandonada" (a análise roda do mesmo jeito)
async function fecharAbandonadas() {
  const { rows } = await query(`SELECT id FROM rotas WHERE status = 'em_andamento' AND iniciada_em < NOW() - INTERVAL '14 hours'`).catch(() => ({ rows: [] }));
  for (const x of rows) await finalizarRota(x.id, { abandonada: true }).catch(() => {});
}

async function carregarRota(id) {
  const { rows: [rota] } = await query(`SELECT * FROM rotas WHERE id = $1`, [id]);
  return rota || null;
}
async function finalizarRota(id, { lat, lng, precisao, observacoes, abandonada } = {}) {
  const rota = await carregarRota(id);
  if (!rota) return null;
  const agora = new Date();
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    await query(`INSERT INTO rota_pontos (rota_id, lat, lng, precisao, tipo) VALUES ($1,$2,$3,$4,'fim')`, [id, lat, lng, precisao ?? null]);
  }
  const { rows: pontos } = await query(`SELECT em, lat, lng, precisao, tipo, evento_id FROM rota_pontos WHERE rota_id = $1 ORDER BY em`, [id]);
  const analise = analisarTrajeto(pontos, rota.visitas || []);
  const fim = abandonada ? (pontos.length ? new Date(pontos[pontos.length - 1].em) : agora) : agora;
  const minutos = rota.iniciada_em ? Math.max(0, Math.round((fim - new Date(rota.iniciada_em)) / 60000)) : null;
  await query(`UPDATE rotas SET status = $2, finalizada_em = $3, destino_lat = COALESCE($4, destino_lat), destino_lng = COALESCE($5, destino_lng),
      km_total = $6, pontos = $7, minutos = $8, analise = $9, paradas_fora = $10, observacoes = COALESCE($11, observacoes) WHERE id = $1`,
    [id, abandonada ? 'abandonada' : 'finalizada', fim, Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null,
      analise.km_total, analise.pontos, minutos, JSON.stringify(analise), analise.fora_agenda, cut(observacoes, 500)]);
  return carregarRota(id);
}

const publica = (rota, { comToken = true } = {}) => rota && ({
  id: rota.id, token: comToken ? rota.token : undefined, data: rota.data instanceof Date ? rota.data.toISOString().slice(0, 10) : String(rota.data).slice(0, 10),
  setor: rota.setor, status: rota.status, condutor_nome: rota.condutor_nome, criado_por_nome: rota.criado_por_nome,
  iniciada_em: rota.iniciada_em, finalizada_em: rota.finalizada_em, km_total: rota.km_total != null ? +rota.km_total : 0, pontos: rota.pontos || 0, minutos: rota.minutos,
  visitas: rota.visitas || [], maps: linkMapsRota(rota.visitas || []), paradas_fora: rota.paradas_fora || 0, observacoes: rota.observacoes || null,
});

// ═══ EQUIPE (logada): a rota do dia e o link do motorista ═══════════════════
// Qualquer usuário logado da agenda pode gerar (a aba Logística já filtra
// quem é de vacinas). Uma rota "viva" por dia e setor: gerar de novo devolve a
// mesma — o link não muda, o motorista não se perde.
r.get('/dia', auth, async (req, res) => {
  try {
    await fecharAbandonadas();
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data : hojeSLZ();
    const setor = cut(req.query.setor, 20) || 'vacinas';
    const { rows } = await query(`SELECT * FROM rotas WHERE data = $1 AND setor = $2 ORDER BY (status IN ('aguardando','em_andamento')) DESC, id DESC LIMIT 1`, [data, setor]);
    const rota = rows[0] || null;
    // A equipe vê o essencial da rota do dia (pra iniciar/acompanhar), nunca a análise.
    res.json({ rota: rota ? publica(rota) : null, visitas: rota?.visitas?.length ? rota.visitas : await visitasDoDia(data, setor) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/link', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const data = /^\d{4}-\d{2}-\d{2}$/.test(b.data || '') ? b.data : hojeSLZ();
    const setor = cut(b.setor, 20) || 'vacinas';
    const { rows } = await query(`SELECT * FROM rotas WHERE data = $1 AND setor = $2 AND status IN ('aguardando','em_andamento') ORDER BY id DESC LIMIT 1`, [data, setor]);
    if (rows[0]) return res.json({ ok: true, rota: publica(rows[0]), reaproveitada: true });
    const visitas = await visitasDoDia(data, setor);
    const token = crypto.randomBytes(16).toString('hex');
    const { rows: [nova] } = await query(`INSERT INTO rotas (token, data, setor, criado_por, criado_por_nome, status, visitas)
      VALUES ($1,$2,$3,$4,$5,'aguardando',$6) RETURNING *`, [token, data, setor, req.user?.id || null, cut(req.user?.nome, 80), JSON.stringify(visitas)]);
    res.json({ ok: true, rota: publica(nova) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ MOTORISTA (sem login, pelo token) ══════════════════════════════════════
async function rotaPorToken(req, res) {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{32}$/.test(token)) { res.status(404).json({ error: 'Link inválido' }); return null; }
  const { rows: [rota] } = await query(`SELECT * FROM rotas WHERE token = $1`, [token]);
  if (!rota) { res.status(404).json({ error: 'Rota não encontrada — peça o link de novo pra equipe.' }); return null; }
  return rota;
}

r.get('/publico/:token', async (req, res) => {
  try {
    const rota = await rotaPorToken(req, res); if (!rota) return;
    if (rota.status === 'aguardando') {
      // Antes de iniciar, mostra a agenda ATUAL (pode ter mudado desde o link)
      const visitas = await visitasDoDia(publica(rota).data, rota.setor);
      return res.json({ rota: { ...publica(rota), visitas, maps: null } });
    }
    const { rows: [{ n }] } = await query(`SELECT COUNT(*)::int n FROM rota_pontos WHERE rota_id = $1 AND tipo = 'gps'`, [rota.id]);
    const { rows: chegadas } = await query(`SELECT evento_id, tipo, em FROM rota_pontos WHERE rota_id = $1 AND tipo IN ('chegada','saida') ORDER BY em`, [rota.id]);
    res.json({ rota: { ...publica(rota), pontos: n, chegadas, maps: rota.status === 'em_andamento' ? linkMapsRota(rota.visitas || []) : null } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/publico/:token/iniciar', async (req, res) => {
  try {
    const rota = await rotaPorToken(req, res); if (!rota) return;
    const b = req.body || {};
    if (rota.status === 'em_andamento') return res.json({ ok: true, rota: { ...publica(rota), maps: linkMapsRota(rota.visitas || []) }, ja_iniciada: true });
    if (rota.status !== 'aguardando') return res.status(400).json({ error: `Esta rota já foi ${rota.status === 'finalizada' ? 'finalizada' : 'encerrada'}. Peça um link novo pra equipe.` });
    const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180), precisao = num(b.precisao, 0, 100000);
    if (lat == null || lng == null) return res.status(400).json({ error: 'Preciso da sua localização pra iniciar a rota — libere o GPS no navegador.' });
    const condutor = cut(b.condutor_nome, 80);
    if (!condutor) return res.status(400).json({ error: 'Diga quem está dirigindo.' });
    const visitas = await visitasDoDia(publica(rota).data, rota.setor);
    const { rows: [upd] } = await query(`UPDATE rotas SET status = 'em_andamento', iniciada_em = NOW(), origem_lat = $2, origem_lng = $3,
        condutor_nome = $4, condutor_usuario_id = $5, dispositivo = $6, visitas = $7 WHERE id = $1 RETURNING *`,
      [rota.id, lat, lng, condutor, cut(b.usuario_id, 60), cut(b.dispositivo, 160), JSON.stringify(visitas)]);
    await query(`INSERT INTO rota_pontos (rota_id, lat, lng, precisao, tipo) VALUES ($1,$2,$3,$4,'inicio')`, [rota.id, lat, lng, precisao]);
    res.json({ ok: true, rota: { ...publica(upd), maps: linkMapsRota(visitas) } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/publico/:token/pontos', async (req, res) => {
  try {
    const rota = await rotaPorToken(req, res); if (!rota) return;
    if (rota.status !== 'em_andamento') return res.status(409).json({ error: 'Rota não está em andamento.', status: rota.status });
    const lista = (Array.isArray(req.body?.pontos) ? req.body.pontos : []).slice(0, 300);
    let gravados = 0;
    for (const p of lista) {
      const lat = num(p.lat, -90, 90), lng = num(p.lng, -180, 180); if (lat == null || lng == null) continue;
      const precisao = num(p.precisao, 0, 100000); if (precisao != null && precisao > 300) continue; // GPS perdido não vira trajeto
      const em = p.em && !isNaN(new Date(p.em)) ? new Date(p.em) : new Date();
      const vel = num(p.velocidade, 0, 100);
      await query(`INSERT INTO rota_pontos (rota_id, em, lat, lng, precisao, velocidade, tipo) VALUES ($1,$2,$3,$4,$5,$6,'gps')`, [rota.id, em, lat, lng, precisao, vel]);
      gravados++;
    }
    if (gravados) await query(`UPDATE rotas SET pontos = COALESCE(pontos,0) + $2 WHERE id = $1`, [rota.id, gravados]);
    res.json({ ok: true, gravados });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/publico/:token/parada', async (req, res) => {
  try {
    const rota = await rotaPorToken(req, res); if (!rota) return;
    if (rota.status !== 'em_andamento') return res.status(409).json({ error: 'Inicie a rota antes de marcar a chegada.' });
    const b = req.body || {};
    const tipo = b.tipo === 'saida' ? 'saida' : 'chegada';
    const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
    if (lat == null || lng == null) return res.status(400).json({ error: 'Sem localização — libere o GPS e tente de novo.' });
    const eventoId = Number.isInteger(+b.evento_id) ? +b.evento_id : null;
    await query(`INSERT INTO rota_pontos (rota_id, lat, lng, precisao, tipo, evento_id, nota) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [rota.id, lat, lng, num(b.precisao, 0, 100000), tipo, eventoId, cut(b.nota, 200)]);
    res.json({ ok: true, tipo, evento_id: eventoId, em: new Date() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/publico/:token/finalizar', async (req, res) => {
  try {
    const rota = await rotaPorToken(req, res); if (!rota) return;
    if (rota.status === 'finalizada') return res.json({ ok: true, rota: publica(rota), ja_finalizada: true });
    if (rota.status !== 'em_andamento') return res.status(400).json({ error: 'A rota não foi iniciada.' });
    const b = req.body || {};
    const fim = await finalizarRota(rota.id, { lat: num(b.lat, -90, 90), lng: num(b.lng, -180, 180), precisao: num(b.precisao, 0, 100000), observacoes: b.observacoes });
    res.json({ ok: true, rota: { ...publica(fim), maps: null }, resumo: { km: +fim.km_total, minutos: fim.minutos, pontos: fim.pontos } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ MASTER: histórico, trajeto e análise ═══════════════════════════════════
r.get('/', auth, masterOnly, async (req, res) => {
  try {
    await fecharAbandonadas();
    const de = /^\d{4}-\d{2}-\d{2}$/.test(req.query.de || '') ? req.query.de : new Date(Date.now() - 3 * 3600 * 1000 - 30 * 86400000).toISOString().slice(0, 10);
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.ate || '') ? req.query.ate : hojeSLZ();
    const { rows } = await query(`SELECT r.*, (SELECT COUNT(*)::int FROM rota_pontos p WHERE p.rota_id = r.id AND p.tipo = 'chegada') chegadas
      FROM rotas r WHERE r.data BETWEEN $1 AND $2 ORDER BY r.data DESC, r.id DESC LIMIT 200`, [de, ate]);
    res.json({ de, ate, rotas: rows.map(x => ({ ...publica(x, { comToken: false }), chegadas: x.chegadas, visitas_previstas: (x.visitas || []).length,
      visitas_sem_chegada: (x.analise?.visitas_sem_chegada || []).length, fora_agenda: x.analise?.fora_agenda ?? x.paradas_fora ?? 0 })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/:id(\\d+)', auth, masterOnly, async (req, res) => {
  try {
    const rota = await carregarRota(+req.params.id);
    if (!rota) return res.status(404).json({ error: 'Rota não encontrada' });
    const { rows: pontos } = await query(`SELECT em, lat, lng, precisao, velocidade, tipo, evento_id, nota FROM rota_pontos WHERE rota_id = $1 ORDER BY em`, [rota.id]);
    // Rota em andamento: análise parcial na hora, pro master acompanhar ao vivo
    const analise = rota.analise || analisarTrajeto(pontos, rota.visitas || []);
    // Trajeto enxuto pro mapa (até ~600 pontos): o navegador não precisa de 3 mil
    const gps = pontos.filter(p => p.tipo === 'gps' || p.tipo === 'inicio' || p.tipo === 'fim');
    const passo = Math.max(1, Math.ceil(gps.length / 600));
    const trajeto = gps.filter((_, i) => i % passo === 0 || i === gps.length - 1).map(p => ({ em: p.em, lat: p.lat, lng: p.lng, precisao: p.precisao }));
    const marcos = pontos.filter(p => ['inicio', 'fim', 'chegada', 'saida'].includes(p.tipo)).map(p => ({ em: p.em, lat: p.lat, lng: p.lng, tipo: p.tipo, evento_id: p.evento_id, nota: p.nota }));
    res.json({ rota: publica(rota, { comToken: false }), analise, trajeto, marcos, total_pontos: pontos.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reanalisar (depois de ajuste de regra) ou encerrar à força uma rota esquecida aberta
r.post('/:id(\\d+)/analisar', auth, masterOnly, async (req, res) => {
  try {
    const rota = await carregarRota(+req.params.id);
    if (!rota) return res.status(404).json({ error: 'Rota não encontrada' });
    if (rota.status === 'em_andamento' && req.body?.encerrar) { const f = await finalizarRota(rota.id, { abandonada: true }); return res.json({ ok: true, rota: publica(f, { comToken: false }), analise: f.analise }); }
    const { rows: pontos } = await query(`SELECT em, lat, lng, precisao, tipo, evento_id FROM rota_pontos WHERE rota_id = $1 ORDER BY em`, [rota.id]);
    const analise = analisarTrajeto(pontos, rota.visitas || []);
    if (rota.status !== 'em_andamento') await query(`UPDATE rotas SET analise = $2, km_total = $3, pontos = $4, paradas_fora = $5 WHERE id = $1`, [rota.id, JSON.stringify(analise), analise.km_total, analise.pontos, analise.fora_agenda]);
    res.json({ ok: true, analise });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default r;
