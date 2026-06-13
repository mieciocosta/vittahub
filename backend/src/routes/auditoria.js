import express from 'express';
import { query } from '../db/pool.js';
import { auth } from '../middleware/auth.js';

/* ═══ AUDITORIA VITTAHUB — somente master ═══════════════════════════════════
   Mesmo conceito do VittaSys: 3 níveis (usuários → dias → timeline),
   detecção de ociosidade, geolocalização e presença em tempo real.           */

const r = express.Router();
r.use(auth);

function getRealIP(req) {
  const xff = req.headers['x-forwarded-for'];
  return xff ? xff.split(',')[0].trim() : req.ip || 'unknown';
}

const onlyMaster = (req, res, next) => {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Acesso restrito ao administrador' });
  next();
};

// ── LOG: frontend envia a cada ação relevante ────────────────────────────────
r.post('/log', async (req, res) => {
  try {
    const b = req.body || {};
    await query(`INSERT INTO audit_logs (usuario_id, usuario_nome, acao, entidade, entidade_id, detalhes, ip, user_agent, latitude, longitude)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [req.user.id, req.user.nome, String(b.acao || 'navegacao').slice(0, 40),
       (b.entidade || '').slice(0, 40) || null, (b.entidade_id || '').slice(0, 60) || null,
       b.detalhes ? JSON.stringify(b.detalhes) : null,
       getRealIP(req), req.get('user-agent')?.slice(0, 300),
       b.latitude || null, b.longitude || null]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── HEARTBEAT: atualiza presença (chamado a cada 30s pelo frontend) ──────────
r.post('/heartbeat', async (req, res) => {
  try {
    const b = req.body || {};
    await query(`INSERT INTO presenca (usuario_id, status, ultimo_heartbeat, latitude, longitude, user_agent, ip, pagina)
      VALUES ($1, 'online', NOW(), $2, $3, $4, $5, $6)
      ON CONFLICT (usuario_id) DO UPDATE SET status = 'online', ultimo_heartbeat = NOW(),
        latitude = COALESCE($2, presenca.latitude), longitude = COALESCE($3, presenca.longitude),
        user_agent = $4, ip = $5, pagina = $6`,
      [req.user.id, b.latitude || null, b.longitude || null,
       req.get('user-agent')?.slice(0, 300), getRealIP(req), (b.pagina || '').slice(0, 60)]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: true }); }
});

// ═══ ENDPOINTS DE CONSULTA (master only) ════════════════════════════════════

// Stats globais
r.get('/stats', onlyMaster, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { rows: [s] } = await query(`SELECT
      (SELECT COUNT(*) FROM audit_logs) AS total,
      (SELECT COUNT(*) FROM audit_logs WHERE created_at::date = $1) AS hoje,
      (SELECT COUNT(*) FROM audit_logs WHERE acao = 'login' AND created_at::date = $1) AS logins_hoje,
      (SELECT COUNT(*) FROM audit_logs WHERE acao IN ('excluir','editar_lead','apagar_mensagem')) AS acoes_criticas`, [today]);
    res.json(s);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Presença em tempo real: quem está online, ocioso, offline
r.get('/presenca', onlyMaster, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT p.usuario_id, u.nome, u.role, u.setor, u.avatar, u.cor,
             p.status, p.ultimo_heartbeat, p.latitude, p.longitude, p.user_agent, p.ip, p.pagina,
             EXTRACT(EPOCH FROM (NOW() - p.ultimo_heartbeat)) AS seg_desde_heartbeat
      FROM presenca p JOIN usuarios u ON u.id = p.usuario_id
      WHERE u.ativo = true ORDER BY p.ultimo_heartbeat DESC`);
    // online: <60s, ocioso: 60s–300s, offline: >300s
    const result = rows.map(r => ({
      ...r,
      status_calc: r.seg_desde_heartbeat <= 60 ? 'online' : r.seg_desde_heartbeat <= 300 ? 'ocioso' : 'offline',
      tempo_ocioso: r.seg_desde_heartbeat > 60 ? Math.round(r.seg_desde_heartbeat / 60) : 0,
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Level 1: Usuários com contagem de eventos
r.get('/usuarios', onlyMaster, async (req, res) => {
  try {
    const search = req.query.search;
    let userFilter = '';
    const params = [];
    if (search) { params.push(`%${search}%`); userFilter = `AND u.nome ILIKE $1`; }
    const { rows } = await query(`
      SELECT u.id, u.nome, u.role, u.setor, u.avatar, u.cor, u.ativo,
        (SELECT COUNT(*) FROM audit_logs a WHERE a.usuario_id = u.id) AS total_eventos,
        (SELECT COUNT(*) FROM audit_logs a WHERE a.usuario_id = u.id AND a.acao IN ('excluir','editar_lead','apagar_mensagem')) AS acoes_criticas,
        (SELECT MAX(a.created_at) FROM audit_logs a WHERE a.usuario_id = u.id) AS ultimo_acesso
      FROM usuarios u WHERE u.role != 'bot' ${userFilter}
      ORDER BY total_eventos DESC`, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Level 2: Dias de um usuário
r.get('/usuario/:id/dias', onlyMaster, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT created_at::date AS data, COUNT(*) AS total,
        COUNT(*) FILTER (WHERE acao IN ('excluir','editar_lead','apagar_mensagem')) AS criticos,
        MIN(created_at) AS primeiro, MAX(created_at) AS ultimo,
        EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 60 AS duracao_min
      FROM audit_logs WHERE usuario_id = $1
      GROUP BY created_at::date ORDER BY data DESC LIMIT 60`, [req.params.id]);
    res.json(rows.map(d => ({ ...d, duracao_min: Math.round(d.duracao_min || 0) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Level 3: Timeline de um dia
r.get('/usuario/:id/dia/:data', onlyMaster, async (req, res) => {
  try {
    const { rows: events } = await query(`
      SELECT id, created_at, acao, entidade, entidade_id, detalhes, ip, user_agent, latitude, longitude
      FROM audit_logs WHERE usuario_id = $1 AND created_at::date = $2
      ORDER BY created_at DESC`, [req.params.id, req.params.data]);

    const CRIT = ['excluir', 'editar_lead', 'apagar_mensagem', 'editar_mensagem'];
    let nextTs = null;
    const timeline = events.map(e => {
      const gap = nextTs ? Math.round((nextTs - e.created_at.getTime()) / 1000) : null;
      nextTs = e.created_at.getTime();
      const ua = e.user_agent || '';
      const browser = ua.includes('Edg/') ? 'Edge' : ua.includes('Chrome/') ? 'Chrome' : ua.includes('Firefox/') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : '—';
      const device = (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) ? '📱' : '🖥️';
      return {
        id: e.id, hora: e.created_at, acao: e.acao, entidade: e.entidade, entidade_id: e.entidade_id,
        detalhes: e.detalhes, ip: e.ip, browser, device, latitude: e.latitude, longitude: e.longitude,
        gap_seconds: gap, critico: CRIT.includes(e.acao),
      };
    });

    const last = events[0]?.created_at;
    const first = events[events.length - 1]?.created_at;
    const dur = first && last ? Math.round((last.getTime() - first.getTime()) / 60000) : 0;
    const idle = timeline.reduce((s, e) => (e.gap_seconds && e.gap_seconds > 300) ? s + Math.round(e.gap_seconds / 60) : s, 0);

    res.json({
      sessao: { primeiro: first, ultimo: last, duracao_min: dur, ativo_min: dur - idle, ocioso_min: idle, total_eventos: events.length },
      timeline,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default r;
export { getRealIP };
