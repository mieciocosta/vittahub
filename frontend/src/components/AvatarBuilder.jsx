import React, { useState, useRef } from 'react';
import { X, Check, Shuffle, Palette, Camera, Upload } from 'lucide-react';
import { useApi, useAuth } from '../context/AuthContext.jsx';

/* FOTO & AVATAR DE PERFIL — um modal só, com duas abas:
   📷 Minha foto  → a pessoa envia a foto que preferir (recorte quadrado
                    automático no centro, preview antes de salvar)
   🎨 Ilustrado   → monta um avatar parecido com ela (pele, cabelo, olhos,
                    boca, barba, óculos, brincos, bochechas)
   Os dois salvam em /auth/me/avatar e aparecem em todo o sistema. */

const PELE = ['#ffe0bd', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3620'];
const COR_CABELO = ['#0f0f0f', '#3b2417', '#6b4423', '#a55728', '#c99a45', '#e6cfa8', '#d1d1d1', '#b0342a'];
const FUNDO = ['#00B8C0', '#7c5cbf', '#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#ec4899', '#14b8a6', '#f43f5e', '#0f172a', '#64748b', '#e5e7eb'];
const CABELOS = ['careca', 'curto', 'franja', 'coque', 'longo', 'ondulado', 'cacheado', 'moicano'];
const OLHOS = ['normal', 'feliz', 'grande'];
const BOCAS = ['sorriso', 'serio', 'sorrisao'];
const BARBAS = ['nenhuma', 'cavanhaque', 'cheia'];
const OCULOS = ['nenhum', 'redondo', 'retangular'];
const BRINCOS = ['nenhum', 'ponto', 'argola'];

const LABEL = {
  careca: 'Careca', curto: 'Curto', franja: 'Franja', coque: 'Coque', longo: 'Longo', ondulado: 'Ondulado', cacheado: 'Cacheado', moicano: 'Moicano',
  normal: 'Normais', feliz: 'Felizes', grande: 'Grandes',
  sorriso: 'Sorriso', serio: 'Sério', sorrisao: 'Sorrisão',
  nenhuma: 'Sem barba', cavanhaque: 'Cavanhaque', cheia: 'Barba cheia',
  nenhum: 'Nenhum', redondo: 'Redondos', retangular: 'Retangulares',
  ponto: 'Pontinho', argola: 'Argola',
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
    franja: `<path d="M46 98 Q44 44 100 42 Q156 44 154 98 L150 86 Q142 74 134 84 Q126 70 116 82 Q106 66 96 80 Q86 68 76 82 Q64 72 58 86 L46 98 Z" fill="${cab}"/>`,
    coque: `<circle cx="100" cy="36" r="15" fill="${cab}"/><path d="M46 98 Q44 46 100 44 Q156 46 154 98 Q150 66 100 62 Q50 66 46 98 Z" fill="${cab}"/>`,
    longo: `<path d="M40 160 Q34 80 46 66 Q60 44 100 43 Q140 44 154 66 Q166 80 160 160 Q150 120 148 96 Q150 66 100 62 Q50 66 52 96 Q50 120 40 160 Z" fill="${cab}"/>`,
    ondulado: `<path d="M38 156 Q30 130 40 118 Q30 100 44 84 Q46 52 100 44 Q154 52 156 84 Q170 100 160 118 Q170 130 162 156 Q150 140 150 118 Q152 96 148 86 Q146 66 100 62 Q54 66 52 86 Q48 96 50 118 Q50 140 38 156 Z" fill="${cab}"/>`,
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
  // Bochechas (blush) — opcional
  const bochechas = c.bochechas
    ? `<ellipse cx="70" cy="126" rx="9" ry="5.5" fill="#f87171" opacity="0.32"/><ellipse cx="130" cy="126" rx="9" ry="5.5" fill="#f87171" opacity="0.32"/>`
    : '';
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
  // Brincos (nas orelhas: cx 47 e 153, cy ~120)
  const brincos = {
    nenhum: '',
    ponto: `<circle cx="47" cy="121" r="3" fill="#D4AF37"/><circle cx="153" cy="121" r="3" fill="#D4AF37"/>`,
    argola: `<circle cx="47" cy="126" r="5" fill="none" stroke="#D4AF37" stroke-width="2.5"/><circle cx="153" cy="126" r="5" fill="none" stroke="#D4AF37" stroke-width="2.5"/>`,
  }[c.brincos || 'nenhum'];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <rect width="200" height="200" rx="28" fill="${c.fundo}"/>
    <rect x="86" y="150" width="28" height="26" rx="10" fill="${peleEsc}"/>
    <ellipse cx="47" cy="112" rx="9" ry="12" fill="${c.pele}"/><ellipse cx="153" cy="112" rx="9" ry="12" fill="${c.pele}"/>
    ${brincos}
    <ellipse cx="100" cy="108" rx="52" ry="58" fill="${c.pele}"/>
    ${c.cabelo === 'longo' || c.cabelo === 'ondulado' ? hair : ''}
    ${barba}
    ${bochechas}
    ${sobr}
    ${olho}
    <path d="M99 112 Q96 122 100 126 Q104 122 101 112" fill="${peleEsc}"/>
    ${boca}
    ${oculos}
    ${c.cabelo !== 'longo' && c.cabelo !== 'ondulado' ? hair : ''}
  </svg>`;
}

function svgParaPng(svg, size = 512) {
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
  const [aba, setAba] = useState('foto'); // 'foto' | 'ilustrado'
  const [cfg, setCfg] = useState({ pele: PELE[1], corCabelo: COR_CABELO[1], fundo: FUNDO[0], cabelo: 'curto', olhos: 'normal', boca: 'sorriso', barba: 'nenhuma', oculos: 'nenhum', brincos: 'nenhum', bochechas: false });
  const [foto, setFoto] = useState(null); // dataURL já recortada, pronta pra salvar
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const fileRef = useRef(null);
  const set = (k, v) => setCfg(p => ({ ...p, [k]: v }));
  const sortear = () => setCfg({ pele: rnd(PELE), corCabelo: rnd(COR_CABELO), fundo: rnd(FUNDO), cabelo: rnd(CABELOS), olhos: rnd(OLHOS), boca: rnd(BOCAS), barba: rnd(BARBAS), oculos: rnd(OCULOS), brincos: rnd(BRINCOS), bochechas: Math.random() < 0.35 });

  // Foto da galeria/câmera: recorte QUADRADO no centro + 384px (nítida e leve)
  const escolherFoto = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErro('Escolha um arquivo de imagem (JPG, PNG…).'); return; }
    setErro('');
    const img = new window.Image();
    img.onload = () => {
      const d = 384, m = Math.min(img.width, img.height);
      const cv = document.createElement('canvas'); cv.width = d; cv.height = d;
      cv.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, d, d);
      setFoto(cv.toDataURL('image/jpeg', 0.88));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => setErro('Não consegui abrir essa imagem. Tente outra.');
    img.src = URL.createObjectURL(f);
  };

  const salvar = async () => {
    setSalvando(true); setErro('');
    try {
      const avatar = aba === 'foto' ? foto : await svgParaPng(gerarAvatarSVG(cfg));
      if (!avatar) { setErro('Escolha uma foto primeiro.'); setSalvando(false); return; }
      const r = await api.patch('/auth/me/avatar', { avatar });
      setUser?.({ ...user, avatar: r.avatar });
      onClose?.();
    } catch (e) { setErro(e.message || 'Não consegui salvar.'); }
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
  const TabBtn = ({ id, icon: Icon, children }) => (
    <button onClick={() => setAba(id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
      padding: '11px 0', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13.5,
      background: aba === id ? 'var(--card, #fff)' : 'rgba(0,0,0,.06)',
      color: aba === id ? 'var(--tq2, #0E8C96)' : 'var(--muted, #6b7280)',
      borderBottom: aba === id ? '3px solid var(--tq, #00B8C0)' : '3px solid transparent' }}>
      <Icon size={15} /> {children}
    </button>
  );

  const podeSalvar = aba === 'ilustrado' || (aba === 'foto' && !!foto);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: 640, maxWidth: '100%', maxHeight: '92vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', color: '#fff', background: 'linear-gradient(135deg,#0E8C96,#00B8C0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 800, fontSize: 16 }}><Camera size={18} /> Foto de perfil</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff' }}><X size={18} /></button>
        </div>

        {/* Abas: foto própria × avatar ilustrado */}
        <div style={{ display: 'flex' }}>
          <TabBtn id="foto" icon={Camera}>Minha foto</TabBtn>
          <TabBtn id="ilustrado" icon={Palette}>Avatar ilustrado</TabBtn>
        </div>

        {aba === 'foto' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '26px 20px', overflow: 'auto' }}>
            {foto || user?.avatar ? (
              <img src={foto || user.avatar} alt="" style={{ width: 170, height: 170, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 8px 24px rgba(0,0,0,.18)', border: '4px solid var(--tq3, #d3f4f6)' }} />
            ) : (
              <div style={{ width: 170, height: 170, borderRadius: '50%', background: 'var(--bg2, #f1f5f9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', border: '2px dashed var(--border, #cbd5e1)' }}>
                <Camera size={44} strokeWidth={1.3} />
              </div>
            )}
            {foto && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ok, #16a34a)' }}>✅ Foto pronta — clique em Salvar</span>}
            <button onClick={() => fileRef.current?.click()} className="btn btn-s" style={{ gap: 7, fontWeight: 700 }}>
              <Upload size={15} /> {foto || user?.avatar ? 'Escolher outra foto' : 'Escolher foto do aparelho'}
            </button>
            <span style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center', maxWidth: 380, lineHeight: 1.5 }}>
              Use a foto que você preferir (do celular ou do computador). Ela é recortada em círculo automaticamente e aparece em todo o sistema.
            </span>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={escolherFoto} />
          </div>
        ) : (
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
              <Linha titulo="Brincos"><Opcoes campo="brincos" valores={BRINCOS} /></Linha>
              <Linha titulo="Bochechas rosadas">
                <button onClick={() => set('bochechas', !cfg.bochechas)} className="btn btn-sm" style={{ fontWeight: 700, fontSize: 12,
                  background: cfg.bochechas ? 'var(--tq)' : 'var(--bg2)', color: cfg.bochechas ? '#fff' : 'var(--txt2)', border: 'none' }}>
                  {cfg.bochechas ? 'Com blush 😊' : 'Sem blush'}
                </button>
              </Linha>
              <Linha titulo="Fundo"><Swatches campo="fundo" cores={FUNDO} /></Linha>
            </div>
          </div>
        )}

        {erro && <div style={{ padding: '0 20px 8px', fontSize: 12.5, color: 'var(--err)', fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
          <button onClick={salvar} disabled={salvando || !podeSalvar} className="btn btn-p" style={{ flex: 1, gap: 6, opacity: podeSalvar ? 1 : .55 }}>
            <Check size={15} /> {salvando ? 'Salvando…' : aba === 'foto' ? 'Salvar minha foto' : 'Usar este avatar'}
          </button>
          <button onClick={onClose} className="btn">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
