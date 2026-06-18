// ═══════════════════════════════════════════════════════════════════════════
// GERADOR DE PROPOSTAS — VittaHub (trazido do VittaSys)
// Gera o HTML da proposta (plano vacinal ou vacinas individuais) com layout
// branded, capa, logo e benefícios. O HTML é convertido em PDF por Puppeteer.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.join(__dirname, '../../assets/proposta');

// Carrega imagem como data URI (base64) para embutir no HTML (Puppeteer renderiza offline)
function imgDataUri(nomeArquivo) {
  try {
    const full = path.join(ASSETS_DIR, nomeArquivo);
    const buf = fs.readFileSync(full);
    const ext = path.extname(nomeArquivo).slice(1).toLowerCase();
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch { return ''; }
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// ─── ÍCONES SVG INLINE ───────────────────────────────────────────────────────
// O Chromium do Railway NÃO tem fonte de emoji: emojis viram "quadradinhos" no
// PDF. Por isso todos os ícones são SVG embutidos (estilo Lucide, traço limpo).
const ICONS = {
  bee: '<path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M17.47 9c1.93-.2 3.53-1.9 3.53-4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  doctor: '<path d="M5 3a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M9 15v1a6 6 0 0 0 6 6 6 6 0 0 0 5-5.7V13"/><circle cx="20" cy="10" r="2"/><path d="M5 3v2M11 3v2"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  speaker: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  syringe: '<path d="m18 2 4 4M17 7l3-3M19 9 9.7 18.3a2.4 2.4 0 0 1-3.4 0l-1.6-1.6a2.4 2.4 0 0 1 0-3.4L14 4"/><path d="m9 11 4 4M5 19l-3 3M14 4l6 6"/>',
  idcard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 10h2M16 14h2M6.2 15a3 3 0 0 1 5.6 0"/><circle cx="9" cy="11" r="2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  shield: '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z"/>',
  shieldcheck: '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  baby: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  camera: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  sparkle: '<path d="M12 3l1.9 5.8 5.8 1.9-5.8 1.9L12 18.4l-1.9-5.8-5.8-1.9 5.8-1.9z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>',
  gift: '<path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
};
function svgIcon(name, color = '#0d3b6e', size = 18, extraStyle = '') {
  const d = ICONS[name];
  if (!d) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;${extraStyle}">${d}</svg>`;
}
const fmtPreco = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const _brlOrc = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ─── PREÇOS DAS VACINAS (catálogo do plano) ──────────────────────────────────
const PRECO = {
  'Hexacelular':450,'Pentacelular':450,'Rotavírus':400,
  'Pneumocócica 20':800,'Pneumocócica 15':600,
  'Meningocócica B':1100,'Meningocócica ACWY':500,
  'Influenza':180,'Febre Amarela':250,'Varicela':450,
  'Tríplice Viral':280,'Hepatite A':250,'Hepatite A+B':320,
  'HPV 9-valente':950,'Herpes Zóster':1200,'Abrysvo (VSR)':1800,
};
const mp = (nome, obs) => { const p = PRECO[nome] || 0; return obs ? { nome, obs, preco: 0, ativo: true } : { nome, preco: p, ativo: true }; };

// ─── PLANOS VACINAIS (cronograma mês a mês) ──────────────────────────────────
const PLANOS = [
  { id:'plano_0_a_6_meses', nome:'Plano Vacinal 0 a 6 meses', periodo:'0 a 6 meses', vacinas:[
    { mes:'Ao nascer', itens:[mp('BCG','indisponível'),mp('Hepatite B','bônus')] },
    { mes:'2 meses', itens:[mp('Hexacelular'),mp('Rotavírus'),mp('Pneumocócica 20')] },
    { mes:'3 meses', itens:[mp('Meningocócica B'),mp('Meningocócica ACWY')] },
    { mes:'4 meses', itens:[mp('Pentacelular'),mp('Rotavírus'),mp('Pneumocócica 20')] },
    { mes:'5 meses', itens:[mp('Meningocócica B'),mp('Meningocócica ACWY')] },
    { mes:'6 meses', itens:[mp('Pentacelular'),mp('Rotavírus'),mp('Pneumocócica 20'),mp('Influenza')] },
  ]},
  { id:'plano_0_a_9_meses', nome:'Plano Vacinal 0 a 9 meses', periodo:'0 a 9 meses', vacinas:[
    { mes:'Ao nascer', itens:[mp('BCG','indisponível'),mp('Hepatite B','bônus')] },
    { mes:'2 meses', itens:[mp('Hexacelular'),mp('Rotavírus'),mp('Pneumocócica 20')] },
    { mes:'3 meses', itens:[mp('Meningocócica B'),mp('Meningocócica ACWY')] },
    { mes:'4 meses', itens:[mp('Pentacelular'),mp('Rotavírus'),mp('Pneumocócica 20')] },
    { mes:'5 meses', itens:[mp('Meningocócica B'),mp('Meningocócica ACWY')] },
    { mes:'6 meses', itens:[mp('Pentacelular'),mp('Rotavírus'),mp('Pneumocócica 20'),mp('Influenza')] },
    { mes:'7 meses', itens:[mp('Influenza')] },
    { mes:'9 meses', itens:[mp('Febre Amarela')] },
  ]},
  { id:'plano_2_a_6_meses', nome:'Plano Vacinal 2 a 6 meses', periodo:'2 a 6 meses', vacinas:[
    { mes:'2 meses', itens:[mp('Hexacelular'),mp('Rotavírus'),mp('Pneumocócica 20')] },
    { mes:'3 meses', itens:[mp('Meningocócica B'),mp('Meningocócica ACWY')] },
    { mes:'4 meses', itens:[mp('Pentacelular'),mp('Rotavírus'),mp('Pneumocócica 20')] },
    { mes:'5 meses', itens:[mp('Meningocócica B'),mp('Meningocócica ACWY')] },
    { mes:'6 meses', itens:[mp('Pentacelular'),mp('Rotavírus'),mp('Pneumocócica 20'),mp('Influenza')] },
  ]},
  { id:'plano_2_a_9_meses', nome:'Plano Vacinal 2 a 9 meses', periodo:'2 a 9 meses', vacinas:[
    { mes:'2 meses', itens:[mp('Hexacelular'),mp('Rotavírus'),mp('Pneumocócica 20')] },
    { mes:'3 meses', itens:[mp('Meningocócica B'),mp('Meningocócica ACWY')] },
    { mes:'4 meses', itens:[mp('Pentacelular'),mp('Rotavírus'),mp('Pneumocócica 20')] },
    { mes:'5 meses', itens:[mp('Meningocócica B'),mp('Meningocócica ACWY')] },
    { mes:'6 meses', itens:[mp('Pentacelular'),mp('Rotavírus'),mp('Pneumocócica 20'),mp('Influenza')] },
    { mes:'7 meses', itens:[mp('Influenza')] },
    { mes:'9 meses', itens:[mp('Febre Amarela')] },
  ]},
  { id:'plano_2_a_18_meses', nome:'Plano Vacinal 2 a 18 meses', periodo:'2 a 18 meses', vacinas:[
    { mes:'2 meses', itens:[mp('Hexacelular'),mp('Rotavírus'),mp('Pneumocócica 20')] },
    { mes:'3 meses', itens:[mp('Meningocócica B'),mp('Meningocócica ACWY')] },
    { mes:'4 meses', itens:[mp('Pentacelular'),mp('Rotavírus'),mp('Pneumocócica 20')] },
    { mes:'5 meses', itens:[mp('Meningocócica B'),mp('Meningocócica ACWY')] },
    { mes:'6 meses', itens:[mp('Pentacelular'),mp('Rotavírus'),mp('Pneumocócica 20'),mp('Influenza')] },
    { mes:'9 meses', itens:[mp('Febre Amarela')] },
    { mes:'12 meses', itens:[mp('Tríplice Viral'),mp('Varicela'),mp('Hepatite A')] },
    { mes:'13 meses', itens:[mp('Meningocócica B'),mp('Meningocócica ACWY'),mp('Pneumocócica 20')] },
    { mes:'15 meses', itens:[mp('Tríplice Viral'),mp('Varicela')] },
    { mes:'16 meses', itens:[mp('Pentacelular')] },
    { mes:'18 meses', itens:[mp('Influenza'),mp('Hepatite A')] },
  ]},
  { id:'plano_completo_0_a_18_meses', nome:'Plano Vacinal Completo 0 a 18 meses', periodo:'0 a 18 meses', vacinas:[
    { mes:'Ao nascer', itens:[mp('BCG','indisponível'),mp('Hepatite B','bônus')] },
    { mes:'2 meses', itens:[mp('Hexacelular'),mp('Rotavírus'),mp('Pneumocócica 20')] },
    { mes:'3 meses', itens:[mp('Meningocócica B'),mp('Meningocócica ACWY')] },
    { mes:'4 meses', itens:[mp('Pentacelular'),mp('Rotavírus'),mp('Pneumocócica 20')] },
    { mes:'5 meses', itens:[mp('Meningocócica B'),mp('Meningocócica ACWY')] },
    { mes:'6 meses', itens:[mp('Pentacelular'),mp('Rotavírus'),mp('Pneumocócica 20'),mp('Influenza')] },
    { mes:'9 meses', itens:[mp('Febre Amarela')] },
    { mes:'12 meses', itens:[mp('Tríplice Viral'),mp('Varicela'),mp('Hepatite A')] },
    { mes:'13 meses', itens:[mp('Meningocócica B'),mp('Meningocócica ACWY'),mp('Pneumocócica 20')] },
    { mes:'15 meses', itens:[mp('Tríplice Viral'),mp('Varicela')] },
    { mes:'16 meses', itens:[mp('Pentacelular')] },
    { mes:'18 meses', itens:[mp('Influenza'),mp('Hepatite A')] },
  ]},
];

// Valores fechados dos planos. ÂNCORA REAL: o PDF oficial do "Plano Vacinal
// completo 2 a 9 meses" (abr/2026) mostra Valor Normal R$ 8.760 → R$ 6.200 à
// vista ou R$ 6.500 no crédito em 10x. A soma do catálogo PRECO bate exatamente
// com os R$ 8.760 do PDF real, então o catálogo está correto.
// Os planos marcados como (ESTIMADO ~29% off) seguem a mesma proporção do real
// — *** Sr. Miécio: CONFIRMAR esses valores antes de divulgar ***
const PRECOS_PLANO = {
  'plano_0_a_6_meses':           { avista:5900, credito:6200, parcelas:10 }, // ESTIMADO (~29% off de R$ 8.330)
  'plano_0_a_9_meses':           { avista:6200, credito:6500, parcelas:10 }, // REAL (PDF abr/2026)
  'plano_2_a_6_meses':           { avista:5900, credito:6200, parcelas:10 }, // ESTIMADO (~29% off de R$ 8.330)
  'plano_2_a_9_meses':           { avista:6200, credito:6500, parcelas:10 }, // REAL (PDF abr/2026)
  'plano_2_a_18_meses':          { avista:9600, credito:9900, parcelas:12 }, // ESTIMADO (~29% off de R$ 13.570)
  'plano_completo_0_a_18_meses': { avista:9600, credito:9900, parcelas:12 }, // ESTIMADO (~29% off de R$ 13.570)
};

// ─── VACINAS INDIVIDUAIS (com descrição, para orçamento avulso) ──────────────
const VACINAS = [
  { nome:'Hexavalente',           desc:'Protege contra difteria, tétano, coqueluche, poliomielite, hepatite B e Haemophilus influenzae.', avista:400,  credito:420,  parcelas:2 },
  { nome:'Pentavalente Acelular', desc:'Protege contra difteria, tétano, coqueluche, poliomielite e Haemophilus influenzae tipo b.',      avista:400,  credito:420,  parcelas:2 },
  { nome:'Rotavírus',             desc:'Protege contra gastroenterites graves — diarreia intensa, vômitos e desidratação.',               avista:400,  credito:420,  parcelas:2 },
  { nome:'Pneumocócica 15',       desc:'Protege contra pneumonia, meningite e infecções generalizadas (15 cepas).',                       avista:550,  credito:580,  parcelas:3 },
  { nome:'Pneumocócica 20',       desc:'Proteção ampliada contra pneumonia, meningite e infecções invasivas (20 cepas).',                 avista:780,  credito:790,  parcelas:4 },
  { nome:'Meningocócica B',       desc:'Protege contra Neisseria meningitidis sorogrupo B — meningite grave.',                           avista:780,  credito:790,  parcelas:4 },
  { nome:'Meningocócica ACWY',    desc:'Protege contra 4 sorogrupos da bactéria meningococo.',                                           avista:550,  credito:580,  parcelas:3 },
  { nome:'HPV Nonavalente',       desc:'Protege contra os 9 principais tipos do papilomavírus humano.',                                  avista:1100, credito:1150, parcelas:2 },
  { nome:'Varicela',              desc:'Protege contra a catapora — lesões na pele, febre e possíveis complicações.',                    avista:550,  credito:580,  parcelas:3 },
  { nome:'Tríplice Viral',        desc:'Protege contra sarampo, caxumba e rubéola.',                                                     avista:250,  credito:280,  parcelas:2 },
  { nome:'Hepatite A',            desc:'Protege contra o vírus da hepatite A.',                                                          avista:250,  credito:280,  parcelas:2 },
  { nome:'Hepatite B',            desc:'Protege contra o vírus da hepatite B.',                                                          avista:250,  credito:280,  parcelas:2 },
  { nome:'Hepatite A+B',          desc:'Proteção combinada contra hepatites A e B.',                                                     avista:550,  credito:580,  parcelas:3 },
  { nome:'dTpa',                  desc:'Protege contra difteria, tétano e coqueluche — adulto e infantil.',                              avista:400,  credito:420,  parcelas:2 },
  { nome:'Influenza',             desc:'Protege contra os principais vírus da gripe (4 cepas sazonais).',                                avista:170,  credito:180,  parcelas:1 },
  { nome:'Febre Amarela',         desc:'Protege contra o vírus da febre amarela.',                                                       avista:250,  credito:280,  parcelas:2 },
  { nome:'Dengue (Qdenga)',       desc:'Protege contra os 4 sorotipos do vírus da dengue.',                                             avista:550,  credito:580,  parcelas:3 },
  { nome:'Herpes Zóster',         desc:'Protege contra o vírus varicela-zóster (cobreiro).',                                            avista:1100, credito:1150, parcelas:2 },
];

// ─── PACOTES POR IDADE (infantil) ────────────────────────────────────────────
const PACOTES = [
  { id:'2m',  label:'Vacinas de 2 Meses',  tipo:'infantil', avista:1200, credito:1250, parcelas:6, vacinas:[0,2,4] },
  { id:'3m',  label:'Vacinas de 3 Meses',  tipo:'infantil', avista:1200, credito:1300, parcelas:6, vacinas:[5,6] },
  { id:'4m',  label:'Vacinas de 4 Meses',  tipo:'infantil', avista:1200, credito:1250, parcelas:6, vacinas:[1,2,4] },
  { id:'5m',  label:'Vacinas de 5 Meses',  tipo:'infantil', avista:1200, credito:1300, parcelas:6, vacinas:[5,6] },
  { id:'6m',  label:'Vacinas de 6 Meses',  tipo:'infantil', avista:1500, credito:1590, parcelas:6, vacinas:[0,2,4,14] },
  { id:'7m',  label:'Vacinas de 7 Meses',  tipo:'infantil', avista:170,  credito:180,  parcelas:2, vacinas:[14] },
  { id:'9m',  label:'Vacinas de 9 Meses',  tipo:'infantil', avista:250,  credito:280,  parcelas:2, vacinas:[15] },
  { id:'12m', label:'Vacinas de 12 Meses', tipo:'infantil', avista:1010, credito:1080, parcelas:6, vacinas:[9,8,10] },
  { id:'13m', label:'Vacinas de 13 Meses', tipo:'infantil', avista:2000, credito:2200, parcelas:6, vacinas:[5,6,4] },
  { id:'15m', label:'Vacinas de 15 Meses', tipo:'infantil', avista:800,  credito:860,  parcelas:3, vacinas:[9,8] },
  { id:'16m', label:'Vacinas de 16 Meses', tipo:'infantil', avista:400,  credito:420,  parcelas:3, vacinas:[1] },
  { id:'18m', label:'Vacinas de 18 Meses', tipo:'infantil', avista:420,  credito:460,  parcelas:2, vacinas:[14,10] },
];

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE 1 — ORÇAMENTO DE VACINAS INDIVIDUAIS (infantil/adulto)
// ═══════════════════════════════════════════════════════════════════════════
function gerarHtmlOrcamento({ vacinas, template = 'adulto', nomeCliente, nomeBebe, pacoteNome, desconto = 0, parcelas = 1, creditoFechado = 0 }) {
  const isInfantil = template === 'infantil';
  const brutoAvista = vacinas.reduce((s, v) => s + Number(v.avista || 0), 0);
  // creditoFechado: preço de cartão fechado do pacote (senão, soma das avulsas)
  const totalCredito = creditoFechado > 0 ? Number(creditoFechado) : vacinas.reduce((s, v) => s + Number(v.credito || 0), 0);
  const totalAvista = Math.max(0, brutoAvista - (desconto || 0));
  const temDesconto = desconto > 0 && brutoAvista > 0;
  const pct = temDesconto ? Math.round(desconto / brutoAvista * 100) : 0;

  const dataHoje = new Date();
  const dataValidade = new Date(dataHoje.getTime() + 2 * 24 * 60 * 60 * 1000);
  const fmtData = d => d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  const logoUrl = imgDataUri('logos/logo-vertical-color.png');

  let propostaPara = '';
  if (isInfantil) {
    if (nomeBebe && nomeCliente) propostaPara = `${esc(nomeBebe)} <span style="font-size:.82em;font-weight:400;opacity:.8;">(resp.: ${esc(nomeCliente)})</span>`;
    else propostaPara = esc(nomeBebe || nomeCliente || '');
  } else { propostaPara = esc(nomeCliente || ''); }

  const tituloDoc = pacoteNome || (isInfantil ? 'Vacinas Infantis' : 'Vacinas');

  const benefInfantil = [
    { icon:'bee',     t:'Buzzy', d:'Aparelho da Europa que ameniza até 90% da dor da picada' },
    { icon:'doctor',  t:'Pós Vacinal', d:'Com Médica da Clínica' },
    { icon:'hand',    t:'Massagem', d:'Para as mamães durante a vacinação' },
    { icon:'speaker', t:'Ruído Branco', d:'Acalma o bebê no procedimento' },
    { icon:'music',   t:'Brinquedos', d:'Distração e conforto na consulta' },
    { icon:'syringe', t:'2 Vacinas simultâneas', d:'Menos visitas, menos dor' },
    { icon:'idcard',  t:'Carteira', d:'Personalizada no fechamento do plano' },
    { icon:'flag',    t:'Vacinas EUA', d:'Maior eficácia e mais cepas' },
  ];
  const benefAdulto = [
    { icon:'shield',  t:'Qualidade', d:'Vacinas importadas e de alta procedência' },
    { icon:'doctor',  t:'Equipe', d:'Profissionais especializados em imunização' },
    { icon:'zap',     t:'Agilidade', d:'Agendamento rápido e eficiente' },
    { icon:'lock',    t:'Segurança', d:'Ambiente seguro, ético e humanizado' },
    { icon:'syringe', t:'Simultânea', d:'Até 2 vacinas na mesma visita' },
    { icon:'flag',    t:'Vacinas EUA', d:'Maior cobertura vacinal' },
  ];
  const beneficios = isInfantil ? benefInfantil : benefAdulto;

  const linhasVacinas = vacinas.map((v, i) => {
    const parcelaStr = v.parcelas > 1 ? `${v.parcelas}x de ${_brlOrc(Math.ceil(v.credito / v.parcelas))} s/j` : _brlOrc(v.credito);
    const bg = i % 2 === 0 ? 'rgba(255,255,255,.92)' : 'rgba(236,246,252,.85)';
    return `<tr style="background:${bg};">
      <td style="padding:6px 7px;border-bottom:1px solid rgba(0,0,0,.05);text-align:center;font-size:.72rem;color:#aaa;font-weight:700;">${i + 1}</td>
      <td style="padding:6px 10px;border-bottom:1px solid rgba(0,0,0,.05);">
        <div style="font-size:.84rem;font-weight:700;color:#0d3b6e;">${esc(v.nome)}</div>
        <div style="font-size:.65rem;color:#777;line-height:1.3;margin-top:1px;">${esc(v.desc || '')}</div>
      </td>
      <td style="padding:6px 7px;border-bottom:1px solid rgba(0,0,0,.05);text-align:center;font-size:.84rem;color:#207898;font-weight:700;">${_brlOrc(v.avista)}</td>
      <td style="padding:6px 7px;border-bottom:1px solid rgba(0,0,0,.05);text-align:center;font-size:.72rem;color:#666;">${parcelaStr}</td>
    </tr>`;
  }).join('');

  const cardsHtml = beneficios.map(c => `
    <div style="background:rgba(255,255,255,.88);border:1px solid rgba(0,184,192,.18);border-radius:8px;padding:9px 7px;text-align:center;">
      <div style="margin-bottom:4px;">${svgIcon(c.icon, isInfantil ? '#e91e8c' : '#00B8C0', 22)}</div>
      <div style="font-weight:700;color:#0d3b6e;font-size:.66rem;margin-bottom:2px;">${c.t}</div>
      <div style="font-size:.6rem;color:#666;line-height:1.3;">${c.d}</div>
    </div>`).join('');

  const C = isInfantil ? {
    bgPage:'linear-gradient(160deg,#fce4ec 0%,#f8f9ff 35%,#e3f2fd 65%,#e0f7fa 100%)',
    bgHeader:'linear-gradient(135deg,#e91e8c 0%,#ad1457 40%,#1565c0 100%)',
    bgPara:'linear-gradient(135deg,#1565c0,#0d47a1)', corPrim:'#1565c0', corAcento:'#e91e8c',
    corTotal:'#e91e8c', bgTotal:'linear-gradient(135deg,#e91e8c,#ad1457)', bgCred:'linear-gradient(135deg,#1565c0,#1976d2)',
    bgBenef:'linear-gradient(135deg,#fce4ec,#f8f9ff)', bgRodape:'linear-gradient(135deg,#1a237e,#1565c0)',
    decoColor1:'rgba(233,30,140,.12)', decoColor2:'rgba(21,101,192,.10)', logoFilter:'', avatarIcon:'baby',
  } : {
    bgPage:'linear-gradient(160deg,#eceff1 0%,#f5f7fa 40%,#e8edf4 100%)',
    bgHeader:'linear-gradient(135deg,#0d3b6e,#1565c0)', bgPara:'linear-gradient(135deg,#0d3b6e,#1a3a5c)',
    corPrim:'#0d3b6e', corAcento:'#00B8C0', corTotal:'#00B8C0', bgTotal:'linear-gradient(135deg,#0d3b6e,#1565c0)',
    bgCred:'linear-gradient(135deg,#00838f,#00B8C0)', bgBenef:'linear-gradient(135deg,#eceff1,#f5f7fa)',
    bgRodape:'linear-gradient(135deg,#060f1a,#0d3b6e)', decoColor1:'rgba(0,184,192,.08)', decoColor2:'rgba(13,59,110,.06)',
    logoFilter:'brightness(0) invert(1)', avatarIcon:'user',
  };

  const descontoBox = temDesconto ? `
    <div style="background:${C.bgTotal};border-radius:10px;padding:10px 16px;text-align:center;color:#fff;margin-bottom:8px;">
      <div style="font-size:.7rem;opacity:.85;text-decoration:line-through;">De ${_brlOrc(brutoAvista)}</div>
      <div style="font-size:1.5rem;font-weight:800;">${_brlOrc(totalAvista)} <span style="font-size:.7rem;font-weight:600;">à vista</span></div>
      <div style="font-size:.66rem;background:rgba(255,255,255,.2);display:inline-block;padding:2px 10px;border-radius:10px;margin-top:3px;">Economize ${_brlOrc(desconto)} (${pct}%)</div>
    </div>` : `
    <div style="background:${C.bgTotal};border-radius:10px;padding:10px 16px;text-align:center;color:#fff;margin-bottom:8px;">
      <div style="font-size:1.5rem;font-weight:800;">${_brlOrc(totalAvista)} <span style="font-size:.7rem;font-weight:600;">à vista</span></div>
    </div>`;

  const parcLabel = parcelas > 1 ? `${parcelas}x de ${_brlOrc(Math.ceil(totalCredito / parcelas))} sem juros` : `${_brlOrc(totalCredito)} no crédito`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>${esc(tituloDoc)} — Vittalis Saúde</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4;margin:0}
.page{width:210mm;min-height:297mm;margin:0 auto;background:${C.bgPage};position:relative;overflow:hidden;padding-bottom:22mm;}
.deco1{position:absolute;top:-25mm;right:-20mm;width:90mm;height:90mm;border-radius:50%;background:${C.decoColor1};}
.deco2{position:absolute;bottom:30mm;left:-15mm;width:60mm;height:60mm;border-radius:50%;background:${C.decoColor2};}
.pg-header{background:${C.bgHeader};padding:7mm 11mm;display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center;position:relative;overflow:hidden;}
.pg-header::before{content:'';position:absolute;top:-12mm;right:-12mm;width:55mm;height:55mm;border-radius:50%;background:rgba(255,255,255,.07);}
.logo-img{height:14mm;object-fit:contain;display:block;filter:${C.logoFilter} drop-shadow(0 1px 3px rgba(0,0,0,.2));}
.header-info{text-align:right;}
.header-titulo{font-size:1.4rem;font-weight:900;color:#fff;letter-spacing:.3px;}
.header-sub{font-size:.68rem;color:rgba(255,255,255,.72);margin-top:3px;}
.header-data{font-size:.63rem;color:rgba(255,255,255,.55);margin-top:2px;}
.para-box{margin:4mm 9mm 3mm;background:${C.bgPara};border-radius:10px;padding:9px 14px;display:flex;gap:12px;align-items:center;color:#fff;}
.para-av{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;}
.para-label{font-size:.6rem;text-transform:uppercase;letter-spacing:.5px;opacity:.8;}
.para-nome{font-size:1rem;font-weight:700;}
.tabela-wrap{margin:0 9mm;background:rgba(255,255,255,.5);border-radius:10px;overflow:hidden;}
table{width:100%;border-collapse:collapse;}
thead th{background:${C.bgPara};color:#fff;padding:7px;font-size:.68rem;text-transform:uppercase;letter-spacing:.4px;}
.valores-wrap{margin:4mm 9mm 0;display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.cred-box{background:${C.bgCred};border-radius:10px;padding:10px 16px;text-align:center;color:#fff;display:flex;flex-direction:column;justify-content:center;}
.cred-box .v{font-size:1.05rem;font-weight:800;margin-top:2px;}
.validade{margin:3mm 9mm 0;background:rgba(255,255,255,.6);border:1px dashed ${C.corAcento};border-radius:8px;padding:6px 12px;text-align:center;font-size:.7rem;color:#555;}
.validade b{color:${C.corPrim};}
.benef-titulo{margin:4mm 9mm 2mm;font-size:.8rem;font-weight:800;color:${C.corPrim};text-transform:uppercase;letter-spacing:.5px;}
.benef-grid{margin:0 9mm;display:grid;grid-template-columns:repeat(4,1fr);gap:7px;}
.selos{margin:4mm 9mm 0;display:flex;justify-content:space-around;padding:6px 0;border-top:1px solid rgba(0,0,0,.06);}
.selo{text-align:center;}.selo .si{font-size:1.1rem;}.selo .st{font-size:.6rem;color:#666;font-weight:600;margin-top:2px;}
.rodape{position:absolute;left:0;right:0;bottom:0;background:${C.bgRodape};color:#fff;padding:5mm 11mm;display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:.66rem;line-height:1.5;}
.rodape .re strong{font-size:.8rem;}
</style></head><body>
<div class="page">
  <div class="deco1"></div><div class="deco2"></div>
  <div class="pg-header">
    ${logoUrl ? `<img src="${logoUrl}" class="logo-img" alt="Vittalis">` : `<div style="font-size:1.6rem;font-weight:900;color:#fff;">Vittalis Saúde</div>`}
    <div class="header-info">
      <div class="header-titulo">${esc(tituloDoc)}</div>
      <div class="header-sub">Proposta de Investimento em Saúde — Vittalis Saúde</div>
      <div class="header-data">Emitido em ${fmtData(dataHoje)}</div>
    </div>
  </div>
  <div class="para-box">
    <div class="para-av">${svgIcon(C.avatarIcon, '#fff', 20)}</div>
    <div class="para-info"><div class="para-label">Proposta para</div><div class="para-nome">${propostaPara || '—'}</div></div>
  </div>
  <div class="tabela-wrap">
    <table>
      <thead><tr><th style="width:28px;">Nº</th><th style="text-align:left;">Vacina / Proteção</th><th>À vista</th><th>No crédito</th></tr></thead>
      <tbody>${linhasVacinas}</tbody>
    </table>
  </div>
  <div class="valores-wrap">
    <div>${descontoBox}</div>
    <div class="cred-box"><div style="font-size:.66rem;opacity:.85;">No cartão</div><div class="v">${parcLabel}</div></div>
  </div>
  <div class="validade">Proposta válida por <b>2 dias</b> — até <b>${fmtData(dataValidade)}</b>. Garanta agora a saúde da sua família!</div>
  <div class="benef-titulo">${svgIcon('sparkle', C.corAcento, 15, 'margin-right:4px;')}Benefícios Exclusivos da Nossa Clínica</div>
  <div class="benef-grid">${cardsHtml}</div>
  <div class="selos">
    <div class="selo"><div class="si">${svgIcon('shield', C.corPrim, 19)}</div><div class="st">Qualidade</div></div>
    <div class="selo"><div class="si">${svgIcon('users', C.corPrim, 19)}</div><div class="st">Confiança</div></div>
    <div class="selo"><div class="si">${svgIcon('heart', C.corPrim, 19)}</div><div class="st">Cuidado</div></div>
    <div class="selo"><div class="si">${svgIcon('zap', C.corPrim, 19)}</div><div class="st">Agilidade</div></div>
    <div class="selo"><div class="si">${svgIcon('flag', C.corPrim, 19)}</div><div class="st">Vacinas EUA</div></div>
  </div>
  <div class="rodape">
    <div class="re"><strong>Vittalis Saúde</strong><br>Edifício Business Center — Renascença<br>Av. Cel. Colares Moreira, 3A, Térreo — São Luís, MA</div>
    <div class="rd">${svgIcon('phone', '#fff', 11, 'margin-right:5px;')}(98) 98422-1002<br>${svgIcon('globe', '#fff', 11, 'margin-right:5px;')}www.vittalissaude.com.br<br>${svgIcon('camera', '#fff', 11, 'margin-right:5px;')}@vittalissaudeslz</div>
  </div>
</div>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE 2 — PLANO VACINAL COMPLETO (capa + cronograma + benefícios em imagem)
// ═══════════════════════════════════════════════════════════════════════════
function gerarHtmlPlano({ planoId, desconto = 0, parcelas, bonus = 'Atendimento Domiciliar' }) {
  const plano = PLANOS.find(p => p.id === planoId);
  if (!plano) throw new Error('Plano não encontrado: ' + planoId);
  const precos = PRECOS_PLANO[planoId] || { avista: 0, credito: 0, parcelas: 6 };

  const logoUrl = imgDataUri('logos/logo-vertical-color.png');
  const capaUrl = imgDataUri('capa.jpg');
  const benef1Url = imgDataUri('beneficios_1.jpg');
  const benef2Url = imgDataUri('beneficios_2.jpg');

  // Total bruto (soma das vacinas com preço)
  let bruto = 0;
  for (const g of plano.vacinas) for (const i of g.itens) if (i.ativo && i.preco > 0) bruto += Number(i.preco);

  const avista = precos.avista || (desconto > 0 ? bruto - desconto : bruto);
  const credito = precos.credito || bruto;
  const parcQtd = parcelas || precos.parcelas || 6;

  const vD = avista < bruto ? fmtPreco(avista) : '';
  const vCredLabel = fmtPreco(credito);
  const vP = parcQtd > 1 ? `${parcQtd}x de ${fmtPreco(Math.ceil(credito / parcQtd))} sem juros` : '';

  const ativos = plano.vacinas.map(g => ({ mes: g.mes, itens: g.itens.filter(i => i.ativo) })).filter(g => g.itens.length);
  let vacH = '';
  ativos.forEach(g => {
    const li = g.itens.map(i => {
      if (i.obs) return `<li>${esc(i.nome)} (${esc(i.obs)})</li>`;
      const p = Number(i.preco);
      return p > 0 ? `<li>${esc(i.nome)} – ${fmtPreco(p)}</li>` : `<li>${esc(i.nome)}</li>`;
    }).join('');
    vacH += `<article class="vi"><div class="vi-month">${esc(g.mes)}</div><ul class="vi-list">${li}</ul></article>`;
  });

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${esc(plano.nome)} — Vittalis Saúde</title>
<style>
@page{size:A4;margin:0}*{box-sizing:border-box}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#073e78;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.static-page{width:210mm;height:297mm;page-break-after:always;overflow:hidden;}
.static-page img{width:100%;height:100%;object-fit:cover;display:block}
.vac-page{background:linear-gradient(180deg,#e8f4fd 0%,#f0f7fc 50%,#d6eaf8 85%,#1a5276 92%,#0d3b5e 100%);padding:6mm 10mm 0;position:relative;width:210mm;min-height:297mm;page-break-after:always;}
.vac-header{text-align:center;margin-bottom:3mm;}
.vac-logo{width:55mm;margin:0 auto 1mm;display:block;}
.vac-tagline{font-size:2.5mm;font-weight:700;letter-spacing:1mm;color:#6b8fa3;margin-bottom:2mm;}
.vac-title{font-size:7mm;font-weight:800;color:#073e78;margin:0 0 2mm;}
.vac-pill{display:inline-block;background:#1a8a7d;color:#fff;padding:2mm 7mm;border-radius:8mm;font-size:5.5mm;font-weight:800;}
.vac-card{background:rgba(255,255,255,.85);border:1mm solid #e0ecf3;border-radius:8mm;padding:5mm 6mm 4mm;margin:3mm 0;display:grid;grid-template-columns:1fr 1fr;column-gap:6mm;align-content:start;}
.vi{padding-bottom:1.5mm;border-bottom:.3mm dotted #c9dce8;break-inside:avoid;margin-bottom:2mm;}
.vi-month{display:inline-block;background:#1a4c6e;color:#fff;border-radius:3mm;padding:.8mm 3mm;font-size:2.8mm;font-weight:800;margin-bottom:1mm;}
.vi-list{margin:0;padding:0 0 0 4mm;list-style:disc;font-size:2.7mm;line-height:3.8mm;color:#2c3e50;}
.vac-values{background:linear-gradient(135deg,#e8f4fd,#fff);border:1mm solid #b8d8e8;border-radius:6mm;margin:3mm 10mm 0;padding:3mm 5mm;text-align:center;}
.vv-destaque{background:linear-gradient(135deg,#1a8a7d,#2bbcb3);border-radius:5mm;padding:2.5mm 4mm;color:#fff;margin-bottom:2mm;}
.vv-destaque-valor{font-size:7mm;font-weight:800;margin:0 2mm;}
.vv-parc{background:linear-gradient(135deg,#0d3b5e,#207898);color:#fff;border-radius:4mm;padding:2.5mm 4mm;font-size:3.2mm;font-weight:700;margin-bottom:1.5mm;}
.vac-bonus{background:#fff;border:1mm solid #1a8a7d;border-radius:6mm;margin:2mm auto 0;width:110mm;text-align:center;padding:2mm 3mm;font-size:3.5mm;font-weight:800;color:#073e78;}
.vac-footer{position:absolute;left:0;right:0;bottom:0;background:#0d3b5e;color:#fff;padding:3mm 12mm;display:grid;grid-template-columns:1fr 1fr;gap:15mm;font-size:2.5mm;line-height:3.5mm;}
.vac-footer strong{font-size:3mm;}
</style></head><body>
${capaUrl ? `<section class="static-page"><img src="${capaUrl}" alt="Capa"/></section>` : ''}
<section class="vac-page">
  <div class="vac-header">
    ${logoUrl ? `<img src="${logoUrl}" class="vac-logo" alt="Vittalis Saúde"/>` : ''}
    <div class="vac-tagline">C U I D A R &nbsp; É &nbsp; O &nbsp; N O S S O &nbsp; P R O P Ó S I T O</div>
    <div class="vac-title">${esc(plano.nome)}</div>
    <div class="vac-pill">${svgIcon('calendar', '#fff', 16, 'margin-right:6px;margin-top:-2px;')}${esc(plano.periodo)}</div>
  </div>
  <div class="vac-card">${vacH}</div>
  <div class="vac-values">
    ${vD ? `<div class="vv-destaque"><span>Valor com desconto:</span><span class="vv-destaque-valor">${esc(vD)}</span><span>à vista</span></div>` : ''}
    <div class="vv-parc">${svgIcon('card', '#fff', 13, 'margin-right:5px;margin-top:-2px;')}Ou ${esc(vCredLabel)} no cartão${vP ? ' em ' + esc(vP) : ''}</div>
  </div>
  <div class="vac-bonus">${svgIcon('gift', '#1a8a7d', 14, 'margin-right:5px;margin-top:-2px;')}Bônus: ${esc(bonus)}</div>
  <footer class="vac-footer">
    <div><strong>NOSSO ENDEREÇO:</strong><br/>Edifício Business Center - Renascença<br/>Av. Coronel Colares Moreira, 3A, Térreo.</div>
    <div>(98) 98422 - 1002<br/>(98) 98423 - 3616<br/>www.vittalissaude.com.br<br/>vittalissaudeslz</div>
  </footer>
</section>
${benef1Url ? `<section class="static-page"><img src="${benef1Url}" alt="Benefícios"/></section>` : ''}
${benef2Url ? `<section class="static-page"><img src="${benef2Url}" alt="Benefícios"/></section>` : ''}
</body></html>`;
}

// helper: monta um pacote mensal fechado para o template de orçamento.
// O desconto é a diferença entre a soma das vacinas avulsas e o preço fechado
// do pacote — assim o PDF mostra "De R$X por R$Y" com valores corretos.
function montarPacote(pacoteId) {
  const id = String(pacoteId || '').toLowerCase().trim();
  const p = PACOTES.find(x => x.id === id) || PACOTES.find(x => x.id === id.replace(/\D/g, '') + 'm');
  if (!p) return null;
  const vacs = p.vacinas.map(i => VACINAS[i]).filter(Boolean);
  const bruto = vacs.reduce((s, v) => s + Number(v.avista || 0), 0);
  return {
    pacote: p,
    vacinas: vacs,
    desconto: Math.max(0, bruto - p.avista),
    credito: p.credito,
    parcelas: p.parcelas,
    label: p.label,
  };
}

// helper: acha vacina por nome (com sinônimos)
function acharVacina(nome) {
  const n = String(nome).toLowerCase().trim();
  const sin = { 'gripe':'influenza','pneumo 20':'pneumocócica 20','pneumo 15':'pneumocócica 15','pneumo':'pneumocócica','catapora':'varicela','menin b':'meningocócica b','menin':'meningocócica','hpv':'hpv','zoster':'zóster','zóster':'zóster','herpes':'zóster','rota':'rotavírus','hexa':'hexavalente','penta':'pentavalente','tripla':'tríplice','triplice':'tríplice' };
  let v = VACINAS.find(x => x.nome.toLowerCase().includes(n) || n.includes(x.nome.toLowerCase()));
  if (v) return v;
  for (const [k, alvo] of Object.entries(sin)) {
    if (n.includes(k)) { v = VACINAS.find(x => x.nome.toLowerCase().includes(alvo)); if (v) return v; }
  }
  return null;
}

export {
  PLANOS, PRECOS_PLANO, VACINAS, PACOTES, PRECO,
  gerarHtmlOrcamento, gerarHtmlPlano, acharVacina, montarPacote,
};
export default {
  PLANOS, PRECOS_PLANO, VACINAS, PACOTES, PRECO,
  gerarHtmlOrcamento, gerarHtmlPlano, acharVacina, montarPacote,
};
