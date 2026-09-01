export const STATUS_CLS = {
  'Novo lead':'b-novo','Em atendimento':'b-atend','Orçamento enviado':'b-orca',
  'Aguardando retorno':'b-aguard','Fechado':'b-fechado','Perdido':'b-perdido'
};
/* 🧹 STATUS_CLR — DESATIVADO (pedido do master: tirar o que não é usado,
   deixando comentado). Era a paleta dos status ANTIGOS de lead ("Orçamento
   enviado", "Aguardando retorno"), de quando o funil vivia na tabela `leads`.
   Hoje o funil real é o das CONVERSAS, com outras etapas e outras cores — esta
   tabela não era lida por tela nenhuma e só confundia quem procurasse "a cor
   do status".
export const STATUS_CLR = {
  'Novo lead':'#3b82f6','Em atendimento':'#f97316','Orçamento enviado':'#8b5cf6',
  'Aguardando retorno':'#f59e0b','Fechado':'#10b981','Perdido':'#ef4444'
};
*/
export const COLORS = ['#00B8C0','#0E8C96','#C4973B','#10b981','#ef4444','#8b5cf6','#f97316','#3b82f6'];

const TRATAMENTO = /^(dr|dra|sr|sra|enf|prof|profa)\.?$/i;
// Tira o pronome de tratamento da FRENTE do nome, quantos vierem ("Dra. Sra. X")
export function semTitulo(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  while (partes.length > 1 && TRATAMENTO.test(partes[0])) partes.shift();
  // Nome que é SÓ o título não vira vazio — melhor mostrar o que existe
  return partes.join(' ') || String(nome || '').trim();
}

export const fmt = {
  brl: v => v==null?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v),
  date: s => { if(!s) return '—'; const[y,m,d]=s.split('-'); return `${d}/${m}/${y}`; },
  phone: p => { const n=(p||'').replace(/\D/g,''); if(n.length===11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`; if(n.length===10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`; return p; },
  relTime: iso => { if(!iso) return ''; const d=new Date(iso),diff=Date.now()-d; if(diff<60000) return 'agora'; if(diff<3600000) return `${Math.floor(diff/60000)}m`; if(diff<86400000) return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}); },
  msgTime: iso => new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
  initials: n => (semTitulo(n)||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(),
  /* 🏷️ NOME SEM PRONOME DE TRATAMENTO (ordem do master, 01/09: "retira Dra…
     retira Dr também"). A tela mostra gente, não título: "Dr Miécio" vira
     "Miécio". Vale só pra exibir — o cadastro é normalizado no servidor. */
  nome: n => semTitulo(n),
  primeiroNome: n => (semTitulo(n).split(' ')[0] || ''),
  shortDate: iso => { if(!iso) return ''; const d=new Date(iso); return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}); },
};

export function openWA(phone, name) {
  const n=(phone||'').replace(/\D/g,'');
  const full = n.startsWith('55')?n:`55${n}`;
  window.open(`https://wa.me/${full}?text=${encodeURIComponent(`Olá ${name}! Aqui é a equipe da *Vittalis Saúde* 💎`)}`, '_blank');
}

// Data LOCAL (São Luís) — toISOString() é UTC e virava "amanhã" depois das 21h,
// marcando retorno de "Hoje" no dia errado à noite.
export const hojeLocalISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function isToday(dateStr) { return dateStr === hojeLocalISO(); }
export function isPast(dateStr) { return dateStr && dateStr < hojeLocalISO(); }

/* ─── Máscaras de formulário (anti-bug: limitam e formatam na digitação) ───── */
export const mask = {
  // (98) 98422-1002 — aceita fixo e celular, máx 11 dígitos
  phone: (v) => {
    const n = String(v || '').replace(/\D/g, '').slice(0, 11);
    if (n.length <= 2)  return n;
    if (n.length <= 6)  return `(${n.slice(0, 2)}) ${n.slice(2)}`;
    if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  },
  // 000.000.000-00
  cpf: (v) => String(v || '').replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2'),
  // R$ 1.234,56 — digita só números, centavos automáticos
  moneyBR: (v) => {
    const n = String(v || '').replace(/\D/g, '').slice(0, 9);
    if (!n) return '';
    const cents = (parseInt(n, 10) / 100).toFixed(2);
    return 'R$ ' + cents.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  },
  // converte o texto mascarado de volta pra número (para enviar à API)
  moneyToNumber: (v) => {
    const n = String(v || '').replace(/\D/g, '');
    return n ? parseInt(n, 10) / 100 : 0;
  },
  digits: (v) => String(v || '').replace(/\D/g, ''),
};

/* Gradiente determinístico por contato (estilo WhatsApp/Telegram) */
const AV_GRADS = [
  ['#00B8C0', '#0E8C96'], ['#7c5cbf', '#4c3a8f'], ['#e8671a', '#c2410c'],
  ['#0fb07a', '#047857'], ['#e84040', '#b91c1c'], ['#C4973B', '#92660f'],
  ['#3b82f6', '#1d4ed8'], ['#ec4899', '#be185d'],
];
export function avatarGrad(seed) {
  const str = String(seed || '?');
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const [a, b] = AV_GRADS[h % AV_GRADS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

/* ─── Mistura de cores ────────────────────────────────────────────────────────
   Usado pelo seletor "monte a sua cor" e por quem precisa derivar tons de um
   acento. Fica aqui, e não no App, porque a Sidebar também usa: importar do App
   criaria ciclo (App → Sidebar → App), que é o tipo de fragilidade que derruba
   a tela inteira sem o build acusar nada. */
const _hexRGB = (h) => {
  const x = String(h || '').replace('#', '');
  const f = x.length === 3 ? x.split('').map(c => c + c).join('') : x;
  return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) || 0);
};
const _hx2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const _mix = (hex, alvo, p) => {
  const [r, g, b] = _hexRGB(hex), [R, G, B] = alvo;
  return `#${_hx2(r + (R - r) * p)}${_hx2(g + (G - g) * p)}${_hx2(b + (B - b) * p)}`;
};
export const hexRGB = _hexRGB;
export const clarear = (hex, p) => _mix(hex, [255, 255, 255], p);
export const escurecer = (hex, p) => _mix(hex, [0, 0, 0], p);

/* ─── Título do usuário ───────────────────────────────────────────────────────
   'Supervisora' sozinha sugeria gestão da clínica inteira. Aqui o cargo é do
   SETOR (Raylane supervisiona vacinas e atende nele; Danielle, consultas e
   terapias), então o título carrega o setor junto — o nome do papel passa a
   dizer o que ele realmente significa no sistema. */
const _CAP = (t) => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);
export function tituloUsuario(u) {
  const base = u?.role === 'master' ? 'Master' : u?.role === 'supervisor' ? 'Supervisora' : 'Atendente';
  if (u?.role === 'master') return base;
  const setores = (Array.isArray(u?.setores) && u.setores.length ? u.setores : [u?.setor]).filter(Boolean);
  if (!setores.length) return base;
  return `${base} · ${setores.map(_CAP).join(' e ')}`;
}
