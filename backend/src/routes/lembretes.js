import express from 'express';
import { query } from '../db/pool.js';
import { auth } from '../middleware/auth.js';
import { zapiOk, zapiSendText } from '../services/zapi.js';
import { socketEmit } from '../socketServer.js';
import { CALENDARIO_PADRAO, getCalendario, invalidarCacheCalendario } from '../services/calendario.js';

// Registra a mensagem enviada dentro da conversa do CRM (se existir), pra
// equipe ver no chat o que foi mandado. Melhor esforço — nunca quebra o envio.
async function registraNaConversa(telefone, texto, senderNome) {
  try {
    const dig = String(telefone || '').replace(/\D/g, '');
    const ult11 = dig.slice(-11);
    if (ult11.length < 10) return;
    const { rows: [conv] } = await query(
      `SELECT id, contact_name, phone FROM conversas
        WHERE RIGHT(regexp_replace(COALESCE(phone,''),'\\D','','g'), 11) = $1
        ORDER BY last_message_at DESC NULLS LAST LIMIT 1`, [ult11]);
    if (!conv) return;
    const { rows: [m] } = await query(
      `INSERT INTO mensagens (conversa_id, from_type, sender_nome, type, content) VALUES ($1,'me',$2,'text',$3) RETURNING *`,
      [conv.id, senderNome || 'Lembretes', texto]);
    await query(`UPDATE conversas SET last_message = $1, last_message_at = NOW() WHERE id = $2`, [String(texto).slice(0, 160), conv.id]).catch(() => {});
    if (m) socketEmit('new_message', { convId: conv.id, message: m, conv });
  } catch { /* silencioso */ }
}

// ─── Central de Lembretes (reforço pelo CRM) ─────────────────────────────────
// 🎂 Aniversários (leads.nascimento) · 📅 Agendamentos de amanhã (agenda_eventos)
// · 🎁 Indicações (vendas dos últimos 7 dias). Envio direto pelo WhatsApp da
// clínica (Z-API). Tudo autenticado.

const r = express.Router();
r.use(auth);

const fmtBR = (d) => new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function msgAmanha(ev) {
  const serv = ev.servico ? ev.servico : (ev.setor === 'terapias' ? 'sessão de terapia' : ev.setor === 'consultas' ? 'consulta' : 'atendimento');
  return `Olá! 💙 Aqui é da Vittalis Saúde. Lembrete: ${serv} de ${ev.paciente} no dia ${fmtBR(ev.data)} às ${ev.hora}${ev.profissional ? `, com ${ev.profissional}` : ''}. Responda SIM para confirmar, ou nos avise se precisar remarcar. Até lá! 😊`;
}
const msgAniversario = (nome) => `🎂🎉 Parabéns, ${String(nome || '').split(' ')[0]}! A equipe da Vittalis Saúde deseja um aniversário cheio de saúde e alegria! 💙 Conte sempre com a gente. "Sua vida é preciosa!"`;
const msgIndicacao = (nome) => `Olá! 💙 Aqui é da Vittalis Saúde. Foi um prazer atender ${String(nome || '').split(' ')[0]}! Se você conhece alguém que também precisa de vacinas, consultas ou terapias, adoraríamos receber sua indicação. 😊 É só encaminhar nosso contato: (98) 98422-1002. Obrigado pela confiança!`;

/* ═══ 💉 CALENDÁRIO VACINAL — quem está no ponto HOJE ═══════════════════════
   O maior ativo da clínica é a base de crianças já cadastradas. Aqui o sistema
   calcula, pela data de nascimento, qual marco vacinal cada criança está
   atingindo — e mostra quem abordar hoje. Vira receita recorrente da base. */
// Calendário da REDE PRIVADA (padrão SBIm) — é só o PADRÃO inicial: a gestão
// ajusta em Lembretes → Calendário vacinal → "Ajustar calendário", pra ficar
// idêntico ao esquema cadastrado no Vittasys.


// GET/PUT do calendário — a gestão espelha aqui o esquema do Vittasys
r.get('/calendario-config', async (req, res) => {
  try { res.json({ marcos: await getCalendario(), padrao: CALENDARIO_PADRAO }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
r.put('/calendario-config', async (req, res) => {
  try {
    if (!['master', 'supervisor'].includes(req.user.role)) return res.status(403).json({ error: 'Apenas a gestão altera o calendário.' });
    const marcos = (Array.isArray(req.body?.marcos) ? req.body.marcos : [])
      .map(m => ({ mes: Math.max(0, Math.min(parseInt(m.mes) || 0, 216)), nome: String(m.nome || '').slice(0, 40), vacinas: String(m.vacinas || '').slice(0, 300) }))
      .filter(m => m.nome && m.vacinas)
      .sort((a, b) => a.mes - b.mes);
    if (!marcos.length) return res.status(400).json({ error: 'Informe ao menos um marco (idade + vacinas).' });
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ('calendario_vacinal', $1::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`, [JSON.stringify({ marcos })]);
    invalidarCacheCalendario(marcos);
    res.json({ ok: true, marcos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const mesesEntre = (nasc, hoje) => {
  const n = new Date(String(nasc).slice(0, 10) + 'T12:00:00');
  let m = (hoje.getFullYear() - n.getFullYear()) * 12 + (hoje.getMonth() - n.getMonth());
  if (hoje.getDate() < n.getDate()) m--;
  return m;
};

// GET /api/lembretes/calendario-vacinal — crianças no ponto / atrasadas / chegando
r.get('/calendario-vacinal', async (req, res) => {
  try {
    const hoje = new Date(Date.now() - 3 * 3600 * 1000); // fuso de São Luís
    const { rows: leads } = await query(
      `SELECT l.id, l.nome, l.telefone, l.responsavel_cliente, l.setor,
              TO_CHAR(l.nascimento,'YYYY-MM-DD') AS nascimento,
              (SELECT MAX(v.data_venda) FROM vendas v WHERE v.lead_id = l.id) AS ultima_venda
         FROM leads l
        WHERE l.nascimento IS NOT NULL
          AND COALESCE(l.status,'') NOT ILIKE '%perdido%'`);

    // Quem já TEM agendamento futuro não entra na lista (já está resolvido)
    const { rows: agFut } = await query(
      `SELECT DISTINCT RIGHT(regexp_replace(COALESCE(telefone,''),'\\D','','g'), 8) AS tel8
         FROM agenda_eventos
        WHERE data >= (NOW() - interval '3 hours')::date
          AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'`).catch(() => ({ rows: [] }));
    const comAgenda = new Set(agFut.map(a => a.tel8).filter(t => t && t.length === 8));

    const CALENDARIO_VACINAL = await getCalendario();
    const lista = [];
    for (const l of leads) {
      const idade = mesesEntre(l.nascimento, hoje);
      if (idade < 0 || idade > 72) continue;                     // fora da janela pediátrica
      const tel8 = String(l.telefone || '').replace(/\D/g, '').slice(-8);
      if (tel8.length === 8 && comAgenda.has(tel8)) continue;    // já tem horário marcado

      // Marco atual: o mais recente que a criança já atingiu (ou o próximo que chega em ≤30 dias)
      const atingidos = CALENDARIO_VACINAL.filter(c => c.mes <= idade);
      const proximo = CALENDARIO_VACINAL.find(c => c.mes > idade);
      const marco = atingidos.length ? atingidos[atingidos.length - 1] : null;
      const mesesDesde = marco ? idade - marco.mes : null;
      const mesesFalta = proximo ? proximo.mes - idade : null;

      // Já comprou depois de atingir o marco? Então esse marco está resolvido.
      let cobertoAtual = false;
      if (marco && l.ultima_venda) {
        const dataMarco = new Date(String(l.nascimento).slice(0, 10) + 'T12:00:00');
        dataMarco.setMonth(dataMarco.getMonth() + marco.mes);
        cobertoAtual = new Date(l.ultima_venda) >= dataMarco;
      }

      let item = null;
      if (marco && !cobertoAtual && mesesDesde <= 6) {
        item = { ...marco, status: mesesDesde >= 2 ? 'atrasada' : 'no_ponto', quando: mesesDesde === 0 ? 'este mês' : `há ${mesesDesde} ${mesesDesde === 1 ? 'mês' : 'meses'}` };
      } else if (proximo && mesesFalta === 0) {
        item = { ...proximo, status: 'no_ponto', quando: 'agora' };
      } else if (proximo && mesesFalta === 1) {
        item = { ...proximo, status: 'chegando', quando: 'no próximo mês' };
      }
      if (!item) continue;

      lista.push({
        lead_id: l.id, nome: l.nome, telefone: l.telefone,
        responsavel: l.responsavel_cliente, nascimento: l.nascimento,
        idade_meses: idade,
        idade_txt: idade < 24 ? `${idade} ${idade === 1 ? 'mês' : 'meses'}` : `${Math.floor(idade / 12)} ano${idade >= 24 ? 's' : ''}`,
        marco: item.nome, vacinas: item.vacinas, status: item.status, quando: item.quando,
      });
    }
    const ordem = { atrasada: 0, no_ponto: 1, chegando: 2 };
    lista.sort((a, b) => (ordem[a.status] - ordem[b.status]) || (b.idade_meses - a.idade_meses));
    res.json({
      total: lista.length,
      atrasadas: lista.filter(x => x.status === 'atrasada').length,
      no_ponto: lista.filter(x => x.status === 'no_ponto').length,
      chegando: lista.filter(x => x.status === 'chegando').length,
      lista: lista.slice(0, 200),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mensagem carinhosa de convite pela idade da criança (usada no envio em lote)
const msgCalendario = (c) => {
  const primeiro = String(c.nome || '').split(' ')[0];
  const abre = c.status === 'atrasada'
    ? `Passando com carinho pra lembrar que ${primeiro} já está na idade das vacinas de ${c.marco}`
    : c.status === 'no_ponto'
      ? `Que alegria! ${primeiro} chegou nos ${c.marco} 🎉 É a idade das vacinas`
      : `${primeiro} está chegando nos ${c.marco}! Já podemos deixar tudo organizado`;
  return `Oi! 💙 Aqui é da Vittalis Saúde 😊\n\n${abre}:\n\n💉 ${c.vacinas}\n\nManter o calendário em dia é o maior presente de proteção pra ${primeiro}. Quer que eu já reserve um horário pra vocês? Atendemos na clínica e também em domicílio. 🥰`;
};

// GET /api/lembretes/resumo?amanha=YYYY-MM-DD&hoje=YYYY-MM-DD — as 3 listas de uma vez
r.get('/resumo', async (req, res) => {
  try {
    const amanhaStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.amanha || '') ? req.query.amanha : new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const hojeStr = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hoje || '') ? req.query.hoje : new Date().toISOString().slice(0, 10);

    const { rows: amanha } = await query(
      `SELECT id, paciente, servico, TO_CHAR(data,'YYYY-MM-DD') AS data, hora, profissional, telefone, setor, lembrete_enviado_em
         FROM agenda_eventos
        WHERE data = $1 AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'
        ORDER BY hora`, [amanhaStr]);

    const { rows: leadsNasc } = await query(
      `SELECT id, nome, telefone, TO_CHAR(nascimento,'YYYY-MM-DD') AS nascimento FROM leads WHERE nascimento IS NOT NULL`);
    const base = new Date(hojeStr + 'T12:00:00');
    const aniversarios = [];
    for (const l of leadsNasc) {
      const n = new Date(l.nascimento + 'T12:00:00');
      const prox = new Date(base.getFullYear(), n.getMonth(), n.getDate(), 12);
      if (prox < new Date(base.getFullYear(), base.getMonth(), base.getDate())) prox.setFullYear(prox.getFullYear() + 1);
      const dias = Math.round((prox - new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12)) / 86400000);
      if (dias <= 7) aniversarios.push({ id: l.id, nome: l.nome, telefone: l.telefone, data: prox.toISOString().slice(0, 10), dias, idade: prox.getFullYear() - n.getFullYear() });
    }
    aniversarios.sort((a, b) => a.dias - b.dias || String(a.nome).localeCompare(String(b.nome)));

    const { rows: indicacoes } = await query(
      `SELECT DISTINCT ON (COALESCE(c.phone, v.cliente_nome))
              v.id, COALESCE(v.cliente_nome, v.paciente_nome) AS nome, v.setor,
              TO_CHAR(v.data_venda,'YYYY-MM-DD') AS data_venda, c.phone AS telefone
         FROM vendas v LEFT JOIN conversas c ON c.id = v.conversa_id
        WHERE v.data_venda >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY COALESCE(c.phone, v.cliente_nome), v.data_venda DESC`);

    res.json({ amanha, aniversarios, indicacoes, whatsapp: zapiOk() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/lembretes/enviar { tipo: 'amanha'|'aniversarios'|'indicacoes', ids: [] }
r.post('/enviar', async (req, res) => {
  try {
    if (!zapiOk()) return res.status(503).json({ error: 'WhatsApp (Z-API) não configurado.' });
    const { tipo } = req.body || {};
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'Informe os ids.' });
    let enviados = 0, falhas = 0, pulados = 0;

    if (tipo === 'amanha') {
      const { rows } = await query(
        `SELECT id, paciente, servico, TO_CHAR(data,'YYYY-MM-DD') AS data, hora, profissional, telefone, setor
           FROM agenda_eventos WHERE id = ANY($1::int[]) AND lembrete_enviado_em IS NULL`, [ids.map(Number)]);
      for (const ev of rows) {
        if (!ev.telefone || String(ev.telefone).replace(/\D/g, '').length < 10) { pulados++; continue; }
        const texto = msgAmanha(ev);
        const zr = await zapiSendText(ev.telefone, texto).catch(() => null);
        if (zr?.ok) { enviados++; await query(`UPDATE agenda_eventos SET lembrete_enviado_em = NOW() WHERE id = $1`, [ev.id]); await registraNaConversa(ev.telefone, texto, req.user?.nome); }
        else falhas++;
      }
    } else if (tipo === 'aniversarios') {
      const { rows } = await query(`SELECT id, nome, telefone FROM leads WHERE id = ANY($1::text[])`, [ids.map(String)]);
      for (const l of rows) {
        if (!l.telefone || String(l.telefone).replace(/\D/g, '').length < 10) { pulados++; continue; }
        const texto = msgAniversario(l.nome);
        const zr = await zapiSendText(l.telefone, texto).catch(() => null);
        if (zr?.ok) { enviados++; await registraNaConversa(l.telefone, texto, req.user?.nome); } else falhas++;
      }
    } else if (tipo === 'indicacoes') {
      const { rows } = await query(
        `SELECT v.id, COALESCE(v.cliente_nome, v.paciente_nome) AS nome, c.phone AS telefone
           FROM vendas v LEFT JOIN conversas c ON c.id = v.conversa_id WHERE v.id = ANY($1::int[])`, [ids.map(Number)]);
      for (const v of rows) {
        if (!v.telefone || String(v.telefone).replace(/\D/g, '').length < 10) { pulados++; continue; }
        const texto = msgIndicacao(v.nome);
        const zr = await zapiSendText(v.telefone, texto).catch(() => null);
        if (zr?.ok) { enviados++; await registraNaConversa(v.telefone, texto, req.user?.nome); } else falhas++;
      }
    } else if (tipo === 'calendario') {
      // 💉 Convite pela idade da criança (calendário vacinal) — espaçado 4s
      // entre envios pra não parecer disparo em massa (anti-bloqueio do WhatsApp)
      const { rows } = await query(
        `SELECT id, nome, telefone, TO_CHAR(nascimento,'YYYY-MM-DD') AS nascimento
           FROM leads WHERE id = ANY($1::text[]) AND nascimento IS NOT NULL`, [ids.map(String)]);
      const hoje = new Date(Date.now() - 3 * 3600 * 1000);
      for (const l of rows) {
        if (!l.telefone || String(l.telefone).replace(/\D/g, '').length < 10) { pulados++; continue; }
        const idade = mesesEntre(l.nascimento, hoje);
        const CALENDARIO_VACINAL = await getCalendario();
        const atingidos = CALENDARIO_VACINAL.filter(c => c.mes <= idade);
        const proximo = CALENDARIO_VACINAL.find(c => c.mes > idade);
        const marco = atingidos.length ? atingidos[atingidos.length - 1] : proximo;
        if (!marco) { pulados++; continue; }
        const status = atingidos.length && (idade - marco.mes) >= 2 ? 'atrasada' : (proximo && proximo.mes - idade === 1 ? 'chegando' : 'no_ponto');
        const texto = msgCalendario({ nome: l.nome, marco: marco.nome, vacinas: marco.vacinas, status });
        const zr = await zapiSendText(l.telefone, texto).catch(() => null);
        if (zr?.ok) { enviados++; await registraNaConversa(l.telefone, texto, req.user?.nome); } else falhas++;
        await new Promise(r2 => setTimeout(r2, 4000));
      }
    } else {
      return res.status(400).json({ error: 'Tipo inválido.' });
    }

    res.json({ enviados, falhas, pulados });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/lembretes/busca?q= — acha destinatário em conversas e clientes (leads)
r.get('/busca', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ itens: [] });
    const like = `%${q}%`;
    const dig = q.replace(/\D/g, '');
    const { rows: convs } = await query(
      `SELECT contact_name AS nome, phone AS telefone FROM conversas
        WHERE contact_name ILIKE $1 ${dig.length >= 4 ? "OR regexp_replace(COALESCE(phone,''),'\\D','','g') LIKE $2" : ''}
        ORDER BY last_message_at DESC NULLS LAST LIMIT 8`,
      dig.length >= 4 ? [like, `%${dig}%`] : [like]);
    const { rows: lds } = await query(
      `SELECT nome, telefone FROM leads
        WHERE nome ILIKE $1 ${dig.length >= 4 ? "OR regexp_replace(COALESCE(telefone,''),'\\D','','g') LIKE $2" : ''}
        ORDER BY updated_at DESC LIMIT 8`,
      dig.length >= 4 ? [like, `%${dig}%`] : [like]);
    const vistos = new Set(); const itens = [];
    for (const it of [...convs, ...lds]) {
      const d = String(it.telefone || '').replace(/\D/g, '').slice(-11);
      const chave = d || it.nome;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      itens.push({ nome: it.nome, telefone: it.telefone });
      if (itens.length >= 10) break;
    }
    res.json({ itens });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/lembretes/livre { telefone, mensagem } — a atendente escreve e envia
// pra QUEM ela quiser, direto pelo WhatsApp da clinica.
r.post('/livre', async (req, res) => {
  try {
    if (!zapiOk()) return res.status(503).json({ error: 'WhatsApp (Z-API) não configurado.' });
    const tel = String(req.body?.telefone || '').replace(/\D/g, '');
    const msg = String(req.body?.mensagem || '').trim().slice(0, 3000);
    if (tel.length < 10) return res.status(400).json({ error: 'Telefone inválido (DDD + número).' });
    if (!msg) return res.status(400).json({ error: 'Escreva a mensagem.' });
    const zr = await zapiSendText(tel, msg).catch(() => null);
    if (!zr?.ok) return res.status(502).json({ error: 'Falha no envio pelo WhatsApp.' });
    await registraNaConversa(tel, msg, req.user?.nome);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Envio automático diário (piloto automático) ─────────────────────────────
// Config em configuracoes.chave='lembretes_auto'. Horários no fuso da clínica
// (America/Fortaleza). O tick roda a cada minuto no index.js.
const AUTO_DEFAULT = { ativo: false, horaLembrete: '18:00', horaNiver: '08:30' };

async function lerAuto() {
  const { rows: [c] } = await query("SELECT valor FROM configuracoes WHERE chave = 'lembretes_auto'").catch(() => ({ rows: [] }));
  return { ...AUTO_DEFAULT, ...(c?.valor || {}) };
}
async function salvarAuto(v) {
  await query(`INSERT INTO configuracoes (chave, valor) VALUES ('lembretes_auto', $1)
               ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`, [JSON.stringify(v)]);
}
function agoraLocal() {
  const s = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  return { data: s.slice(0, 10), hhmm: s.slice(11, 16) };
}

export async function rodarLembretesAutomaticos() {
  if (!zapiOk()) return;
  const cfg = await lerAuto();
  if (!cfg.ativo) return;
  const { data: hojeLocal, hhmm } = agoraLocal();

  // 📅 Lembretes dos agendamentos de AMANHÃ
  if (hhmm >= cfg.horaLembrete && cfg.ultimoLembreteDia !== hojeLocal) {
    cfg.ultimoLembreteDia = hojeLocal; await salvarAuto(cfg); // trava antes (evita duplicar)
    const d = new Date(hojeLocal + 'T12:00:00'); d.setDate(d.getDate() + 1);
    const amanhaLocal = d.toISOString().slice(0, 10);
    const { rows } = await query(
      `SELECT id, paciente, servico, TO_CHAR(data,'YYYY-MM-DD') AS data, hora, profissional, telefone, setor
         FROM agenda_eventos
        WHERE data = $1 AND lembrete_enviado_em IS NULL AND LOWER(COALESCE(status,'')) NOT LIKE 'cancel%'`, [amanhaLocal]);
    let n = 0;
    for (const ev of rows) {
      if (!ev.telefone || String(ev.telefone).replace(/\D/g, '').length < 10) continue;
      const texto = msgAmanha(ev);
      const zr = await zapiSendText(ev.telefone, texto).catch(() => null);
      if (zr?.ok) { n++; await query(`UPDATE agenda_eventos SET lembrete_enviado_em = NOW() WHERE id = $1`, [ev.id]); await registraNaConversa(ev.telefone, texto, 'Envio automático 🤖'); }
    }
    if (rows.length) console.log(`🤖 Lembretes automáticos de amanhã: ${n}/${rows.length} enviado(s)`);
  }

  // 🎂 Parabéns dos aniversariantes de HOJE
  if (hhmm >= cfg.horaNiver && cfg.ultimoNiverDia !== hojeLocal) {
    cfg.ultimoNiverDia = hojeLocal; await salvarAuto(cfg);
    const { rows } = await query(
      `SELECT id, nome, telefone FROM leads WHERE nascimento IS NOT NULL AND TO_CHAR(nascimento,'MM-DD') = $1`, [hojeLocal.slice(5)]);
    let n = 0;
    for (const l of rows) {
      if (!l.telefone || String(l.telefone).replace(/\D/g, '').length < 10) continue;
      const texto = msgAniversario(l.nome);
      const zr = await zapiSendText(l.telefone, texto).catch(() => null);
      if (zr?.ok) { n++; await registraNaConversa(l.telefone, texto, 'Envio automático 🤖'); }
    }
    if (rows.length) console.log(`🤖 Parabéns automáticos: ${n}/${rows.length} enviado(s)`);
  }
}

// GET/PUT /api/lembretes/auto — configuração do piloto automático
r.get('/auto', async (req, res) => {
  try { res.json(await lerAuto()); } catch (err) { res.status(500).json({ error: err.message }); }
});
r.put('/auto', async (req, res) => {
  try {
    if (!['master', 'supervisor'].includes(req.user.role)) return res.status(403).json({ error: 'Só a gestão altera o envio automático.' });
    const b = req.body || {};
    const cfg = await lerAuto();
    if (typeof b.ativo === 'boolean') cfg.ativo = b.ativo;
    if (/^\d{2}:\d{2}$/.test(b.horaLembrete || '')) cfg.horaLembrete = b.horaLembrete;
    if (/^\d{2}:\d{2}$/.test(b.horaNiver || '')) cfg.horaNiver = b.horaNiver;
    await salvarAuto(cfg);
    res.json(cfg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default r;
