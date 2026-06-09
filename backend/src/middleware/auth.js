import jwt from 'jsonwebtoken';
export const SECRET = process.env.JWT_SECRET || 'vittahub_secret_2024';

export function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ error: 'Token inválido' }); }
}

export function masterOnly(req, res, next) {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Acesso restrito ao master' });
  next();
}
