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

/* Endereço do VittaMed pra ABRIR no navegador (o atalho da barra lateral). É
   diferente do VITTAMED_URL, que é o endereço da API usado servidor-a-servidor:
   a equipe precisa do endereço do sistema, não do endpoint. Sai da mesma tabela
   de configurações do Vittasys, então o master edita pela tela. */
r.get('/config', auth, async (req, res) => {
  try {
    const { query } = await import('../db/pool.js');
    const { rows: [c] } = await query("SELECT valor FROM configuracoes WHERE chave = 'vittamed'").catch(() => ({ rows: [] }));
    res.json({ url: c?.valor?.url || process.env.VITTAMED_SITE_URL || 'https://vittamed.vittalissaude.com.br' });
  } catch { res.json({ url: 'https://vittamed.vittalissaude.com.br' }); }
});

r.put('/config', auth, async (req, res) => {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Apenas o master altera o endereço.' });
  const url = String(req.body?.url || '').trim().slice(0, 300);
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Informe um endereço válido (https://…).' });
  try {
    const { query } = await import('../db/pool.js');
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('vittamed', $1::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`, [JSON.stringify({ url })]);
    res.json({ ok: true, url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
      // Mensagem que a EQUIPE entende: dizer "falta VITTAMED_URL no ambiente"
      // não ajuda quem está atendendo — ela precisa saber que não é defeito e
      // quem resolve.
      aviso: 'A ligação com o VittaMed ainda não foi ligada. Não é um defeito: falta o Dr. Miécio cadastrar o endereço do VittaMed e a chave de integração no Railway. Enquanto isso, consulte a agenda direto no VittaMed.',
      falta: [
        !process.env.VITTAMED_URL ? 'VITTAMED_URL (endereço da API do VittaMed)' : null,
        (!process.env.INTEGRACAO_TOKEN || process.env.INTEGRACAO_TOKEN.length < 16)
          ? 'INTEGRACAO_TOKEN (senha compartilhada entre os dois sistemas, 16+ caracteres)' : null,
      ].filter(Boolean),
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
