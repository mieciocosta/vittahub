import express from 'express';
import { auth } from '../middleware/auth.js';

// ─── Agenda do VittaMed dentro do VittaHub ───────────────────────────────────
// Pedido do master: cada setor tem sua agenda, e a equipe daqui precisa ver o
// que está marcado lá sem trocar de sistema.
//
// O navegador NUNCA vê o token da ponte: quem chama o VittaMed é este servidor,
// com o INTEGRACAO_TOKEN que já existe no ambiente. Só leitura — agendar
// continua sendo no sistema de origem, para não criar duas verdades.

const r = express.Router();

const configurado = () =>
  !!(process.env.VITTAMED_URL && process.env.INTEGRACAO_TOKEN && process.env.INTEGRACAO_TOKEN.length >= 16);

// "Hoje" no fuso de São Luís (UTC-3) — toISOString() puro vira o dia seguinte
// depois das 21h e a agenda do dia sumiria da tela.
const hojeLocal = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

// Quem enxerga a agenda do VittaMed: gestão e o pessoal de CONSULTAS.
// Pedido do master: é a equipe de consultas que recebe essa agenda. Vacinas e
// terapias têm as suas e não precisam dessa aqui atravessando a tela.
function podeVerVittaMed(user) {
  if (['master', 'supervisor'].includes(user?.role)) return true;
  const setores = Array.isArray(user?.setores) && user.setores.length ? user.setores : [user?.setor];
  return setores.includes('consultas');
}

// GET /api/extras/vittamed/agenda?data=YYYY-MM-DD[&setor=terapias]
r.get('/agenda', auth, async (req, res) => {
  if (!podeVerVittaMed(req.user)) return res.status(403).json({ error: 'A agenda do VittaMed é da equipe de consultas.' });
  if (!configurado()) {
    return res.json({
      ok: false, configurado: false, itens: [], total: 0, por_setor: {},
      aviso: 'Ponte com o VittaMed ainda não configurada (falta VITTAMED_URL ou INTEGRACAO_TOKEN no ambiente).',
    });
  }
  const data = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data : hojeLocal();
  const setor = ['vacinas', 'consultas', 'terapias'].includes(req.query.setor) ? req.query.setor : '';
  const base = String(process.env.VITTAMED_URL).replace(/\/+$/, '');

  try {
    const { default: fetch } = await import('node-fetch');
    const url = `${base}/api/integracao/agenda?data=${data}${setor ? `&setor=${setor}` : ''}`;
    const vr = await fetch(url, {
      headers: { 'x-integracao-token': process.env.INTEGRACAO_TOKEN },
      signal: AbortSignal.timeout(15000),
    });
    if (!vr.ok) {
      const txt = await vr.text().catch(() => '');
      return res.status(502).json({ ok: false, configurado: true, itens: [], total: 0, por_setor: {},
        aviso: `O VittaMed respondeu ${vr.status}. ${txt.slice(0, 140)}` });
    }
    const j = await vr.json();
    return res.json({ ok: true, configurado: true, ...j });
  } catch (err) {
    // Sistema fora do ar não pode derrubar a agenda daqui — devolve vazio com aviso.
    return res.json({ ok: false, configurado: true, itens: [], total: 0, por_setor: {},
      aviso: `Não consegui falar com o VittaMed agora (${err.message}).` });
  }
});

export default r;
