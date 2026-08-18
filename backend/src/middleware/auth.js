import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';

// Sem fallback: se faltar o segredo, o app NÃO sobe (evita assinar tokens com um
// segredo público versionado, que permitiria forjar um token de master).
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET não definido — configure a variável de ambiente antes de iniciar o servidor.');
}
export const SECRET = process.env.JWT_SECRET;

// Revogação de acesso: usuários DESATIVADos têm o acesso cortado mesmo com um
// token ainda válido. Mantemos em memória o conjunto de IDs inativos, atualizado
// a cada 15s (e na inicialização) — checagem por requisição é O(1), sem ir ao banco.
let inativos = new Set();
// Usuário APAGADO do banco também perde o acesso: guardamos o conjunto dos ids
// existentes — token válido de um id que não existe mais é recusado (pedido do
// master de "retirar" usuários; sem isso o token velho viveria até expirar).
let existentes = null; // null = ainda não carregado (não bloqueia ninguém)
async function carregarInativos() {
  try {
    const { rows } = await query("SELECT id, ativo FROM usuarios");
    inativos = new Set(rows.filter(r => r.ativo === false).map(r => r.id));
    existentes = new Set(rows.map(r => String(r.id)));
  } catch { /* banco ainda não pronto — tenta de novo no próximo tick */ }
}
carregarInativos();
setInterval(carregarInativos, 15000);
// Permite revogar na hora (ex.: ao desativar um usuário pela tela)
export function revogarAcesso(userId) { if (userId) inativos.add(String(userId)); }
export function reativarAcesso(userId) { if (userId) inativos.delete(String(userId)); }

export function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token necessário' });
  try {
    req.user = jwt.verify(token, SECRET);
    if (req.user?.id && inativos.has(String(req.user.id))) {
      return res.status(401).json({ error: 'Acesso revogado — usuário desativado' });
    }
    if (req.user?.id && existentes && !existentes.has(String(req.user.id))) {
      return res.status(401).json({ error: 'Acesso revogado — usuário removido' });
    }
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function masterOnly(req, res, next) {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Acesso restrito ao master' });
  next();
}
