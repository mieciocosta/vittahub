import React, { useEffect, useState, useCallback } from 'react';
import { aoVivo } from '../hooks/polling.js';
import { Shield, Search, ChevronLeft, MapPin, Clock, Wifi, WifiOff, Loader2, Monitor, Smartphone } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';
import { fmt } from '../hooks/utils.js';

/* ═══ AUDITORIA VITTAHUB — somente administrador ═══════════════════════════
   3 níveis: Presença (tempo real) + Usuários → Dias → Timeline.
   Localização, ociosidade, IP, dispositivo — mesmo conceito do VittaSys.   */

const ACOES = {
  login: ['🔑', '#059669'], login_falha: ['🚫', '#dc2626'], navegacao: ['📄', '#94a3b8'],
  enviar_msg: ['💬', '#0369a1'], criar_lead: ['➕', '#2563eb'], editar_lead: ['✏️', '#7c3aed'],
  agendar: ['📅', '#0E8C96'], excluir: ['🗑️', '#dc2626'], editar_mensagem: ['✏️', '#d97706'],
  apagar_mensagem: ['🗑️', '#dc2626'], indicacao: ['🎁', '#C4973B'], proposta: ['💰', '#059669'],
  heartbeat: ['💓', '#e2e8f0'],
  abrir_conversa: ['💬', '#0E8C96'], responder: ['↩️', '#0369a1'], copiar: ['📋', '#7c3aed'],
  registrar_venda: ['💰', '#16a34a'], transferir: ['🔁', '#d97706'], classificar: ['🏷️', '#2563eb'],
  mover_pasta: ['📁', '#C4973B'], toggle_bot: ['🤖', '#0E8C96'],
};
const CRIT = ['excluir', 'editar_lead', 'apagar_mensagem', 'editar_mensagem', 'login_falha'];

/* 📍 Como cada ponto do aparelho e cada rede aparecem na tela (15/09/2026,
   ordem do master: "a localização exata do endereço de cada IP"). O ponto do
   aparelho vem com ENDEREÇO (rua, nº, bairro) e PRECISÃO; a rede (IP) vem
   como "área da operadora" — o centro da cidade ou do bairro, que é tudo o
   que um IP sabe dizer. Nunca mais os dois se confundem na leitura. */
const mapsPonto = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
const corPrecisao = (nivel) => nivel === 'alta' ? '#059669' : nivel === 'media' ? '#0E8C96' : nivel === 'baixa' ? '#d97706' : 'var(--muted)';
function PontoChip({ p, rotulo, destaque }) {
  if (!p) return null;
  const txt = p.endereco || (p.pendente ? '⏳ localizando o endereço…' : `${Number(p.lat).toFixed(4)}, ${Number(p.lng).toFixed(4)}`);
  return (
    <a href={mapsPonto(p)} target="_blank" rel="noreferrer"
      title={`Abrir no Google Maps: ${p.lat}, ${p.lng}${p.registros ? ` · ${p.registros} registro(s)` : ''}${p.precisao_txt ? ` · ${p.precisao_txt}` : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, textDecoration: 'none',
        padding: '3px 10px', borderRadius: 99, maxWidth: '100%',
        background: destaque ? 'var(--tq3)' : 'var(--bg2)', color: 'var(--tq2)', border: `1px solid ${destaque ? 'var(--tq)' : 'var(--border)'}` }}>
      <span>📍</span>
      {rotulo && <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{rotulo}</span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txt}</span>
      {p.precisao_txt && <span style={{ fontWeight: 700, color: corPrecisao(p.precisao_nivel) }}>{p.precisao_txt}</span>}
    </a>
  );
}
function RedeArea({ rd }) {
  const badges = [];
  if (rd.proxy) badges.push(['🕵️ proxy/VPN', '#dc2626']);
  if (rd.hosting) badges.push(['🏢 datacenter', '#dc2626']);
  if (rd.movel) badges.push(['📶 rede móvel', 'var(--muted)']);
  /* 🎯 O que a coordenada do IP vale, escrito (sessão de 15/09): bairro ≈1,5 km,
     cidade ≈8 km, e em 4G o IP não localiza. */
  const raio = rd.precisao === 'movel' ? '📱 4G: IP não localiza' : rd.precisao === 'bairro' ? `≈ bairro · raio ${rd.raio_km || 1.5} km` : rd.precisao === 'cidade' ? `≈ cidade · raio ${rd.raio_km || 8} km` : null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
      {rd.cidade ? (
        <a href={rd.lat && rd.lng ? mapsPonto(rd) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([rd.bairro, rd.cidade].filter(Boolean).join(' '))}`}
          target="_blank" rel="noreferrer" title="Área onde a operadora registra esta rede — o centro da cidade ou do bairro, NÃO o endereço da pessoa"
          style={{ color: 'var(--muted)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
          🌐 área da operadora: {[rd.bairro, rd.cidade].filter(Boolean).join(' · ')}
        </a>
      ) : rd.rede_pendente ? <span style={{ color: 'var(--muted)' }}>🌐 ⏳ localizando a rede…</span>
        : <span style={{ color: 'var(--muted)' }}>🌐 rede sem área conhecida</span>}
      {raio && <span title="Localização pelo IP: o provedor entrega um ponto aproximado, não o endereço" style={{ fontWeight: 800, padding: '1px 7px', borderRadius: 20,
        background: rd.precisao === 'movel' ? '#fee2e2' : rd.precisao === 'bairro' ? '#dcfce7' : '#fef3c7',
        color: rd.precisao === 'movel' ? '#991b1b' : rd.precisao === 'bairro' ? '#166534' : '#92400e' }}>{raio}</span>}
      {rd.provedor && <span style={{ color: 'var(--muted)' }}>{rd.provedor}</span>}
      {badges.map(([t, c]) => <span key={t} style={{ fontWeight: 800, color: c, background: c === '#dc2626' ? '#fee2e2' : 'transparent', borderRadius: 8, padding: '1px 7px' }}>{t}</span>)}
    </span>
  );
}

/* 📄 RELATÓRIO COMPLETO DE ACESSOS (ordem do master, 28/08: "quero um relatório
   mais completo e onde eu possa abrir pelo Google Maps"). Abre a folha pronta
   pra imprimir ou salvar em PDF, com tudo o que o painel mostra: resumo de cada
   pessoa, o dia a dia, as redes com bairro e provedor, os episódios de uso
   simultâneo, os sinais de risco e os LINKS do Google Maps de cada ponto. */
function relatorioAcessos(locais, dias, alvo) {
  const esc = (t) => String(t ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const usuarios = alvo ? locais.usuarios.filter(u => u.usuario_id === alvo.usuario_id) : locais.usuarios;
  const hhmm = (t) => new Date(new Date(t).getTime() - 3 * 3600 * 1000).toISOString().slice(11, 16);
  const dataBR = (d) => String(d).split('-').reverse().join('/');
  const maps = (c) => `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;

  const blocoDia = (d) => `
    <div class="dia">
      <div class="dh">
        <b>${dataBR(d.dia)}</b>
        <span>${hhmm(d.primeiro)} às ${hhmm(d.ultimo)}</span>
        <span>${d.eventos} ações</span>
        <span>${d.redes} rede${d.redes > 1 ? 's' : ''}</span>
        ${d.simultaneo ? '<span class="bad">USO SIMULTÂNEO</span>' : ''}
      </div>
      ${(d.sinais || []).length ? `<div class="sin">${d.sinais.map(sg => `<span class="${sg.grave ? 'g' : 'a'}">${esc(sg.txt)}</span>`).join('')}</div>` : ''}
      ${(d.episodios || []).length ? `<div class="epi">${d.episodios.map(e =>
        `<div>🚨 <b>${esc(e.hora)}</b> — ${(e.lugares && e.lugares.length ? e.lugares : (e.ips || []).map(ip => ({ ip }))).map(l => `${esc(l.ip)}${l.ponto ? ` (📍 ${esc(l.ponto.endereco || `${l.ponto.lat}, ${l.ponto.lng}`)})` : ' (aparelho sem localização)'}`).join(' e ')} ativas ao mesmo tempo (${e.eventos} ações)${e.distancia_km !== null && e.distancia_km !== undefined ? ` — <b>${String(e.distancia_km).replace('.', ',')} km entre os dois aparelhos</b>` : ''}</div>`).join('')}</div>` : ''}
      <table class="redes">
        <tr><th>Rede (IP)</th><th>Horário</th><th>Ações</th><th>Aparelho</th><th>Endereço pelo aparelho</th><th>Área da operadora (IP)</th><th>Provedor</th></tr>
        ${(d.redes_detalhe || []).map(rd => { const pt = (rd.pontos || [])[0]; return `<tr>
          <td class="mono">${esc(rd.ip)}</td>
          <td>${esc(rd.de)} às ${esc(rd.ate)}</td>
          <td class="n">${rd.acoes}</td>
          <td>${rd.aparelho === 'celular' ? 'Celular' : 'Computador'}${rd.navegador ? ` · ${esc(rd.navegador)}` : ''}</td>
          <td>${pt ? `<a href="${maps(pt)}">📍 ${esc(pt.endereco || `${pt.lat}, ${pt.lng}`)}</a>${pt.precisao_txt ? ` <small>(${esc(pt.precisao_txt)})</small>` : ''}${(rd.pontos || []).length > 1 ? ` <small>+${rd.pontos.length - 1} lugar(es)</small>` : ''}` : '<small>sem localização do aparelho nesta rede</small>'}</td>
          <td>${rd.cidade ? `<a href="${rd.lat && rd.lng ? maps(rd) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([rd.bairro, rd.cidade].filter(Boolean).join(' '))}`}">${esc([rd.bairro, rd.cidade].filter(Boolean).join(' · '))}</a>${rd.raio_km ? ` <small>(raio ${rd.raio_km} km)</small>` : ''}` : '—'}${rd.proxy ? ' <b class="bad">proxy/VPN</b>' : ''}${rd.hosting ? ' <b class="bad">datacenter</b>' : ''}</td>
          <td>${esc(rd.provedor || '—')}${rd.movel ? ' (móvel)' : ''}</td>
        </tr>`; }).join('')}
      </table>
      ${(d.pontos || d.coords || []).length ? `<div class="pts"><b>Onde esteve (aparelho):</b> ${(d.pontos && d.pontos.length ? d.pontos : d.coords).map((c, i) =>
        `<a href="${maps(c)}">📍 ${esc(c.endereco || `Ponto ${i + 1} (${c.lat}, ${c.lng})`)}</a>${c.precisao_txt ? ` <small>(${esc(c.precisao_txt)})</small>` : ''}`).join(' · ')}
        ${(d.coords || []).length > 1 ? ` · <a href="https://www.google.com/maps/dir/${d.coords.map(c => `${c.lat},${c.lng}`).join('/')}">ver trajeto</a>` : ''}</div>` : ''}
    </div>`;

  const blocoUsuario = (u) => {
    const meus = (locais.por_dia || []).filter(d => d.usuario_id === u.usuario_id);
    const totalAcoes = meus.reduce((t, d) => t + d.eventos, 0);
    const redes = new Set(); meus.forEach(d => (d.ips || []).forEach(i => redes.add(i)));
    const alertas = (locais.simultaneos || []).filter(e => e.usuario_id === u.usuario_id).length;
    return `
      <div class="user">
        <h2>${esc(u.usuario_nome)}</h2>
        <div class="kpis">
          <div class="k"><b>${meus.length}</b><span>dias com acesso</span></div>
          <div class="k"><b>${totalAcoes}</b><span>ações no período</span></div>
          <div class="k"><b>${redes.size}</b><span>redes diferentes</span></div>
          <div class="k"><b>${u.lugares || 0}</b><span>lugares</span></div>
          <div class="k ${alertas ? 'bad' : ''}"><b>${alertas}</b><span>uso simultâneo</span></div>
        </div>
        ${meus.map(blocoDia).join('')}
      </div>`;
  };

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Relatório de acessos — Vittalis Saúde</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;color:#0a1520;background:#fff}
.faixa{height:7px;background:linear-gradient(90deg,#00B8C0,#0E8C96)}
.pg{padding:26px 32px}
.cab{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.cab img{height:66px}
.cab .t{text-align:right}.cab h1{font-size:20px;color:#06424A}
.cab .s{font-size:12px;color:#5a7285;margin-top:3px}
.cab .p{display:inline-block;margin-top:6px;background:#e5f8f9;color:#007d83;padding:3px 11px;border-radius:20px;font-size:10.5px;font-weight:700}
.hr{height:1.5px;background:#e3ebf1;margin:14px 0 18px}
.user{margin-bottom:26px;page-break-inside:avoid}
.user h2{font-size:15px;color:#06424A;border-left:4px solid #00B8C0;padding-left:9px;margin-bottom:9px}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-bottom:12px}
.k{border:1px solid #e3ebf1;border-radius:10px;padding:8px 10px;background:#f8fbfc}
.k b{display:block;font-size:17px;color:#06424A}.k span{font-size:9.5px;color:#5a7285;font-weight:700;text-transform:uppercase}
.k.bad b{color:#b91c1c}
.dia{border:1px solid #e3ebf1;border-radius:10px;padding:9px 11px;margin-bottom:9px;page-break-inside:avoid}
.dh{display:flex;gap:11px;align-items:center;font-size:11.5px;color:#5a7285;flex-wrap:wrap}
.dh b{font-size:13px;color:#0a1520}
.dh .bad,.sin .g{background:#fee2e2;color:#b91c1c;border-radius:6px;padding:1px 7px;font-size:9.5px;font-weight:800}
.sin{margin-top:5px;display:flex;gap:5px;flex-wrap:wrap}
.sin .a{background:#fef3c7;color:#92400e;border-radius:6px;padding:1px 7px;font-size:9.5px;font-weight:800}
.epi{margin-top:5px;background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:6px 9px;font-size:10.5px;color:#b91c1c}
table.redes{width:100%;border-collapse:collapse;margin-top:7px}
table.redes th{background:#06424A;color:#fff;font-size:9px;text-transform:uppercase;padding:4px 7px;text-align:left}
table.redes td{font-size:10.5px;padding:4px 7px;border-top:1px solid #eef3f7}
td.mono{font-family:monospace}td.n{text-align:right;font-weight:700}
a{color:#0e7490}
.pts{margin-top:6px;font-size:10.5px;color:#5a7285}
.rod{margin-top:16px;border-top:1px solid #e3ebf1;padding-top:9px;font-size:9.5px;color:#8fa3b3;line-height:1.55}
@page{size:A4;margin:11mm}
</style></head><body><div class="faixa"></div><div class="pg">
<div class="cab">
  <img src="${window.location.origin}/logos/logo-v-color.png" alt="Vittalis Saúde"/>
  <div class="t"><h1>Relatório de acessos</h1>
  <div class="s">Onde, quando e de qual rede cada pessoa entrou no VittaHub</div>
  <div class="p">Últimos ${dias} dias${alvo ? ` · ${esc(alvo.usuario_nome)}` : ' · equipe toda'}</div></div>
</div><div class="hr"></div>
${usuarios.map(blocoUsuario).join('')}
<div class="rod">Como ler: "Endereço pelo aparelho" é o GPS/Wi-Fi do navegador convertido em rua e bairro, com a margem de erro ao lado (±10 m é GPS; ±10 km é só a rede, sem GPS).
"Área da operadora" é o que o IP sabe dizer: o bairro ou a cidade onde a rede está registrada (por isso cai no centro), nunca o endereço da pessoa; em 4G nem isso. "Uso simultâneo" é o mesmo login ativo de duas redes diferentes no mesmo bloco de 10 minutos,
o sinal clássico de senha emprestada. Gerado em ${new Date().toLocaleString('pt-BR')} · Vittalis Saúde · documento interno.</div>
</div></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html); w.document.close();
  setTimeout(() => w.print(), 700);
}

export default function Auditoria() {
  const api = useApi();
  const { isMaster } = useAuth();
  const [nivel, setNivel] = useState('resumo'); // resumo | presenca | usuarios | dias | timeline | locais | seguranca
  const [resumoSeg, setResumoSeg] = useState(null);   // 🛡️ veredito por pessoa (15/09)
  const [resumoDias, setResumoDias] = useState(30);
  const carregarResumo = () => api.get(`/auditoria/resumo-seguranca?dias=${resumoDias}`).then(setResumoSeg).catch(() => setResumoSeg({ pessoas: [], clinica: null }));
  useEffect(() => { if (nivel === 'resumo') { setResumoSeg(null); carregarResumo(); } }, [nivel, resumoDias]); // eslint-disable-line
  const [selUser, setSelUser] = useState(null);
  const [selDia, setSelDia] = useState(null);
  const [stats, setStats] = useState(null);
  const [presenca, setPresenca] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [dias, setDias] = useState([]);
  // 🔒 Tentativas de copiar telefone e capturas de tela (pedido do master)
  const [seg, setSeg] = useState(null);
  const [acessos, setAcessos] = useState(null);   // 🌐 logins por IP (senha compartilhada aparece)
  useEffect(() => {
    if (nivel !== 'seguranca') return;
    setSeg(null);
    api.get('/auditoria/seguranca?dias=30').then(setSeg).catch(e => setSeg({ erro: e.message }));
    api.get('/auditoria/acessos').then(setAcessos).catch(() => setAcessos(null));
  }, [nivel]); // eslint-disable-line
  // 📸 Banco de prints: a reconstituição da tela de cada captura (30 dias)
  const [prints, setPrints] = useState([]);
  const [printImg, setPrintImg] = useState(null);   // {info, imagem|null=carregando}
  useEffect(() => {
    if (nivel !== 'seguranca') return;
    api.get('/auditoria/prints').then(d => setPrints(Array.isArray(d) ? d : [])).catch(() => {});
  }, [nivel]); // eslint-disable-line
  const verPrint = async (pr) => {
    setPrintImg({ info: pr, imagem: null });
    try { const d = await api.get(`/auditoria/prints/${pr.id}/imagem`); setPrintImg({ info: pr, imagem: d.imagem }); }
    catch { setPrintImg(null); }
  };
  const [timeline, setTimeline] = useState(null);
  const [search, setSearch] = useState('');
  // 📍 Histórico de localização de acesso (pedido do master)
  const [locais, setLocais] = useState(null);
  const [locDias, setLocDias] = useState(30);
  const [locUser, setLocUser] = useState(null);
  useEffect(() => {
    if (nivel !== 'locais') return;
    setLocais(null);
    api.get(`/auditoria/localizacoes?dias=${locDias}`).then(setLocais).catch(e => setLocais({ erro: e.message }));
  }, [nivel, locDias]); // eslint-disable-line

  useEffect(() => { api.get('/auditoria/stats').then(setStats).catch(() => {}); }, []); // eslint-disable-line

  const loadPresenca = useCallback(() => {
    api.get('/auditoria/presenca').then(setPresenca).catch(() => {});
  }, []); // eslint-disable-line
  useEffect(() => { if (nivel === 'presenca') { loadPresenca(); return aoVivo(loadPresenca, 15000); } }, [nivel]); // eslint-disable-line

  useEffect(() => {
    if (nivel === 'usuarios') api.get(`/auditoria/usuarios${search ? `?search=${encodeURIComponent(search)}` : ''}`).then(setUsuarios).catch(() => {});
  }, [nivel, search]); // eslint-disable-line

  useEffect(() => {
    if (nivel === 'dias' && selUser) api.get(`/auditoria/usuario/${selUser.id}/dias`).then(setDias).catch(() => {});
  }, [nivel, selUser?.id]); // eslint-disable-line

  useEffect(() => {
    if (nivel === 'timeline' && selUser && selDia) api.get(`/auditoria/usuario/${selUser.id}/dia/${selDia}`).then(setTimeline).catch(() => {});
  }, [nivel, selUser?.id, selDia]); // eslint-disable-line

  if (!isMaster) return <div style={{ padding: 40, color: 'var(--muted)' }}>Acesso restrito ao administrador.</div>;

  const Breadcrumb = () => (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
      <span onClick={() => { setNivel('presenca'); setSelUser(null); setSelDia(null); }} style={{ cursor: 'pointer', color: 'var(--tq2)', fontWeight: 700 }}>Auditoria</span>
      {(nivel === 'usuarios' || nivel === 'dias' || nivel === 'timeline') && (
        <><span style={{ color: 'var(--light)' }}>›</span><span onClick={() => setNivel('usuarios')} style={{ cursor: 'pointer', color: 'var(--tq2)', fontWeight: 600 }}>Usuários</span></>
      )}
      {(nivel === 'dias' || nivel === 'timeline') && selUser && (
        <><span style={{ color: 'var(--light)' }}>›</span><span onClick={() => setNivel('dias')} style={{ cursor: 'pointer', color: 'var(--tq2)', fontWeight: 600 }}>{selUser.nome?.split(' ')[0]}</span></>
      )}
      {nivel === 'timeline' && selDia && <><span style={{ color: 'var(--light)' }}>›</span><span style={{ fontWeight: 600 }}>{selDia.split('-').reverse().join('/')}</span></>}
    </div>
  );

  const StatCard = ({ label, valor, cor }) => (
    <div style={{ flex: 1, minWidth: 100, padding: '12px 14px', background: 'var(--card)', borderRadius: 11, borderLeft: `3px solid ${cor}`, textAlign: 'center', boxShadow: '0 1px 3px #0001' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor }}>{valor}</div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: .5 }}>{label}</div>
    </div>
  );

  const Avatar = ({ u, size = 36 }) => u.avatar
    ? <img src={u.avatar} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: u.cor || 'var(--tq)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * .35, fontWeight: 800 }}>{fmt.initials(u.nome)}</div>;

  return (
    <div style={{ padding: 28 }}>
      <Breadcrumb />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 27, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><Shield size={22} color="var(--tq2)" /> Auditoria</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>Presença, localização, atividades e ociosidade da equipe</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['resumo', 'presenca', 'usuarios', 'locais', 'seguranca'].map(n => (
            <button key={n} onClick={() => { setNivel(n); setSelUser(null); setSelDia(null); }}
              style={{ padding: '7px 15px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${nivel === n || (n === 'usuarios' && ['dias', 'timeline'].includes(nivel)) ? 'var(--tq)' : 'var(--border)'}`,
                background: nivel === n || (n === 'usuarios' && ['dias', 'timeline'].includes(nivel)) ? 'var(--tq)' : '#fff',
                color: nivel === n || (n === 'usuarios' && ['dias', 'timeline'].includes(nivel)) ? '#fff' : 'var(--muted)' }}>
              {n === 'resumo' ? '🛡️ Resumo' : n === 'presenca' ? '🟢 Tempo Real' : n === 'usuarios' ? '📊 Histórico' : n === 'locais' ? '📍 Localizações' : '🔒 Segurança'}
            </button>
          ))}
        </div>
      </div>

      {stats && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <StatCard label="Total" valor={stats.total || 0} cor="#1B4965" />
          <StatCard label="Hoje" valor={stats.hoje || 0} cor="#0E8C96" />
          <StatCard label="Logins" valor={stats.logins_hoje || 0} cor="#059669" />
          <StatCard label="Críticas" valor={stats.acoes_criticas || 0} cor="#dc2626" />
        </div>
      )}

      {/* ── Presença em tempo real ── */}
      {/* 🔒 SEGURANÇA — quem tentou copiar telefone e quem capturou a tela */}
      {/* ── 📍 LOCALIZAÇÕES: de onde cada pessoa entrou no sistema ──────────
             Duas fontes com confiabilidade bem diferente: GPS do navegador
             (preciso, mas só existe com permissão) e IP (sempre existe, mas
             diz rede, não endereço). A tela mostra as duas e diz qual é qual —
             conclusão sobre gente não se tira de dado que finge precisão. */}
      {/* 🛡️ RESUMO DE SEGURANÇA — o veredito (ordem do master, 15/09: "não consigo
          fazer uma leitura clara; quero saber se a equipe acessa só da clínica,
          e se não, o endereço, o bairro; alerta, nota e resumo por usuário"). */}
      {nivel === 'resumo' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Período:</span>
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setResumoDias(d)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
                border: `1.5px solid ${resumoDias === d ? 'var(--tq)' : 'var(--border)'}`, background: resumoDias === d ? 'var(--tq)' : 'var(--card)', color: resumoDias === d ? '#fff' : 'var(--muted)' }}>{d} dias</button>
            ))}
            {resumoSeg && <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 'auto' }}>
              {resumoSeg.pessoas.filter(p => p.cor === 'vermelho').length} em vermelho · {resumoSeg.pessoas.filter(p => p.cor === 'amarelo').length} em amarelo · {resumoSeg.pessoas.filter(p => p.cor === 'verde').length} em verde
            </span>}
          </div>

          {/* 🏥 O que o sistema considera "a clínica" — e o master ajusta com um clique */}
          {resumoSeg?.clinica && (
            <div className="card" style={{ padding: '12px 16px', marginBottom: 14, borderLeft: '4px solid var(--tq)' }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>🏥 O que conta como "dentro da clínica"</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                Ponto: <b style={{ color: 'var(--txt2)' }}>{resumoSeg.clinica.endereco || 'endereço oficial'}</b>, raio de {resumoSeg.clinica.raio_m} m pelo GPS.
                Redes: as que 3 ou mais pessoas usam no horário comercial (é o Wi-Fi da casa; ninguém divide 4G com o colega), mais as que o senhor marcar.
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {[...new Set([...resumoSeg.clinica.ips_auto.map(x => x.ip), ...resumoSeg.clinica.ips_manuais, ...resumoSeg.clinica.ips_excluidos])].map(ip => {
                  const auto = resumoSeg.clinica.ips_auto.find(x => x.ip === ip);
                  const ativa = resumoSeg.clinica.ips.includes(ip);
                  return (
                    <button key={ip} onClick={() => api.put('/auditoria/clinica', { ip, clinica: !ativa }).then(() => carregarResumo()).catch(() => {})}
                      title={ativa ? 'Clique para deixar de contar como rede da clínica' : 'Clique para contar como rede da clínica'}
                      style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                        border: `1.5px solid ${ativa ? 'var(--tq)' : 'var(--border)'}`, background: ativa ? 'var(--tq4)' : 'var(--bg2)', color: ativa ? 'var(--tq2)' : 'var(--muted)' }}>
                      {ativa ? '✓ ' : '✕ '}{ip}{auto ? ` · ${auto.pessoas} pessoas` : ''}{auto?.provedor ? ` · ${auto.provedor.split(' ')[0]}` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!resumoSeg && <div style={{ fontSize: 13, color: 'var(--muted)', padding: 20 }}>Montando o resumo…</div>}
          {resumoSeg?.pessoas?.map(p => {
            const corBorda = p.cor === 'vermelho' ? '#dc2626' : p.cor === 'amarelo' ? '#d97706' : '#16a34a';
            const corFundo = p.cor === 'vermelho' ? '#fef2f2' : p.cor === 'amarelo' ? '#fffbeb' : '#f0fdf4';
            return (
              <div key={p.usuario_id} className="card" style={{ padding: '14px 16px', marginBottom: 12, borderLeft: `5px solid ${corBorda}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: corFundo, color: corBorda, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: 900, lineHeight: 1 }}>
                    <span style={{ fontSize: 17 }}>{String(p.nota).replace('.', ',')}</span><span style={{ fontSize: 8.5, fontWeight: 700, opacity: .8 }}>nota</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{p.nome}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: p.so_clinica ? '#16a34a' : corBorda, marginTop: 2 }}>
                      {p.so_clinica ? '✅ Só da clínica' : `⚠️ ${p.pct_fora}% do uso fora da clínica`}
                      <span style={{ fontWeight: 600, color: 'var(--muted)' }}> · {p.acoes} ações</span>
                    </div>
                  </div>
                  <button onClick={() => { setLocUser({ usuario_id: p.usuario_id, usuario_nome: p.nome }); setNivel('locais'); }}
                    style={{ padding: '6px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--tq2)', fontWeight: 800, fontSize: 11.5, cursor: 'pointer' }}>
                    Ver dia a dia →
                  </button>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.6, marginTop: 10, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 10 }}>📝 {p.resumo}</div>
                {p.alertas.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {p.alertas.map((a, i) => (
                      <span key={i} style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                        background: a.nivel === 'alto' ? '#fee2e2' : a.nivel === 'medio' ? '#fef3c7' : 'var(--bg2)',
                        color: a.nivel === 'alto' ? '#991b1b' : a.nivel === 'medio' ? '#92400e' : 'var(--muted)' }}>
                        {a.nivel === 'alto' ? '🚨' : a.nivel === 'medio' ? '⚠️' : '•'} {a.txt}
                      </span>
                    ))}
                  </div>
                )}
                {(p.pontos_fora.length > 0 || p.redes.some(r2 => !r2.clinica)) && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 }}>📍 Onde esteve fora da clínica</div>
                    {p.pontos_fora.map((pt, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, padding: '4px 0', borderTop: i ? '1px dashed var(--border)' : 'none' }}>
                        <a href={`https://www.google.com/maps?q=${pt.lat},${pt.lng}`} target="_blank" rel="noreferrer" style={{ color: 'var(--tq2)', fontWeight: 800, textDecoration: 'none', flex: 1, minWidth: 0 }}>
                          {pt.endereco
                            ? `${[pt.endereco.rua, pt.endereco.numero].filter(Boolean).join(', ') || 'rua não identificada'}${pt.endereco.bairro ? ` · ${pt.endereco.bairro}` : ''}${pt.endereco.cidade ? ` · ${pt.endereco.cidade}` : ''}`
                            : `${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)} (endereço sendo buscado)`} 🗺️
                        </a>
                        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>GPS{pt.precisao_m != null ? ` ±${Math.round(pt.precisao_m)} m` : ''} · {pt.dias} dia(s) · {pt.n} ações{pt.dist_m != null ? ` · a ${pt.dist_m >= 1000 ? `${(pt.dist_m / 1000).toFixed(1)} km` : `${pt.dist_m} m`} da clínica` : ''}</span>
                      </div>
                    ))}
                    {p.redes.filter(r2 => !r2.clinica).slice(0, 4).map((r2, i) => (
                      <div key={r2.ip} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, padding: '4px 0', borderTop: (i || p.pontos_fora.length) ? '1px dashed var(--border)' : 'none', color: 'var(--muted)' }}>
                        <span style={{ flex: 1, minWidth: 0 }}>🌐 {r2.movel ? `rede móvel (4G) ${r2.provedor || ''} — o IP não diz onde ela está` : `${[r2.bairro, r2.cidade].filter(Boolean).join(' · ') || r2.ip}${r2.provedor ? ` · ${r2.provedor}` : ''} (aproximado pelo IP${r2.raio_km ? `, raio ${r2.raio_km} km` : ''})`}</span>
                        <span style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{r2.dias} dia(s) · {r2.n} ações</span>
                      </div>
                    ))}
                    {p.pontos_fora.length === 0 && p.gps_negado && <div style={{ fontSize: 11.5, color: '#991b1b', marginTop: 4 }}>Sem endereço exato: ela negou a localização no navegador. Só o IP, que é aproximado.</div>}
                    {p.pontos_fora.length === 0 && !p.gps_negado && p.sem_gps_pct >= 80 && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>Sem endereço exato: o navegador dela ainda não enviou GPS ({p.sem_gps_pct}% dos acessos sem localização).</div>}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6, marginTop: 6 }}>
            <b style={{ color: 'var(--txt2)' }}>Como a nota é dada:</b> começa em 10. Login em dois lugares ao mesmo tempo tira até 3; uso fora da clínica tira até 3; capturas de tela até 2; tentativa de copiar telefone 2; negar a localização 1; madrugada 1. Verde a partir de 8,5; amarelo de 6 a 8,4; vermelho abaixo de 6.
          </div>
        </div>
      )}

      {nivel === 'locais' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Período:</div>
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => { setLocDias(d); setLocUser(null); }}
                style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${locDias === d ? 'var(--tq)' : 'var(--border)'}`,
                  background: locDias === d ? 'var(--tq)' : '#fff', color: locDias === d ? '#fff' : 'var(--muted)' }}>
                {d} dias
              </button>
            ))}
            {locUser && (
              <button onClick={() => setLocUser(null)} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--border)', background: '#fff', color: 'var(--tq2)' }}>
                ← Todos
              </button>
            )}
          </div>

          {locais && !locais.erro && (locais.usuarios || []).length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button onClick={() => relatorioAcessos(locais, locDias, locUser)}
                title="Abre a folha pronta pra imprimir ou salvar em PDF, com os links do Google Maps"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)',
                  background: 'var(--card)', color: 'var(--txt2)', borderRadius: 9, padding: '6px 13px',
                  fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                📄 Relatório completo{locUser ? ` de ${String(locUser.usuario_nome).split(' ')[0]}` : ' da equipe'}
              </button>
            </div>
          )}
          {locais?.erro && <div style={{ padding: 12, borderRadius: 10, background: 'var(--err2,#fdecec)', color: 'var(--err,#dc2626)', fontSize: 13 }}>{locais.erro}</div>}
          {!locais && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Carregando…</div>}
          {locais && !locais.erro && (locais.pendentes || 0) > 0 && (
            <div style={{ padding: '8px 12px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12, marginBottom: 12 }}>
              ⏳ {locais.pendentes} endereço(s) ainda sendo localizado(s) em segundo plano (1 por vez, pelo mapa público) — recarregue esta aba em alguns minutos.
            </div>
          )}

          {locais && !locais.erro && !locUser && (
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))' }}>
              {!locais.usuarios.length && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhum acesso registrado nesse período.</div>}
              {locais.usuarios.map(u => {
                const semLoc = u.eventos ? Math.round((u.sem_localizacao / u.eventos) * 100) : 0;
                return (
                  <div key={u.usuario_id} onClick={() => setLocUser(u)} className="card"
                    style={{ padding: 14, cursor: 'pointer',
                      borderLeft: `3px solid ${u.alertas_simultaneos ? '#dc2626' : u.lugares > 3 ? '#d97706' : 'var(--tq)'}`,
                      background: u.alertas_simultaneos ? 'rgba(220,38,38,.05)' : undefined }}>
                    <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      {u.usuario_nome || '—'}
                      {u.alertas_simultaneos > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 900, background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '2px 8px' }}>
                          🚨 {u.alertas_simultaneos}x em 2 lugares ao mesmo tempo
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, lineHeight: 1.7 }}>
                      <div><b style={{ color: 'var(--txt)' }}>{u.lugares}</b> {u.lugares === 1 ? 'lugar' : 'lugares'} · <b style={{ color: 'var(--txt)' }}>{u.ips}</b> {u.ips === 1 ? 'rede' : 'redes'}</div>
                      <div>Último acesso: {new Date(u.ultimo).toLocaleString('pt-BR')}</div>
                      {semLoc > 0 && (
                        <div style={{ color: semLoc > 60 ? '#d97706' : 'var(--muted)' }}>
                          {semLoc}% dos acessos sem localização {semLoc > 60 ? '— provavelmente negou a permissão' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {locais && !locais.erro && locUser && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>{locUser.usuario_nome}</div>

              {/* 🚨 MESMO LOGIN, DOIS LUGARES, MESMA HORA (senha emprestada) */}
              {(locais.simultaneos || []).filter(e => e.usuario_id === locUser.usuario_id).length > 0 && (
                <div className="card" style={{ padding: 14, marginBottom: 12, borderLeft: '3px solid #dc2626', background: 'rgba(220,38,38,.05)' }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: '#dc2626' }}>🚨 Login usado em dois lugares ao mesmo tempo</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '4px 0 9px', lineHeight: 1.5 }}>
                    Duas redes diferentes ativas no mesmo intervalo de 10 minutos. Olhe a <b>distância entre os dois aparelhos</b>: quilômetros de diferença é o mesmo acesso sendo usado por mais de uma pessoa; poucos metros é Wi-Fi e 4G juntos no mesmo lugar. Sem localização do aparelho numa das redes, não dá para concluir só pela rede.
                  </div>
                  {(locais.simultaneos || []).filter(e => e.usuario_id === locUser.usuario_id).map((e, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--txt2)', display: 'flex', gap: 10, flexWrap: 'wrap', padding: '5px 0', borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                      <b>{e.dia.split('-').reverse().join('/')} às {e.hora}</b>
                      <span style={{ fontFamily: 'monospace', color: '#dc2626' }}>{e.ips.join('  ×  ')}</span>
                      <span style={{ color: 'var(--muted)' }}>{e.eventos} ações</span>
                      {/* 📍 onde estava cada aparelho naquele bloco — e a distância entre eles */}
                      {(e.lugares || []).map(l => (
                        <span key={l.ip} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                          <span style={{ fontFamily: 'monospace', color: 'var(--muted)' }}>{l.ip}:</span>
                          {l.ponto ? <PontoChip p={l.ponto} /> : <span style={{ color: 'var(--muted)' }}>📵 aparelho sem localização</span>}
                        </span>
                      ))}
                      {e.distancia_km !== null && e.distancia_km !== undefined && (
                        <span style={{ fontSize: 11, fontWeight: 900, borderRadius: 8, padding: '2px 8px', background: e.mesmo_lugar ? '#ecfdf5' : '#fee2e2', color: e.mesmo_lugar ? '#047857' : '#b91c1c' }}>
                          {e.mesmo_lugar ? `mesmo lugar (${String(e.distancia_km).replace('.', ',')} km) — Wi-Fi e 4G juntos` : `${String(e.distancia_km).replace('.', ',')} km entre os dois aparelhos`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 📅 DIA A DIA */}
              {(locais.por_dia || []).filter(d => d.usuario_id === locUser.usuario_id).length > 0 && (
                <div className="card" style={{ padding: 0, marginBottom: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 13 }}>
                    📅 Dia a dia
                  </div>
                  {(() => {
                    const dias = (locais.por_dia || []).filter(d => d.usuario_id === locUser.usuario_id);
                    const total = dias.length;
                    return dias.map((d, i) => (
                    <div key={i} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)',
                      background: d.simultaneo ? 'rgba(220,38,38,.05)' : 'transparent', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 900, color: '#fff', background: 'var(--tq)', borderRadius: 8, padding: '2px 8px', minWidth: 46, textAlign: 'center' }}>
                        Dia {total - i}
                      </span>
                      <b style={{ fontSize: 12.5, minWidth: 86 }}>{d.dia.split('-').reverse().join('/')}</b>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {new Date(new Date(d.primeiro).getTime() - 3 * 3600 * 1000).toISOString().slice(11, 16)}
                        {' às '}
                        {new Date(new Date(d.ultimo).getTime() - 3 * 3600 * 1000).toISOString().slice(11, 16)}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{d.eventos} ações</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: d.redes > 1 ? '#d97706' : 'var(--muted)' }}>
                        {d.redes} rede{d.redes > 1 ? 's' : ''}
                      </span>
                      {d.simultaneo && (
                        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 900, background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '2px 8px' }}>
                          🚨 uso simultâneo
                        </span>
                      )}

                      {/* 🕵️ Por que este dia merece atenção */}
                      {(d.sinais || []).length > 0 && (
                        <div style={{ flexBasis: '100%', display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                          {(d.sinais || []).map((sg, k) => (
                            <span key={k} style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 8, padding: '2px 9px',
                              background: sg.grave ? '#fee2e2' : '#fef3c7', color: sg.grave ? '#b91c1c' : '#92400e' }}>
                              {sg.tipo === 'print' ? '📸' : sg.tipo === 'copia' ? '📋' : sg.tipo === 'varredura' ? '🔎' : sg.tipo === 'madrugada' ? '🌙' : '📈'} {sg.txt}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* 🚨 A hora exata do uso simultâneo, com as duas redes */}
                      {(d.episodios || []).length > 0 && (
                        <div style={{ flexBasis: '100%', marginTop: 5, padding: '7px 10px', borderRadius: 9, background: 'rgba(220,38,38,.07)', border: '1px solid rgba(220,38,38,.3)' }}>
                          {(d.episodios || []).map((ep, k) => (
                            <div key={k} style={{ fontSize: 11.5, color: '#b91c1c', display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
                              <b>🚨 {ep.hora}</b>
                              <span style={{ fontFamily: 'monospace' }}>{ep.ips.join('  e  ')}</span>
                              <span style={{ color: 'var(--muted)' }}>ativas ao mesmo tempo · {ep.eventos} ações</span>
                              {(ep.lugares || []).map(l => (
                                <span key={l.ip} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                  <span style={{ fontFamily: 'monospace', color: 'var(--muted)' }}>{l.ip}:</span>
                                  {l.ponto ? <PontoChip p={l.ponto} /> : <span style={{ color: 'var(--muted)', fontSize: 11 }}>📵 sem localização</span>}
                                </span>
                              ))}
                              {ep.distancia_km !== null && ep.distancia_km !== undefined && (
                                <b style={{ color: ep.mesmo_lugar ? '#047857' : '#b91c1c' }}>
                                  {ep.mesmo_lugar ? `mesmo lugar (${String(ep.distancia_km).replace('.', ',')} km)` : `${String(ep.distancia_km).replace('.', ',')} km entre os aparelhos`}
                                </b>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 📍 OS PONTOS DE VERDADE (ordem do master, 28/08: "quero
                          abrir pelo Google Maps"). São as coordenadas que o
                          aparelho enviou — bem mais precisas que o IP. Cada uma
                          abre o mapa; nunca eram mostradas na tela até agora. */}
                      {((d.pontos || []).length > 0 || (d.coords || []).length > 0) && (
                        <div style={{ flexBasis: '100%', marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5 }}>
                            Onde esteve (aparelho)
                          </span>
                          {(d.pontos || []).length > 0
                            ? (d.pontos || []).map((c, k) => <PontoChip key={k} p={c} rotulo={`${k + 1}.`} destaque />)
                            : (d.coords || []).map((c, k) => (
                            <a key={k} href={`https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`}
                              target="_blank" rel="noreferrer"
                              title={`Abrir no Google Maps: ${c.lat}, ${c.lng}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800,
                                textDecoration: 'none', padding: '3px 10px', borderRadius: 99,
                                background: 'var(--tq3)', color: 'var(--tq2)', border: '1px solid var(--tq)' }}>
                              📍 Ponto {k + 1}
                            </a>
                          ))}
                          {(d.coords || []).length > 1 && (
                            <a href={`https://www.google.com/maps/dir/${(d.coords || []).map(c => `${c.lat},${c.lng}`).join('/')}`}
                              target="_blank" rel="noreferrer"
                              title="Ver o trajeto do dia no Google Maps"
                              style={{ fontSize: 11, fontWeight: 800, textDecoration: 'none', padding: '3px 10px', borderRadius: 99,
                                background: 'var(--gold2,#fdf5e8)', color: 'var(--gold,#C4973B)', border: '1px solid var(--gold,#C4973B)' }}>
                              🗺️ Ver trajeto do dia
                            </a>
                          )}
                        </div>
                      )}

                      {/* 🌐 Cada rede daquele dia, com horário, cidade e aparelho */}
                      {(d.redes_detalhe || []).length > 0 && (
                        <div style={{ flexBasis: '100%', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {(d.redes_detalhe || []).map((rd, k) => (
                            <div key={k} style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center', fontSize: 11.5,
                              padding: '5px 9px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--txt2)' }}>🌐 {rd.ip}</span>
                              <span style={{ color: 'var(--muted)' }}>das {rd.de} às {rd.ate}</span>
                              <span style={{ color: 'var(--muted)' }}>{rd.acoes} ações</span>
                              <span style={{ color: 'var(--muted)' }}>{rd.aparelho === 'celular' ? '📱 celular' : '🖥️ computador'}{rd.navegador ? ` · ${rd.navegador}` : ''}</span>
                              {/* 📍 O ENDEREÇO DE VERDADE desta rede (15/09/2026): o que o
                                  APARELHO disse enquanto estava nela — rua, nº, bairro e a
                                  margem de erro. O link abre o Google Maps no ponto exato. */}
                              <div style={{ flexBasis: '100%', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                {(rd.pontos || []).length
                                  ? (rd.pontos || []).slice(0, 3).map((p, j) => <PontoChip key={j} p={p} rotulo={j === 0 ? 'aparelho:' : ''} destaque={j === 0} />)
                                  : <span style={{ fontSize: 11, color: '#92400e', fontWeight: 700 }}>📵 aparelho sem localização nesta rede (permissão de localização negada ou ainda não lida)</span>}
                                {(rd.pontos || []).length > 3 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>+{rd.pontos.length - 3} lugar(es)</span>}
                              </div>
                              {/* 🌐 A área da operadora é só contexto — o centro do bairro ou da
                                  cidade onde a rede está registrada, com o raio escrito e as
                                  marcas de proxy/VPN e datacenter (acesso escondido é sinal). */}
                              <div style={{ flexBasis: '100%' }}><RedeArea rd={rd} /></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )); })()}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {locais.lugares.filter(l => l.usuario_id === locUser.usuario_id).map((l, i) => (
                  <div key={i} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    borderLeft: `3px solid ${l.sem_localizacao ? 'var(--light)' : 'var(--tq)'}` }}>
                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                      {l.sem_localizacao ? (
                        <div style={{ fontWeight: 700, fontSize: 13, color: l.gps_negado ? 'var(--err,#dc2626)' : 'var(--muted)' }}>
                          {l.gps_negado ? '🚫 GPS negado no navegador (ela recusou a localização)' : 'Sem localização — permissão não concedida'}
                        </div>
                      ) : (
                        <a href={`https://www.google.com/maps?q=${l.latitude},${l.longitude}`} target="_blank" rel="noreferrer"
                          title={`GPS ${l.latitude.toFixed(4)}, ${l.longitude.toFixed(4)}`}
                          style={{ fontWeight: 700, fontSize: 13, color: 'var(--tq2)', textDecoration: 'none' }}>
                          📍 {l.endereco || (l.endereco_pendente ? '⏳ localizando o endereço…' : `GPS ${l.latitude.toFixed(4)}, ${l.longitude.toFixed(4)}`)} — abrir no mapa
                          {l.precisao_txt && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: corPrecisao(l.precisao_nivel) }}>{l.precisao_txt}</span>}
                        </a>
                      )}
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                        {l.dispositivo === 'celular' ? '📱' : '🖥️'} {l.navegador} · rede {l.ip || '—'}
                      </div>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'right' }}>
                      <div>{new Date(l.primeiro).toLocaleDateString('pt-BR')} → {new Date(l.ultimo).toLocaleDateString('pt-BR')}</div>
                      <div><b style={{ color: 'var(--txt)' }}>{l.dias}</b> {l.dias === 1 ? 'dia' : 'dias'} · {l.eventos} registros</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--bg2,#f8fafc)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.65 }}>
                <b style={{ color: 'var(--txt2)' }}>Como ler isso:</b> <b>📍 aparelho</b> é o GPS/Wi-Fi do navegador convertido em rua e bairro
                — a margem ao lado diz o quanto vale (±10 m é GPS; ±10 km é só a rede, sem GPS). <b>🌐 área da operadora</b> é o que o IP sabe
                dizer: o bairro ou a cidade onde a rede está registrada (por isso cai no centro) — nunca o endereço da pessoa, e em 4G nem isso.
                Os pontos são agrupados num raio de ~110 m, então casa e clínica aparecem separadas, mas duas salas do mesmo prédio não. A rede
                muda ao trocar de Wi-Fi para 4G sem a pessoa sair do lugar; por isso o uso simultâneo mostra a <b>distância entre os dois
                aparelhos</b>: 12 km é gente diferente, 40 m é a mesma sala. Acesso sem localização quase sempre é permissão negada no navegador,
                não acesso escondido.
              </div>
            </div>
          )}
        </div>
      )}

      {nivel === 'seguranca' && (
        <div>
          {!seg && <div className="card" style={{ padding: 26, color: 'var(--muted)' }}>Carregando…</div>}
          {seg?.erro && <div className="card" style={{ padding: 20, color: 'var(--err)', fontWeight: 600 }}>⚠️ {seg.erro}</div>}
          {seg && !seg.erro && (<>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <StatCard label="Cópias bloqueadas" valor={seg.resumo.copias} cor="#ea580c" />
              <StatCard label="Capturas de tela" valor={seg.resumo.prints} cor="#dc2626" />
              <StatCard label="Pessoas envolvidas" valor={seg.resumo.pessoas} cor="var(--tq)" />
              <StatCard label="Período" valor={`${seg.dias}d`} cor="var(--muted)" />
            </div>

            {/* 🌐 ACESSOS POR LOCALIZAÇÃO (pedido do master): mesmo login em
                endereços diferentes fica exposto aqui — e gera alerta no sino. */}
            {acessos?.itens?.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>
                  🌐 Acessos por localização <span style={{ fontWeight: 600, color: 'var(--muted)', fontSize: 11.5 }}>(logins dos últimos {acessos.dias} dias, por endereço de rede)</span>
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {acessos.itens.map((u, i) => (
                    <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: u.suspeito ? 'rgba(220,38,38,.05)' : 'transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 13 }}>{u.nome}</span>
                        {u.suspeito ? (
                          <span style={{ fontSize: 10, fontWeight: 800, background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '2px 9px' }}>
                            ⚠️ {u.enderecos} endereços diferentes
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>1 endereço</span>
                        )}
                      </div>
                      <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {u.ips.map((x, j) => (
                          <div key={j} style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, color: u.suspeito ? '#dc2626' : 'var(--txt2)', fontFamily: 'monospace' }}>{x.ip}</span>
                            <span>{x.logins} login(s)</span>
                            <span>último: {new Date(x.ultimo).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            {x.aparelho && <span style={{ opacity: .8, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260, whiteSpace: 'nowrap' }}>{x.aparelho}</span>}
                            {x.ponto ? <PontoChip p={x.ponto} rotulo="aparelho:" destaque /> : <span style={{ color: '#92400e' }}>📵 aparelho sem localização</span>}
                            {x.rede && <RedeArea rd={x.rede} />}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                  ⚠️ 2+ endereços pode ser troca de rede (Wi-Fi ↔ 4G) ou a senha usada por duas pessoas — o alerta chega no seu sino na hora do segundo login. Aparelhos diferentes no mesmo nome reforçam a suspeita.
                </div>
              </div>
            )}

            {/* 📸 O banco de prints — a tela como estava no momento da captura */}
            {prints.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>
                  📸 Prints com imagem <span style={{ fontWeight: 600, color: 'var(--muted)', fontSize: 11.5 }}>(reconstituição da tela · guardados 30 dias)</span>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {prints.map(pr => (
                    <div key={pr.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                      <span style={{ fontSize: 15 }}>🖼️</span>
                      <b style={{ minWidth: 110 }}>{String(pr.usuario_nome || '—').split(' ')[0]}</b>
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pr.tela || ''}{pr.conversa ? ` · conversa: ${pr.conversa}` : ''}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(pr.created_at).toLocaleString('pt-BR')}</span>
                      <button onClick={() => verPrint(pr)} className="btn btn-p btn-sm" style={{ fontSize: 11, fontWeight: 800 }}>Ver imagem</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {printImg && (
              <div onClick={() => setPrintImg(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 2000, display: 'flex', flexDirection: 'column', padding: 18 }}>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 13.5, marginBottom: 10 }}>
                  📸 {printImg.info.usuario_nome} · {new Date(printImg.info.created_at).toLocaleString('pt-BR')}{printImg.info.conversa ? ` · ${printImg.info.conversa}` : ''}
                  <span style={{ float: 'right', cursor: 'pointer' }}>✕ fechar</span>
                </div>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {printImg.imagem
                    ? <img src={printImg.imagem} alt="print" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, boxShadow: '0 10px 40px rgba(0,0,0,.5)' }} />
                    : <span style={{ color: '#fff', fontWeight: 700 }}>Carregando a imagem…</span>}
                </div>
              </div>
            )}

            {!seg.por_pessoa.length ? (
              <div className="card" style={{ padding: 26, textAlign: 'center', color: 'var(--muted)', fontSize: 13.5 }}>
                ✅ Nenhuma tentativa de copiar telefone ou captura de tela nos últimos {seg.dias} dias.
              </div>
            ) : (<>
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>
                  Por pessoa
                </div>
                {seg.por_pessoa.map(p => (
                  <div key={p.usuario_id || p.nome} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        última em {new Date(p.ultima).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    {p.copias > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: '#fff7ed', color: '#9a3412' }}>📋 {p.copias} cópia(s)</span>}
                    {p.prints > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: '#fee2e2', color: '#991b1b' }}>📸 {p.prints} print(s)</span>}
                  </div>
                ))}
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 14 }}>
                  Últimos registros
                </div>
                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {seg.ultimos.map((u, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                      <span style={{ fontSize: 15 }}>{u.acao === 'captura_tela' ? '📸' : '📋'}</span>
                      <b style={{ minWidth: 110 }}>{String(u.usuario_nome || '—').split(' ')[0]}</b>
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--muted)' }}>
                        {u.acao === 'captura_tela' ? 'capturou a tela' : 'tentou copiar telefone'}
                        {u.detalhes?.tela ? ` em ${u.detalhes.tela}` : ''}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {new Date(u.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>)}
          </>)}
        </div>
      )}

      {nivel === 'presenca' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'var(--card)' }}>
          <div style={{ padding: '13px 18px', background: 'linear-gradient(90deg,var(--tq),#0aa6ae)', color: '#fff', fontWeight: 800, fontSize: 14 }}>
            Equipe — Tempo Real
          </div>
          {presenca.length === 0 && <div style={{ padding: '36px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Nenhum dado de presença ainda — o heartbeat começa quando a equipe abrir o CRM.</div>}
          {presenca.map(p => {
            const st = p.status_calc;
            const cor = st === 'online' ? '#059669' : st === 'ocioso' ? '#d97706' : '#94a3b8';
            const label = st === 'online' ? 'Online' : st === 'ocioso' ? `Ocioso há ${p.tempo_ocioso} min` : `Offline há ${p.tempo_ocioso} min`;
            const ua = p.user_agent || '';
            const isMobile = ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone');
            return (
              <div key={p.usuario_id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 18px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ position: 'relative' }}>
                  <Avatar u={p} size={40} />
                  <div style={{ position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: '50%', background: cor, border: '2px solid #fff' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.nome} <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>· {p.role === 'master' ? 'Master' : p.role === 'supervisor' ? 'Supervisora' : 'Atendente'}{p.setor ? ` · ${p.setor}` : ''}</span></div>
                  <div style={{ fontSize: 11.5, color: cor, fontWeight: 700 }}>{label}{p.pagina ? ` · ${p.pagina}` : ''}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
                    {isMobile ? <Smartphone size={12} /> : <Monitor size={12} />}
                    <span>{p.ip}</span>
                  </div>
                  {p.latitude && p.longitude && (
                    <a href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`} target="_blank" rel="noreferrer"
                      title={p.ponto?.precisao_txt || ''}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--tq2)', fontWeight: 700, textDecoration: 'none', maxWidth: 320 }}>
                      <MapPin size={11} /> {p.ponto?.endereco || 'Ver localização'}
                      {p.ponto?.precisao_txt && <span style={{ color: corPrecisao(p.ponto.precisao_nivel), fontWeight: 800 }}>{p.ponto.precisao_txt}</span>}
                    </a>
                  )}
                  {p.rede?.cidade && (
                    <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>🌐 {p.rede.cidade}{p.rede.proxy ? ' · 🕵️ proxy/VPN' : ''}{p.rede.hosting ? ' · 🏢 datacenter' : ''}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Nível 1: Usuários ── */}
      {nivel === 'usuarios' && (
        <>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 400, padding: '8px 12px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--card)' }}>
              <Search size={14} color="var(--muted)" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar usuário…"
                style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13, background: 'transparent', color: 'var(--txt)' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
            {usuarios.map(u => (
              <div key={u.id} onClick={() => { setSelUser(u); setNivel('dias'); }}
                className="card" style={{ padding: '14px 16px', cursor: 'pointer', borderLeft: `4px solid ${u.role === 'master' ? '#059669' : u.role === 'supervisor' ? '#0E8C96' : '#64748b'}`, background: 'var(--card)', transition: 'box-shadow .15s' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px #0002'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>{u.nome}</div><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{u.role}{u.setor ? ` · ${u.setor}` : ''}</div></div>
                  <Avatar u={u} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 12 }}>
                  <div><span style={{ color: 'var(--muted)' }}>Eventos:</span> <b>{u.total_eventos || 0}</b></div>
                  <div><span style={{ color: 'var(--muted)' }}>Críticas:</span> <b style={{ color: '#dc2626' }}>{u.acoes_criticas || 0}</b></div>
                  {u.ultimo_acesso && <div style={{ gridColumn: '1/-1', color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>Último: {fmt.relTime(u.ultimo_acesso)}</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Nível 2: Dias ── */}
      {nivel === 'dias' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dias.length === 0 && <div className="card" style={{ padding: '36px 18px', textAlign: 'center', color: 'var(--muted)', background: 'var(--card)' }}>Sem atividade registrada.</div>}
          {dias.map(d => {
            const dt = new Date(String(d.data).slice(0, 10) + 'T12:00:00');
            const DS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            const fh = t => t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
            return (
              <div key={d.data} onClick={() => { setSelDia(String(d.data).slice(0, 10)); setNivel('timeline'); }}
                className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', cursor: 'pointer', background: 'var(--card)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--tq4)'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                <div style={{ width: 48, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tq2)' }}>{dt.getDate()}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>{DS[dt.getDay()]}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{String(d.data).slice(0, 10)}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{fh(d.primeiro)} → {fh(d.ultimo)} · {d.duracao_min} min</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ padding: '4px 10px', borderRadius: 8, background: '#e0f2fe', fontSize: 12, fontWeight: 700, color: '#0369a1' }}>{d.total}</span>
                  {d.criticos > 0 && <span style={{ padding: '4px 10px', borderRadius: 8, background: '#fef2f2', fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{d.criticos}⚠</span>}
                </div>
                <span style={{ color: 'var(--muted)' }}>→</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Nível 3: Timeline ── */}
      {nivel === 'timeline' && timeline && (
        <>
          {timeline.sessao && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              {[['1º Acesso', timeline.sessao.primeiro ? new Date(timeline.sessao.primeiro).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—', '#0369a1'],
                ['Último', timeline.sessao.ultimo ? new Date(timeline.sessao.ultimo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—', '#0369a1'],
                ['Total', `${timeline.sessao.duracao_min || 0}m`, '#1B4965'],
                ['Ativo', `${timeline.sessao.ativo_min || 0}m`, '#059669'],
                ['Ocioso', `${timeline.sessao.ocioso_min || 0}m`, '#d97706'],
                ['Eventos', String(timeline.sessao.total_eventos || 0), '#0E8C96'],
              ].map(([l, v, c]) => (
                <div key={l} style={{ flex: 1, minWidth: 80, padding: '10px 12px', background: 'var(--card)', borderRadius: 9, textAlign: 'center', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{v}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ position: 'relative', paddingLeft: 24, borderLeft: '2px solid var(--border)' }}>
            {(timeline.timeline || []).map(e => {
              const [icon, color] = ACOES[e.acao] || ['📌', '#94a3b8'];
              const isCrit = e.critico;
              const hora = e.hora ? new Date(e.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
              return (
                <div key={e.id} style={{ position: 'relative', marginBottom: 6, marginLeft: 12 }}>
                  <div style={{ position: 'absolute', left: isCrit ? -32 : -30, top: 14, width: isCrit ? 16 : 10, height: isCrit ? 16 : 10, borderRadius: '50%', background: color, border: '2px solid #fff', boxShadow: `0 0 0 2px ${color}40` }} />
                  {e.gap_seconds && e.gap_seconds > 120 && (
                    <div style={{ fontSize: 10, color: '#d97706', fontWeight: 600, marginBottom: 4, fontStyle: 'italic' }}>⏸ {Math.round(e.gap_seconds / 60)} min ocioso</div>
                  )}
                  <div style={{ padding: isCrit ? '12px 14px' : '7px 12px', background: isCrit ? 'var(--warn2)' : 'var(--card)', borderRadius: 10, border: `${isCrit ? 2 : 1}px solid ${isCrit ? '#f59e0b' : 'var(--border)'}`, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: isCrit ? 18 : 14 }}>{icon}</span>
                        <span style={{ fontWeight: 700, fontSize: isCrit ? 13 : 12, color, fontFamily: 'monospace' }}>{hora}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: isCrit ? 11 : 10, fontWeight: 700, color: '#fff', background: color }}>{e.acao.toUpperCase().replace(/_/g, ' ')}</span>
                        {e.entidade && <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, background: 'var(--bg2)', color: 'var(--muted)', fontWeight: 600 }}>{e.entidade}</span>}
                        {e.entidade_id && <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>#{String(e.entidade_id).slice(0, 12)}</span>}
                        {e.latitude && (
                          <a href={`https://www.google.com/maps?q=${e.latitude},${e.longitude}`} target="_blank" rel="noreferrer"
                            title={`${e.latitude}, ${e.longitude}${e.precisao_m != null ? ` · ±${e.precisao_m} m` : ''}`}
                            style={{ fontSize: 10, color: 'var(--tq2)', fontWeight: 700, textDecoration: 'none' }}>📍{e.endereco ? ` ${e.endereco}` : ''}{e.precisao_m != null ? ` (±${e.precisao_m} m)` : ''}</a>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10, color: 'var(--muted)' }}>
                        <span>{e.device}</span><span>{e.browser}</span><span>{e.ip}</span>
                      </div>
                    </div>
                    {e.detalhes && typeof e.detalhes === 'object' && Object.keys(e.detalhes).length > 0 && (
                      <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--txt2)', background: 'var(--bg2)', padding: '6px 10px', borderRadius: 7, fontFamily: 'monospace', wordBreak: 'break-all', maxHeight: 100, overflow: 'auto' }}>
                        {JSON.stringify(e.detalhes, null, 1)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {(!timeline.timeline || timeline.timeline.length === 0) && <div style={{ padding: '30px 18px', color: 'var(--muted)', fontSize: 13 }}>Sem eventos neste dia.</div>}
          </div>
        </>
      )}
    </div>
  );
}
