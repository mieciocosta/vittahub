import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { SECRET, auth, revogarAcesso, reativarAcesso } from '../middleware/auth.js';

const r = express.Router();

// IP real atrás do proxy do Railway
function getRealIP(req) {
  const xff = req.headers['x-forwarded-for'];
  return xff ? xff.split(',')[0].trim() : req.ip || 'unknown';
}

// Rate-limit de login (anti brute-force): por IP, no máx 10 falhas em 10 min.
const loginFalhas = new Map(); // ip -> { count, until }
function loginBloqueado(ip) {
  const e = loginFalhas.get(ip);
  return e && e.until > Date.now() && e.count >= 10;
}
function registraFalhaLogin(ip) {
  const now = Date.now();
  let e = loginFalhas.get(ip);
  if (!e || e.until < now) e = { count: 0, until: now + 10 * 60 * 1000 };
  e.count++; loginFalhas.set(ip, e);
}
function limpaFalhasLogin(ip) { loginFalhas.delete(ip); }
// limpeza periódica do mapa (evita crescer pra sempre)
setInterval(() => { const now = Date.now(); for (const [k, v] of loginFalhas) if (v.until < now) loginFalhas.delete(k); }, 10 * 60 * 1000);

// Auditoria fire-and-forget — registra a ação SEM nunca lançar erro
// (uma falha de log jamais pode derrubar o login).
function logAudit(req, usuarioId, usuarioNome, acao, detalhes) {
  query(
    `INSERT INTO audit_logs (usuario_id, usuario_nome, acao, detalhes, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [usuarioId || null, usuarioNome || null, String(acao || '').slice(0, 40),
     detalhes ? JSON.stringify(detalhes) : null,
     getRealIP(req), req.get('user-agent')?.slice(0, 300)]
  ).catch(() => {});
}

r.post('/login', async (req, res) => {
  const ip = getRealIP(req);
  try {
    if (loginBloqueado(ip)) return res.status(429).json({ error: 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.' });
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
    if (!u) { registraFalhaLogin(ip); return res.status(401).json({ error: 'Usuário não encontrado. Confira o CPF digitado.' }); }
    const ok = await bcrypt.compare(senha, u.senha);
    if (!ok) { registraFalhaLogin(ip); logAudit(req, null, id, 'login_falha', { motivo: 'Senha incorreta' }); return res.status(401).json({ error: 'Senha incorreta' }); }
    limpaFalhasLogin(ip);
    const token = jwt.sign({ id: u.id, nome: u.nome, email: u.email, role: u.role, cor: u.cor, setor: u.setor || null, setores: u.setores || null, lider: !!u.lider, ve_tudo: !!u.ve_tudo }, SECRET, { expiresIn: u.role === 'master' ? '30d' : '16h' }); // equipe: sessão morre no mesmo dia; master mantém 30d
    logAudit(req, u.id, u.nome, 'login', { metodo: 'cpf' });
    res.json({ token, user: { id: u.id, nome: u.nome, email: u.email, cpf: u.cpf, role: u.role, cor: u.cor, avatar: u.avatar || null, setor: u.setor || null, lider: !!u.lider, ve_tudo: !!u.ve_tudo, dono: ehDono(u) } });
  } catch (err) {
    console.error('Login error:', err.message); // detalhe só no log do servidor
    res.status(500).json({ error: 'Erro interno. Tente novamente.' }); // não vaza o motivo
  }
});

r.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await query('SELECT id,nome,email,cpf,role,cor,avatar,setor,setores,lider,ve_tudo FROM usuarios WHERE id=$1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    res.json({ ...rows[0], dono: ehDono(rows[0]) });
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

// Editar o PRÓPRIO nome de exibição — instantâneo (reemite o token com o nome novo).
r.patch('/me/nome', auth, async (req, res) => {
  try {
    const nome = String(req.body?.nome || '').trim().slice(0, 60);
    if (nome.length < 2) return res.status(400).json({ error: 'Digite um nome válido.' });
    const { rows: [u] } = await query(
      'UPDATE usuarios SET nome = $1, updated_at = NOW() WHERE id = $2 RETURNING id, nome, email, cpf, role, cor, avatar, setor, setores, lider, ve_tudo',
      [nome, req.user.id]);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const token = jwt.sign({ id: u.id, nome: u.nome, email: u.email, role: u.role, cor: u.cor, setor: u.setor || null, setores: u.setores || null, lider: !!u.lider, ve_tudo: !!u.ve_tudo }, SECRET, { expiresIn: u.role === 'master' ? '30d' : '16h' }); // equipe: sessão morre no mesmo dia; master mantém 30d
    res.json({ ok: true, token, user: { id: u.id, nome: u.nome, email: u.email, cpf: u.cpf, role: u.role, cor: u.cor, avatar: u.avatar || null, setor: u.setor || null, lider: !!u.lider, ve_tudo: !!u.ve_tudo, dono: ehDono(u) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── 👤 ENTRAR COMO (impersonação, só master) ────────────────────────────────
// Gera um token do usuário-alvo pro master ver/operar o sistema como ele.
// O token carrega impersonadoPor pra rastreabilidade nos logs.
// Só o DONO (Miécio) troca de usuário: master + nome/e-mail com "miecio", ou o
// id definido em SUPER_ADMIN_ID no Railway (escape se a conta dele tiver outro nome).
/* Identidade do dono, em ordem de confiabilidade. O CPF e o e-mail vêm antes do
   nome de propósito: o master pode renomear a própria conta a qualquer momento
   (e renomeou), e o gate baseado só no nome simplesmente parava de reconhecê-lo
   — sem erro, o botão só sumia. CPF não muda. */
const CPF_DONO = '02914270305';
const EMAIL_DONO = 'miecio@vittalissaude.com.br';
export const ehDono = (u) => {
  if (!u) return false;
  if (process.env.SUPER_ADMIN_ID && u.id === process.env.SUPER_ADMIN_ID) return true;
  if (String(u.cpf || '').replace(/\D/g, '') === CPF_DONO) return true;
  if (String(u.email || '').toLowerCase() === EMAIL_DONO) return true;
  return /mi[eé]cio/i.test(`${u.nome || ''} ${u.email || ''}`);
};

r.post('/impersonar/:id', auth, async (req, res) => {
  try {
    // Confere no BANCO, não no token: o token não carrega CPF e pode estar
    // velho (nome antigo). A fonte da verdade é o cadastro.
    const { rows: [eu] } = await query('SELECT id, nome, email, cpf, role FROM usuarios WHERE id = $1', [req.user.id]);
    if (!eu || eu.role !== 'master' || !ehDono(eu)) {
      return res.status(403).json({ error: 'Recurso exclusivo do usuário do Dr. Miécio.' });
    }
    const { rows: [u] } = await query('SELECT id,nome,email,cpf,role,cor,avatar,setor,setores,lider,ve_tudo FROM usuarios WHERE id = $1', [req.params.id]);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    const token = jwt.sign(
      { id: u.id, nome: u.nome, email: u.email, role: u.role, cor: u.cor, setor: u.setor || null, setores: u.setores || null, lider: !!u.lider, ve_tudo: !!u.ve_tudo, impersonadoPor: req.user.id },
      SECRET, { expiresIn: '12h' });
    console.log(`👤 IMPERSONAÇÃO: ${req.user.nome} entrou como ${u.nome} (${u.id})`);
    res.json({ token, user: { id: u.id, nome: u.nome, email: u.email, cpf: u.cpf, role: u.role, cor: u.cor, avatar: u.avatar || null, setor: u.setor || null, lider: !!u.lider, ve_tudo: !!u.ve_tudo, dono: ehDono(u) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/usuarios', auth, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const { rows } = await query("SELECT id,nome,email,cpf,role,cor,ativo,avatar,setor,setores,lider,meta_individual,meta_tipo,meta_qtd_dia,meta_dias_uteis FROM usuarios WHERE role!='bot' ORDER BY nome");
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
    const role = ['master', 'supervisor', 'atendente'].includes(req.body.role) ? req.body.role : 'atendente';
    const cor = req.body.cor || '#00B8C0';
    const setor = ['vacinas','consultas','terapias'].includes(req.body.setor) ? req.body.setor : null;
    if (!nome) return res.status(400).json({ error: 'Informe o nome' });
    if (cpf.length !== 11) return res.status(400).json({ error: 'CPF inválido — precisa de 11 dígitos' });
    if (senha.length < 8) return res.status(400).json({ error: 'A senha precisa de pelo menos 8 caracteres' });
    const { rows: [dup] } = await query('SELECT 1 FROM usuarios WHERE cpf = $1', [cpf]);
    if (dup) return res.status(409).json({ error: 'Este CPF já está cadastrado' });
    const hash = await bcrypt.hash(senha, 10);
    const email = `${cpf}@vittahub.local`; // e-mail é NOT NULL/único no schema; login é pelo CPF
    const { rows: [u] } = await query(
      `INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, true, $7)
       RETURNING id, nome, email, cpf, role, cor, ativo, setor`,
      [nome, email, cpf, hash, role, cor, setor]);
    res.status(201).json(u);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Editar usuário (master): cadastrar CPF, trocar senha, ativar/desativar, papel, cor
r.put('/usuarios/:id', auth, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const { nome, cpf, role, cor, ativo, senha, setor } = req.body;
    const updates = [], params = [];
    let pi = 1;
    const set = (col, val) => { if (val !== undefined) { updates.push(`${col} = $${pi++}`); params.push(val); } };
    set('nome', nome);
    if (cpf !== undefined) set('cpf', String(cpf).replace(/\D/g, '') || null);
    if (role !== undefined && ['master', 'supervisor', 'atendente'].includes(role)) set('role', role);
    set('cor', cor);
    if (setor !== undefined) set('setor', ['vacinas','consultas','terapias'].includes(setor) ? setor : null);
    if (req.body.setores !== undefined) {
      const ss = Array.isArray(req.body.setores) ? req.body.setores.filter(s => ['vacinas','consultas','terapias'].includes(s)) : [];
      set('setores', ss.length ? ss : null);
    }
    if (req.body.lider !== undefined) set('lider', !!req.body.lider);
    if (req.body.meta_individual !== undefined) set('meta_individual', Math.max(0, Math.min(parseFloat(req.body.meta_individual) || 0, 100000000)));
    // Meta individual em duas unidades: R$ no mês ou consultas por dia
    if (req.body.meta_tipo !== undefined) set('meta_tipo', ['valor', 'consultas'].includes(req.body.meta_tipo) ? req.body.meta_tipo : 'valor');
    if (req.body.meta_qtd_dia !== undefined) set('meta_qtd_dia', Math.max(0, Math.min(parseInt(req.body.meta_qtd_dia) || 0, 500)));
    if (req.body.meta_dias_uteis !== undefined) set('meta_dias_uteis', Math.max(1, Math.min(parseInt(req.body.meta_dias_uteis) || 26, 31)));
    set('ativo', ativo);
    if (senha) {
      if (String(senha).length < 8) return res.status(400).json({ error: 'A senha precisa de pelo menos 8 caracteres' });
      const hash = await bcrypt.hash(String(senha), 10);
      set('senha', hash);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nada para atualizar' });
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE usuarios SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pi} RETURNING id,nome,email,cpf,role,cor,ativo,setor,setores,lider,meta_individual,meta_tipo,meta_qtd_dia,meta_dias_uteis`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });
    // Revoga/reativa o acesso NA HORA quando o status muda (não espera o token expirar)
    if (ativo === false) revogarAcesso(rows[0].id);
    else if (ativo === true) reativarAcesso(rows[0].id);
    res.json(rows[0]);
  } catch (err) {
    if (String(err.message).includes('idx_usuarios_cpf')) return res.status(409).json({ error: 'Este CPF já está cadastrado em outro usuário' });
    res.status(500).json({ error: err.message });
  }
});

export default r;
