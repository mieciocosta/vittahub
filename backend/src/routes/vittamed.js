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

/* 🔌 A ponte agora se liga PELA TELA (pedido do master — a equipe de consultas
   precisa da agenda e a variável no Railway nunca foi cadastrada). Precedência:
   variável de ambiente, se existir; senão, o que o master salvou em
   configuracoes.ponte_vittamed pela própria aba VittaMed. Cache de 60s pra não
   ir ao banco a cada requisição. */
let _ponteCache = { valor: null, em: 0 };
export function invalidarPonteVittamed() { _ponteCache = { valor: null, em: 0 }; }
async function ponteConfig() {
  if (process.env.VITTAMED_URL && process.env.INTEGRACAO_TOKEN && process.env.INTEGRACAO_TOKEN.length >= 16) {
    return { api_url: process.env.VITTAMED_URL, token: process.env.INTEGRACAO_TOKEN, origem: 'ambiente' };
  }
  if (_ponteCache.valor !== null && Date.now() - _ponteCache.em < 60000) return _ponteCache.valor;
  try {
    const { query } = await import('../db/pool.js');
    const { rows: [c] } = await query("SELECT valor FROM configuracoes WHERE chave = 'ponte_vittamed'");
    const v = c?.valor || {};
    const ok = v.api_url && v.token && String(v.token).length >= 16;
    const out = ok ? { api_url: v.api_url, token: v.token, origem: 'tela' } : null;
    _ponteCache = { valor: out, em: Date.now() };
    return out;
  } catch { return null; }
}

// Master salva a ponte pela tela — o token NUNCA volta pro navegador
r.put('/ponte', auth, async (req, res) => {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Só o master liga a ponte.' });
  const api_url = String(req.body?.api_url || '').trim().slice(0, 300);
  const token = String(req.body?.token || '').trim().slice(0, 200);
  if (!/^https?:\/\//i.test(api_url)) return res.status(400).json({ error: 'Informe o endereço da API (https://…).' });
  if (token.length < 16) return res.status(400).json({ error: 'A chave precisa de pelo menos 16 caracteres — e deve ser IGUAL no VittaMed.' });
  try {
    const { query } = await import('../db/pool.js');
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('ponte_vittamed', $1::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify({ api_url, token, por: req.user.nome, em: new Date().toISOString() })]);
    invalidarPonteVittamed();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.get('/ponte', auth, async (req, res) => {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Só o master vê a ponte.' });
  const c = await ponteConfig();
  res.json({ configurado: !!c, origem: c?.origem || null, api_url: c?.api_url || null });   // sem o token
});

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
  const ponte = await ponteConfig();
  if (!ponte) {
    return res.json({
      ok: false, configurado: false, itens: [], total: 0, por_setor: {},
      aviso: 'A ligação com o VittaMed ainda não foi ligada. Não é um defeito: o Dr. Miécio consegue ligar aqui mesmo — nesta aba aparece, só pra ele, o campo pra colar o endereço da API e a chave de integração.',
      falta: ['Endereço da API do VittaMed', 'Chave de integração (a MESMA nos dois sistemas, 16+ caracteres)'],
    });
  }
  const data = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data : hojeLocal();
  const setor = ['vacinas', 'consultas', 'terapias'].includes(req.query.setor) ? req.query.setor : '';
  const base = String(ponte.api_url).replace(/\/+$/, '');

  try {
    const { default: fetch } = await import('node-fetch');
    const url = `${base}/api/integracao/agenda?data=${data}${setor ? `&setor=${setor}` : ''}`;
    const vr = await fetch(url, {
      headers: { 'x-integracao-token': ponte.token },
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

/* Teste da ponte — o master valida na hora em que cadastrar as variáveis,
   sem esperar a equipe reclamar. Diz exatamente o que está errado: variável
   faltando, endereço fora do ar, token recusado ou endpoint inexistente. */
r.get('/status', auth, async (req, res) => {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Só o master testa a ponte.' });
  const ponte = await ponteConfig();
  if (!ponte) {
    return res.json({ ok: false, configurado: false,
      falta: ['Endereço da API do VittaMed', 'Chave de integração (a MESMA nos dois sistemas, 16+ caracteres)'] });
  }
  try {
    const { default: fetch } = await import('node-fetch');
    const base = String(ponte.api_url).replace(/\/+$/, '');
    const vr = await fetch(`${base}/api/integracao/agenda?data=${hojeLocal()}`, {
      headers: { 'x-integracao-token': ponte.token },
      signal: AbortSignal.timeout(15000),
    });
    if (vr.ok) {
      const d = await vr.json().catch(() => ({}));
      return res.json({ ok: true, configurado: true, origem: ponte.origem,
        mensagem: `Ponte respondendo! O VittaMed devolveu ${Array.isArray(d?.itens) ? d.itens.length : (Array.isArray(d) ? d.length : 0)} agendamento(s) pra hoje.` });
    }
    const corpo = await vr.text().catch(() => '');
    const motivo = vr.status === 401 || vr.status === 403
      ? 'O VittaMed recusou a chave — o token precisa ser IGUAL nos dois sistemas.'
      : vr.status === 404
        ? 'O endereço respondeu, mas não existe /api/integracao/agenda lá — o VittaMed ainda não tem o endpoint da ponte.'
        : `O VittaMed respondeu ${vr.status}.`;
    return res.json({ ok: false, configurado: true, erro: motivo, detalhe: corpo.slice(0, 150) });
  } catch (err) {
    return res.json({ ok: false, configurado: true,
      erro: `Não consegui alcançar o VittaMed nesse endereço (${err.message}). Confira o endereço da API.` });
  }
});

/* ─── 🩺 PACIENTES DO VITTAMED ─────────────────────────────────────────────────
   "Os pacientes de lá estão cadastrados é porque houveram consultas" (master).
   Espelhamos os pacientes num cache local: a Vitta reconhece o telefone e trata
   quem já consultou como paciente da casa. A busca ao vivo alimenta o cache; a
   sincronização puxa a lista inteira de uma vez. */
const soDigitos = (t) => {
  let d = String(t || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  return d;
};

// Consulta usada pelo BOT (sem HTTP interno): só o cache local, rápido e barato.
export async function pacienteVittaMedLocal(telefone) {
  const d = soDigitos(telefone);
  if (!d) return null;
  try {
    const { query } = await import('../db/pool.js');
    const { rows: [p] } = await query('SELECT nome, dados, visto_em FROM vittamed_pacientes WHERE telefone = $1', [d]);
    return p || null;
  } catch { return null; }
}

async function upsertPaciente(query, p) {
  const d = soDigitos(p.telefone || p.phone || p.celular);
  if (!d) return false;
  const nome = String(p.nome || p.paciente || '').slice(0, 120) || null;
  const dados = {};
  for (const k of ['nascimento', 'responsavel', 'ultima_consulta', 'ultimo_atendimento', 'convenio', 'profissional']) {
    if (p[k] != null && String(p[k]).trim() !== '') dados[k] = String(p[k]).slice(0, 160);
  }
  await query(`INSERT INTO vittamed_pacientes (telefone, nome, dados, visto_em)
               VALUES ($1,$2,$3::jsonb,NOW())
               ON CONFLICT (telefone) DO UPDATE SET nome = COALESCE($2, vittamed_pacientes.nome),
                 dados = vittamed_pacientes.dados || $3::jsonb, visto_em = NOW()`,
    [d, nome, JSON.stringify(dados)]);
  return true;
}

// GET /paciente?telefone= — equipe de consultas/gestão. Cache primeiro; se a
// ponte estiver de pé, confirma lá e atualiza o cache.
r.get('/paciente', auth, async (req, res) => {
  if (!podeVerVittaMed(req.user)) return res.status(403).json({ error: 'Os pacientes do VittaMed são da equipe de consultas.' });
  const d = soDigitos(req.query.telefone);
  if (!d) return res.status(400).json({ error: 'Informe o telefone.' });
  try {
    const local = await pacienteVittaMedLocal(d);
    const ponte = await ponteConfig();
    if (!ponte) return res.json({ encontrado: !!local, origem: local ? 'cache' : null, paciente: local });
    try {
      const { default: fetch } = await import('node-fetch');
      const base = String(ponte.api_url).replace(/\/+$/, '');
      const vr = await fetch(`${base}/api/integracao/paciente?telefone=${d}`, {
        headers: { 'x-integracao-token': ponte.token }, signal: AbortSignal.timeout(8000),
      });
      if (vr.ok) {
        const j = await vr.json().catch(() => null);
        const p = j?.paciente || j;
        if (p && (p.nome || p.paciente)) {
          const { query } = await import('../db/pool.js');
          await upsertPaciente(query, { ...p, telefone: d }).catch(() => {});
          return res.json({ encontrado: true, origem: 'vittamed', paciente: { nome: p.nome || p.paciente, dados: p } });
        }
        return res.json({ encontrado: !!local, origem: local ? 'cache' : null, paciente: local });
      }
    } catch { /* ponte fora do ar: cai pro cache */ }
    res.json({ encontrado: !!local, origem: local ? 'cache' : null, paciente: local });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /pacientes/sincronizar — master puxa a lista inteira do VittaMed pro cache.
r.post('/pacientes/sincronizar', auth, async (req, res) => {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Só o master sincroniza os pacientes.' });
  const ponte = await ponteConfig();
  if (!ponte) {
    return res.status(400).json({ ok: false, error: 'A ponte com o VittaMed ainda não foi ligada — cadastre o endereço da API e a chave na aba VittaMed da Agenda.' });
  }
  try {
    const { default: fetch } = await import('node-fetch');
    const base = String(ponte.api_url).replace(/\/+$/, '');
    const vr = await fetch(`${base}/api/integracao/pacientes`, {
      headers: { 'x-integracao-token': ponte.token }, signal: AbortSignal.timeout(30000),
    });
    if (vr.status === 404) {
      return res.status(502).json({ ok: false, error: 'O VittaMed respondeu, mas ainda não existe /api/integracao/pacientes lá — é o lado de lá que precisa expor a lista (mesma chave x-integracao-token).' });
    }
    if (vr.status === 401 || vr.status === 403) {
      return res.status(502).json({ ok: false, error: 'O VittaMed recusou a chave — o token precisa ser IGUAL nos dois sistemas.' });
    }
    if (!vr.ok) return res.status(502).json({ ok: false, error: `O VittaMed respondeu ${vr.status}.` });
    const j = await vr.json().catch(() => null);
    const lista = Array.isArray(j) ? j : (Array.isArray(j?.itens) ? j.itens : (Array.isArray(j?.pacientes) ? j.pacientes : []));
    if (!lista.length) return res.json({ ok: true, total: 0, aviso: 'O VittaMed respondeu, mas a lista veio vazia.' });
    const { query } = await import('../db/pool.js');
    let n = 0;
    for (const p of lista.slice(0, 20000)) { if (await upsertPaciente(query, p).catch(() => false)) n++; }
    res.json({ ok: true, total: n });
  } catch (err) {
    res.status(502).json({ ok: false, error: `Não consegui falar com o VittaMed (${err.message}).` });
  }
});

// Contagem do cache — mostra na tela se a base de pacientes está viva
r.get('/pacientes/status', auth, async (req, res) => {
  if (!podeVerVittaMed(req.user)) return res.status(403).json({ error: 'Acesso restrito.' });
  try {
    const { query } = await import('../db/pool.js');
    const { rows: [c] } = await query('SELECT COUNT(*)::int n, MAX(visto_em) ultimo FROM vittamed_pacientes').catch(() => ({ rows: [{ n: 0, ultimo: null }] }));
    res.json({ total: c?.n || 0, ultimo: c?.ultimo || null });
  } catch { res.json({ total: 0, ultimo: null }); }
});

export default r;
