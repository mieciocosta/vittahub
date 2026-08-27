import express from 'express';
import { query } from '../db/pool.js';
import { socketEmit } from '../socketServer.js';

/* ═══ 🔗 AGENDAMENTO PÚBLICO (sem login) ══════════════════════════════════════
   Link pra colocar no Instagram/status do WhatsApp: a mãe agenda sozinha, 24h
   por dia — inclusive de madrugada, quando ninguém está atendendo. Cada pedido
   cai na Agenda como "Agendado" (a equipe confirma) e vira lead no CRM.

   Este é o ÚNICO router sem autenticação — por isso, aqui dentro:
   · nada de dados de clientes sai (só horários livres);
   · limite por IP (anti-spam) e validação rígida de tudo que entra;
   · nunca aceita valor, desconto ou qualquer campo financeiro.            */

const r = express.Router();

const HORARIOS = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];
const SETORES = { vacinas: '💉 Vacinação', consultas: '🩺 Consulta', terapias: '🧩 Terapia' };
const cut = (v, n) => String(v ?? '').trim().slice(0, n);

/* 💟 FIGURINHA COMO ARQUIVO (cobrança do master, 27/08: "está demorando pra
   carregar e nem todas carregam"). O painel puxava CADA figurinha por uma
   chamada de API que devolvia base64 dentro de um JSON — 65 chamadas, sem
   cache, e as que estavam fora da primeira tela só carregavam se o mouse
   passasse por cima (no celular, nunca). Servindo como arquivo, o próprio
   navegador faz preguiçoso e guarda em cache; a segunda abertura é instantânea.
   Só serve tipo 'figurinha': é arte da marca, não tem dado de cliente. */
r.get('/figurinha/:id', async (req, res) => {
  try {
    const { rows: [m] } = await query(
      `SELECT data, mime FROM biblioteca_midias WHERE id = $1 AND tipo = 'figurinha' LIMIT 1`,
      [String(req.params.id).slice(0, 64)]);
    if (!m || !m.data) return res.status(404).end();
    const buf = Buffer.from(m.data, 'base64');
    res.set('Content-Type', m.mime || 'image/webp');
    res.set('Content-Length', buf.length);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buf);
  } catch { res.status(500).end(); }
});

// Anti-spam: no máx. 5 pedidos por IP a cada hora
const porIP = new Map();
setInterval(() => { const agora = Date.now(); for (const [k, v] of porIP) if (agora - v.inicio > 3600000) porIP.delete(k); }, 600000).unref?.();
function excedeuLimite(ip) {
  const agora = Date.now();
  let e = porIP.get(ip);
  if (!e || agora - e.inicio > 3600000) { e = { n: 0, inicio: agora }; porIP.set(ip, e); }
  e.n++;
  return e.n > 5;
}
const getIP = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'sem-ip';

// GET /api/publico/horarios?data=YYYY-MM-DD&setor=vacinas — só o que está LIVRE
r.get('/horarios', async (req, res) => {
  try {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data : null;
    const setor = SETORES[req.query.setor] ? req.query.setor : 'vacinas';
    if (!data) return res.status(400).json({ error: 'Informe a data.' });

    // Só a partir de amanhã e até 60 dias à frente (fuso de São Luís)
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const limite = new Date(Date.now() - 3 * 3600 * 1000 + 60 * 86400000).toISOString().slice(0, 10);
    if (data <= hoje) return res.json({ data, horarios: [], aviso: 'Escolha a partir de amanhã 😊' });
    if (data > limite) return res.json({ data, horarios: [], aviso: 'Escolha uma data nos próximos 60 dias.' });
    const dow = new Date(data + 'T12:00:00Z').getUTCDay();
    if (dow === 0) return res.json({ data, horarios: [], aviso: 'Domingo não temos atendimento. Escolha outro dia 💙' });

    const { rows } = await query(
      `SELECT hora FROM agenda_eventos WHERE data = $1 AND COALESCE(setor,'vacinas') = $2
        AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'`, [data, setor]);
    const ocupados = new Set(rows.map(x => String(x.hora).slice(0, 5)));
    const livres = HORARIOS.filter(h => !ocupados.has(h) && !(dow === 6 && h >= '12:00')); // sábado só de manhã
    res.json({ data, setor, horarios: livres });
  } catch (err) { res.status(500).json({ error: 'Não consegui carregar os horários agora.' }); }
});

// POST /api/publico/agendar — cria o agendamento + lead + aviso pra equipe
r.post('/agendar', async (req, res) => {
  try {
    if (excedeuLimite(getIP(req))) return res.status(429).json({ error: 'Muitos pedidos deste dispositivo. Tente novamente mais tarde ou fale com a gente no WhatsApp 💙' });
    const b = req.body || {};
    const paciente = cut(b.paciente, 80);
    const responsavel = cut(b.responsavel, 80);
    const telefone = cut(b.telefone, 20).replace(/\D/g, '');
    const setor = SETORES[b.setor] ? b.setor : 'vacinas';
    const data = /^\d{4}-\d{2}-\d{2}$/.test(b.data || '') ? b.data : null;
    const hora = HORARIOS.includes(b.hora) ? b.hora : null;
    const observacoes = cut(b.observacoes, 300);

    if (paciente.length < 2) return res.status(400).json({ error: 'Informe o nome do paciente.' });
    if (telefone.length < 10 || telefone.length > 13) return res.status(400).json({ error: 'Informe um WhatsApp válido com DDD.' });
    if (!data || !hora) return res.status(400).json({ error: 'Escolha a data e o horário.' });

    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    if (data <= hoje) return res.status(400).json({ error: 'Escolha uma data a partir de amanhã.' });

    // Horário ainda livre? (alguém pode ter pego enquanto a pessoa preenchia)
    const { rows: [ocupado] } = await query(
      `SELECT 1 FROM agenda_eventos WHERE data = $1 AND hora = $2 AND COALESCE(setor,'vacinas') = $3
        AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%' LIMIT 1`, [data, hora, setor]);
    if (ocupado) return res.status(409).json({ error: 'Ops! Esse horário acabou de ser preenchido. Escolha outro 😊' });

    const { rows: [ev] } = await query(
      `INSERT INTO agenda_eventos (paciente, responsavel_nome, telefone, data, hora, setor, status, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,'Agendado',$7) RETURNING *`,
      [paciente, responsavel || null, telefone, data, hora, setor,
       `🔗 Agendado pelo site${observacoes ? ` — ${observacoes}` : ''}`]);

    // Vira lead no funil (pra ninguém sumir) — melhor esforço
    await query(
      `INSERT INTO leads (nome, telefone, origem, interesse, status, setor, observacoes, responsavel_cliente)
       VALUES ($1,$2,'Site','${setor}','Novo Lead',$3,$4,$5)`,
      [paciente, telefone, setor, `Agendou pelo link público para ${data} às ${hora}.`, responsavel || null]).catch(() => {});

    await query(
      `INSERT INTO notificacoes (tipo, titulo, texto) VALUES ('novo_lead', $1, $2)`,
      [`🔗 Novo agendamento pelo site: ${paciente}`,
       `${SETORES[setor]} em ${data.split('-').reverse().join('/')} às ${hora} · WhatsApp ${telefone}. Confirmar com a família.`]).catch(() => {});
    socketEmit('agenda_update', { id: ev.id, publico: true });

    res.status(201).json({ ok: true, data, hora, setor: SETORES[setor] });
  } catch (err) {
    console.error('Agendamento público:', err.message);
    res.status(500).json({ error: 'Não consegui concluir agora. Tente de novo ou fale com a gente no WhatsApp.' });
  }
});

export default r;
