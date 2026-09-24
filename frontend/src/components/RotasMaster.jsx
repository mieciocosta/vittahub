import React, { useEffect, useState } from 'react';
import { fmtHora, fmtDur, fmtKm, mapsPonto } from '../hooks/rota.js';

/* 🛰 ROTAS GPS — visão exclusiva do MASTER (ordem de 24/09/2026: "o único
   que vai ter visão disso é o Master"). Lista as rotas do período e abre cada
   uma com o trajeto desenhado, as paradas (quais bateram com uma casa da
   agenda, qual foi a clínica e quais ficaram FORA da agenda) e as visitas
   marcadas que não tiveram "Cheguei".

   O mapa é um desenho do próprio trajeto (SVG), sem depender de mapa
   externo: os pontos viram um traçado em escala de metros; cada parada tem o
   link pra abrir no Google Maps. É o suficiente pra ver se o carro foi onde a
   agenda mandava — e aonde mais foi. */

const ST = { aguardando: ['Aguardando início', '#92400e', '#fffbeb'], em_andamento: ['🟢 Em andamento', '#065f46', '#ecfdf5'], finalizada: ['Finalizada', '#1e40af', '#eff6ff'], abandonada: ['Encerrada sem finalizar', '#991b1b', '#fef2f2'] };
const fmtData = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '';
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const diasAtrasISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function RotasMaster({ api }) {
  const [de, setDe] = useState(diasAtrasISO(30));
  const [ate, setAte] = useState(hojeISO());
  const [lista, setLista] = useState(null);
  const [sel, setSel] = useState(null);      // detalhe carregado
  const [carregandoDet, setCarregandoDet] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = () => { setErro(''); api.get(`/rotas?de=${de}&ate=${ate}`).then(d => setLista(d.rotas || [])).catch(e => { setErro(e.message); setLista([]); }); };
  useEffect(() => { carregar(); }, [de, ate]); // eslint-disable-line

  const abrir = async (id) => {
    setCarregandoDet(true); setErro('');
    try { setSel(await api.get(`/rotas/${id}`)); } catch (e) { setErro(e.message); }
    setCarregandoDet(false);
  };
  const reanalisar = async (encerrar) => {
    if (!sel) return;
    try { await api.post(`/rotas/${sel.rota.id}/analisar`, encerrar ? { encerrar: true } : {}); await abrir(sel.rota.id); carregar(); } catch (e) { setErro(e.message); }
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '13px 20px', background: 'linear-gradient(90deg,#1e3a5f,#0e7490)', color: '#fff', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>🛰 Rotas GPS · só o master vê</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
          <input type="date" value={de} onChange={e => setDe(e.target.value)} style={{ padding: '5px 8px', borderRadius: 8, border: 'none', fontSize: 12 }} />
          até
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={{ padding: '5px 8px', borderRadius: 8, border: 'none', fontSize: 12 }} />
        </span>
      </div>
      <div style={{ padding: '10px 18px', fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.55, borderBottom: '1px solid var(--border)' }}>
        Cada rota nasce do botão <b>▶ Iniciar rota</b> da Logística (ou do link do motorista). O sistema grava saída, trajeto, "Cheguei"/"Saí" em cada casa e a volta; ao finalizar, aponta as <b>paradas fora da agenda</b> (parou 5+ min num lugar sem "Cheguei" por perto e longe da clínica) e as visitas sem chegada registrada.
        <span style={{ color: 'var(--muted)' }}> GPS de celular erra 5–50 m e só grava com a página aberta: use como sinal, e confirme antes de concluir.</span>
      </div>
      {erro && <div style={{ padding: '10px 18px', color: 'var(--err,#b91c1c)', fontWeight: 700, fontSize: 13 }}>⚠️ {erro}</div>}

      {lista === null ? <div style={{ padding: 24, color: 'var(--muted)' }}>Carregando…</div>
        : lista.length === 0 ? <div style={{ padding: '34px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13.5 }}>Nenhuma rota registrada no período. A primeira aparece assim que a equipe tocar em "Iniciar rota".</div>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ background: 'var(--bg2,#f4f7f9)', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: .4 }}>
                {['Dia', 'Quem dirigiu', 'Saída → volta', 'Duração', 'Km', 'Visitas', 'Fora da agenda', 'Situação'].map(x => <th key={x} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800 }}>{x}</th>)}
              </tr></thead>
              <tbody>
                {lista.map(r => {
                  const [rot, cor, bg] = ST[r.status] || ST.aguardando;
                  const fora = r.fora_agenda || 0, semCheg = r.visitas_sem_chegada || 0;
                  return (
                    <tr key={r.id} onClick={() => abrir(r.id)} style={{ cursor: 'pointer', borderTop: '1px solid var(--border)', background: sel?.rota?.id === r.id ? 'var(--bg2,#f4f7f9)' : 'transparent' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 800, textTransform: 'capitalize' }}>{fmtData(r.data)}</td>
                      <td style={{ padding: '9px 12px' }}>{r.condutor_nome || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{fmtHora(r.iniciada_em)} → {fmtHora(r.finalizada_em)}</td>
                      <td style={{ padding: '9px 12px' }}>{fmtDur(r.minutos)}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 800 }}>{r.status === 'aguardando' ? '—' : fmtKm(r.km_total)}</td>
                      <td style={{ padding: '9px 12px' }}>{r.chegadas}/{r.visitas_previstas} com Cheguei{semCheg ? <span style={{ color: '#b45309', fontWeight: 800 }}> · {semCheg} sem</span> : ''}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 900, color: fora ? '#b91c1c' : '#166534' }}>{r.status === 'aguardando' ? '—' : fora ? `⚠ ${fora}` : '✓ 0'}</td>
                      <td style={{ padding: '9px 12px' }}><span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 800, color: cor, background: bg }}>{rot}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      {carregandoDet && <div style={{ padding: 18, color: 'var(--muted)' }}>Abrindo a rota…</div>}
      {sel && !carregandoDet && <DetalheRota det={sel} onReanalisar={() => reanalisar(false)} onEncerrar={() => reanalisar(true)} onFechar={() => setSel(null)} />}
    </div>
  );
}

function DetalheRota({ det, onReanalisar, onEncerrar, onFechar }) {
  const { rota, analise, trajeto, marcos } = det;
  const paradas = analise?.paradas || [];
  const [rot, cor, bg] = ST[rota.status] || ST.aguardando;
  const visitasPorId = new Map((rota.visitas || []).map(v => [String(v.evento_id), v]));
  const semChegada = analise?.visitas_sem_chegada || [];
  const dirMaps = (() => {
    const pts = [...marcos.filter(m => m.tipo === 'inicio'), ...paradas.map(p => ({ lat: p.lat, lng: p.lng })), ...marcos.filter(m => m.tipo === 'fim')].slice(0, 10);
    return pts.length >= 2 ? `https://www.google.com/maps/dir/${pts.map(p => `${p.lat},${p.lng}`).join('/')}` : null;
  })();
  return (
    <div style={{ borderTop: '2px solid var(--border)', padding: '14px 18px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <b style={{ fontSize: 14.5, textTransform: 'capitalize' }}>{fmtData(rota.data)} · {rota.condutor_nome || 'sem condutor'}</b>
        <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 800, color: cor, background: bg }}>{rot}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {dirMaps && <a href={dirMaps} target="_blank" rel="noreferrer" className="btn btn-s" style={{ fontSize: 12, textDecoration: 'none' }}>🗺️ Trajeto no Google Maps</a>}
          <button onClick={onReanalisar} className="btn btn-s" style={{ fontSize: 12 }}>↻ Reanalisar</button>
          {rota.status === 'em_andamento' && <button onClick={onEncerrar} className="btn btn-s" style={{ fontSize: 12, color: '#b91c1c' }}>⏹ Encerrar esquecida</button>}
          <button onClick={onFechar} className="btn btn-s" style={{ fontSize: 12 }}>✕</button>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginBottom: 12 }}>
        {[['Saída', fmtHora(rota.iniciada_em)], ['Volta', fmtHora(rota.finalizada_em)], ['Duração', fmtDur(rota.minutos)], ['Km', fmtKm(analise?.km_total ?? rota.km_total)],
          ['Paradas', String(paradas.length)], ['Fora da agenda', String(analise?.fora_agenda || 0)], ['Sem "Cheguei"', String(semChegada.length)], ['Pontos GPS', String(det.total_pontos || 0)]].map(([l, v]) => (
          <div key={l} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', background: 'var(--card)' }}>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase' }}>{l}</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: (l === 'Fora da agenda' && analise?.fora_agenda) || (l === 'Sem "Cheguei"' && semChegada.length) ? '#b91c1c' : 'var(--txt)' }}>{v}</div>
          </div>
        ))}
      </div>

      <MapaTrajeto trajeto={trajeto} marcos={marcos} paradas={paradas} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14, marginTop: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Paradas (5+ min no mesmo lugar)</div>
          {paradas.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nenhuma parada detectada{rota.status === 'em_andamento' ? ' ainda' : ''}.</div>}
          {paradas.map((p, i) => {
            const st = p.tipo === 'visita' ? ['✓ visita da agenda', '#166534', '#ecfdf5'] : p.tipo === 'clinica' ? ['🏥 clínica', '#334155', '#f1f5f9'] : ['⚠ fora da agenda', '#b91c1c', '#fef2f2'];
            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '7px 10px', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 5, background: st[2], fontSize: 12.5 }}>
                <b>{fmtHora(p.inicio)}–{fmtHora(p.fim)}</b><span>{p.minutos} min</span>
                <span style={{ color: st[1], fontWeight: 800 }}>{st[0]}{p.paciente ? ` · ${p.paciente}` : ''}</span>
                <a href={mapsPonto(p.lat, p.lng)} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--tq2,#0e7490)', fontWeight: 700 }}>abrir no Maps ↗</a>
              </div>
            );
          })}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Visitas previstas × "Cheguei"</div>
          {(rota.visitas || []).length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>A agenda não tinha visita em casa neste dia.</div>}
          {(rota.visitas || []).map((v, i) => {
            const ch = marcos.find(m => m.tipo === 'chegada' && String(m.evento_id) === String(v.evento_id));
            const sa = marcos.find(m => m.tipo === 'saida' && String(m.evento_id) === String(v.evento_id));
            return (
              <div key={v.evento_id || i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '7px 10px', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 5, fontSize: 12.5, background: ch ? '#ecfdf5' : '#fff7ed' }}>
                <b>{v.hora || '--:--'}</b><span style={{ fontWeight: 700 }}>{v.paciente}</span>
                <span style={{ color: ch ? '#166534' : '#b45309', fontWeight: 800, marginLeft: 'auto' }}>{ch ? `chegou ${fmtHora(ch.em)}${sa ? ` · saiu ${fmtHora(sa.em)}` : ''}` : 'sem "Cheguei"'}</span>
                {ch && <a href={mapsPonto(ch.lat, ch.lng)} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: 'var(--tq2,#0e7490)', fontWeight: 700 }}>↗</a>}
              </div>
            );
          })}
          {rota.observacoes && <div style={{ fontSize: 12.5, color: 'var(--txt2)', marginTop: 6 }}>📝 {rota.observacoes}</div>}
          {visitasPorId.size > 0 && analise?.gps_fraco > 0 && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>{analise.gps_fraco} ponto(s) de GPS fraco foram ignorados.</div>}
        </div>
      </div>
    </div>
  );
}

/* Desenho do trajeto em escala de metros (sem mapa externo). */
function MapaTrajeto({ trajeto, marcos, paradas }) {
  const todos = [...(trajeto || []), ...(marcos || []), ...(paradas || [])].filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (todos.length < 2) return <div style={{ padding: 16, borderRadius: 12, border: '1px dashed var(--border)', color: 'var(--muted)', fontSize: 12.5, textAlign: 'center' }}>Sem trajeto suficiente pra desenhar (o GPS precisa ficar ligado com a página aberta).</div>;
  const W = 820, H = 420, PAD = 26;
  const lats = todos.map(p => p.lat), lngs = todos.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latMid = (minLat + maxLat) / 2;
  const mx = (lng) => (lng - minLng) * Math.cos(latMid * Math.PI / 180) * 111320;
  const my = (lat) => (maxLat - lat) * 110540;
  const largM = Math.max(mx(maxLng), 50), altM = Math.max(my(minLat), 50);
  const esc = Math.min((W - 2 * PAD) / largM, (H - 2 * PAD) / altM);
  const X = (lng) => PAD + mx(lng) * esc, Y = (lat) => PAD + my(lat) * esc;
  const linha = (trajeto || []).map(p => `${X(p.lng).toFixed(1)},${Y(p.lat).toFixed(1)}`).join(' ');
  const escalaM = largM > 5000 ? 1000 : largM > 1000 ? 500 : 100;
  let nChegada = 0;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#f8fafc' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <polyline points={linha} fill="none" stroke="#0e7490" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" opacity=".85" />
        {(paradas || []).map((p, i) => (
          <g key={'p' + i}>
            <circle cx={X(p.lng)} cy={Y(p.lat)} r={p.tipo === 'fora_agenda' ? 11 : 9} fill={p.tipo === 'visita' ? '#16a34a' : p.tipo === 'clinica' ? '#64748b' : '#dc2626'} opacity=".9" stroke="#fff" strokeWidth="2" />
            <text x={X(p.lng)} y={Y(p.lat) - 14} fontSize="11" fontWeight="800" textAnchor="middle" fill={p.tipo === 'fora_agenda' ? '#b91c1c' : '#334155'}>{p.tipo === 'fora_agenda' ? `⚠ ${p.minutos} min` : p.tipo === 'clinica' ? 'clínica' : `${p.minutos} min`}</text>
          </g>
        ))}
        {(marcos || []).map((m, i) => {
          if (m.tipo === 'chegada') nChegada++;
          const cor = m.tipo === 'inicio' ? '#2563eb' : m.tipo === 'fim' ? '#1e3a5f' : m.tipo === 'chegada' ? '#16a34a' : '#94a3b8';
          const rot = m.tipo === 'inicio' ? 'saída' : m.tipo === 'fim' ? 'volta' : m.tipo === 'chegada' ? `${nChegada}` : '';
          return (
            <g key={'m' + i}>
              {m.tipo === 'inicio' || m.tipo === 'fim'
                ? <rect x={X(m.lng) - 7} y={Y(m.lat) - 7} width="14" height="14" fill={cor} stroke="#fff" strokeWidth="2" rx="3" />
                : <circle cx={X(m.lng)} cy={Y(m.lat)} r={m.tipo === 'chegada' ? 8 : 4} fill={cor} stroke="#fff" strokeWidth="1.5" />}
              {/* saída em cima e volta embaixo do quadrado: quase sempre é o mesmo ponto (a clínica) */}
              {rot && <text x={X(m.lng)} y={Y(m.lat) + (m.tipo === 'chegada' ? 4 : m.tipo === 'inicio' ? -12 : 22)} fontSize={m.tipo === 'chegada' ? 10 : 11} fontWeight="800" textAnchor="middle" fill={m.tipo === 'chegada' ? '#fff' : cor}>{rot}</text>}
            </g>
          );
        })}
        <line x1={W - PAD - escalaM * esc} y1={H - 12} x2={W - PAD} y2={H - 12} stroke="#334155" strokeWidth="2" />
        <text x={W - PAD - (escalaM * esc) / 2} y={H - 16} fontSize="10" textAnchor="middle" fill="#334155">{escalaM >= 1000 ? `${escalaM / 1000} km` : `${escalaM} m`}</text>
      </svg>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '6px 12px', fontSize: 11, color: 'var(--txt2)', borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
        <span>■ azul: saída / volta</span><span>● verde: casa com "Cheguei"</span><span>● cinza: clínica</span><span style={{ color: '#b91c1c', fontWeight: 800 }}>● vermelho: parada fora da agenda</span><span>— linha: trajeto do GPS</span>
      </div>
    </div>
  );
}
