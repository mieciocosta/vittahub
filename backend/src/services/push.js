import webpush from 'web-push';
import { query } from '../db/pool.js';

/* 🔔 PUSH REAL (app fechado) — avisa no celular da equipe mesmo com o CRM
   fechado: lead quente, cliente esperando, alerta de segurança.

   As chaves VAPID são geradas UMA vez e guardadas no banco (configuracoes),
   então não precisa configurar nada no Railway. Tudo aqui é "melhor esforço":
   se o push falhar, o sino do CRM continua funcionando normalmente.        */

let vapid = null;

export async function getVapid() {
  if (vapid) return vapid;
  try {
    const { rows: [c] } = await query("SELECT valor FROM configuracoes WHERE chave = 'vapid'");
    if (c?.valor?.publicKey && c.valor.privateKey) {
      vapid = c.valor;
    } else {
      const novo = webpush.generateVAPIDKeys();
      await query(`INSERT INTO configuracoes (chave, valor) VALUES ('vapid', $1::jsonb)
                   ON CONFLICT (chave) DO UPDATE SET valor = $1::jsonb, updated_at = NOW()`,
        [JSON.stringify(novo)]);
      vapid = novo;
      console.log('🔑 Chaves de notificação (VAPID) geradas');
    }
    webpush.setVapidDetails('mailto:contato@vittalissaude.com.br', vapid.publicKey, vapid.privateKey);
    return vapid;
  } catch (e) { console.error('VAPID:', e.message); return null; }
}

/** Envia push para um usuário (ou para o master, se usuarioId = null). */
export async function enviarPush(usuarioId, { titulo, texto, url = '/' }) {
  try {
    const v = await getVapid();
    if (!v) return;
    const { rows: subs } = usuarioId
      ? await query('SELECT * FROM push_subscriptions WHERE usuario_id = $1', [usuarioId])
      : await query(`SELECT p.* FROM push_subscriptions p JOIN usuarios u ON u.id = p.usuario_id WHERE u.role = 'master'`);
    if (!subs.length) return;
    const payload = JSON.stringify({ titulo, texto: String(texto || '').slice(0, 160), url });
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (err) {
        // 404/410 = a pessoa desinstalou ou revogou: limpa a inscrição morta
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [s.endpoint]).catch(() => {});
        }
      }
    }
  } catch (e) { console.error('Push:', e.message); }
}

/** Push para TODA a equipe ativa (usar com parcimônia — só o que é urgente). */
export async function enviarPushEquipe({ titulo, texto, url = '/' }) {
  try {
    const v = await getVapid();
    if (!v) return;
    const { rows: subs } = await query(
      `SELECT p.* FROM push_subscriptions p JOIN usuarios u ON u.id = p.usuario_id WHERE COALESCE(u.ativo, true) = true`);
    const payload = JSON.stringify({ titulo, texto: String(texto || '').slice(0, 160), url });
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [s.endpoint]).catch(() => {});
        }
      }
    }
  } catch (e) { console.error('Push equipe:', e.message); }
}
