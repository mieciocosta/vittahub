import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { SECRET, auth } from '../middleware/auth.js';

const r = express.Router();

r.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: 'Email e senha obrigatórios' });
    const { rows } = await query('SELECT * FROM usuarios WHERE email = $1 AND ativo = true', [email]);
    const u = rows[0];
    if (!u) return res.status(401).json({ error: 'Usuário não encontrado' });
    const ok = await bcrypt.compare(senha, u.senha);
    if (!ok) return res.status(401).json({ error: 'Senha incorreta' });
    const token = jwt.sign({ id: u.id, nome: u.nome, email: u.email, role: u.role, cor: u.cor }, SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: u.id, nome: u.nome, email: u.email, role: u.role, cor: u.cor } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
});

r.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await query('SELECT id,nome,email,role,cor FROM usuarios WHERE id=$1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/usuarios', auth, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const { rows } = await query("SELECT id,nome,email,role,cor,ativo FROM usuarios WHERE role!='bot' ORDER BY nome");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default r;
