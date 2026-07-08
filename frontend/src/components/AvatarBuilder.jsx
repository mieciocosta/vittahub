import React, { useState } from 'react';
import { X, Check, Shuffle, Palette } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* AVATAR BUILDER — cada pessoa monta um avatar parecido com ela (tom de pele,
   cabelo, olhos, boca, barba, óculos). Gera SVG → converte em PNG → salva no
   perfil (aparece em todo lugar que já mostra a foto). */

const PELE = ['#ffe0bd', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3620'];
const COR_CABELO = ['#0f0f0f', '#3b2417', '#6b4423', '#a55728', '#c99a45', '#e6cfa8', '#d1d1d1', '#b0342a'];
const FUNDO = ['#00B8C0', '#7c5cbf', '#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#ec4899', '#0f172a', '#e5e7eb'];
const CABELOS = ['careca', 'curto', 'coque', 'longo', 'cacheado', 'moicano'];
const OLHOS = ['normal', 'feliz', 'grande'];
const BOCAS = ['sorriso', 'serio', 'sorrisao'];
const BARBAS = ['nenhuma', 'cavanhaque', 'cheia'];
const OCULOS = ['nenhum', 'redondo', 'retangular'];

const LABEL = {
  careca: 'Careca', curto: 'Curto', coque: 'Coque', longo: 'Longo', cacheado: 'Cacheado', moicano: 'Moicano',
  normal: 'Normais', feliz: 'Felizes', grande: 'Grandes',
  sorriso: 'Sorriso', serio: 'Sério', sorrisao: 'Sorrisão',
  nenhuma: 'Sem barba', cavanhaque: 'Cavanhaque', cheia: 'Barba cheia',
  nenhum: 'Sem óculos', redondo: 'Redondos', retangular: 'Retangulares',
};

function escurece(hex, f = 0.75) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function gerarAvatarSVG(c) {
  const peleEsc = escurece(c.pele, 0.86);
  const cab = c.corCabelo;
  // Cabelos
  const hair = {
    careca: '',
    curto: `<path d="M46 98 Q44 44 100 42 Q156 44 154 98 Q150 66 100 62 Q50 66 46 98 Z" fill="${cab}"/>`,
    coque: `<circle cx="100" cy="36" r="15" fill="${cab}"/><path d="M46 98 Q44 46 100 44 Q156 46 154 98 Q150 66 100 62 Q50 66 46 98 Z" fill="${cab}"/>`,
    longo: `<path d="M40 160 Q34 80 46 66 Q60 44 100 43 Q140 44 154 66 Q166 80 160 160 Q150 120 148 96 Q150 66 100 62 Q50 66 52 96 Q50 120 40 160 Z" fill="${cab}"/>`,
    cacheado: `<g fill="${cab}"><circle cx="60" cy="70" r="18"/><circle cx="82" cy="56" r="19"/><circle cx="106" cy="54" r="20"/><circle cx="130" cy="60" r="18"/><circle cx="146" cy="78" r="16"/><path d="M48 96 Q50 68 100 64 Q150 68 152 96 Q150 76 100 72 Q50 76 48 96Z"/></g>`,
    moicano: `<path d="M90 40 Q100 30 110 40 L112 96 Q100 90 88 96 Z" fill="${cab}"/>`,
  }[c.cabelo] || '';
  // Olhos
  const olho = {
    normal: `<circle cx="80" cy="108" r="5.5" fill="#2a2320"/><circle cx="120" cy="108" r="5.5" fill="#2a2320"/>`,
    feliz: `<path d="M72 110 Q80 102 88 110" stroke="#2a2320" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M112 110 Q120 102 128 110" stroke="#2a2320" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
    grande: `<g><circle cx="80" cy="108" r="8" fill="#fff" stroke="#2a2320" stroke-width="1.5"/><circle cx="81" cy="109" r="4" fill="#2a2320"/><circle cx="120" cy="108" r="8" fill="#fff" stroke="#2a2320" stroke-width="1.5"/><circle cx="121" cy="109" r="4" fill="#2a2320"/></g>`,
  }[c.olhos];
  // Sobrancelhas
  const sobr = `<path d="M71 96 Q80 92 89 96" stroke="${escurece(cab || '#3b2417', .8)}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M111 96 Q120 92 129 96" stroke="${escurece(cab || '#3b2417', .8)}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  // Boca
  const boca = {
    sorriso: `<path d="M84 134 Q100 148 116 134" stroke="#9c4a3a" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
    serio: `<path d="M86 138 L114 138" stroke="#9c4a3a" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
    sorrisao: `<path d="M82 132 Q100 152 118 132 Z" fill="#9c4a3a"/><path d="M85 134 Q100 140 115 134 Z" fill="#fff"/>`,
  }[c.boca];
  // Barba
  const barba = {
    nenhuma: '',
    cavanhaque: `<path d="M92 146 Q100 158 108 146 Q106 152 100 152 Q94 152 92 146Z" fill="${cab}"/>`,
    cheia: `<path d="M58 118 Q60 165 100 168 Q140 165 142 118 Q140 150 100 152 Q60 150 58 118 Z" fill="${cab}" opacity="0.95"/>`,
  }[c.barba];
  // Óculos
  const oculos = {
    nenhum: '',
    redondo: `<g fill="none" stroke="#333" stroke-width="3"><circle cx="80" cy="108" r="13"/><circle cx="120" cy="108" r="13"/><path d="M93 108 L107 108"/></g>`,
    retangular: `<g fill="none" stroke="#333" stroke-width="3"><rect x="67" y="99" width="26" height="18" rx="4"/><rect x="107" y="99" width="26" height="18" rx="4"/><path d="M93 108 L107 108"/></g>`,
  }[c.oculos];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <rect width="200" height="200" rx="28" fill="${c.fundo}"/>
    <rect x="86" y="150" width="28" height="26" rx="10" fill="${peleEsc}"/>
    <ellipse cx="47" cy="112" rx="9" ry="12" fill="${c.pele}"/><ellipse cx="153" cy="112" rx="9" ry="12" fill="${c.pele}"/>
    <ellipse cx="100" cy="108" rx="52" ry="58" fill="${c.pele}"/>
    ${c.cabelo === 'longo' ? hair : ''}
    ${barba}
    ${sobr}
    ${olho}
    <path d="M99 112 Q96 122 100 126 Q104 122 101 112" fill="${peleEsc}"/>
    ${boca}
    ${oculos}
    ${c.cabelo !== 'longo' ? hair : ''}
  </svg>`;
}

function svgParaPng(svg, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
      cv.getContext('2d').drawImage(img, 0, 0, size, size);
      resolve(cv.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  });
}

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

export default function AvatarBuilder({ onClose }) {
  const api = useApi();
  const { user, setUser } = useAuth();
  const [cfg, setCfg] = useState({ pele: PELE[1], corCabelo: COR_CABELO[1], fundo: FUNDO[0], cabelo: 'curto', olhos: 'normal', boca: 'sorriso', barba: 'nenhuma', oculos: 'nenhum' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (k, v) => setCfg(p => ({ ...p, [k]: v }));
  const sortear = () => setCfg({ pele: rnd(PELE), corCabelo: rnd(COR_CABELO), fundo: rnd(FUNDO), cabelo: rnd(CABELOS), olhos: rnd(OLHOS), boca: rnd(BOCAS), barba: rnd(BARBAS), oculos: rnd(OCULOS) });

  const salvar = async () => {
    setSalvando(true); setErro('');
    try {
      const png = await svgParaPng(gerarAvatarSVG(cfg));
      const r = await api.patch('/auth/me/avatar', { avatar: png });
      setUser?.({ ...user, avatar: r.avatar });
      onClose?.();
    } catch (e) { setErro(e.message || 'Não consegui salvar o avatar.'); }
    setSalvando(false);
  };

  const Swatches = ({ campo, cores }) => (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
      {cores.map(c => (
        <button key={c} onClick={() => set(campo, c)} title={c}
          style={{ width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
            border: cfg[campo] === c ? '3px solid var(--tq)' : '2px solid var(--border)', boxShadow: cfg[campo] === c ? '0 0 0 2px var(--tq3)' : 'none' }} />
      ))}
    </div>
  );
  const Opcoes = ({ campo, valores }) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {valores.map(v => (
        <button key={v} onClick={() => set(campo, v)} className="btn btn-sm" style={{ fontWeight: 700, fontSize: 12,
          background: cfg[campo] === v ? 'var(--tq)' : 'var(--bg2)', color: cfg[campo] === v ? '#fff' : 'var(--txt2)', border: 'none' }}>
          {LABEL[v]}
        </button>
      ))}
    </div>
  );
  const Linha = ({ titulo, children }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 6 }}>{titulo}</div>
      {children}
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: 640, maxWidth: '100%', maxHeight: '90vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', color: '#fff', background: 'linear-gradient(135deg,#0E8C96,#00B8C0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 800, fontSize: 16 }}><Palette size={18} /> Criar meu avatar</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', gap: 18, padding: 20, overflow: 'auto', flexWrap: 'wrap' }}>
          {/* Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, minWidth: 180, flex: '0 0 auto', margin: '0 auto' }}>
            <div style={{ width: 180, height: 180, borderRadius: 24, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,.15)' }}
              dangerouslySetInnerHTML={{ __html: gerarAvatarSVG(cfg).replace('width="200" height="200"', 'width="180" height="180"') }} />
            <button onClick={sortear} className="btn btn-s btn-sm" style={{ gap: 6 }}><Shuffle size={14} /> Surpreenda-me</button>
          </div>
          {/* Controles */}
          <div style={{ flex: 1, minWidth: 260 }}>
            <Linha titulo="Tom de pele"><Swatches campo="pele" cores={PELE} /></Linha>
            <Linha titulo="Cabelo"><Opcoes campo="cabelo" valores={CABELOS} /></Linha>
            <Linha titulo="Cor do cabelo"><Swatches campo="corCabelo" cores={COR_CABELO} /></Linha>
            <Linha titulo="Olhos"><Opcoes campo="olhos" valores={OLHOS} /></Linha>
            <Linha titulo="Boca"><Opcoes campo="boca" valores={BOCAS} /></Linha>
            <Linha titulo="Barba"><Opcoes campo="barba" valores={BARBAS} /></Linha>
            <Linha titulo="Óculos"><Opcoes campo="oculos" valores={OCULOS} /></Linha>
            <Linha titulo="Fundo"><Swatches campo="fundo" cores={FUNDO} /></Linha>
          </div>
        </div>
        {erro && <div style={{ padding: '0 20px', fontSize: 12.5, color: 'var(--err)', fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
          <button onClick={salvar} disabled={salvando} className="btn btn-p" style={{ flex: 1, gap: 6 }}><Check size={15} /> {salvando ? 'Salvando…' : 'Usar este avatar'}</button>
          <button onClick={onClose} className="btn">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
