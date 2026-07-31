import { query } from '../db/pool.js';

/* ═══ PRIVACIDADE / ANTI-VAZAMENTO DE CLIENTES ════════════════════════════════
   Camadas de proteção contra furto da base de clientes para outras clínicas:

   1. MASCARAMENTO nas LISTAS: a equipe (não-gestão) vê o telefone mascarado
      nas listagens em massa (lista de conversas, busca, recuperação) — os
      lugares onde daria pra "colher" a base inteira de uma vez. Na conversa
      ABERTA o número continua completo (necessário pro trabalho do dia a dia;
      lá o Ctrl+C de telefone já é bloqueado pelo SecurityLock do frontend).
   2. DETECTOR DE VARREDURA: quem abre conversas demais em pouco tempo
      (comportamento de coleta, não de atendimento) gera alerta reservado ao
      master + registro na auditoria; acima do limite duro, o acesso a novas
      conversas é pausado por alguns minutos.
   3. As listas têm teto de itens por página para não-gestão (sem "limit=9999").

   Gestão (master/supervisor/ve_tudo) segue vendo tudo — a trava é pra ponta. */

export const ehGestao = (u) => !!u && (['master', 'supervisor'].includes(u.role) || u.ve_tudo);

// (98) •••••-••02 — mantém DDD e os 2 últimos dígitos: dá pra RECONHECER o
// cliente no atendimento, mas não dá pra discar/exportar.
export function mascararTelefone(v) {
  const s = String(v ?? '');
  const digits = s.replace(/\D/g, '');
  if (digits.length < 8) return s; // curto demais pra ser telefone real
  const semDDI = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  const ddd = semDDI.slice(0, 2);
  const fim = semDDI.slice(-2);
  return `(${ddd}) •••••-••${fim}`;
}

// Cópia da linha com o telefone mascarado (NUNCA mutar o objeto do cache!)
export function mascararLinha(c, user) {
  if (!c || ehGestao(user)) return c;
  const out = { ...c };
  if (out.phone) out.phone = mascararTelefone(out.phone);
  if (out.telefone) out.telefone = mascararTelefone(out.telefone);
  return out;
}
export const mascararLista = (rows, user) =>
  ehGestao(user) ? rows : (rows || []).map((c) => mascararLinha(c, user));

/* ── DETECTOR DE VARREDURA (aberturas de conversa por usuário) ────────────────
   Janela de 10 min contando conversas DISTINTAS abertas:
   · 40+  → alerta reservado ao master + auditoria (uma vez por janela)
   · 80+  → bloqueio suave de novas aberturas até a janela expirar
   Atendimento normal não chega perto disso; coleta em massa chega rápido. */
const JANELA_MS = 10 * 60 * 1000;
const LIMITE_ALERTA = 40;
const LIMITE_BLOQUEIO = 80;
const varredura = new Map(); // userId -> { ids:Set, inicio, alertou }
setInterval(() => {
  const agora = Date.now();
  for (const [k, v] of varredura) if (agora - v.inicio > JANELA_MS) varredura.delete(k);
}, JANELA_MS).unref?.();

export function registrarAberturaConversa(user, convId, req) {
  if (!user || user.role === 'master') return { bloqueado: false };
  const agora = Date.now();
  let e = varredura.get(user.id);
  if (!e || agora - e.inicio > JANELA_MS) { e = { ids: new Set(), inicio: agora, alertou: false }; varredura.set(user.id, e); }
  e.ids.add(String(convId));
  const n = e.ids.size;

  if (n >= LIMITE_ALERTA && !e.alertou) {
    e.alertou = true;
    // Alerta só para o master (a coluna apenas_master esconde do resto da equipe)
    query(`INSERT INTO notificacoes (tipo, titulo, texto, apenas_master)
           VALUES ('seguranca', $1, $2, true)`,
      [`🛡️ Atividade incomum: ${user.nome || 'usuário'}`,
       `Abriu ${n} conversas diferentes em menos de 10 minutos — padrão de varredura de contatos. Vale conferir na Auditoria.`]).catch(() => {});
    query(`INSERT INTO audit_logs (usuario_id, usuario_nome, acao, detalhes, ip, user_agent)
           VALUES ($1, $2, 'alerta_varredura', $3, $4, $5)`,
      [user.id, user.nome || null, JSON.stringify({ conversas_10min: n }),
       req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req?.ip || null,
       req?.headers?.['user-agent'] || null]).catch(() => {});
  }

  // Gestão nunca é bloqueada (supervisor com ve_tudo trabalha em volume)
  if (n > LIMITE_BLOQUEIO && !ehGestao(user)) return { bloqueado: true };
  return { bloqueado: false };
}
