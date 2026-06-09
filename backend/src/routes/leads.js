import express from 'express';
import { v4 as uuid } from 'uuid';
import { leads, users, conversations, notifications, nextAtendente, ORIGENS, INTERESSES, STATUS_LIST, MOTIVOS_PERDA, TAGS } from '../data/db.js';
import { auth } from '../middleware/auth.js';

const r = express.Router();
r.use(auth);

const enrich = (l) => ({ ...l, responsavelNome: users.find(u => u.id === l.responsavelId)?.nome || null, responsavelCor: users.find(u => u.id === l.responsavelId)?.cor || null });
const guard = (l, role) => role === 'master' ? l : { ...l, valorProposta: null };

r.get('/', (req, res) => {
  const { status, responsavelId, origem, search, tag, page = 1, limit = 50 } = req.query;
  let list = leads.map(enrich);
  if (status) list = list.filter(l => l.status === status);
  if (responsavelId) list = list.filter(l => l.responsavelId === responsavelId);
  if (origem) list = list.filter(l => l.origem === origem);
  if (tag) list = list.filter(l => l.tags?.includes(tag));
  if (search) { const s = search.toLowerCase(); list = list.filter(l => l.nome.toLowerCase().includes(s) || (l.telefone||'').replace(/\D/g,'').includes(s.replace(/\D/g,'')) || (l.email||'').toLowerCase().includes(s)); }
  list.sort((a, b) => new Date(b.dataEntrada) - new Date(a.dataEntrada));
  const total = list.length;
  const paged = list.slice((+page-1)*+limit, +page*+limit);
  res.json({ data: paged.map(l => guard(l, req.user.role)), total, page: +page, pages: Math.ceil(total/+limit) });
});

r.get('/meta', (req, res) => res.json({ origens: ORIGENS, interesses: INTERESSES, statusList: STATUS_LIST, motivosPerda: MOTIVOS_PERDA, tags: TAGS, users: users.filter(u=>u.role!=='bot').map(u => ({ id: u.id, nome: u.nome, cor: u.cor })) }));

r.get('/:id', (req, res) => {
  const l = leads.find(l => l.id === req.params.id);
  if (!l) return res.status(404).json({ error: 'Não encontrado' });
  res.json(guard(enrich(l), req.user.role));
});

r.post('/', (req, res) => {
  // Auto-assign to next atendente if no responsavelId
  const responsavelId = req.body.responsavelId || nextAtendente();
  const novo = {
    id: uuid(),
    nome: req.body.nome || '',
    telefone: req.body.telefone || '',
    email: req.body.email || '',
    origem: req.body.origem || 'WhatsApp',
    interesse: req.body.interesse || 'Consulta',
    status: 'Novo lead',
    responsavelId,
    valorProposta: req.user.role === 'master' ? (parseFloat(req.body.valorProposta)||0) : 0,
    servico: req.body.servico || '',
    dataEntrada: new Date().toISOString().split('T')[0],
    dataRetorno: req.body.dataRetorno || null,
    observacoes: req.body.observacoes || '',
    motivoPerda: null,
    tags: req.body.tags || [],
    vittasysClienteId: req.body.vittasysClienteId || null,
  };
  leads.unshift(novo);
  // Notification
  notifications.unshift({ id: uuid(), tipo:'novo_lead', titulo:'Novo lead', texto:`${novo.nome} entrou via ${novo.origem}`, leadId: novo.id, lida: false, createdAt: new Date().toISOString() });
  res.status(201).json(guard(enrich(novo), req.user.role));
});

r.put('/:id', (req, res) => {
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
  const update = { ...leads[idx], ...req.body, id: leads[idx].id };
  if (req.user.role !== 'master') delete update.valorProposta;
  leads[idx] = update;
  res.json(guard(enrich(leads[idx]), req.user.role));
});

r.patch('/:id/status', (req, res) => {
  const l = leads.find(l => l.id === req.params.id);
  if (!l) return res.status(404).json({ error: 'Não encontrado' });
  l.status = req.body.status;
  if (req.body.motivoPerda) l.motivoPerda = req.body.motivoPerda;
  if (req.body.responsavelId) l.responsavelId = req.body.responsavelId;
  res.json(guard(enrich(l), req.user.role));
});

r.delete('/:id', (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Somente master' });
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
  leads.splice(idx, 1);
  res.json({ ok: true });
});

export default r;
