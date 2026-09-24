/* 🛰 ROTA DA LOGÍSTICA — o que a página do motorista e a aba Logística
   compartilham: chamadas por TOKEN (sem login), GPS e contas de distância.
   Ordem do master (24/09/2026): iniciar a rota é obrigatório; o trajeto, as
   paradas e a hora de volta ficam registrados; só o master enxerga depois. */

const BASE = import.meta.env.VITE_API_URL || '';
export const LS_ROTA = 'vh_rota_ativa';

async function req(method, path, body) {
  const res = await fetch(`${BASE}/api/rotas${path}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  let d = null; try { d = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) { const e = new Error(d?.error || `HTTP ${res.status}`); e.status = res.status; e.data = d; throw e; }
  return d;
}

export const rotaApi = {
  publico:   (t)    => req('GET', `/publico/${t}`),
  iniciar:   (t, b) => req('POST', `/publico/${t}/iniciar`, b),
  pontos:    (t, b) => req('POST', `/publico/${t}/pontos`, b),
  parada:    (t, b) => req('POST', `/publico/${t}/parada`, b),
  finalizar: (t, b) => req('POST', `/publico/${t}/finalizar`, b),
  // Ao esconder a página (trocou de app, apagou a tela) o navegador ainda
  // deixa um envio "keepalive" sair — é o que salva os últimos pontos.
  pontosKeepalive: (t, pontos) => {
    try {
      return fetch(`${BASE}/api/rotas/publico/${t}/pontos`, { method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pontos }) }).catch(() => {});
    } catch { return null; }
  },
};

export function distanciaM(a, b) {
  const toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Uma posição, agora. Erros em português — a mensagem vai direto pra tela.
export function pegarPosicao({ timeout = 15000 } = {}) {
  return new Promise((ok, no) => {
    if (!navigator.geolocation) return no(new Error('Este navegador não tem GPS. Abra o link no Chrome ou no Safari do celular.'));
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: Math.round(p.coords.accuracy || 0),
        velocidade: p.coords.speed == null || Number.isNaN(p.coords.speed) ? null : +p.coords.speed.toFixed(1), em: new Date(p.timestamp || Date.now()).toISOString() }),
      (e) => no(new Error(e.code === 1 ? 'GPS negado. Libere a localização pra este site nas permissões do navegador e tente de novo.'
        : e.code === 3 ? 'O GPS demorou pra responder. Vá pra um lugar aberto e tente de novo.' : 'Não consegui pegar a localização agora.')),
      { enableHighAccuracy: true, timeout, maximumAge: 5000 });
  });
}

export const fmtHora = (s) => s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
export const fmtDur = (min) => { if (min == null || Number.isNaN(min)) return '—'; const m = Math.max(0, Math.round(min)); const h = Math.floor(m / 60); return h ? `${h}h${String(m % 60).padStart(2, '0')}` : `${m} min`; };
export const fmtKm = (km) => `${Number(km || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
export const mapsPonto = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
