import express from 'express';
import { leads, conversations, users, notifications } from '../data/db.js';
import { auth } from '../middleware/auth.js';

const r = express.Router();
r.use(auth);

r.get('/dashboard', (req, res) => {
  const isMaster = req.user.role === 'master';
  const today = new Date().toISOString().split('T')[0];
  const mine = isMaster ? leads : leads.filter(l => l.responsavelId === req.user.id);

  const fechados = mine.filter(l => l.status === 'Fechado');
  const perdidos = mine.filter(l => l.status === 'Perdido');
  const totalVendido = isMaster ? fechados.reduce((s,l) => s+(l.valorProposta||0), 0) : null;
  const ticket = isMaster && fechados.length > 0 ? totalVendido/fechados.length : null;

  // Por responsavel (master)
  const porResponsavel = isMaster ? {} : null;
  if (isMaster) {
    users.filter(u=>u.role!=='bot').forEach(u => { porResponsavel[u.id] = { id:u.id, nome:u.nome, cor:u.cor, leads:0, fechados:0, valor:0, taxa:0 }; });
    leads.forEach(l => {
      if (l.responsavelId && porResponsavel[l.responsavelId]) {
        porResponsavel[l.responsavelId].leads++;
        if (l.status==='Fechado') { porResponsavel[l.responsavelId].fechados++; porResponsavel[l.responsavelId].valor+=(l.valorProposta||0); }
      }
    });
    Object.values(porResponsavel).forEach(v => { v.taxa = v.leads>0?+(v.fechados/v.leads*100).toFixed(1):0; });
  }

  // Por origem
  const porOrigem = {};
  mine.forEach(l => {
    if (!porOrigem[l.origem]) porOrigem[l.origem] = { total:0, fechados:0 };
    porOrigem[l.origem].total++;
    if(l.status==='Fechado') porOrigem[l.origem].fechados++;
  });

  // Por status
  const porStatus = {};
  mine.forEach(l => { porStatus[l.status] = (porStatus[l.status]||0)+1; });

  // Motivos perda
  const motivosPerda = {};
  perdidos.forEach(l => { if(l.motivoPerda) motivosPerda[l.motivoPerda]=(motivosPerda[l.motivoPerda]||0)+1; });

  // Por dia (last 7 days)
  const porDia = {};
  for (let i=6; i>=0; i--) { const dt=new Date(); dt.setDate(dt.getDate()-i); porDia[dt.toISOString().split('T')[0]] = { leads:0, fechados:0 }; }
  mine.forEach(l => { if(porDia[l.dataEntrada]) { porDia[l.dataEntrada].leads++; if(l.status==='Fechado') porDia[l.dataEntrada].fechados++; } });

  const totalUnread = conversations.reduce((s,c) => s+(c.unread||0), 0);
  const retornosHoje = mine.filter(l => l.dataRetorno===today).length;
  const retornosVencidos = mine.filter(l => l.dataRetorno && l.dataRetorno<today && l.status!=='Fechado' && l.status!=='Perdido').length;
  const notificacoesNaoLidas = notifications.filter(n=>!n.lida).length;

  res.json({
    resumo: { totalLeads:mine.length, leadsHoje:mine.filter(l=>l.dataEntrada===today).length, emAtendimento:mine.filter(l=>l.status==='Em atendimento').length, fechados:fechados.length, perdidos:perdidos.length, totalVendido, ticket, taxaConversao:mine.length>0?+((fechados.length/mine.length)*100).toFixed(1):0, retornosHoje, retornosVencidos, totalUnread, notificacoesNaoLidas },
    porResponsavel,
    porOrigem,
    porStatus,
    motivosPerda,
    porDia: Object.entries(porDia).map(([data,v]) => ({ data: data.slice(5), ...v })),
  });
});

// PDF report data
r.get('/pdf-data', (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Somente master' });
  const fechados = leads.filter(l=>l.status==='Fechado');
  const totalVendido = fechados.reduce((s,l)=>s+(l.valorProposta||0),0);
  const porOrigem = {};
  leads.forEach(l => { if(!porOrigem[l.origem]) porOrigem[l.origem]={total:0,fechados:0}; porOrigem[l.origem].total++; if(l.status==='Fechado') porOrigem[l.origem].fechados++; });
  const porResponsavel = {};
  users.filter(u=>u.role!=='bot').forEach(u => { porResponsavel[u.nome]={leads:0,fechados:0,valor:0}; });
  leads.forEach(l => {
    const nome = users.find(u=>u.id===l.responsavelId)?.nome;
    if(nome&&porResponsavel[nome]){porResponsavel[nome].leads++;if(l.status==='Fechado'){porResponsavel[nome].fechados++;porResponsavel[nome].valor+=(l.valorProposta||0);}}
  });
  res.json({ totalLeads:leads.length, fechados:fechados.length, totalVendido, porOrigem, porResponsavel, geradoEm:new Date().toLocaleString('pt-BR'), periodo:'Todo período' });
});

export default r;
