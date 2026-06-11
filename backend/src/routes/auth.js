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
    res.json({ token, user: { id: u.id, nome: u.nome, email: u.email, cpf: u.cpf, role: u.role, cor: u.cor, avatar: u.avatar || null } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
});

r.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await query('SELECT id,nome,email,cpf,role,cor,avatar FROM usuarios WHERE id=$1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Foto de perfil do PRÓPRIO usuário (qualquer perfil) — imagem pequena em data URL
r.patch('/me/avatar', auth, async (req, res) => {
  try {
    const { avatar } = req.body; // null remove
    if (avatar != null) {
      if (typeof avatar !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(avatar)) {
        return res.status(400).json({ error: 'Imagem inválida' });
      }
      if (avatar.length > 200_000) return res.status(400).json({ error: 'Imagem muito grande — tente outra foto' });
    }
    const { rows: [u] } = await query('UPDATE usuarios SET avatar = $1, updated_at = NOW() WHERE id = $2 RETURNING id, avatar', [avatar || null, req.user.id]);
    res.json({ ok: true, avatar: u.avatar });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/usuarios', auth, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const { rows } = await query("SELECT id,nome,email,cpf,role,cor,ativo,avatar FROM usuarios WHERE role!='bot' ORDER BY nome");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Criar usuário (master): login por CPF + senha inicial
r.post('/usuarios', auth, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const nome = String(req.body.nome || '').trim().slice(0, 80);
    const cpf = String(req.body.cpf || '').replace(/\D/g, '');
    const senha = String(req.body.senha || '');
    const role = ['master', 'atendente'].includes(req.body.role) ? req.body.role : 'atendente';
    const cor = req.body.cor || '#00B8C0';
    if (!nome) return res.status(400).json({ error: 'Informe o nome' });
    if (cpf.length !== 11) return res.status(400).json({ error: 'CPF inválido — precisa de 11 dígitos' });
    if (senha.length < 8) return res.status(400).json({ error: 'A senha precisa de pelo menos 8 caracteres' });
    const { rows: [dup] } = await query('SELECT 1 FROM usuarios WHERE cpf = $1', [cpf]);
    if (dup) return res.status(409).json({ error: 'Este CPF já está cadastrado' });
    const hash = await bcrypt.hash(senha, 10);
    const email = `${cpf}@vittahub.local`; // e-mail é NOT NULL/único no schema; login é pelo CPF
    const { rows: [u] } = await query(
      `INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, true)
       RETURNING id, nome, email, cpf, role, cor, ativo`,
      [nome, email, cpf, hash, role, cor]);
    res.status(201).json(u);
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
