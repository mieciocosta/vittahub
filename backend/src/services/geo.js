import { query } from '../db/pool.js';

/* ═══ GEOLOCALIZAÇÃO DA AUDITORIA (ordem do master, 15/09/2026) ═══════════════
   "Na geolocalização ele está pegando somente a região do centro — um valor
   default. Preciso da localização exata do endereço de cada IP logado."

   O que existia: o IP virava cidade pelo ip-api, e a coordenada devolvida por
   ele é o CENTRO da cidade (é assim que o provedor registra a rede — não
   existe endereço de rua num IP; a Claro sabe que o cliente está em São Luís,
   não em qual rua). Os pontos do aparelho (GPS/Wi-Fi do navegador) esses sim
   são precisos, mas ficavam soltos: coordenada crua, sem endereço, sem margem
   de erro e sem ligação com a rede que estava em uso naquele momento.

   Este serviço fecha as três pontas:
   • enderecoDe(lat, lng) — o ponto do aparelho vira ENDEREÇO legível (rua,
     número, bairro, cidade) por geocodificação reversa (OpenStreetMap /
     Nominatim; BigDataCloud como reserva), com cache no banco — nada é
     consultado duas vezes, nada do que já existe é apagado;
   • localizarIP(ip) — a rede continua virando cidade + provedor, agora com
     as marcas de proxy/VPN/datacenter (acesso escondido é sinal de segurança)
     e rotulada como "área da operadora", não como endereço da pessoa;
   • fila em segundo plano — o histórico inteiro (pontos e IPs já gravados)
     ganha endereço aos poucos, 1 consulta por vez, respeitando o limite dos
     serviços públicos. O painel nunca espera a rede: mostra o que já tem e
     marca o que ainda está sendo localizado.                                */

const NOMINATIM = process.env.GEO_NOMINATIM_URL || 'https://nominatim.openstreetmap.org/reverse';
const BIGDATACLOUD = process.env.GEO_BDC_URL || 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const IPAPI = process.env.GEO_IPAPI_URL || 'http://ip-api.com/json';
const UA = 'VittaHub/1.0 (auditoria interna; contato@vittalissaude.com.br)';
const DESLIGADO = String(process.env.GEO_DESLIGADO || '') === '1';

// Chave do cache de endereço: 4 casas ≈ 11 m — dois pontos na mesma calçada
// dividem o mesmo endereço; do outro lado do quarteirão, não.
export const chaveGeo = (lat, lng) => `geocode_${Number(lat).toFixed(4)}_${Number(lng).toFixed(4)}`;
const ipPrivado = (ip) => /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd|169\.254\.)/.test(ip);
const coordOk = (lat, lng) => Number.isFinite(+lat) && Number.isFinite(+lng) && Math.abs(+lat) <= 90 && Math.abs(+lng) <= 180 && !(+lat === 0 && +lng === 0);

async function fetchJson(url, ms = 6000) {
  const { default: fetch } = await import('node-fetch');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Accept-Language': 'pt-BR' } });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } finally { clearTimeout(t); }
}

/* ── Texto curto do endereço: "Rua X, 123 · Bairro · Cidade" ──────────────── */
export function textoEndereco(e) {
  if (!e || e.vazio) return null;
  const rua = [e.rua, e.numero].filter(Boolean).join(', ');
  return [rua, e.bairro, e.cidade].filter(Boolean).join(' · ') || null;
}

function montarDoNominatim(j) {
  const a = j?.address; if (!a) return null;
  const rua = a.road || a.pedestrian || a.footway || a.residential || a.path || null;
  const bairro = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.hamlet || null;
  const cidade = a.city || a.town || a.village || a.municipality || a.county || null;
  if (!rua && !bairro && !cidade) return null;
  return { rua, numero: a.house_number || null, bairro, cidade, estado: a.state || null, uf: a.state || null, cep: a.postcode || null,
    texto: String(j.display_name || '').slice(0, 160) || null,
    pais: a.country_code ? String(a.country_code).toUpperCase() : null, fonte: 'osm', em: new Date().toISOString() };
}
function montarDoBigDataCloud(j) {
  if (!j) return null;
  const cidade = j.city || j.locality || null;
  const bairro = (j.locality && j.city && j.locality !== j.city) ? j.locality : null;
  if (!cidade && !bairro) return null;
  return { rua: null, numero: null, bairro, cidade, estado: j.principalSubdivision || null, uf: j.principalSubdivision || null, cep: j.postcode || null,
    texto: null, pais: j.countryCode || null, fonte: 'bdc', em: new Date().toISOString() };
}

/* Cache antigo da aba Resumo (georev_<lat3>_<lng3>, 3 casas ≈ 110 m): vale
   como resposta enquanto o ponto fino (4 casas) não é consultado. Nada é
   apagado — as duas chaves convivem. */
const chaveAntiga = (lat, lng) => `georev_${Number(lat).toFixed(3)}_${Number(lng).toFixed(3)}`;
const doAntigo = (v) => (v && !v.vazio) ? { ...v, estado: v.estado || v.uf || null, fonte: v.fonte || 'osm' } : null;

/* Endereço já conhecido (cache), sem tocar na rede. */
export async function enderecosDoCache(pontos) {
  const validos = pontos.filter(p => coordOk(p.lat, p.lng));
  const chaves = [...new Set(validos.map(p => chaveGeo(p.lat, p.lng)))];
  if (!chaves.length) return {};
  const out = {};
  try {
    const { rows } = await query(`SELECT chave, valor FROM configuracoes WHERE chave = ANY($1::text[])`, [chaves]);
    for (const r of rows) out[r.chave] = r.valor || null;
    const faltam = validos.filter(p => !out[chaveGeo(p.lat, p.lng)]);
    if (faltam.length) {
      const antigas = [...new Set(faltam.map(p => chaveAntiga(p.lat, p.lng)))];
      const { rows: r2 } = await query(`SELECT chave, valor FROM configuracoes WHERE chave = ANY($1::text[])`, [antigas]);
      const mapa = {}; for (const r of r2) mapa[r.chave] = r.valor;
      for (const p of faltam) { const v = doAntigo(mapa[chaveAntiga(p.lat, p.lng)]); if (v) out[chaveGeo(p.lat, p.lng)] = v; }
    }
  } catch { /* sem cache, segue */ }
  return out;
}

/* Consulta a rede e grava. Devolve o endereço (ou {vazio:true}). */
export async function enderecoDe(lat, lng) {
  if (!coordOk(lat, lng)) return null;
  const chave = chaveGeo(lat, lng);
  try {
    const { rows: [c] } = await query(`SELECT valor FROM configuracoes WHERE chave = $1`, [chave]);
    if (c?.valor && !c.valor.vazio) return c.valor;
    // vazio recente: não insiste a cada tela (tenta de novo depois de 24h)
    if (c?.valor?.vazio && c.valor.em && Date.now() - new Date(c.valor.em).getTime() < 24 * 3600e3) return c.valor;
    const { rows: [a] } = await query(`SELECT valor FROM configuracoes WHERE chave = $1`, [chaveAntiga(lat, lng)]);
    const v = doAntigo(a?.valor); if (v) return v;
  } catch { /* segue */ }
  if (DESLIGADO) return null;
  let end = null;
  try {
    const j = await fetchJson(`${NOMINATIM}?format=jsonv2&lat=${encodeURIComponent(+lat)}&lon=${encodeURIComponent(+lng)}&zoom=18&addressdetails=1&accept-language=pt-BR`);
    end = montarDoNominatim(j);
  } catch { /* reserva abaixo */ }
  if (!end) {
    try {
      const j = await fetchJson(`${BIGDATACLOUD}?latitude=${encodeURIComponent(+lat)}&longitude=${encodeURIComponent(+lng)}&localityLanguage=pt`);
      end = montarDoBigDataCloud(j);
    } catch { /* fica vazio */ }
  }
  const valor = end || { vazio: true, em: new Date().toISOString() };
  await query(`INSERT INTO configuracoes (chave, valor) VALUES ($1, $2::jsonb)
               ON CONFLICT (chave) DO UPDATE SET valor = $2::jsonb, updated_at = NOW()`,
    [chave, JSON.stringify(valor)]).catch(() => {});
  return valor;
}

/* ── IP → área da operadora (+ proxy/VPN/datacenter) ─────────────────────── */
export async function ipsDoCache(ips) {
  const lista = [...new Set(ips.filter(Boolean))];
  if (!lista.length) return {};
  const out = {};
  try {
    const { rows } = await query(`SELECT chave, valor FROM configuracoes WHERE chave = ANY($1::text[])`, [lista.map(ip => `geoip_${ip}`)]);
    for (const r of rows) out[String(r.chave).replace('geoip_', '')] = r.valor || null;
  } catch { /* segue */ }
  return out;
}

export async function localizarIP(ip) {
  const limpo = String(ip || '').trim();
  if (!limpo || limpo === 'unknown' || ipPrivado(limpo)) return null;
  try {
    const { rows: [cache] } = await query('SELECT valor FROM configuracoes WHERE chave = $1', [`geoip_${limpo}`]);
    if (cache?.valor?.vazio && cache.valor.em && Date.now() - new Date(cache.valor.em).getTime() < 24 * 3600e3) return null;
    /* Cache completo = tem cidade, coordenada E as marcas de proxy (as antigas
       não têm; refaz uma vez pra completar sem apagar o que já sabia). */
    if (cache?.valor?.cidade && cache.valor.lat !== undefined && cache.valor.proxy !== undefined && cache.valor.precisao) return cache.valor;
  } catch { /* sem cache, segue */ }
  if (DESLIGADO) return null;
  let loc = null;
  try {
    const j = await fetchJson(`${IPAPI}/${encodeURIComponent(limpo)}?fields=status,country,regionName,city,district,zip,lat,lon,isp,org,as,mobile,proxy,hosting&lang=pt-BR`, 3500);
    if (j && j.status === 'success') {
      loc = { cidade: j.city || null, estado: j.regionName || null, pais: j.country || null,
        bairro: j.district || null, cep: j.zip || null,
        lat: typeof j.lat === 'number' ? j.lat : null, lng: typeof j.lon === 'number' ? j.lon : null,
        provedor: String(j.isp || '').slice(0, 60), org: String(j.org || '').slice(0, 60) || null, asn: String(j.as || '').slice(0, 60) || null,
        movel: !!j.mobile, proxy: !!j.proxy, hosting: !!j.hosting,
        /* 🎯 O que a coordenada do IP vale, escrito: 'bairro' (≈1,5 km),
           'cidade' (≈8 km) ou 'movel' (4G: o IP não diz onde a pessoa está).
           É o formato que a aba Resumo lê (sessão paralela de 15/09). */
        precisao: j.mobile ? 'movel' : j.district ? 'bairro' : 'cidade',
        raio_km: j.mobile ? 30 : j.district ? 1.5 : 8,
        atualizado: new Date().toISOString(), em: new Date().toISOString() };
    }
  } catch { /* melhor esforço */ }
  await query(`INSERT INTO configuracoes (chave, valor) VALUES ($1, $2::jsonb)
               ON CONFLICT (chave) DO UPDATE SET valor = $2::jsonb, updated_at = NOW()`,
    [`geoip_${limpo}`, JSON.stringify(loc || { vazio: true, em: new Date().toISOString() })]).catch(() => {});
  return loc;
}

/* ── FILA EM SEGUNDO PLANO ─────────────────────────────────────────────────
   Uma consulta por vez, com folga (o Nominatim pede no máximo 1/s; o ip-api,
   45/min). O painel só enfileira; quem resolve é o tique. */
const fila = [];            // { tipo:'ponto', lat, lng } | { tipo:'ip', ip }
const naFila = new Set();
let tique = null, varredura = null;

export function pedirEndereco(lat, lng) {
  if (DESLIGADO || !coordOk(lat, lng)) return;
  const k = chaveGeo(lat, lng);
  if (naFila.has(k) || fila.length > 2000) return;
  naFila.add(k); fila.push({ tipo: 'ponto', lat: +lat, lng: +lng, k });
}
export function pedirIP(ip) {
  const limpo = String(ip || '').trim();
  if (DESLIGADO || !limpo || limpo === 'unknown' || ipPrivado(limpo)) return;
  const k = `geoip_${limpo}`;
  if (naFila.has(k) || fila.length > 2000) return;
  naFila.add(k); fila.push({ tipo: 'ip', ip: limpo, k });
}
export const tamanhoFila = () => fila.length;

async function processarUm() {
  const item = fila.shift();
  if (!item) return;
  try {
    if (item.tipo === 'ponto') await enderecoDe(item.lat, item.lng);
    else await localizarIP(item.ip);
  } catch { /* nunca derruba o tique */ }
  finally { naFila.delete(item.k); }
}

/* Varredura: o que já está gravado e ainda não tem endereço entra na fila —
   é assim que o histórico dos últimos meses ganha endereço sem ninguém
   pedir, e sem apagar nada. */
export async function varrerPendentes({ dias = 120, limite = 40 } = {}) {
  if (DESLIGADO) return { pontos: 0, ips: 0 };
  let pontos = 0, ips = 0;
  try {
    const { rows } = await query(`
      SELECT DISTINCT ROUND(latitude::numeric, 4) lat, ROUND(longitude::numeric, 4) lng
        FROM audit_logs
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
         AND created_at > NOW() - ($1 || ' days')::interval
       ORDER BY 1, 2 LIMIT 3000`, [dias]);
    const cache = await enderecosDoCache(rows.map(r => ({ lat: r.lat, lng: r.lng })));
    for (const r of rows) {
      const c = cache[chaveGeo(r.lat, r.lng)];
      if (c && (!c.vazio || (c.em && Date.now() - new Date(c.em).getTime() < 24 * 3600e3))) continue;
      pedirEndereco(r.lat, r.lng); pontos++;
      if (pontos >= limite) break;
    }
  } catch { /* segue */ }
  try {
    const { rows } = await query(`
      SELECT DISTINCT ip FROM audit_logs
       WHERE ip IS NOT NULL AND created_at > NOW() - ($1 || ' days')::interval LIMIT 1500`, [dias]);
    const cache = await ipsDoCache(rows.map(r => r.ip));
    for (const r of rows) {
      const c = cache[r.ip];
      if (c && ((c.cidade && c.proxy !== undefined) || (c.vazio && c.em && Date.now() - new Date(c.em).getTime() < 24 * 3600e3))) continue;
      pedirIP(r.ip); ips++;
      if (ips >= limite) break;
    }
  } catch { /* segue */ }
  return { pontos, ips };
}

export function iniciarFilaGeo() {
  if (DESLIGADO || tique) return;
  tique = setInterval(() => { processarUm().catch(() => {}); }, 1500);
  // primeira varredura 40 s depois do boot; depois a cada 10 min
  setTimeout(() => { varrerPendentes().catch(() => {}); }, 40 * 1000);
  varredura = setInterval(() => { varrerPendentes().catch(() => {}); }, 10 * 60 * 1000);
  if (tique.unref) tique.unref();
  if (varredura.unref) varredura.unref();
}

/* ── Utilidades do painel ─────────────────────────────────────────────────── */
export function distanciaKm(a, b) {
  if (!a || !b || !coordOk(a.lat, a.lng) || !coordOk(b.lat, b.lng)) return null;
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}

/* Precisão em palavras: o painel diz o que aquele ponto vale. */
export function rotuloPrecisao(m) {
  if (m === null || m === undefined) return { txt: 'precisão não registrada', nivel: 'desconhecida' };
  const v = Number(m);
  if (v <= 60) return { txt: `±${Math.round(v)} m · GPS/Wi-Fi`, nivel: 'alta' };
  if (v <= 500) return { txt: `±${Math.round(v)} m · Wi-Fi`, nivel: 'media' };
  if (v <= 5000) return { txt: `±${(v / 1000).toFixed(1)} km · rede`, nivel: 'baixa' };
  return { txt: `±${Math.round(v / 1000)} km · só pela rede (sem GPS)`, nivel: 'baixa' };
}
