export const STATUS_CLS = {
  'Novo lead':'b-novo','Em atendimento':'b-atend','Orçamento enviado':'b-orca',
  'Aguardando retorno':'b-aguard','Fechado':'b-fechado','Perdido':'b-perdido'
};
export const STATUS_CLR = {
  'Novo lead':'#3b82f6','Em atendimento':'#f97316','Orçamento enviado':'#8b5cf6',
  'Aguardando retorno':'#f59e0b','Fechado':'#10b981','Perdido':'#ef4444'
};
export const COLORS = ['#00B8C0','#207898','#C4973B','#10b981','#ef4444','#8b5cf6','#f97316','#3b82f6'];

export const fmt = {
  brl: v => v==null?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v),
  date: s => { if(!s) return '—'; const[y,m,d]=s.split('-'); return `${d}/${m}/${y}`; },
  phone: p => { const n=(p||'').replace(/\D/g,''); if(n.length===11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`; if(n.length===10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`; return p; },
  relTime: iso => { if(!iso) return ''; const d=new Date(iso),diff=Date.now()-d; if(diff<60000) return 'agora'; if(diff<3600000) return `${Math.floor(diff/60000)}m`; if(diff<86400000) return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}); },
  msgTime: iso => new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
  initials: n => (n||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(),
  shortDate: iso => { if(!iso) return ''; const d=new Date(iso); return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}); },
};

export function openWA(phone, name) {
  const n=(phone||'').replace(/\D/g,'');
  const full = n.startsWith('55')?n:`55${n}`;
  window.open(`https://wa.me/${full}?text=${encodeURIComponent(`Olá ${name}! Aqui é a equipe da *Vittalis Saúde* 💎`)}`, '_blank');
}

export function isToday(dateStr) { return dateStr === new Date().toISOString().split('T')[0]; }
export function isPast(dateStr) { return dateStr && dateStr < new Date().toISOString().split('T')[0]; }
