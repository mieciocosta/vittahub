import React, { useEffect, useRef, useState, useCallback } from 'react';
import { rotaApi, pegarPosicao, distanciaM, fmtHora, fmtDur, fmtKm, LS_ROTA } from '../hooks/rota.js';

/* 🛰 ROTA EM ANDAMENTO — a mesma tela pra atendente (dentro da Logística) e
   pro motorista (página sem login, pelo link).

   O que ela faz, na ordem do dia:
   1. "Iniciar rota": pede o GPS, grava a saída e SÓ ENTÃO libera o Google
      Maps com o roteiro (ordem do master: iniciar é obrigatório).
   2. Enquanto a página fica aberta, manda a posição a cada ~20 s. Trocou de
      app? O último lote sai em modo keepalive. Voltou? Continua.
   3. Em cada casa: "Cheguei" e "Saí" (é o que casa a parada com a agenda).
   4. "Finalizar": grava a hora de volta e fecha a rota.

   Limite honesto: o navegador não rastreia com a página fechada. Por isso o
   aviso "mantenha aberta" é grande, e a tela pede pra não apagar. */

const INTERVALO_ENVIO_MS = 20000;
const pilula = (bg, cor) => ({ padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 800, background: bg, color: cor, whiteSpace: 'nowrap' });
const botao = (bg, extra = {}) => ({ border: 'none', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
  background: bg, color: '#fff', boxShadow: '0 3px 10px rgba(0,0,0,.14)', ...extra });

export default function RotaAtiva({ token, rotaInicial, modo = 'equipe', nomeSugerido = '', usuarioId = null, onChange }) {
  const [rota, setRota] = useState(rotaInicial || null);
  const [condutor, setCondutor] = useState(nomeSugerido || '');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState('');          // 'iniciar' | 'finalizar' | 'parada:<id>'
  const [gps, setGps] = useState({ status: 'parado', ultimo: null, erro: '' });
  const [kmLocal, setKmLocal] = useState(0);
  const [pontosLocais, setPontosLocais] = useState(0);
  const [chegadas, setChegadas] = useState({});         // evento_id → {chegada, saida}
  const [confirmaFim, setConfirmaFim] = useState(false);
  const [obs, setObs] = useState('');
  const [, setTick] = useState(0);
  const buffer = useRef([]);
  const ultimoPonto = useRef(null);
  const watchId = useRef(null);
  const wakeLock = useRef(null);
  const rotaRef = useRef(rota);
  rotaRef.current = rota;

  const atualizar = useCallback((r) => { setRota(r); onChange && onChange(r); }, [onChange]);

  // Recarrega do servidor (chegadas já feitas, situação) ao montar
  useEffect(() => {
    let vivo = true;
    rotaApi.publico(token).then(d => {
      if (!vivo) return;
      atualizar(d.rota);
      const m = {};
      (d.rota.chegadas || []).forEach(c => { if (!c.evento_id) return; m[c.evento_id] = m[c.evento_id] || {}; m[c.evento_id][c.tipo] = c.em; });
      setChegadas(m);
    }).catch(e => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [token]); // eslint-disable-line

  // Relógio da tela (tempo de rota) — a cada 30 s
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t); }, []);

  // ── Rastreio ──────────────────────────────────────────────────────────────
  const enviarBuffer = useCallback(async (keepalive = false) => {
    const r = rotaRef.current;
    if (!r || r.status !== 'em_andamento' || !buffer.current.length) return;
    const lote = buffer.current.splice(0, buffer.current.length);
    if (keepalive) { rotaApi.pontosKeepalive(token, lote); return; }
    try { await rotaApi.pontos(token, { pontos: lote }); }
    catch (e) {
      // Sem internet agora: guarda de volta e tenta no próximo ciclo (até 500 pontos)
      if (e.status !== 409) buffer.current = lote.concat(buffer.current).slice(-500);
    }
  }, [token]);

  const registrarPosicao = useCallback((p) => {
    const pt = { lat: p.coords.latitude, lng: p.coords.longitude, precisao: Math.round(p.coords.accuracy || 0),
      velocidade: p.coords.speed == null || Number.isNaN(p.coords.speed) ? null : +p.coords.speed.toFixed(1), em: new Date(p.timestamp || Date.now()).toISOString() };
    setGps({ status: 'ok', ultimo: pt, erro: '' });
    if (pt.precisao > 300) return; // GPS perdido não vira trajeto
    const ant = ultimoPonto.current;
    if (ant) {
      const d = distanciaM(ant, pt);
      const dt = (new Date(pt.em) - new Date(ant.em)) / 1000;
      if (d < 15 && dt < 60) return;                        // tremida parado: ignora
      if (dt > 0 && (d / dt) * 3.6 <= 150) setKmLocal(k => k + d / 1000);
    }
    ultimoPonto.current = pt;
    buffer.current.push(pt);
    setPontosLocais(n => n + 1);
  }, []);

  useEffect(() => {
    if (!rota || rota.status !== 'em_andamento') return undefined;
    if (!navigator.geolocation) { setGps({ status: 'sem', ultimo: null, erro: 'Este navegador não tem GPS.' }); return undefined; }
    setGps(g => ({ ...g, status: 'ligando' }));
    watchId.current = navigator.geolocation.watchPosition(registrarPosicao,
      (e) => setGps(g => ({ ...g, status: e.code === 1 ? 'negado' : 'erro', erro: e.code === 1 ? 'GPS negado — libere a localização pro site.' : 'GPS sem sinal no momento.' })),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    const timer = setInterval(() => enviarBuffer(false), INTERVALO_ENVIO_MS);
    const aoEsconder = () => { if (document.visibilityState === 'hidden') enviarBuffer(true); };
    document.addEventListener('visibilitychange', aoEsconder);
    window.addEventListener('pagehide', () => enviarBuffer(true));
    // Tela acesa enquanto a rota anda (onde o navegador deixa)
    try { navigator.wakeLock?.request('screen').then(w => { wakeLock.current = w; }).catch(() => {}); } catch { /* sem wake lock */ }
    try { localStorage.setItem(LS_ROTA, JSON.stringify({ token, modo, em: Date.now() })); } catch { /* sem storage */ }
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', aoEsconder);
      try { wakeLock.current?.release?.(); } catch { /* ok */ }
      enviarBuffer(true);
    };
  }, [rota?.status]); // eslint-disable-line

  // ── Ações ─────────────────────────────────────────────────────────────────
  const iniciar = async () => {
    setErro('');
    if (!condutor.trim()) { setErro('Diga quem está dirigindo.'); return; }
    setOcupado('iniciar');
    try {
      const pos = await pegarPosicao({ timeout: 20000 });
      const d = await rotaApi.iniciar(token, { ...pos, condutor_nome: condutor.trim(), usuario_id: usuarioId, dispositivo: navigator.userAgent.slice(0, 150) });
      ultimoPonto.current = pos;
      atualizar(d.rota);
      // Só agora o Maps: abrir antes de iniciar era o furo que o master quis fechar
      if (d.rota.maps) { try { window.open(d.rota.maps, '_blank', 'noopener'); } catch { /* popup bloqueado: o botão abaixo abre */ } }
    } catch (e) { setErro(e.message); }
    finally { setOcupado(''); }
  };

  const marcar = async (visita, tipo) => {
    setErro(''); setOcupado(`${tipo}:${visita.evento_id}`);
    try {
      const pos = await pegarPosicao({ timeout: 20000 });
      const d = await rotaApi.parada(token, { ...pos, tipo, evento_id: visita.evento_id });
      setChegadas(m => ({ ...m, [visita.evento_id]: { ...(m[visita.evento_id] || {}), [tipo]: d.em } }));
    } catch (e) { setErro(e.message); }
    finally { setOcupado(''); }
  };

  const finalizar = async () => {
    setErro(''); setOcupado('finalizar');
    try {
      await enviarBuffer(false);
      let pos = {};
      try { pos = await pegarPosicao({ timeout: 12000 }); } catch { /* finaliza mesmo sem GPS */ }
      const d = await rotaApi.finalizar(token, { ...pos, observacoes: obs.trim() || undefined });
      atualizar(d.rota);
      setConfirmaFim(false);
      try { localStorage.removeItem(LS_ROTA); } catch { /* ok */ }
    } catch (e) { setErro(e.message); }
    finally { setOcupado(''); }
  };

  if (!rota) return <div style={{ padding: 18, color: 'var(--muted,#64748b)', fontSize: 13 }}>{erro ? `⚠️ ${erro}` : 'Carregando a rota…'}</div>;

  const visitas = rota.visitas || [];
  const minutos = rota.iniciada_em ? Math.round(((rota.finalizada_em ? new Date(rota.finalizada_em) : new Date()) - new Date(rota.iniciada_em)) / 60000) : null;
  const ehMotorista = modo === 'motorista';

  // ── Aguardando: quem dirige + iniciar ─────────────────────────────────────
  if (rota.status === 'aguardando') {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ padding: '12px 14px', borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 13, lineHeight: 1.55, marginBottom: 12 }}>
          <b>▶ Iniciar a rota é obrigatório antes de sair.</b> Ao iniciar, o sistema grava a hora de saída, abre o roteiro no Google Maps e passa a registrar o trajeto. Mantenha esta página aberta no celular durante a rota.
        </div>
        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: 'var(--muted,#64748b)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 5 }}>Quem está dirigindo hoje?</label>
        <input value={condutor} onChange={e => setCondutor(e.target.value)} placeholder="Nome de quem vai no volante"
          style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--border,#dbe3ea)', fontSize: 16, marginBottom: 12, boxSizing: 'border-box', background: 'var(--card,#fff)', color: 'var(--txt,#14202b)' }} />
        <div style={{ fontSize: 12.5, color: 'var(--txt2,#334155)', marginBottom: 12 }}>
          {visitas.length ? `${visitas.length} visita${visitas.length === 1 ? '' : 's'} na agenda de hoje: ${visitas.map(v => `${v.hora || '--:--'} ${v.paciente || ''}`).join(' · ')}` : 'Nenhuma visita em casa na agenda de hoje — a rota pode ser iniciada mesmo assim.'}
        </div>
        {erro && <div style={{ color: '#b91c1c', fontWeight: 700, fontSize: 13, marginBottom: 10 }}>⚠️ {erro}</div>}
        <button onClick={iniciar} disabled={!!ocupado} style={{ ...botao('#0e7490', { width: '100%', padding: '15px', fontSize: 16 }), opacity: ocupado ? .7 : 1 }}>
          {ocupado === 'iniciar' ? '📡 Pegando sua localização…' : '▶ Iniciar rota agora'}
        </button>
      </div>
    );
  }

  // ── Finalizada ────────────────────────────────────────────────────────────
  if (rota.status !== 'em_andamento') {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ padding: '12px 14px', borderRadius: 12, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontSize: 13.5, lineHeight: 1.6 }}>
          <b>✅ Rota {rota.status === 'abandonada' ? 'encerrada automaticamente' : 'finalizada'}.</b> Saída {fmtHora(rota.iniciada_em)} · volta {fmtHora(rota.finalizada_em)} · {fmtDur(rota.minutos ?? minutos)} · {fmtKm(rota.km_total)}
          {rota.condutor_nome ? ` · ${rota.condutor_nome}` : ''}
          {rota.status === 'abandonada' && <div style={{ fontSize: 12, marginTop: 4 }}>Ficou aberta por mais de 14 h e o sistema encerrou sozinho. Da próxima vez, toque em "Finalizar" ao voltar.</div>}
        </div>
        {!ehMotorista && <div style={{ fontSize: 12, color: 'var(--muted,#64748b)', marginTop: 10 }}>O trajeto completo e a análise ficam na aba 🛰 Rotas GPS, que é só do master.</div>}
      </div>
    );
  }

  // ── Em andamento ──────────────────────────────────────────────────────────
  const corGps = gps.status === 'ok' ? ['#dcfce7', '#166534'] : gps.status === 'negado' || gps.status === 'erro' ? ['#fee2e2', '#991b1b'] : ['#fef3c7', '#92400e'];
  const rotGps = gps.status === 'ok' ? `📡 GPS ok${gps.ultimo?.precisao ? ` · ±${gps.ultimo.precisao} m` : ''}` : gps.status === 'ligando' ? '📡 ligando o GPS…' : gps.status === 'negado' ? '📡 GPS negado' : gps.status === 'erro' ? '📡 GPS sem sinal' : '📡 GPS';
  return (
    <div>
      <div style={{ padding: '12px 16px', background: 'linear-gradient(90deg,#0e7490,#0891b2)', color: '#fff', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ fontWeight: 900, fontSize: 14 }}>🟢 Rota em andamento</span>
        <span style={{ fontSize: 12, opacity: .95 }}>desde {fmtHora(rota.iniciada_em)}{rota.condutor_nome ? ` · ${rota.condutor_nome}` : ''}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={pilula('rgba(255,255,255,.18)', '#fff')}>⏱ {fmtDur(minutos)}</span>
          <span style={pilula('rgba(255,255,255,.18)', '#fff')}>🚗 {fmtKm(kmLocal)}</span>
          <span style={pilula(corGps[0], corGps[1])}>{rotGps}</span>
        </span>
      </div>
      <div style={{ padding: 14 }}>
        {(gps.status === 'negado' || gps.status === 'erro') && (
          <div style={{ padding: '9px 12px', borderRadius: 10, background: '#fee2e2', color: '#991b1b', fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>⚠️ {gps.erro} Sem GPS a rota fica sem trajeto.</div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {rota.maps && <a href={rota.maps} target="_blank" rel="noreferrer" style={{ ...botao('#0e7490'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>🗺️ Abrir roteiro no Google Maps</a>}
          <span style={{ fontSize: 12, color: 'var(--muted,#64748b)', alignSelf: 'center' }}>Mantenha esta página aberta (pode voltar pro Maps e retornar).</span>
        </div>
        {erro && <div style={{ color: '#b91c1c', fontWeight: 700, fontSize: 13, marginBottom: 10 }}>⚠️ {erro}</div>}

        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted,#64748b)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Visitas de hoje — toque "Cheguei" ao chegar e "Saí" ao sair</div>
        {visitas.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted,#64748b)', marginBottom: 10 }}>Nenhuma visita em casa na agenda.</div>}
        {visitas.map((v, i) => {
          const c = chegadas[v.evento_id] || {};
          return (
            <div key={v.evento_id || i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: i ? '1px solid var(--border,#e5e9ef)' : 'none', flexWrap: 'wrap' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: c.chegada ? '#dcfce7' : '#fdf5e8', color: c.chegada ? '#166534' : '#a97c25', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12, flexShrink: 0 }}>{c.chegada ? '✓' : i + 1}</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--txt,#14202b)' }}>{v.hora || '--:--'} · {v.paciente || 'Paciente'}</div>
                <div style={{ fontSize: 12, color: 'var(--txt2,#334155)' }}>{v.endereco ? <a href={v.maps || '#'} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>📍 {v.endereco}</a> : <span style={{ color: '#b91c1c', fontWeight: 700 }}>⚠️ sem endereço cadastrado</span>}{v.servico ? ` · 💉 ${v.servico}` : ''}</div>
                {(c.chegada || c.saida) && <div style={{ fontSize: 11.5, color: '#166534', fontWeight: 700 }}>{c.chegada ? `chegou ${fmtHora(c.chegada)}` : ''}{c.saida ? ` · saiu ${fmtHora(c.saida)}` : ''}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {!c.chegada && <button onClick={() => marcar(v, 'chegada')} disabled={!!ocupado} style={botao('#16a34a', { padding: '9px 12px', fontSize: 13 })}>{ocupado === `chegada:${v.evento_id}` ? '📡…' : '📍 Cheguei'}</button>}
                {c.chegada && !c.saida && <button onClick={() => marcar(v, 'saida')} disabled={!!ocupado} style={botao('#64748b', { padding: '9px 12px', fontSize: 13 })}>{ocupado === `saida:${v.evento_id}` ? '📡…' : '🚗 Saí'}</button>}
              </div>
            </div>
          );
        })}

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border,#e5e9ef)' }}>
          {!confirmaFim ? (
            <button onClick={() => setConfirmaFim(true)} style={{ ...botao('#b45309', { width: '100%', padding: 14 }) }}>⏹ Finalizar rota (cheguei de volta)</button>
          ) : (
            <div style={{ padding: 12, borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e', marginBottom: 8 }}>Finalizar agora? A hora de volta fica registrada e o rastreio para.</div>
              <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional): trânsito, imprevisto, parada extra…"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #fde68a', fontSize: 14, marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={finalizar} disabled={!!ocupado} style={botao('#b45309', { flex: 1 })}>{ocupado === 'finalizar' ? 'Finalizando…' : '✓ Sim, finalizar'}</button>
                <button onClick={() => setConfirmaFim(false)} disabled={!!ocupado} style={botao('#94a3b8')}>Voltar</button>
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--muted,#64748b)', marginTop: 8 }}>{pontosLocais} ponto(s) de GPS nesta sessão · o trajeto e a análise ficam só com o master.</div>
        </div>
      </div>
    </div>
  );
}
