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

/* 📸 BANCO DE PRINTS (pedido do master): no instante da captura, o navegador
   manda uma RECONSTITUIÇÃO da tela — imagem gerada pelo próprio sistema (não é
   o arquivo do print da pessoa, é o que a tela mostrava). Fica 30 dias e o
   master vê na aba Segurança da Auditoria. */
const ultimoPrintPor = new Map();   // userId -> ts (1 a cada 3s por pessoa)
r.post('/print-tela', async (req, res) => {
  try {
    const img = String(req.body?.imagem || '');
    if (!img.startsWith('data:image/')) return res.status(400).json({ error: 'Imagem inválida.' });
    if (img.length > 1_200_000) return res.status(400).json({ error: 'Imagem grande demais.' });
    const agora = Date.now();
    if (agora - (ultimoPrintPor.get(req.user.id) || 0) < 3000) return res.json({ ok: true, ignorado: true });
    ultimoPrintPor.set(req.user.id, agora);
    await query(`INSERT INTO capturas_print (usuario_id, usuario_nome, tela, conversa, conv_id, imagem)
                 VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.user.id, req.user.nome, String(req.body?.tela || '').slice(0, 80),
       String(req.body?.conversa || '').slice(0, 80) || null,
       String(req.body?.conv_id || '').slice(0, 60) || null, img]);
    query(`DELETE FROM capturas_print WHERE created_at < NOW() - interval '30 days'`).catch(() => {});
    /* 🚨 Rajada de prints (pedido do master: "a segurança está fraca"):
       no 5º print do dia da MESMA pessoa, o master é avisado na hora no
       sino — uma vez só por dia, pra não virar ruído. */
    try {
      const { rows: [{ n: printsHoje }] } = await query(
        `SELECT COUNT(*)::int n FROM capturas_print
          WHERE usuario_id = $1 AND created_at > (NOW() - interval '3 hours')::date + interval '3 hours'`,
        [req.user.id]);
      if (printsHoje === 5) {
        await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('alerta', $1, $2, true)`,
          [`🚨 ${String(req.user.nome || '').split(' ')[0]} já tirou 5 prints hoje`,
           `${req.user.nome} capturou a tela 5 vezes hoje. As imagens reconstituídas estão em Auditoria → Prints com imagem — vale conferir o que está sendo capturado. Lembrando: todo print da equipe sai com a marca d'água do nome de quem capturou.`]);
      }
    } catch { /* alerta é melhor-esforço */ }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
/* 🌐 ACESSOS POR LOCALIZAÇÃO (ordem do master): quem entrou, de onde e em
   quantos endereços diferentes — senha compartilhada aparece aqui. */
r.get('/acessos', onlyMaster, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT usuario_id, COALESCE(usuario_nome,'(desconhecido)') nome, ip,
             MAX(created_at) ultimo, COUNT(*)::int logins,
             MAX(user_agent) exemplo_aparelho
        FROM audit_logs
       WHERE acao = 'login' AND created_at > NOW() - interval '7 days'
       GROUP BY 1, 2, 3 ORDER BY 2, ultimo DESC`);
    const porUser = {};
    for (const r2 of rows) {
      const k = r2.usuario_id || r2.nome;
      (porUser[k] ||= { nome: r2.nome, ips: [] }).ips.push({
        ip: r2.ip, ultimo: r2.ultimo, logins: r2.logins,
        aparelho: String(r2.exemplo_aparelho || '').replace(/^Mozilla\/[\d.]+\s*/, '').slice(0, 90),
      });
    }
    const itens = Object.values(porUser).map(u => ({
      ...u, enderecos: u.ips.length, suspeito: u.ips.length >= 2,
    })).sort((a, b) => b.enderecos - a.enderecos);
    res.json({ itens, dias: 7 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/prints', onlyMaster, async (req, res) => {
  try {
    const { rows } = await query(`SELECT id, usuario_nome, tela, conversa, created_at FROM capturas_print ORDER BY created_at DESC LIMIT 100`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
r.get('/prints/:id/imagem', onlyMaster, async (req, res) => {
  try {
    const { rows: [c] } = await query(`SELECT imagem FROM capturas_print WHERE id = $1`, [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Print não encontrado.' });
    res.json({ imagem: c.imagem });
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

/* ═══ HISTÓRICO DE LOCALIZAÇÃO DE ACESSO ═══════════════════════════════════
   De onde cada pessoa entrou no sistema, ao longo do tempo.

   Duas fontes, e a diferença entre elas importa:
   • GPS do navegador (latitude/longitude) — preciso, mas só existe se a
     pessoa AUTORIZOU a localização no navegador. Negou, fica sem.
   • IP — sempre existe, mas diz pouco: rede da clínica, 4G da operadora,
     Wi-Fi de casa. Serve para ver MUDANÇA de rede, não endereço.

   Os pontos são agrupados por coordenada arredondada em 3 casas (~110 m):
   sem isso a lista viraria dez mil linhas do mesmo lugar, uma por heartbeat.
   Acesso SEM localização não é escondido — vira uma linha própria dizendo
   que não houve permissão, senão o histórico daria a entender que a pessoa
   não acessou. */
r.get('/localizacoes', onlyMaster, async (req, res) => {
  try {
    const dias = Math.min(365, Math.max(1, parseInt(req.query.dias, 10) || 30));
    const usuarioId = req.query.usuario_id || null;

    const params = [dias];
    let filtro = '';
    if (usuarioId) { params.push(usuarioId); filtro = `AND usuario_id = $${params.length}`; }

    const { rows } = await query(`
      SELECT usuario_id, usuario_nome,
             ROUND(latitude::numeric, 3)  AS lat,
             ROUND(longitude::numeric, 3) AS lng,
             MIN(created_at) AS primeiro,
             MAX(created_at) AS ultimo,
             COUNT(*)::int   AS eventos,
             COUNT(DISTINCT created_at::date)::int AS dias_distintos,
             MODE() WITHIN GROUP (ORDER BY ip) AS ip,
             MODE() WITHIN GROUP (ORDER BY user_agent) AS user_agent
        FROM audit_logs
       WHERE created_at > NOW() - ($1 || ' days')::interval
         AND usuario_id IS NOT NULL
         ${filtro}
       GROUP BY usuario_id, usuario_nome,
                ROUND(latitude::numeric, 3), ROUND(longitude::numeric, 3)
       ORDER BY usuario_nome, MAX(created_at) DESC
       LIMIT 800`, params);

    const lugares = rows.map(x => {
      const ua = x.user_agent || '';
      return {
        usuario_id: x.usuario_id, usuario_nome: x.usuario_nome,
        latitude: x.lat === null ? null : Number(x.lat),
        longitude: x.lng === null ? null : Number(x.lng),
        sem_localizacao: x.lat === null || x.lng === null,
        primeiro: x.primeiro, ultimo: x.ultimo,
        eventos: x.eventos, dias: x.dias_distintos, ip: x.ip,
        dispositivo: (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) ? 'celular' : 'computador',
        navegador: ua.includes('Edg/') ? 'Edge' : ua.includes('Chrome/') ? 'Chrome'
                 : ua.includes('Firefox/') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : '—',
      };
    });

    // Um resumo por pessoa: quantos lugares distintos, quantas redes, e quanto
    // do acesso ficou sem localização. É o que responde "isso aqui está
    // confiável?" antes de qualquer conclusão sobre alguém.
    const porUsuario = new Map();
    for (const l of lugares) {
      if (!porUsuario.has(l.usuario_id)) {
        porUsuario.set(l.usuario_id, {
          usuario_id: l.usuario_id, usuario_nome: l.usuario_nome,
          lugares: 0, sem_localizacao: 0, eventos: 0, ips: new Set(), ultimo: l.ultimo,
        });
      }
      const u = porUsuario.get(l.usuario_id);
      u.eventos += l.eventos;
      if (l.sem_localizacao) u.sem_localizacao += l.eventos; else u.lugares++;
      if (l.ip) u.ips.add(l.ip);
      if (new Date(l.ultimo) > new Date(u.ultimo)) u.ultimo = l.ultimo;
    }

    /* 📅 POR DIA (ordem do master, 24/08: "organizada por dia") — cada dia com
       as redes usadas, os lugares e a janela de trabalho. */
    const { rows: porDiaRows } = await query(`
      SELECT usuario_id, usuario_nome,
             to_char((created_at - interval '3 hours')::date, 'YYYY-MM-DD') dia,
             MIN(created_at) primeiro, MAX(created_at) ultimo, COUNT(*)::int eventos,
             COUNT(DISTINCT ip)::int redes,
             ARRAY_AGG(DISTINCT ip) FILTER (WHERE ip IS NOT NULL) ips,
             COUNT(DISTINCT (ROUND(latitude::numeric,3) || ',' || ROUND(longitude::numeric,3)))
               FILTER (WHERE latitude IS NOT NULL)::int lugares
        FROM audit_logs
       WHERE created_at > NOW() - ($1 || ' days')::interval AND usuario_id IS NOT NULL ${filtro}
       GROUP BY 1, 2, 3 ORDER BY 3 DESC, 2`, params).catch(() => ({ rows: [] }));

    /* 🚨 MESMO LOGIN EM DOIS LUGARES AO MESMO TEMPO (ordem do master): senha
       emprestada aparece aqui. Fatiamos o dia em blocos de 10 minutos e
       procuramos o mesmo usuário ativo de DUAS redes diferentes no MESMO bloco.
       Rede diferente no mesmo minuto não é troca de Wi-Fi para 4G: é gente
       diferente usando o mesmo acesso. */
    const { rows: simultRows } = await query(`
      SELECT usuario_id, usuario_nome,
             to_char(bloco - interval '3 hours', 'YYYY-MM-DD') dia,
             to_char(bloco - interval '3 hours', 'HH24:MI') hora,
             ARRAY_AGG(DISTINCT ip) ips, SUM(n)::int eventos
        FROM (
          SELECT usuario_id, usuario_nome, ip,
                 to_timestamp(floor(extract(epoch FROM created_at) / 600) * 600) bloco,
                 COUNT(*)::int n
            FROM audit_logs
           WHERE created_at > NOW() - ($1 || ' days')::interval
             AND usuario_id IS NOT NULL AND ip IS NOT NULL ${filtro}
           GROUP BY 1, 2, 3, 4) t
       GROUP BY 1, 2, 3, 4
      HAVING COUNT(DISTINCT ip) > 1
       ORDER BY dia DESC, hora DESC LIMIT 200`, params).catch(() => ({ rows: [] }));

    const simultaneos = simultRows.map(r2 => ({
      usuario_id: r2.usuario_id, usuario_nome: r2.usuario_nome,
      dia: r2.dia, hora: r2.hora, ips: r2.ips || [], eventos: r2.eventos,
    }));
    const alertaPorUser = {};
    for (const e of simultaneos) alertaPorUser[e.usuario_id] = (alertaPorUser[e.usuario_id] || 0) + 1;

    const porDia = porDiaRows.map(d => ({
      usuario_id: d.usuario_id, usuario_nome: d.usuario_nome, dia: d.dia,
      primeiro: d.primeiro, ultimo: d.ultimo, eventos: d.eventos,
      redes: d.redes, ips: d.ips || [], lugares: d.lugares || 0,
      simultaneo: simultaneos.some(x => x.usuario_id === d.usuario_id && x.dia === d.dia),
    }));

    res.json({
      dias,
      usuarios: [...porUsuario.values()]
        .map(u => ({ ...u, ips: u.ips.size, alertas_simultaneos: alertaPorUser[u.usuario_id] || 0 }))
        .sort((a, b) => (b.alertas_simultaneos - a.alertas_simultaneos) || (new Date(b.ultimo) - new Date(a.ultimo))),
      lugares,
      por_dia: porDia,
      simultaneos,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});



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
/* 🔒 RELATÓRIO DE SEGURANÇA — tentativas de copiar telefone e capturas de tela.
   Bloquear sozinho não conta nada ao master: ele não fica sabendo quem tentou,
   quantas vezes nem em que tela. É este relatório que transforma o bloqueio em
   informação — e no dia em que a intenção aparece, não depois do vazamento. */
r.get('/seguranca', onlyMaster, async (req, res) => {
  try {
    const dias = Math.max(1, Math.min(parseInt(req.query.dias) || 30, 180));
    const [porPessoa, ultimos, porDia] = await Promise.all([
      query(`SELECT COALESCE(usuario_nome,'(desconhecido)') nome, usuario_id,
                    COUNT(*) FILTER (WHERE acao = 'copia_telefone_bloqueada')::int copias,
                    COUNT(*) FILTER (WHERE acao = 'captura_tela')::int prints,
                    MAX(created_at) ultima
               FROM audit_logs
              WHERE acao IN ('copia_telefone_bloqueada','captura_tela')
                AND created_at > NOW() - ($1 || ' days')::interval
              GROUP BY 1,2 ORDER BY (COUNT(*)) DESC`, [dias]),
      query(`SELECT usuario_nome, acao, detalhes, ip, created_at
               FROM audit_logs
              WHERE acao IN ('copia_telefone_bloqueada','captura_tela')
                AND created_at > NOW() - ($1 || ' days')::interval
              ORDER BY created_at DESC LIMIT 200`, [dias]),
      query(`SELECT TO_CHAR(created_at - interval '3 hours','YYYY-MM-DD') dia,
                    COUNT(*) FILTER (WHERE acao = 'copia_telefone_bloqueada')::int copias,
                    COUNT(*) FILTER (WHERE acao = 'captura_tela')::int prints
               FROM audit_logs
              WHERE acao IN ('copia_telefone_bloqueada','captura_tela')
                AND created_at > NOW() - ($1 || ' days')::interval
              GROUP BY 1 ORDER BY 1`, [dias]),
    ]);
    const tot = porPessoa.rows.reduce((a, p) => ({ copias: a.copias + p.copias, prints: a.prints + p.prints }), { copias: 0, prints: 0 });
    res.json({
      dias, por_pessoa: porPessoa.rows, ultimos: ultimos.rows, por_dia: porDia.rows,
      resumo: { ...tot, pessoas: porPessoa.rows.length },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
