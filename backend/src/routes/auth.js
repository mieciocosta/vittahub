import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { users } from '../data/db.js';
import { SECRET, auth } from '../middleware/auth.js';

const r = express.Router();

r.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  const u = users.find(u => u.email === email && u.ativo);
  if (!u) return res.status(401).json({ error: 'Usuário não encontrado' });
  const ok = await bcrypt.compare(senha, u.senha);
  if (!ok) return res.status(401).json({ error: 'Senha incorreta' });
  const token = jwt.sign({ id: u.id, nome: u.nome, email: u.email, role: u.role, cor: u.cor }, SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: u.id, nome: u.nome, email: u.email, role: u.role, cor: u.cor } });
});

r.get('/me', auth, (req, res) => {
  const u = users.find(u => u.id === req.user.id);
  if (!u) return res.status(404).json({ error: 'Não encontrado' });
  res.json({ id: u.id, nome: u.nome, email: u.email, role: u.role, cor: u.cor });
});

r.get('/usuarios', auth, (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Acesso negado' });
  res.json(users.filter(u => u.role !== 'bot').map(u => ({ id: u.id, nome: u.nome, email: u.email, role: u.role, cor: u.cor, ativo: u.ativo })));
});

export default r;
