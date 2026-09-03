import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { SECRET, auth, revogarAcesso, reativarAcesso } from '../middleware/auth.js';
import { erroCpf } from '../cpf.js';

const r = express.Router();

// IP real atrás do proxy do Railway
function getRealIP(req) {
  const xff = req.headers['x-forwarded-for'];
  return xff ? xff.split(',')[0].trim() : req.ip || 'unknown';
}

// Rate-limit de login (anti brute-force): por IP, no máx 10 falhas em 10 min.
const loginFalhas = new Map(); // ip -> { count, until }
function loginBloqueado(ip) {
  const e = loginFalhas.get(ip);
  return e && e.until > Date.now() && e.count >= 10;
}
function registraFalhaLogin(ip) {
  const now = Date.now();
  let e = loginFalhas.get(ip);
  if (!e || e.until < now) e = { count: 0, until: now + 10 * 60 * 1000 };
  e.count++; loginFalhas.set(ip, e);
}
function limpaFalhasLogin(ip) { loginFalhas.delete(ip); }
// limpeza periódica do mapa (evita crescer pra sempre)
setInterval(() => { const now = Date.now(); for (const [k, v] of loginFalhas) if (v.until < now) loginFalhas.delete(k); }, 10 * 60 * 1000);

/* 📍 DE ONDE ELA ENTROU (ordem do master, 24/08: "histórico de localização de
   acesso de cada usuário, de cada dia"). O IP vira cidade e estado por um
   serviço público de geolocalização, com CACHE no banco pra não consultar duas
   vezes o mesmo endereço. É melhor esforço: falhou, o acesso é registrado do
   mesmo jeito, só sem a cidade. IP de rede interna não tem cidade. */
async function localizarIP(ip) {
  const limpo = String(ip || '').trim();
  if (!limpo || limpo === 'unknown' || /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1)/.test(limpo)) return null;
  try {
    const { rows: [cache] } = await query("SELECT valor FROM configuracoes WHERE chave = $1", [`geoip_${limpo}`]);
    /* Cache antigo não tem bairro nem coordenada: refaz uma vez pra completar
       (senão o painel ficaria pra sempre sem o bairro dos IPs já conhecidos). */
    if (cache?.valor?.vazio) return null;
    if (cache?.valor?.cidade && cache.valor.lat !== undefined) return cache.valor;
  } catch { /* sem cache, segue */ }
  try {
    const { default: fetch } = await import('node-fetch');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    /* Pede também BAIRRO, CEP e coordenadas (ordem do master, 28/08: "quero o
       bairro na descrição e a opção de abrir a localização"). É melhor esforço:
       em rede móvel o bairro costuma vir vazio, e aí o painel mostra a cidade. */
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(limpo)}?fields=status,country,regionName,city,district,zip,lat,lon,isp,mobile&lang=pt-BR`, { signal: ctrl.signal });
    clearTimeout(t);
    const j = await r.json().catch(() => null);
    const loc = j && j.status === 'success'
      ? { cidade: j.city || null, estado: j.regionName || null, pais: j.country || null,
          bairro: j.district || null, cep: j.zip || null,
          lat: typeof j.lat === 'number' ? j.lat : null, lng: typeof j.lon === 'number' ? j.lon : null,
          provedor: String(j.isp || '').slice(0, 60), movel: !!j.mobile }
      : null;
    await query(`INSERT INTO configuracoes (chave, valor) VALUES ($1, $2::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = $2::jsonb, updated_at = NOW()`,
      [`geoip_${limpo}`, JSON.stringify(loc || { vazio: true })]).catch(() => {});
    return loc;
  } catch { return null; }
}

// Auditoria fire-and-forget — registra a ação SEM nunca lançar erro
// (uma falha de log jamais pode derrubar o login).
function logAudit(req, usuarioId, usuarioNome, acao, detalhes) {
  query(
    `INSERT INTO audit_logs (usuario_id, usuario_nome, acao, detalhes, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [usuarioId || null, usuarioNome || null, String(acao || '').slice(0, 40),
     detalhes ? JSON.stringify(detalhes) : null,
     getRealIP(req), req.get('user-agent')?.slice(0, 300)]
  ).catch(() => {});
}

r.post('/login', async (req, res) => {
  const ip = getRealIP(req);
  try {
    if (loginBloqueado(ip)) return res.status(429).json({ error: 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.' });
    // Login por CPF (padrão da equipe) ou e-mail. Aceita { login } ou { email }.
    const id = String(req.body.login || req.body.email || '').trim();
    const { senha } = req.body;
    if (!id || !senha) return res.status(400).json({ error: 'CPF e senha são obrigatórios' });

    const digits = id.replace(/\D/g, '');
    let rows;
    if (digits.length === 11 && !id.includes('@')) {
      ({ rows } = await query("SELECT * FROM usuarios WHERE regexp_replace(COALESCE(cpf,''), '\\D', '', 'g') = $1 AND ativo = true", [digits]));
    } else {
      ({ rows } = await query('SELECT * FROM usuarios WHERE LOWER(email) = LOWER($1) AND ativo = true', [id]));
    }
    const u = rows[0];
    if (!u) { registraFalhaLogin(ip); return res.status(401).json({ error: 'Usuário não encontrado. Confira o CPF digitado.' }); }
    const ok = await bcrypt.compare(senha, u.senha);
    if (!ok) { registraFalhaLogin(ip); logAudit(req, null, id, 'login_falha', { motivo: 'Senha incorreta' }); return res.status(401).json({ error: 'Senha incorreta' }); }
    limpaFalhasLogin(ip);
    const token = jwt.sign({ id: u.id, nome: u.nome, email: u.email, role: u.role, cor: u.cor, setor: u.setor || null, setores: u.setores || null, lider: !!u.lider, ve_tudo: !!u.ve_tudo, ve_geral: !!u.ve_geral, so_carteira: !!u.so_carteira, so_fidelidade: !!u.so_fidelidade, distribuidor: !!u.distribuidor }, SECRET, { expiresIn: u.role === 'master' ? '30d' : '16h' }); // equipe: sessão morre no mesmo dia; master mantém 30d
    /* 🌐 RASTREIO DE LOCALIZAÇÃO (ordem do master, 22/08): mesmo login usado
       em ENDEREÇOS (IPs) diferentes num curto intervalo = alerta na hora pro
       master. É o sinal clássico de senha compartilhada. */
    try {
      const { rows: ipsAnt } = await query(`SELECT DISTINCT ip FROM audit_logs
        WHERE usuario_id = $1 AND acao = 'login' AND ip IS NOT NULL
          AND created_at > NOW() - interval '12 hours'`, [u.id]);
      const outros = ipsAnt.map(r2 => r2.ip).filter(x => x && x !== ip);
      if (outros.length) {
        const { rows: [jaAvisou] } = await query(`SELECT 1 FROM notificacoes
          WHERE tipo = 'alerta' AND titulo LIKE $1 AND created_at > NOW() - interval '6 hours' LIMIT 1`,
          [`%login em 2 lugares%${String(u.nome).split(' ')[0]}%`]);
        if (!jaAvisou) {
          await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('alerta', $1, $2, true)`,
            [`🌐 Possível login em 2 lugares: ${String(u.nome).split(' ')[0]}`,
             `A conta de ${u.nome} entrou agora do endereço ${ip} e, nas últimas 12 horas, também foi usada de: ${outros.slice(0, 3).join(', ')}. Pode ser troca de rede (Wi-Fi/4G) ou a senha sendo usada por duas pessoas. Detalhes em Auditoria, seção Acessos.`]);
        }
      }
    } catch { /* rastreio é melhor-esforço, nunca trava o login */ }
    // 📍 Registra o acesso COM a cidade de onde ela entrou (histórico por dia)
    localizarIP(ip).then(loc => {
      query(`INSERT INTO audit_logs (usuario_id, usuario_nome, acao, detalhes, ip, user_agent)
             VALUES ($1,$2,'login',$3::jsonb,$4,$5)`,
        [u.id, u.nome, JSON.stringify({ metodo: 'cpf', ...(loc || {}) }), ip, req.get('user-agent')?.slice(0, 300)]).catch(() => {});
    }).catch(() => { logAudit(req, u.id, u.nome, 'login', { metodo: 'cpf' }); });
    res.json({ token, user: { id: u.id, nome: u.nome, email: u.email, cpf: u.cpf, role: u.role, cor: u.cor, avatar: u.avatar || null, setor: u.setor || null, setores: u.setores || null, lider: !!u.lider, ve_tudo: !!u.ve_tudo,
        /* 📥 Os perfis de carteira vêm JUNTO (01/09). Sem eles, quem entrava —
           ou quem o master impersonava — ficava sem a marca de distribuidora
           até dar F5: a aba de Distribuição e as duas fileiras simplesmente não
           apareciam no usuário da Danielle. O /auth/me já mandava certo; o
           login e o "entrar como" é que devolviam um usuário pela metade. */
        distribuidor: u.distribuidor === true, so_carteira: u.so_carteira === true, so_fidelidade: u.so_fidelidade === true,
        ve_carteira_leads: u.ve_carteira_leads === true,   // 📊 relatório Carteira de Leads (José, 03/09)
        dono: ehDono(u) || u.pode_impersonar === true } });
  } catch (err) {
    console.error('Login error:', err.message); // detalhe só no log do servidor
    res.status(500).json({ error: 'Erro interno. Tente novamente.' }); // não vaza o motivo
  }
});

r.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await query('SELECT id,nome,email,cpf,role,cor,avatar,setor,setores,lider,ve_tudo,ve_geral,so_carteira,so_fidelidade,distribuidor,ia_consultas,ia_ligada,pode_impersonar,baixa_supervisionada,ve_carteira_leads FROM usuarios WHERE id=$1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    res.json({ ...rows[0], dono: ehDono(rows[0]) || rows[0].pode_impersonar === true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* 🤖 Chave PESSOAL da IA — cada usuária liga/desliga a Mary nas conversas
   DELA, sem tocar nas colegas (pedido do master). O master tem a geral no
   painel do Placar e a lista completa na aba Mary (IA). */
r.patch('/me/ia', auth, async (req, res) => {
  try {
    const ligada = req.body?.ligada === true;
    const { rows: [u] } = await query('UPDATE usuarios SET ia_ligada = $1, updated_at = NOW() WHERE id = $2 RETURNING id, nome, ia_ligada', [ligada, req.user.id]);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ ok: true, ia_ligada: u.ia_ligada });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Lista da equipe da IA (master): quem tem o botão e o estado de cada uma
r.get('/ia-equipe', auth, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Acesso restrito ao master.' });
  try {
    const { rows } = await query(`SELECT id, nome, setor, setores, ia_ligada FROM usuarios
      WHERE ativo = true AND ia_consultas = true ORDER BY nome`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Foto de perfil do PRÓPRIO usuário (qualquer perfil) — imagem pequena em data URL
r.patch('/me/avatar', auth, async (req, res) => {
  try {
    const { avatar } = req.body; // null remove
    if (avatar != null) {
      if (typeof avatar !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(avatar)) {
        return res.status(400).json({ error: 'Imagem inválida' });
      }
      if (avatar.length > 200_000) return res.status(400).json({ error: 'Imagem muito grande — tente outra foto' });
    }
    const { rows: [u] } = await query('UPDATE usuarios SET avatar = $1, updated_at = NOW() WHERE id = $2 RETURNING id, avatar', [avatar || null, req.user.id]);
    res.json({ ok: true, avatar: u.avatar });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Editar o PRÓPRIO nome de exibição — instantâneo (reemite o token com o nome novo).
r.patch('/me/nome', auth, async (req, res) => {
  try {
    const nome = String(req.body?.nome || '').trim().slice(0, 60);
    if (nome.length < 2) return res.status(400).json({ error: 'Digite um nome válido.' });
    const { rows: [u] } = await query(
      /* O RETURNING precisa trazer os perfis de carteira: é com estes campos
         que o token novo é assinado. Sem eles, trocar o próprio nome fazia a
         pessoa PERDER a marca de distribuidora até sair e entrar de novo — a
         fila de Distribuição sumia do nada, sem ninguém ter mexido em nada. */
      `UPDATE usuarios SET nome = $1, updated_at = NOW() WHERE id = $2
         RETURNING id, nome, email, cpf, role, cor, avatar, setor, setores, lider, ve_tudo, ve_geral,
                   so_carteira, so_fidelidade, distribuidor, pode_impersonar, ve_carteira_leads`,
      [nome, req.user.id]);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const token = jwt.sign({ id: u.id, nome: u.nome, email: u.email, role: u.role, cor: u.cor, setor: u.setor || null, setores: u.setores || null, lider: !!u.lider, ve_tudo: !!u.ve_tudo, ve_geral: !!u.ve_geral, so_carteira: !!u.so_carteira, so_fidelidade: !!u.so_fidelidade, distribuidor: !!u.distribuidor }, SECRET, { expiresIn: u.role === 'master' ? '30d' : '16h' }); // equipe: sessão morre no mesmo dia; master mantém 30d
    res.json({ ok: true, token, user: { id: u.id, nome: u.nome, email: u.email, cpf: u.cpf, role: u.role, cor: u.cor, avatar: u.avatar || null, setor: u.setor || null, setores: u.setores || null, lider: !!u.lider, ve_tudo: !!u.ve_tudo,
        /* 📥 Os perfis de carteira vêm JUNTO (01/09). Sem eles, quem entrava —
           ou quem o master impersonava — ficava sem a marca de distribuidora
           até dar F5: a aba de Distribuição e as duas fileiras simplesmente não
           apareciam no usuário da Danielle. O /auth/me já mandava certo; o
           login e o "entrar como" é que devolviam um usuário pela metade. */
        distribuidor: u.distribuidor === true, so_carteira: u.so_carteira === true, so_fidelidade: u.so_fidelidade === true,
        ve_carteira_leads: u.ve_carteira_leads === true,   // 📊 relatório Carteira de Leads (José, 03/09)
        dono: ehDono(u) || u.pode_impersonar === true } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── 👤 ENTRAR COMO (impersonação, só master) ────────────────────────────────
// Gera um token do usuário-alvo pro master ver/operar o sistema como ele.
// O token carrega impersonadoPor pra rastreabilidade nos logs.
// Só o DONO (Miécio) troca de usuário: master + nome/e-mail com "miecio", ou o
// id definido em SUPER_ADMIN_ID no Railway (escape se a conta dele tiver outro nome).
/* Identidade do dono, em ordem de confiabilidade. O CPF e o e-mail vêm antes do
   nome de propósito: o master pode renomear a própria conta a qualquer momento
   (e renomeou), e o gate baseado só no nome simplesmente parava de reconhecê-lo
   — sem erro, o botão só sumia. CPF não muda. */
const CPF_DONO = '02914270305';
const EMAIL_DONO = 'miecio@vittalissaude.com.br';
export const ehDono = (u) => {
  if (!u) return false;
  if (process.env.SUPER_ADMIN_ID && u.id === process.env.SUPER_ADMIN_ID) return true;
  if (String(u.cpf || '').replace(/\D/g, '') === CPF_DONO) return true;
  if (String(u.email || '').toLowerCase() === EMAIL_DONO) return true;
  return /mi[eé]cio/i.test(`${u.nome || ''} ${u.email || ''}`);
};

/* 🧭 DIAGNÓSTICO DE SETORES (master) — mostra, numa lista só, o que está
   gravado no cadastro de cada pessoa. Nasceu de um erro que se escondeu: o seed
   de setores comparava o CPF cru, não achava ninguém, e a equipe ficava sem
   setor — o que fazia o sistema mostrar as abas de TODOS os setores pra elas.
   Com esta lista o master vê o dado real em vez de depender do meu palpite. */
r.get('/diagnostico-setores', auth, async (req, res) => {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Acesso restrito ao master.' });
  try {
    const { rows } = await query(`
      SELECT nome, role, setor, setores, ve_tudo,
             regexp_replace(COALESCE(cpf,''),'\\D','','g') cpf_digitos, cpf cpf_bruto
        FROM usuarios WHERE role <> 'bot' AND ativo = true ORDER BY nome`);
    const itens = rows.map(u => {
      const setores = (Array.isArray(u.setores) && u.setores.length) ? u.setores : [u.setor].filter(Boolean);
      return {
        nome: u.nome, papel: u.role, setores,
        // O que a pessoa REALMENTE enxerga hoje, pelas regras em vigor
        ve: u.role === 'master' ? 'tudo (master)' : setores.length ? setores.join(' e ') : '⚠️ nenhum setor — abas de setor escondidas',
        problema: u.role !== 'master' && !setores.length ? 'Cadastro sem setor: marque em Configurações → Usuários' : null,
        cpf_com_pontuacao: u.cpf_bruto !== u.cpf_digitos,
      };
    });
    res.json({ itens, sem_setor: itens.filter(i => i.problema).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* 👥 QUEM EU POSSO OBSERVAR (ordem do master, 01/09: "quero que a Danielle
   possa mudar de usuário em qualquer momento, igual eu e a Nágila, pra que ela
   possa observar o rendimento mais precisamente — exceto Dra e Dr").

   A lista de usuários do sistema é do master e continua sendo. Esta aqui é
   outra coisa: é a lista de quem se pode ENTRAR pra observar, e ela já vem
   filtrada pelas mesmas regras que o /impersonar aplica. Assim a gestora
   comercial não recebe uma lista com nomes que o servidor recusaria depois.

   Os DONOS DA CASA ficam de fora pra quem não é dono: quem supervisiona a
   operação não entra na conta de quem é dono dela. */
r.get('/impersonaveis', auth, async (req, res) => {
  try {
    const { rows: [eu] } = await query(
      'SELECT id, nome, email, cpf, role, pode_impersonar FROM usuarios WHERE id = $1', [req.user.id]);
    if (!eu || (!ehDono(eu) && eu.pode_impersonar !== true)) {
      return res.status(403).json({ error: 'Você não tem permissão para entrar como outro usuário.' });
    }
    const souDono = ehDono(eu);
    const { rows } = await query(`
      SELECT id, nome, email, cpf, role, cor, avatar, setor, titulo,
             COALESCE(dono_casa,false) AS dono_casa
        FROM usuarios
       WHERE role <> 'bot' AND ativo = true AND id <> $1
       ORDER BY nome`, [eu.id]).catch(() => ({ rows: [] }));
    const lista = rows.filter(u => souDono || (u.role !== 'master' && u.dono_casa !== true));
    res.json(lista.map(u => ({ id: u.id, nome: u.nome, cor: u.cor, avatar: u.avatar || null,
      setor: u.setor || null, titulo: u.titulo || null, role: u.role, ativo: true })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.post('/impersonar/:id', auth, async (req, res) => {
  try {
    // Confere no BANCO, não no token: o token não carrega CPF e pode estar
    // velho (nome antigo). A fonte da verdade é o cadastro.
    const { rows: [eu] } = await query('SELECT id, nome, email, cpf, role, pode_impersonar FROM usuarios WHERE id = $1', [req.user.id]);
    // Autorizado = o dono OU quem o master liberou na tela (pode_impersonar)
    if (!eu || (!ehDono(eu) && eu.pode_impersonar !== true)) {
      return res.status(403).json({ error: 'Você não tem permissão para entrar como outro usuário. O master libera isso em Configurações → Usuários.' });
    }
    const { rows: [u] } = await query('SELECT id,nome,email,cpf,role,cor,avatar,setor,setores,lider,ve_tudo,ve_geral,so_carteira,so_fidelidade,distribuidor,ve_carteira_leads,COALESCE(dono_casa,false) AS dono_casa FROM usuarios WHERE id = $1', [req.params.id]);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    // Entrar na conta de um MASTER é privilégio do dono — senão a permissão
    // liberada a um supervisor viraria caminho pra assumir o sistema inteiro.
    /* 🏛️ Quem não é dono não entra na conta de um dono (ordem do master,
       01/09: "exceto Dra e Dr"). Vale pro cargo de master E pra marca
       dono_casa, que é o que identifica as contas do Miécio e da Nágila. */
    if ((u.role === 'master' || u.dono_casa === true) && !ehDono(eu)) {
      return res.status(403).json({ error: 'Esta conta é da direção da clínica e não pode ser observada.' });
    }
    const token = jwt.sign(
      // ve_geral vai junto: impersonar tem que mostrar EXATAMENTE o que a
      // pessoa vê — sem ele o master entrava no marketing e perdia a visão geral
      /* Os perfis de carteira vão JUNTO (28/08): sem eles, o master entrava como
         a Poliana e via mais do que ela vê de verdade — e a régua nova de acesso
         (fila de leads, carteira fechada) lê exatamente esses campos. */
      { id: u.id, nome: u.nome, email: u.email, role: u.role, cor: u.cor, setor: u.setor || null, setores: u.setores || null, lider: !!u.lider, ve_tudo: !!u.ve_tudo, ve_geral: !!u.ve_geral,
        so_carteira: u.so_carteira === true, so_fidelidade: u.so_fidelidade === true, distribuidor: u.distribuidor === true,
        impersonadoPor: req.user.id },
      SECRET, { expiresIn: '12h' });
    console.log(`👤 IMPERSONAÇÃO: ${req.user.nome} entrou como ${u.nome} (${u.id})`);
    /* 🔔 O MASTER SEMPRE SABE (01/09). Liberar a troca de usuário pra gestora
       comercial é dar acesso à conversa de todo mundo — legítimo pra
       supervisão, e por isso mesmo tem que deixar rastro. O aviso é
       apenas_master: fica só com o dono, não vira exposição da equipe.
       Quando é o próprio dono que entra, não avisa nada — seria ele avisando
       a si mesmo a cada troca. */
    if (!ehDono(eu)) {
      await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master)
                   VALUES ('seguranca', $1, $2, true)`,
        [`👤 ${String(eu.nome).split(' ')[0]} entrou como ${String(u.nome).split(' ')[0]}`,
         `${eu.nome} usou a troca de usuário para observar a conta de ${u.nome}. Registrado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`])
        .catch(() => {});
    }
    res.json({ token, user: { id: u.id, nome: u.nome, email: u.email, cpf: u.cpf, role: u.role, cor: u.cor, avatar: u.avatar || null, setor: u.setor || null, setores: u.setores || null, lider: !!u.lider, ve_tudo: !!u.ve_tudo,
        /* 📥 Os perfis de carteira vêm JUNTO (01/09). Sem eles, quem entrava —
           ou quem o master impersonava — ficava sem a marca de distribuidora
           até dar F5: a aba de Distribuição e as duas fileiras simplesmente não
           apareciam no usuário da Danielle. O /auth/me já mandava certo; o
           login e o "entrar como" é que devolviam um usuário pela metade. */
        distribuidor: u.distribuidor === true, so_carteira: u.so_carteira === true, so_fidelidade: u.so_fidelidade === true,
        ve_carteira_leads: u.ve_carteira_leads === true,   // 📊 relatório Carteira de Leads (José, 03/09)
        dono: ehDono(u) || u.pode_impersonar === true } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.get('/usuarios', auth, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const { rows } = await query("SELECT id,nome,email,cpf,role,cor,ativo,avatar,setor,setores,lider,ve_tudo,ve_geral,so_carteira,so_fidelidade,ia_consultas,ia_ligada,supervisor_id,meta_individual,meta_tipo,meta_qtd_dia,meta_dias_uteis,pode_impersonar FROM usuarios WHERE role!='bot' ORDER BY nome");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Criar usuário (master): login por CPF + senha inicial
r.post('/usuarios', auth, async (req, res) => {
  /* A supervisora monta o TIME DELA: pode cadastrar integrante, mas só como
     atendente e só no setor dela (pedido do master — "coloca a opção de
     cadastrar integrante" no painel de equipe). Ela não cria supervisora, não
     cria master e não põe ninguém em outro setor: as duas linhas abaixo é que
     garantem isso, não a tela. */
  const ehSup = req.user.role === 'supervisor';
  if (req.user.role !== 'master' && !ehSup) return res.status(403).json({ error: 'Acesso negado' });
  try {
    const nome = String(req.body.nome || '').trim().slice(0, 80);
    const cpf = String(req.body.cpf || '').replace(/\D/g, '');
    const senha = String(req.body.senha || '');
    let role = ['master', 'supervisor', 'atendente'].includes(req.body.role) ? req.body.role : 'atendente';
    const cor = req.body.cor || '#00B8C0';
    let setor = ['vacinas','consultas','terapias'].includes(req.body.setor) ? req.body.setor : null;
    if (ehSup) {
      role = 'atendente';
      // Setor vem do BANCO, não do corpo do pedido — token velho não vale aqui
      const { rows: [me] } = await query('SELECT setor, setores FROM usuarios WHERE id = $1', [req.user.id]).catch(() => ({ rows: [null] }));
      const meus = (me && Array.isArray(me.setores) && me.setores.length) ? me.setores : [me?.setor].filter(Boolean);
      if (!meus.length) return res.status(403).json({ error: 'Seu cadastro está sem setor — peça pra gestão marcar antes de cadastrar alguém.' });
      setor = meus.includes(setor) ? setor : meus[0];
    }
    if (!nome) return res.status(400).json({ error: 'Informe o nome' });
    // CPF é o login: número errado = conta em que ninguém entra. Confere o
    // dígito verificador, não só o tamanho.
    const erroDoCpf = erroCpf(cpf);
    if (erroDoCpf) return res.status(400).json({ error: erroDoCpf });
    if (senha.length < 8) return res.status(400).json({ error: 'A senha precisa de pelo menos 8 caracteres' });
    const { rows: [dup] } = await query('SELECT 1 FROM usuarios WHERE cpf = $1', [cpf]);
    if (dup) return res.status(409).json({ error: 'Este CPF já está cadastrado' });
    const hash = await bcrypt.hash(senha, 10);
    const email = `${cpf}@vittahub.local`; // e-mail é NOT NULL/único no schema; login é pelo CPF
    /* 👥 Debaixo de quem essa pessoa trabalha: a supervisora que cadastra já
       vira a chefe do integrante; o master escolhe na tela (pedido do master:
       equipe da Danielle — ela recebe os leads e transfere pra quem quiser). */
    let supervisorId = null;
    if (ehSup) supervisorId = req.user.id;
    else if (req.body.supervisor_id) {
      const { rows: [sup] } = await query("SELECT id FROM usuarios WHERE id = $1 AND role = 'supervisor' AND ativo = true", [String(req.body.supervisor_id)]).catch(() => ({ rows: [null] }));
      supervisorId = sup?.id || null;
    }
    const { rows: [u] } = await query(
      `INSERT INTO usuarios (id, nome, email, cpf, senha, role, cor, ativo, setor, meta_individual, supervisor_id)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, true, $7, $8, $9)
       RETURNING id, nome, email, cpf, role, cor, ativo, setor, meta_individual, supervisor_id`,
      // Integrante nasce com a meta do time (R$ 100 mil) — sem isso ele entrava
      // no time sem alvo e o painel mostrava a equipe furada.
      [nome, email, cpf, hash, role, cor, setor, Math.max(0, parseFloat(req.body.meta_individual) || 100000), supervisorId]);
    res.status(201).json(u);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Editar usuário (master): cadastrar CPF, trocar senha, ativar/desativar, papel, cor
/* 🚫 CANCELAR ACESSO 100% (ordem do master, 24/08). Um clique tira a pessoa do
   VittaHub de vez: desativa, embaralha a senha (não entra nem com a antiga),
   tira CPF e e-mail de circulação (não dá login pelo CPF), zera todos os
   poderes e devolve as conversas e os leads dela pro time. O cadastro NÃO é
   apagado de propósito: vendas, caixa e metas antigas apontam pra ele, e
   apagar quebraria o histórico da casa. A sessão aberta cai na hora. */
r.post('/usuarios/:id/cancelar-acesso', auth, async (req, res) => {
  try {
    if (req.user?.role !== 'master') return res.status(403).json({ error: 'Acesso restrito ao master.' });
    const id = String(req.params.id);
    const { rows: [u] } = await query('SELECT id, nome, role FROM usuarios WHERE id = $1', [id]);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (u.role === 'master') return res.status(400).json({ error: 'O acesso do master não pode ser cancelado por aqui.' });

    const r1 = await query('UPDATE conversas SET responsavel_id = NULL WHERE responsavel_id = $1', [id]).catch(() => null);
    await query('UPDATE leads SET responsavel_id = NULL WHERE responsavel_id = $1', [id]).catch(() => {});
    await query('UPDATE usuarios SET supervisor_id = NULL WHERE supervisor_id = $1', [id]).catch(() => {});
    await query(`UPDATE usuarios SET
         ativo = false,
         senha = md5(random()::text || clock_timestamp()::text),
         cpf = CASE WHEN cpf IS NULL OR cpf LIKE '%-off' THEN cpf ELSE cpf || '-off' END,
         email = CASE WHEN email LIKE '%.off' THEN email ELSE COALESCE(email, id) || '.off' END,
         ia_consultas = false, ia_ligada = false, lider = false,
         ve_tudo = false, ve_geral = false, pode_impersonar = false,
         baixa_supervisionada = false, supervisor_id = NULL,
         setor = NULL, setores = '{}', updated_at = NOW()
       WHERE id = $1`, [id]);
    revogarAcesso(id);   // derruba a sessão aberta na hora
    logAudit(req, req.user.id, req.user.nome, 'cancelar_acesso', { alvo: u.nome, conversas_liberadas: r1?.rowCount || 0 });
    await query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master) VALUES ('alerta', $1, $2, true)`,
      [`🚫 Acesso cancelado: ${u.nome}`,
       `${u.nome} não entra mais no VittaHub: senha embaralhada, CPF e e-mail fora de circulação, poderes zerados e ${r1?.rowCount || 0} conversa(s) devolvida(s) pro time. O histórico de vendas dela continua guardado.`]).catch(() => {});
    res.json({ ok: true, nome: u.nome, conversas_liberadas: r1?.rowCount || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

r.put('/usuarios/:id', auth, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const { nome, cpf, role, cor, ativo, senha, setor } = req.body;
    const updates = [], params = [];
    let pi = 1;
    const set = (col, val) => { if (val !== undefined) { updates.push(`${col} = $${pi++}`); params.push(val); } };
    set('nome', nome);
    if (cpf !== undefined) set('cpf', String(cpf).replace(/\D/g, '') || null);
    if (role !== undefined && ['master', 'supervisor', 'atendente'].includes(role)) set('role', role);
    set('cor', cor);
    if (setor !== undefined) set('setor', ['vacinas','consultas','terapias'].includes(setor) ? setor : null);
    /* Só o master concede visão geral — é a chave que abre a clínica inteira.
       Supervisora não pode se promover, nem promover ninguém. */
    if (req.body.ve_geral !== undefined && req.user.role === 'master') set('ve_geral', req.body.ve_geral === true);
    // Home office por produção: só carteira transferida (gestão marca)
    if (req.body.so_carteira !== undefined) set('so_carteira', req.body.so_carteira === true);
    // 💛 Só a pasta Fidelidade (perfil da Poliana) — ligável pela tela de Usuários
    if (req.body.so_fidelidade !== undefined) set('so_fidelidade', req.body.so_fidelidade === true);
    if (req.body.setores !== undefined) {
      const ss = Array.isArray(req.body.setores) ? req.body.setores.filter(s => ['vacinas','consultas','terapias'].includes(s)) : [];
      set('setores', ss.length ? ss : null);
    }
    if (req.body.lider !== undefined) set('lider', !!req.body.lider);
    // Quem pode entrar como outro usuário — o master decide na tela
    if (req.body.pode_impersonar !== undefined) set('pode_impersonar', !!req.body.pode_impersonar);
    if (req.body.meta_individual !== undefined) set('meta_individual', Math.max(0, Math.min(parseFloat(req.body.meta_individual) || 0, 100000000)));
    // Meta individual em duas unidades: R$ no mês ou consultas por dia
    if (req.body.meta_tipo !== undefined) set('meta_tipo', ['valor', 'consultas'].includes(req.body.meta_tipo) ? req.body.meta_tipo : 'valor');
    if (req.body.meta_qtd_dia !== undefined) set('meta_qtd_dia', Math.max(0, Math.min(parseInt(req.body.meta_qtd_dia) || 0, 500)));
    if (req.body.meta_dias_uteis !== undefined) set('meta_dias_uteis', Math.max(1, Math.min(parseInt(req.body.meta_dias_uteis) || 26, 31)));
    set('ativo', ativo);
    // IA de consultas por usuária (pedido do master: só Danielle, Stefany e Mayara)
    if (req.body.ia_consultas !== undefined) set('ia_consultas', req.body.ia_consultas === true);
    if (req.body.ia_ligada !== undefined) set('ia_ligada', req.body.ia_ligada === true);
    // 👥 Debaixo de qual supervisora a pessoa trabalha ('' = ninguém)
    if (req.body.supervisor_id !== undefined) set('supervisor_id', req.body.supervisor_id || null);
    if (senha) {
      if (String(senha).length < 8) return res.status(400).json({ error: 'A senha precisa de pelo menos 8 caracteres' });
      const hash = await bcrypt.hash(String(senha), 10);
      set('senha', hash);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nada para atualizar' });
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE usuarios SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${pi} RETURNING id,nome,email,cpf,role,cor,ativo,setor,setores,lider,ve_tudo,ve_geral,so_carteira,so_fidelidade,ia_consultas,ia_ligada,supervisor_id,meta_individual,meta_tipo,meta_qtd_dia,meta_dias_uteis,pode_impersonar`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });
    // Revoga/reativa o acesso NA HORA quando o status muda (não espera o token expirar)
    if (ativo === false) revogarAcesso(rows[0].id);
    else if (ativo === true) reativarAcesso(rows[0].id);
    res.json(rows[0]);
  } catch (err) {
    if (String(err.message).includes('idx_usuarios_cpf')) return res.status(409).json({ error: 'Este CPF já está cadastrado em outro usuário' });
    res.status(500).json({ error: err.message });
  }
});

export default r;
