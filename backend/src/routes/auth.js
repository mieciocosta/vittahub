import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { SECRET, auth } from '../middleware/auth.js';

const r = express.Router();

r.post('/login', async (req, res) => {
  try {
    // Login por CPF (padrão da equipe) ou e-mail. Aceita { login } ou { email }.
    const id = String(req.body.login || req.body.email || '').trim();
    const { senha } = req.body;
    if (!id || !senha) return res.status(400).json({ error: 'CPF e senha são obrigatórios' });

    const digits = id.replace(/\D/g, '');
    let rows;
    if (digits.length === 11 && !id.includes('@')) {
      ({ rows } = await query("SELECT * FROM usuarios WHERE regexp_replace(COALESCE(cpf,''), '\\D', '', 'g') = $1 AND ativo = true", [digits]));
    } else {
      ({ rows } = await query('SELECT * FROM usuarios WHERE LOWER(email) = LOWER($1) AND ativo = true', [id]));
    }
    const u = rows[0];
    if (!u) return res.status(401).json({ error: 'Usuário não encontrado. Confira o CPF digitado.' });
    const ok = await bcrypt.compare(senha, u.senha);
    if (!ok) return res.status(401).json({ error: 'Senha incorreta' });
    const token = jwt.sign({ id: u.id, nome: u.nome, email: u.email, role: u.role, cor: u.cor }, SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: u.id, nome: u.nome, email: u.email, cpf: u.cpf, role: u.role, cor: u.cor } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
});

r.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await query('SELECT id,nome,email,cpf,role,cor FROM usuarios WHERE id=$1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/usuarios', auth, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const { rows } = await query("SELECT id,nome,email,cpf,role,cor,ativo FROM usuarios WHERE role!='bot' ORDER BY nome");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Editar usuário (master): cadastrar CPF, trocar senha, ativar/desativar, papel, cor
r.put('/usuarios/:id', auth, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const { nome, cpf, role, cor, ativo, senha } = req.body;
    const updates = [], params = [];
    let pi = 1;
    const set = (col, val) => { if (val !== undefined) { updates.push(`${col} = $${pi++}`); params.push(val); } };
    set('nome', nome);
    if (cpf !== undefined) set('cpf', String(cpf).replace(/\D/g, '') || null);
    if (role !== undefined && ['master', 'atendente'].includes(role)) set('role', role);
    set('cor', cor);
    set('ativo', ativo);
    if (senha) {
      if (String(senha).length < 8) return res.status(400).json({ error: 'A senha precisa de pelo menos 8 caracteres' });
      const hash = await bcrypt.hash(String(senha), 10);
      set('senha', hash);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nada para atualizar' });
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE usuarios SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pi} RETURNING id,nome,email,cpf,role,cor,ativo`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    if (String(err.message).includes('idx_usuarios_cpf')) return res.status(409).json({ error: 'Este CPF já está cadastrado em outro usuário' });
    res.status(500).json({ error: err.message });
  }
});

export default r;
