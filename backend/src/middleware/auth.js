import jwt from 'jsonwebtoken';

// Sem fallback: se faltar o segredo, o app NÃO sobe (evita assinar tokens com um
// segredo público versionado, que permitiria forjar um token de master).
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET não definido — configure a variável de ambiente antes de iniciar o servidor.');
}
export const SECRET = process.env.JWT_SECRET;

export function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token necessário' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function masterOnly(req, res, next) {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Acesso restrito ao master' });
  next();
}
